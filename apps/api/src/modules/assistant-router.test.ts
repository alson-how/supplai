import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';

type App = ReturnType<typeof createApp>;
async function login(app: App, email = 'commercial_planner@demo.supplai.io') {
  return (await request(app).post('/api/auth/login').send({ email, password: 'Demo@123' })).body.accessToken as string;
}

describe('AI assistant API', () => {
  let app: App;
  let token: string;
  beforeEach(async () => { app = createApp(); token = await login(app); });

  it('answers a question about a run scenario (deterministic provider)', async () => {
    const id = (await request(app).post('/api/scenarios').set('Authorization', `Bearer ${token}`).send({ name: 'Assistant test' })).body.id;
    await request(app).post(`/api/scenarios/${id}/run`).set('Authorization', `Bearer ${token}`);
    const result = await request(app).post('/api/assistant/ask').set('Authorization', `Bearer ${token}`).send({ scenarioId: id, question: 'What are the top opportunities?' });
    expect(result.status).toBe(200);
    expect(result.body.provider).toBe('deterministic');
    expect(result.body.answer.length).toBeGreaterThan(10);
  });

  it('returns 404 for an unknown scenario', async () => {
    const result = await request(app).post('/api/assistant/ask').set('Authorization', `Bearer ${token}`).send({ scenarioId: 'nope', question: 'anything here' });
    expect(result.status).toBe(404);
  });

  it('extracts structured signals from market news text', async () => {
    const result = await request(app).post('/api/assistant/extract-signals').set('Authorization', `Bearer ${token}`)
      .send({ text: 'Vietnam polypropylene prices surged this week as regional supply tightened amid an unplanned plant outage.' });
    expect(result.status).toBe(200);
    expect(result.body.signals.length).toBe(1);
    expect(result.body.signals[0].marketCountry).toBe('Vietnam');
    expect(result.body.signals[0].signalType).toBe('SUPPLY_DISRUPTION');
  });

  it('rejects an unauthenticated assistant request', async () => {
    const result = await request(app).post('/api/assistant/ask').send({ scenarioId: 'x', question: 'hello there' });
    expect(result.status).toBe(401);
  });
});
