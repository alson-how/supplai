import { describe, expect, it } from 'vitest';
import { customerRowSchema, parseCsv, productRowSchema } from './import.js';

describe('parseCsv', () => {
  it('parses headers and rows into keyed objects', () => {
    const rows = parseCsv('code,name\nA1,Alpha\nB2,Beta');
    expect(rows).toEqual([{ code: 'A1', name: 'Alpha' }, { code: 'B2', name: 'Beta' }]);
  });

  it('handles quoted fields with commas, newlines and doubled quotes', () => {
    const rows = parseCsv('code,name\n"X1","Contains, comma and ""quotes"""\n"Y2","line\nbreak"');
    expect(rows[0].name).toBe('Contains, comma and "quotes"');
    expect(rows[1].name).toBe('line\nbreak');
  });

  it('ignores blank lines and trailing newline', () => {
    expect(parseCsv('code\nA1\n\n')).toEqual([{ code: 'A1' }]);
  });
});

describe('row schemas', () => {
  it('coerces numeric product cells', () => {
    const parsed = productRowSchema.parse({ code: 'X5501', name: 'HDPE X5501', category: 'PE', polymerType: 'HDPE', grade: 'X5501', application: 'Containers', productionCostPerUnit: '812', minimumOrderQuantity: '25', shelfLifeDays: '720' });
    expect(parsed.productionCostPerUnit).toBe(812);
    expect(parsed.shelfLifeDays).toBe(720);
    expect(parsed.status).toBe('ACTIVE');
  });

  it('rejects an invalid product category', () => {
    expect(productRowSchema.safeParse({ code: 'X1', name: 'Bad', category: 'ABS', polymerType: 'X', grade: 'X', application: 'Film', productionCostPerUnit: '1', minimumOrderQuantity: '1', shelfLifeDays: '1' }).success).toBe(false);
  });

  it('parses common boolean spellings for strategicAccount', () => {
    const base = { code: 'C1', name: 'Cust', marketCountry: 'Vietnam', segment: 'MID_MARKET', industry: 'Packaging', creditLimit: '1', outstandingCredit: '0', priorityScore: '50', paymentRiskScore: '0.2', serviceLevelTarget: '0.9' };
    expect(customerRowSchema.parse({ ...base, strategicAccount: 'true' }).strategicAccount).toBe(true);
    expect(customerRowSchema.parse({ ...base, strategicAccount: 'no' }).strategicAccount).toBe(false);
    expect(customerRowSchema.parse({ ...base, strategicAccount: '' }).strategicAccount).toBe(false);
  });
});
