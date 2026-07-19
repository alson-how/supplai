import type { CoreDataRepository, UpsertOutcome } from '../repositories/core-data-repository.js';
import type { Customer, Product } from '../domain/core-data.js';
import { customerRowSchema, IMPORT_ENTITIES, parseCsv, productRowSchema, type CustomerRow, type ImportEntity, type ProductRow } from '../domain/import.js';

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

    const marketsByCountry = new Map((await this.coreData.markets(organisationId)).map(market => [market.country.toLowerCase(), market]));
    const seenCodes = new Set<string>();

    for (const [index, raw] of rows.entries()) {
      const rowNumber = index + 2; // 1-based, and the header is row 1
      const built = entity === 'products'
        ? this.buildProduct(organisationId, raw)
        : this.buildCustomer(organisationId, raw, marketsByCountry);
      if (!built.ok) {
        report.invalid++;
        report.errors.push(...built.errors.map(error => ({ ...error, row: rowNumber })));
        continue;
      }
      if (seenCodes.has(built.code)) {
        report.invalid++;
        report.errors.push({ row: rowNumber, field: 'code', message: `Duplicate code "${built.code}" within this file` });
        continue;
      }
      seenCodes.add(built.code);
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
    return { ok: true, code: row.code, commit: () => this.coreData.upsertProduct(organisationId, product) };
  }

  private buildCustomer(organisationId: string, raw: Record<string, string>, marketsByCountry: Map<string, { id: string }>): BuiltRow {
    const parsed = customerRowSchema.safeParse(raw);
    if (!parsed.success) return { ok: false, errors: zodErrors(parsed.error) };
    const row: CustomerRow = parsed.data;
    const market = marketsByCountry.get(row.marketCountry.toLowerCase());
    if (!market) return { ok: false, errors: [{ row: 0, field: 'marketCountry', message: `Unknown market country "${row.marketCountry}"` }] };
    const { marketCountry: _country, ...rest } = row;
    const customer: Omit<Customer, 'id' | 'organisationId'> = { ...rest, marketId: market.id };
    return { ok: true, code: row.code, commit: () => this.coreData.upsertCustomer(organisationId, customer) };
  }
}

type BuiltRow = { ok: true; code: string; commit: () => Promise<UpsertOutcome> } | { ok: false; errors: ImportRowError[] };

function requiredHeaders(entity: ImportEntity): string[] {
  // Every header except the optional trailing `status`.
  return IMPORT_ENTITIES[entity].headers.filter(header => header !== 'status');
}

function zodErrors(error: import('zod').ZodError): ImportRowError[] {
  return error.issues.map(issue => ({ row: 0, field: issue.path.join('.') || undefined, message: `${issue.path.join('.') || 'row'}: ${issue.message}` }));
}
