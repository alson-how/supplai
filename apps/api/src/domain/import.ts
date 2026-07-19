import { z } from 'zod';

// Deterministic CSV/row parsing and validation for operational data imports.
// Row schemas coerce the string cells a CSV produces into typed values; the
// import service resolves references (e.g. market country) and persists.

export type ImportEntity = 'products' | 'customers' | 'market-prices' | 'sales';

// Minimal RFC-4180-style CSV parser: handles quoted fields, embedded commas and
// newlines, and doubled quotes. Returns one keyed object per data row.
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;
  const normalised = text.replace(/\r\n?/g, '\n');
  for (let i = 0; i < normalised.length; i++) {
    const char = normalised[i];
    if (inQuotes) {
      if (char === '"') {
        if (normalised[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += char;
    } else if (char === '"') inQuotes = true;
    else if (char === ',') { row.push(field); field = ''; }
    else if (char === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else field += char;
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }

  const nonEmpty = rows.filter(cells => cells.some(cell => cell.trim() !== ''));
  if (nonEmpty.length === 0) return [];
  const headers = nonEmpty[0].map(header => header.trim());
  return nonEmpty.slice(1).map(cells => Object.fromEntries(headers.map((header, index) => [header, (cells[index] ?? '').trim()])));
}

// CSV cells are strings; accept the common truthy spellings for booleans.
const csvBoolean = z.preprocess(value => {
  if (typeof value !== 'string') return value;
  const normalised = value.trim().toLowerCase();
  if (['true', '1', 'yes', 'y'].includes(normalised)) return true;
  if (['false', '0', 'no', 'n', ''].includes(normalised)) return false;
  return value;
}, z.boolean());

export const productRowSchema = z.object({
  code: z.string().trim().min(2).max(30),
  name: z.string().trim().min(3).max(150),
  category: z.enum(['PE', 'PP']),
  polymerType: z.string().trim().min(2),
  grade: z.string().trim().min(1),
  application: z.string().trim().min(2),
  productionCostPerUnit: z.coerce.number().nonnegative(),
  minimumOrderQuantity: z.coerce.number().positive(),
  shelfLifeDays: z.coerce.number().int().positive(),
  status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
});
export type ProductRow = z.infer<typeof productRowSchema>;

export const customerRowSchema = z.object({
  code: z.string().trim().min(2).max(30),
  name: z.string().trim().min(2).max(150),
  marketCountry: z.string().trim().min(2),
  segment: z.string().trim().min(2),
  industry: z.string().trim().min(2),
  creditLimit: z.coerce.number().nonnegative(),
  outstandingCredit: z.coerce.number().nonnegative(),
  priorityScore: z.coerce.number().min(0).max(100),
  strategicAccount: csvBoolean.default(false),
  paymentRiskScore: z.coerce.number().min(0).max(1),
  serviceLevelTarget: z.coerce.number().min(0).max(1),
  status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
});
export type CustomerRow = z.infer<typeof customerRowSchema>;

export const marketPriceRowSchema = z.object({
  productCode: z.string().trim().min(2).max(30),
  marketCountry: z.string().trim().min(2),
  signalDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be a date in YYYY-MM-DD form'),
  marketPricePerUnit: z.coerce.number().positive(),
  currency: z.string().trim().length(3).default('USD'),
  source: z.string().trim().min(2).default('Imported'),
  reliabilityScore: z.coerce.number().min(0).max(1).default(0.9),
  trend: z.enum(['UP', 'DOWN', 'STABLE']).default('STABLE'),
  percentageChange: z.coerce.number().default(0),
});
export type MarketPriceRow = z.infer<typeof marketPriceRowSchema>;

export const salesRowSchema = z.object({
  productCode: z.string().trim().min(2).max(30),
  marketCountry: z.string().trim().min(2),
  period: z.string().trim().regex(/^\d{4}-\d{2}$/, 'must be a month in YYYY-MM form'),
  quantity: z.coerce.number().nonnegative(),
});
export type SalesRow = z.infer<typeof salesRowSchema>;

export interface ImportEntityMeta { entity: ImportEntity; label: string; schema: z.ZodTypeAny; headers: string[]; example: string }

export const IMPORT_ENTITIES: Record<ImportEntity, ImportEntityMeta> = {
  products: {
    entity: 'products',
    label: 'Products',
    schema: productRowSchema,
    headers: ['code', 'name', 'category', 'polymerType', 'grade', 'application', 'productionCostPerUnit', 'minimumOrderQuantity', 'shelfLifeDays', 'status'],
    example: [
      'code,name,category,polymerType,grade,application,productionCostPerUnit,minimumOrderQuantity,shelfLifeDays,status',
      'X5501,HDPE Blow Moulding X5501,PE,HDPE,X5501,Containers,812,25,720,ACTIVE',
      'M220,PP Homopolymer M220,PP,Homopolymer,M220,Injection moulding,835,25,540,ACTIVE',
    ].join('\n'),
  },
  customers: {
    entity: 'customers',
    label: 'Customers',
    schema: customerRowSchema,
    headers: ['code', 'name', 'marketCountry', 'segment', 'industry', 'creditLimit', 'outstandingCredit', 'priorityScore', 'strategicAccount', 'paymentRiskScore', 'serviceLevelTarget', 'status'],
    example: [
      'code,name,marketCountry,segment,industry,creditLimit,outstandingCredit,priorityScore,strategicAccount,paymentRiskScore,serviceLevelTarget,status',
      'VN-006,Vietnam Coastal Polymers,Vietnam,KEY_ACCOUNT,Packaging,480000,90000,88,true,0.24,0.96,ACTIVE',
      'TH-006,Thailand Precision Mould,Thailand,MID_MARKET,Manufacturing,300000,50000,74,false,0.28,0.92,ACTIVE',
    ].join('\n'),
  },
  'market-prices': {
    entity: 'market-prices',
    label: 'Market prices',
    schema: marketPriceRowSchema,
    headers: ['productCode', 'marketCountry', 'signalDate', 'marketPricePerUnit', 'currency', 'source', 'reliabilityScore', 'trend', 'percentageChange'],
    example: [
      'productCode,marketCountry,signalDate,marketPricePerUnit,currency,source,reliabilityScore,trend,percentageChange',
      'H110MA,Vietnam,2026-07-15,1310,USD,SEA CFR (proxy),0.9,UP,4.2',
      'F7000,Vietnam,2026-07-15,1440,USD,SEA CFR (proxy),0.9,UP,3.1',
    ].join('\n'),
  },
  sales: {
    entity: 'sales',
    label: 'Historical sales',
    schema: salesRowSchema,
    headers: ['productCode', 'marketCountry', 'period', 'quantity'],
    example: [
      'productCode,marketCountry,period,quantity',
      'H110MA,Vietnam,2026-01,540',
      'H110MA,Vietnam,2026-02,585',
      'H110MA,Vietnam,2026-03,610',
    ].join('\n'),
  },
};

export function isImportEntity(value: string): value is ImportEntity {
  return value === 'products' || value === 'customers' || value === 'market-prices' || value === 'sales';
}
