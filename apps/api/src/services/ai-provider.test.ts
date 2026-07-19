import { describe, expect, it } from 'vitest';
import { createAiProvider, DeterministicAiProvider } from './ai-provider.js';

const provider = new DeterministicAiProvider();

describe('DeterministicAiProvider', () => {
  it('explains a recommendation from structured facts', async () => {
    const text = await provider.explainRecommendation({
      product: 'HDPE Film F7000', customer: 'VietPoly', market: 'Vietnam', quantity: 120, marginPercent: 26.5,
      inventoryImpact: 'Draws stock.', productionImpact: 'Uses production.', logisticsImpact: 'Ships by sea.',
      constraints: ['Customer credit limit'], risks: ['Payment risk'], alternatives: ['retain inventory'],
    });
    expect(text).toContain('120 tonnes of HDPE Film F7000');
    expect(text).toContain('26.5%');
    expect(text).toContain('Customer credit limit');
  });

  const planInput = {
    question: '', scenarioName: 'Base', run: { engine: 'or-tools', solverStatus: 'OPTIMAL', expectedRevenue: 5000000, marginPercent: 22.5, recommendationCount: 2 },
    recommendations: [
      { rank: 1, product: 'PP H110MA', customer: 'VietPoly', market: 'Vietnam', quantity: 100, marginPercent: 26, feasibility: 'FEASIBLE', status: 'PENDING_REVIEW', constraints: [] },
      { rank: 2, product: 'HDPE F7000', customer: 'IndoFlex', market: 'Indonesia', quantity: 80, marginPercent: 12, feasibility: 'CONSTRAINT_WARNING', status: 'PENDING_REVIEW', constraints: ['Customer credit limit'] },
    ],
    diagnostics: { bindingConstraints: ['product_supply:product-F7000'], unmetDemand: 3, excludedOpportunities: 5, infeasibleRequirements: 0 },
  };

  it('answers a question about a named customer from the plan', async () => {
    const answer = await provider.answerPlanQuestion({ ...planInput, question: 'What about IndoFlex?' });
    expect(answer).toContain('IndoFlex');
    expect(answer).toContain('#2');
    expect(answer).toContain('Customer credit limit');
  });

  it('answers a why/constraint question from diagnostics', async () => {
    const answer = await provider.answerPlanQuestion({ ...planInput, question: 'Why is demand unmet?' });
    expect(answer).toContain('5 excluded');
    expect(answer).toContain('product_supply:product-F7000');
  });

  it('extracts a market signal with sentiment from free text', async () => {
    const signals = await provider.extractSignals('Vietnam PP prices surged this week on tight regional supply.', { markets: ['Vietnam', 'Malaysia'], productCodes: ['H110MA'] });
    expect(signals).toHaveLength(1);
    expect(signals[0].marketCountry).toBe('Vietnam');
    expect(signals[0].sentiment).toBe('POSITIVE');
  });

  it('returns no signal when no known market is mentioned', async () => {
    const signals = await provider.extractSignals('Prices rose in Brazil.', { markets: ['Vietnam'], productCodes: [] });
    expect(signals).toHaveLength(0);
  });

  it('factory returns the deterministic provider without a key', () => {
    expect(createAiProvider({}).name).toBe('deterministic');
    expect(createAiProvider({ AI_PROVIDER: 'anthropic', AI_API_KEY: 'sk-test' }).name).toBe('anthropic');
  });
});
