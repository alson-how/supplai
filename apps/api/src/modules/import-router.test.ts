import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';

type App = ReturnType<typeof createApp>;
async function login(app: App, email = 'commercial_planner@demo.supplai.io') {
  return (await request(app).post('/api/auth/login').send({ email, password: 'Demo@123' })).body.accessToken as string;
}

const PRODUCT_CSV = [
  'code,name,category,polymerType,grade,application,productionCostPerUnit,minimumOrderQuantity,shelfLifeDays,status',
  'X5501,HDPE Blow Moulding X5501,PE,HDPE,X5501,Containers,812,25,720,ACTIVE', // new
  'H110MA,PP Homopolymer H110MA (revised),PP,Homopolymer,H110MA,Injection moulding,999,25,540,ACTIVE', // existing -> update
  'BAD,Broken row,ABS,X,X,Film,-5,0,0,ACTIVE', // invalid
].join('\n');

describe('data import API', () => {
  let app: App;
  let token: string;
  beforeEach(async () => { app = createApp(); token = await login(app); });

  it('publishes templates for importable entities', async () => {
    const result = await request(app).get('/api/imports/templates').set('Authorization', `Bearer ${token}`);
    expect(result.status).toBe(200);
    expect(result.body.data.map((t: { entity: string }) => t.entity).sort()).toEqual(['customers', 'products']);
    expect(result.body.data[0].example).toContain('code,name');
  });

  it('validates without persisting (dry run)', async () => {
    const result = await request(app).post('/api/imports/products').set('Authorization', `Bearer ${token}`).send({ csv: PRODUCT_CSV, mode: 'validate' });
    expect(result.status).toBe(200);
    expect(result.body.totalRows).toBe(3);
    expect(result.body.valid).toBe(2);
    expect(result.body.invalid).toBe(1);
    expect(result.body.created).toBe(0); // nothing persisted in validate mode
    expect(result.body.errors[0].row).toBe(4); // the BAD row is line 4

    // Confirm no product was added.
    const products = await request(app).get('/api/products?pageSize=100').set('Authorization', `Bearer ${token}`);
    expect(products.body.data.some((p: { code: string }) => p.code === 'X5501')).toBe(false);
  });

  it('commits valid rows as create/update and skips invalid ones', async () => {
    const result = await request(app).post('/api/imports/products').set('Authorization', `Bearer ${token}`).send({ csv: PRODUCT_CSV, mode: 'commit' });
    expect(result.body.created).toBe(1);
    expect(result.body.updated).toBe(1);
    expect(result.body.invalid).toBe(1);

    const products = await request(app).get('/api/products?pageSize=100').set('Authorization', `Bearer ${token}`);
    const added = products.body.data.find((p: { code: string }) => p.code === 'X5501');
    const updated = products.body.data.find((p: { code: string }) => p.code === 'H110MA');
    expect(added).toBeTruthy();
    expect(updated.productionCostPerUnit).toBe(999);

    const audit = await request(app).get('/api/audit').set('Authorization', `Bearer ${token}`);
    expect(audit.body.data.some((e: { entityType: string; action: string }) => e.entityType === 'Import' && e.action === 'IMPORT')).toBe(true);
  });

  it('reports an unknown market country for a customer import', async () => {
    const csv = 'code,name,marketCountry,segment,industry,creditLimit,outstandingCredit,priorityScore,strategicAccount,paymentRiskScore,serviceLevelTarget\nZZ-001,Ghost Co,Atlantis,MID_MARKET,Packaging,100000,0,50,false,0.2,0.9';
    const result = await request(app).post('/api/imports/customers').set('Authorization', `Bearer ${token}`).send({ csv, mode: 'commit' });
    expect(result.body.valid).toBe(0);
    expect(result.body.errors[0].message).toContain('Atlantis');
  });

  it('imports a new customer that then appears in the customer list', async () => {
    const csv = 'code,name,marketCountry,segment,industry,creditLimit,outstandingCredit,priorityScore,strategicAccount,paymentRiskScore,serviceLevelTarget\nVN-006,Vietnam Coastal Polymers,Vietnam,KEY_ACCOUNT,Packaging,480000,90000,88,true,0.24,0.96';
    const result = await request(app).post('/api/imports/customers').set('Authorization', `Bearer ${token}`).send({ csv, mode: 'commit' });
    expect(result.body.created).toBe(1);
    const customers = await request(app).get('/api/customers?pageSize=100&search=Coastal').set('Authorization', `Bearer ${token}`);
    expect(customers.body.data.some((c: { code: string }) => c.code === 'VN-006')).toBe(true);
  });

  it('blocks executive viewers from importing', async () => {
    const viewerToken = await login(app, 'executive_viewer@demo.supplai.io');
    const result = await request(app).post('/api/imports/products').set('Authorization', `Bearer ${viewerToken}`).send({ csv: PRODUCT_CSV, mode: 'commit' });
    expect(result.status).toBe(403);
  });
});
