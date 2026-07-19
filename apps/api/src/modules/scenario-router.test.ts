import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';

type App = ReturnType<typeof createApp>;
async function login(app: App, email = 'commercial_planner@demo.supplai.io') {
  return (await request(app).post('/api/auth/login').send({ email, password: 'Demo@123' })).body.accessToken as string;
}

describe('demand forecasting API', () => {
  let app: App;
  let token: string;
  beforeEach(async () => { app = createApp(); token = await login(app); });

  it('returns ranked product/market forecasts with confidence bands', async () => {
    const result = await request(app).get('/api/demand/forecast').set('Authorization', `Bearer ${token}`);
    expect(result.status).toBe(200);
    expect(result.body.total).toBeGreaterThan(0);
    const first = result.body.data[0];
    expect(first.predictedQuantity).toBeGreaterThan(0);
    expect(first.upperBound).toBeGreaterThanOrEqual(first.predictedQuantity);
    expect(first.confidenceScore).toBeGreaterThan(0);
  });

  it('summarises forecast accuracy for the organisation', async () => {
    const result = await request(app).get('/api/demand/summary').set('Authorization', `Bearer ${token}`);
    expect(result.status).toBe(200);
    expect(result.body.totalPredictedQuantity).toBeGreaterThan(0);
    expect(result.body.backtestAccuracyPercent).toBeGreaterThan(0);
  });
});

describe('scenario workflow API', () => {
  let app: App;
  let token: string;
  beforeEach(async () => { app = createApp(); token = await login(app); });

  async function createScenario(overrides: Record<string, unknown> = {}) {
    return request(app).post('/api/scenarios').set('Authorization', `Bearer ${token}`).send({ name: 'Vietnam export push', ...overrides });
  }

  it('creates, runs, and persists recommendations from the optimiser', async () => {
    const created = await createScenario();
    expect(created.status).toBe(201);
    const id = created.body.id;

    const run = await request(app).post(`/api/scenarios/${id}/run`).set('Authorization', `Bearer ${token}`);
    expect(run.status).toBe(200);
    expect(run.body.run.recommendationCount).toBeGreaterThan(0);
    expect(run.body.run.expectedRevenue).toBeGreaterThan(0);
    expect(['OPTIMAL', 'FEASIBLE']).toContain(run.body.run.solverStatus);
    expect(run.body.recommendations[0].explanation).toContain('Allocate');
    expect(run.body.recommendations[0].rank).toBe(1);

    const persisted = await request(app).get(`/api/scenarios/${id}/recommendations`).set('Authorization', `Bearer ${token}`);
    expect(persisted.body.total).toBe(run.body.run.recommendationCount);

    const scenario = await request(app).get(`/api/scenarios/${id}`).set('Authorization', `Bearer ${token}`);
    expect(scenario.body.status).toBe('COMPLETED');
    expect(scenario.body.lastRun.diagnostics).toBeDefined();
  });

  it('records the run in the audit trail', async () => {
    const id = (await createScenario()).body.id;
    await request(app).post(`/api/scenarios/${id}/run`).set('Authorization', `Bearer ${token}`);
    const audit = await request(app).get('/api/audit').set('Authorization', `Bearer ${token}`);
    expect(audit.body.data.some((entry: { entityType: string; action: string }) => entry.entityType === 'Scenario' && entry.action === 'RUN')).toBe(true);
  });

  it('clones a scenario, adjusts demand, and compares the two runs', async () => {
    const baseId = (await createScenario()).body.id;
    await request(app).post(`/api/scenarios/${baseId}/run`).set('Authorization', `Bearer ${token}`);

    const clone = await request(app).post(`/api/scenarios/${baseId}/clone`).set('Authorization', `Bearer ${token}`).send({ name: 'Aggressive demand' });
    expect(clone.status).toBe(201);
    expect(clone.body.baselineScenarioId).toBe(baseId);
    const cloneId = clone.body.id;

    await request(app).patch(`/api/scenarios/${cloneId}/assumptions`).set('Authorization', `Bearer ${token}`).send({ demandUpliftPercent: 40, priceAdjustmentPercent: 3 });
    await request(app).post(`/api/scenarios/${cloneId}/run`).set('Authorization', `Bearer ${token}`);

    const comparison = await request(app).get('/api/scenarios/compare').query({ baselineId: baseId, candidateId: cloneId }).set('Authorization', `Bearer ${token}`);
    expect(comparison.status).toBe(200);
    expect(comparison.body.baselineScenarioId).toBe(baseId);
    expect(typeof comparison.body.revenueDelta).toBe('number');
  });

  it('prevents executive viewers from creating scenarios', async () => {
    const viewerToken = await login(app, 'executive_viewer@demo.supplai.io');
    const result = await request(app).post('/api/scenarios').set('Authorization', `Bearer ${viewerToken}`).send({ name: 'Read only attempt' });
    expect(result.status).toBe(403);
  });

  it('approves and modifies a recommendation and records the audit trail', async () => {
    const id = (await createScenario()).body.id;
    const run = await request(app).post(`/api/scenarios/${id}/run`).set('Authorization', `Bearer ${token}`);
    const [first, second] = run.body.recommendations as Array<{ id: string; quantity: number; price: number }>;

    const approved = await request(app).patch(`/api/scenarios/${id}/recommendations/${first.id}/decision`)
      .set('Authorization', `Bearer ${token}`).send({ decision: 'APPROVED', reason: 'Best risk-adjusted contribution' });
    expect(approved.status).toBe(200);
    expect(approved.body.status).toBe('APPROVED');

    const half = Math.round(second.quantity / 2);
    const modified = await request(app).patch(`/api/scenarios/${id}/recommendations/${second.id}/decision`)
      .set('Authorization', `Bearer ${token}`).send({ decision: 'MODIFIED', finalQuantity: half, reason: 'Trim to available credit' });
    expect(modified.status).toBe(200);
    expect(modified.body.quantity).toBe(half);
    expect(modified.body.revenue).toBeCloseTo(half * second.price, 1);
    expect(modified.body.originalQuantity).toBe(second.quantity);

    const persisted = await request(app).get(`/api/scenarios/${id}/recommendations`).set('Authorization', `Bearer ${token}`);
    const statuses = (persisted.body.data as Array<{ id: string; status: string }>);
    expect(statuses.find(r => r.id === first.id)?.status).toBe('APPROVED');
    expect(statuses.find(r => r.id === second.id)?.status).toBe('MODIFIED');

    const audit = await request(app).get('/api/audit').set('Authorization', `Bearer ${token}`);
    expect(audit.body.data.filter((e: { entityType: string }) => e.entityType === 'AllocationRecommendation').length).toBeGreaterThanOrEqual(2);
  });

  it('rejects a modify decision that omits the final quantity', async () => {
    const id = (await createScenario()).body.id;
    const run = await request(app).post(`/api/scenarios/${id}/run`).set('Authorization', `Bearer ${token}`);
    const recId = run.body.recommendations[0].id;
    const result = await request(app).patch(`/api/scenarios/${id}/recommendations/${recId}/decision`)
      .set('Authorization', `Bearer ${token}`).send({ decision: 'MODIFIED', reason: 'Missing quantity' });
    expect(result.status).toBe(400);
  });

  it('prevents executive viewers from deciding recommendations', async () => {
    const id = (await createScenario()).body.id;
    const run = await request(app).post(`/api/scenarios/${id}/run`).set('Authorization', `Bearer ${token}`);
    const recId = run.body.recommendations[0].id;
    const viewerToken = await login(app, 'executive_viewer@demo.supplai.io');
    const result = await request(app).patch(`/api/scenarios/${id}/recommendations/${recId}/decision`)
      .set('Authorization', `Bearer ${viewerToken}`).send({ decision: 'APPROVED', reason: 'Should be blocked' });
    expect(result.status).toBe(403);
  });
});
