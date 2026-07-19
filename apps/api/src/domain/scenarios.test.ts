import { describe, expect, it } from 'vitest';
import { applyAssumptions, assumptionsSchema, compareScenarios, decideRecommendation, defaultAssumptions, weightsFromAssumptions, type Scenario, type ScenarioRecommendation, type ScenarioRunSummary } from './scenarios.js';
import type { OptimizerOpportunity } from '../services/optimizer-client.js';

function opportunity(overrides: Partial<OptimizerOpportunity> = {}): OptimizerOpportunity {
  return {
    id: 'opp', product_id: 'p1', customer_id: 'c1', market_id: 'm1', route_id: 'r1',
    demand: 100, price: 1000, production_cost: 800, logistics_cost: 40, inventory_cost: 5, risk_cost: 5,
    available_credit: 500_000, minimum_order: 10, margin_threshold: 0.09, strategic: true, commitment: 25,
    delivery_feasible: true, compatible: true, ...overrides,
  };
}

describe('scenario assumptions', () => {
  it('supplies runnable defaults', () => {
    const assumptions = defaultAssumptions();
    expect(assumptions.forecastMethod).toBe('WEIGHTED_MOVING_AVERAGE');
    expect(assumptions.safetyStockFactor).toBe(0.1);
    expect(weightsFromAssumptions(assumptions)).toEqual({ margin: 1, strategic: 25, risk: 1, inventory: 0 });
  });

  it('applies demand, price and cost adjustments', () => {
    const assumptions = assumptionsSchema.parse({ demandUpliftPercent: 20, demandUpliftByMarket: { m1: 10 }, priceAdjustmentPercent: 5, productionCostAdjustmentPercent: -10 });
    const adjusted = applyAssumptions(opportunity(), assumptions);
    expect(adjusted.demand).toBeCloseTo(100 * 1.2 * 1.1, 3);
    expect(adjusted.price).toBeCloseTo(1050, 2);
    expect(adjusted.production_cost).toBeCloseTo(720, 2);
  });

  it('honours rule toggles for commitments and holding cost', () => {
    const assumptions = assumptionsSchema.parse({ enforceStrategicCommitments: false, includeInventoryHoldingCost: false });
    const adjusted = applyAssumptions(opportunity(), assumptions);
    expect(adjusted.commitment).toBe(0);
    expect(adjusted.inventory_cost).toBe(0);
  });
});

describe('compareScenarios', () => {
  const run = (overrides: Partial<ScenarioRunSummary>): ScenarioRunSummary => ({
    runId: 'run', solverStatus: 'FEASIBLE', engine: 'local-heuristic', objectiveValue: 1, expectedRevenue: 1000,
    expectedNetMargin: 100, marginPercent: 10, totalAllocatedQuantity: 100, recommendationCount: 3, executionDurationMs: 1,
    generatedAt: '2026-08-01T00:00:00.000Z', diagnostics: { bindingConstraints: [], unmetDemand: [], unusedInventory: {}, excludedOpportunities: [], infeasibleRequirements: [] }, ...overrides,
  });
  const scenario = (id: string, lastRun?: ScenarioRunSummary): Scenario => ({
    id, organisationId: 'org', name: id, description: '', scenarioType: 'WHAT_IF', status: 'COMPLETED', assumptions: defaultAssumptions(),
    createdBy: 'user', createdAt: '', updatedAt: '', lastRun,
  });

  it('computes deltas between two runs', () => {
    const comparison = compareScenarios(scenario('base', run({ expectedRevenue: 1000, expectedNetMargin: 100 })), scenario('cand', run({ expectedRevenue: 1200, expectedNetMargin: 150, recommendationCount: 5 })));
    expect(comparison.revenueDelta).toBe(200);
    expect(comparison.revenueDeltaPercent).toBe(20);
    expect(comparison.netMarginDelta).toBe(50);
    expect(comparison.recommendationCountDelta).toBe(2);
  });

  it('requires both scenarios to have been run', () => {
    expect(() => compareScenarios(scenario('base'), scenario('cand', run({})))).toThrow(/must be run/);
  });
});

describe('decideRecommendation', () => {
  const base: ScenarioRecommendation = {
    id: 'rec', organisationId: 'org', scenarioId: 's', runId: 'r', rank: 1, opportunityId: 'o', productId: 'p', customerId: 'c', marketId: 'm',
    product: 'PP', customer: 'Acme', market: 'Vietnam', route: 'x', quantity: 100, price: 1000, revenue: 100000, netMargin: 12000, marginPercent: 12,
    leadTimeDays: 7, confidence: 0.9, feasibility: 'FEASIBLE', status: 'PENDING_REVIEW', rationale: '', explanation: '', constraints: [],
  };

  it('approves without changing quantity', () => {
    const decided = decideRecommendation(base, { decision: 'APPROVED', reason: 'Profitable' }, 'user-1', '2026-08-01T00:00:00.000Z');
    expect(decided.status).toBe('APPROVED');
    expect(decided.quantity).toBe(100);
    expect(decided.decidedBy).toBe('user-1');
    expect(decided.originalQuantity).toBe(100);
  });

  it('rescales revenue and margin when modified at unchanged unit economics', () => {
    const decided = decideRecommendation(base, { decision: 'MODIFIED', finalQuantity: 60, reason: 'Credit cap' }, 'user-1', '2026-08-01T00:00:00.000Z');
    expect(decided.quantity).toBe(60);
    expect(decided.revenue).toBe(60000);
    expect(decided.netMargin).toBe(7200); // 60 * (12000/100)
    expect(decided.marginPercent).toBe(12); // per-unit economics unchanged
    expect(decided.originalQuantity).toBe(100);
  });

  it('records a rejection with its reason', () => {
    const decided = decideRecommendation(base, { decision: 'REJECTED', reason: 'Out of appetite' }, 'user-2', '2026-08-01T00:00:00.000Z');
    expect(decided.status).toBe('REJECTED');
    expect(decided.decisionReason).toBe('Out of appetite');
  });
});
