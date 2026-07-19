import type { CoreDataRepository, UpsertOutcome } from '../repositories/core-data-repository.js';
import type { Customer, MarketPriceSignal, Product } from '../domain/core-data.js';
import { customerRowSchema, IMPORT_ENTITIES, marketPriceRowSchema, parseCsv, productRowSchema, type CustomerRow, type ImportEntity, type MarketPriceRow, type ProductRow } from '../domain/import.js';

export type ImportMode = 'validate' | 'commit';

export interface ImportRowError { row: number; field?: string; message: string }
export interface ImportReport {
  entity: ImportEntity;
  mode: ImportMode;
  totalRows: number;
  valid: number;
  invalid: number;
  created: number;
  updated: number;
  errors: ImportRowError[];
}

// Columns that may be omitted or left blank (they have schema defaults).
const OPTIONAL_HEADERS: Record<ImportEntity, string[]> = {
  products: ['status'],
  customers: ['status'],
  'market-prices': ['currency', 'source', 'reliabilityScore', 'trend', 'percentageChange'],
};

type BuiltRow = { ok: true; key: string; commit: () => Promise<UpsertOutcome> } | { ok: false; errors: ImportRowError[] };

// Turns a CSV upload into a validated, reference-resolved, reported import.
// In `validate` mode nothing is persisted (a dry run); in `commit` mode each
// valid row is upserted by its natural key and counted as created or updated.
export class ImportService {
  constructor(private readonly coreData: CoreDataRepository) {}

  async import(organisationId: string, entity: ImportEntity, csv: string, mode: ImportMode): Promise<ImportReport> {
    const rows = parseCsv(csv);
    const report: ImportReport = { entity, mode, totalRows: rows.length, valid: 0, invalid: 0, created: 0, updated: 0, errors: [] };
    if (rows.length === 0) {
      report.errors.push({ row: 0, message: 'No data rows found. Include a header row and at least one record.' });
      return report;
    }
    const missingHeaders = requiredHeaders(entity).filter(header => !(header in rows[0]));
    if (missingHeaders.length > 0) {
      report.errors.push({ row: 1, message: `Missing required column(s): ${missingHeaders.join(', ')}` });
      report.invalid = rows.length;
      return report;
    }

    const [markets, products] = await Promise.all([this.coreData.markets(organisationId), this.coreData.products(organisationId)]);
    const marketsByCountry = new Map(markets.map(market => [market.country.toLowerCase(), market]));
    const productsByCode = new Map(products.map(product => [product.code.toLowerCase(), product]));
    const seenKeys = new Set<string>();

    for (const [index, rawRow] of rows.entries()) {
      const rowNumber = index + 2; // 1-based, and the header is row 1
      const raw = dropEmpty(rawRow); // blank cells fall back to schema defaults
      const built = entity === 'products' ? this.buildProduct(organisationId, raw)
        : entity === 'customers' ? this.buildCustomer(organisationId, raw, marketsByCountry)
        : this.buildMarketPrice(organisationId, raw, productsByCode, marketsByCountry);
      if (!built.ok) {
        report.invalid++;
        report.errors.push(...built.errors.map(error => ({ ...error, row: rowNumber })));
        continue;
      }
      if (seenKeys.has(built.key)) {
        report.invalid++;
        report.errors.push({ row: rowNumber, message: `Duplicate row for "${built.key}" within this file` });
        continue;
      }
      seenKeys.add(built.key);
      report.valid++;
      if (mode === 'commit') {
        const result = await built.commit();
        if (result === 'created') report.created++; else report.updated++;
      }
    }
    return report;
  }

  private buildProduct(organisationId: string, raw: Record<string, string>): BuiltRow {
    const parsed = productRowSchema.safeParse(raw);
    if (!parsed.success) return { ok: false, errors: zodErrors(parsed.error) };
    const row: ProductRow = parsed.data;
    const product: Omit<Product, 'id' | 'organisationId'> = { ...row, unitOfMeasure: 'TONNE' };
    return { ok: true, key: row.code, commit: () => this.coreData.upsertProduct(organisationId, product) };
  }

  private buildCustomer(organisationId: string, raw: Record<string, string>, marketsByCountry: Map<string, { id: string }>): BuiltRow {
    const parsed = customerRowSchema.safeParse(raw);
    if (!parsed.success) return { ok: false, errors: zodErrors(parsed.error) };
    const row: CustomerRow = parsed.data;
    const market = marketsByCountry.get(row.marketCountry.toLowerCase());
    if (!market) return { ok: false, errors: [{ row: 0, field: 'marketCountry', message: `Unknown market country "${row.marketCountry}"` }] };
    const { marketCountry: _country, ...rest } = row;
    const customer: Omit<Customer, 'id' | 'organisationId'> = { ...rest, marketId: market.id };
    return { ok: true, key: row.code, commit: () => this.coreData.upsertCustomer(organisationId, customer) };
  }

  private buildMarketPrice(organisationId: string, raw: Record<string, string>, productsByCode: Map<string, { id: string }>, marketsByCountry: Map<string, { id: string }>): BuiltRow {
    const parsed = marketPriceRowSchema.safeParse(raw);
    if (!parsed.success) return { ok: false, errors: zodErrors(parsed.error) };
    const row: MarketPriceRow = parsed.data;
    const product = productsByCode.get(row.productCode.toLowerCase());
    const market = marketsByCountry.get(row.marketCountry.toLowerCase());
    const errors: ImportRowError[] = [];
    if (!product) errors.push({ row: 0, field: 'productCode', message: `Unknown product code "${row.productCode}"` });
    if (!market) errors.push({ row: 0, field: 'marketCountry', message: `Unknown market country "${row.marketCountry}"` });
    if (!product || !market) return { ok: false, errors };
    const signal: Omit<MarketPriceSignal, 'id' | 'organisationId'> = {
      productId: product.id, marketId: market.id, signalDate: row.signalDate, marketPricePerUnit: row.marketPricePerUnit,
      currency: row.currency, source: row.source, reliabilityScore: row.reliabilityScore, trend: row.trend, percentageChange: row.percentageChange,
    };
    return { ok: true, key: `${row.productCode}|${row.marketCountry}|${row.signalDate}`, commit: () => this.coreData.upsertMarketPrice(organisationId, signal) };
  }
}

function requiredHeaders(entity: ImportEntity): string[] {
  const optional = new Set(OPTIONAL_HEADERS[entity]);
  return IMPORT_ENTITIES[entity].headers.filter(header => !optional.has(header));
}

function dropEmpty(raw: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(raw).filter(([, value]) => value !== ''));
}

function zodErrors(error: import('zod').ZodError): ImportRowError[] {
  return error.issues.map(issue => ({ row: 0, field: issue.path.join('.') || undefined, message: `${issue.path.join('.') || 'row'}: ${issue.message}` }));
}
