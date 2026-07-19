import { describe, expect, it } from 'vitest';
import { buildAllocationProblem, LocalOptimizerClient, type OptimizerOpportunity } from './optimizer-client.js';

function opportunity(overrides: Partial<OptimizerOpportunity> = {}): OptimizerOpportunity {
  return {
    id: 'opp-1', product_id: 'p1', customer_id: 'c1', market_id: 'm1', route_id: 'r1',
    demand: 100, price: 1000, production_cost: 800, logistics_cost: 40, inventory_cost: 5, risk_cost: 5,
    available_credit: 1_000_000, minimum_order: 0, margin_threshold: 0.09, strategic: false, commitment: 0,
    delivery_feasible: true, compatible: true, ...overrides,
  };
}

describe('buildAllocationProblem', () => {
  it('applies default weights and empty safety stock', () => {
    const problem = buildAllocationProblem({ opportunities: [opportunity()], productSupply: { p1: 500 }, routeCapacity: { r1: 500 } });
    expect(problem.weights).toEqual({ margin: 1, strategic: 25, inventory: 0, risk: 1 });
    expect(problem.safety_stock).toEqual({});
  });

  it('rejects an opportunity that references unsupplied product capacity', () => {
    expect(() => buildAllocationProblem({ opportunities: [opportunity({ product_id: 'ghost' })], productSupply: { p1: 500 }, routeCapacity: { r1: 500 } })).toThrow(/without supplied capacity/);
  });
});

describe('LocalOptimizerClient', () => {
  const client = new LocalOptimizerClient();

  it('allocates a profitable opportunity up to demand', async () => {
    const problem = buildAllocationProblem({ opportunities: [opportunity()], productSupply: { p1: 500 }, routeCapacity: { r1: 500 } });
    const result = await client.solve(problem);
    expect(result.engine).toBe('local-heuristic');
    expect(result.allocations).toHaveLength(1);
    expect(result.allocations[0].quantity).toBe(100);
  });

  it('excludes opportunities below the margin threshold unless strategic', async () => {
    const thin = opportunity({ id: 'thin', production_cost: 980 }); // ~1.5% margin < 9% threshold
    const result = await client.solve(buildAllocationProblem({ opportunities: [thin], productSupply: { p1: 500 }, routeCapacity: { r1: 500 } }));
    expect(result.allocations).toHaveLength(0);
    expect(result.diagnostics.excludedOpportunities.map(entry => entry.opportunityId)).toContain('thin');
  });

  it('caps allocation at available credit', async () => {
    const constrained = opportunity({ id: 'credit', available_credit: 30_000 }); // 30 tonnes at 1000/tonne
    const result = await client.solve(buildAllocationProblem({ opportunities: [constrained], productSupply: { p1: 500 }, routeCapacity: { r1: 500 } }));
    expect(result.allocations[0].quantity).toBe(30);
    expect(result.diagnostics.unmetDemand.find(entry => entry.opportunityId === 'credit')?.quantity).toBe(70);
  });

  it('respects product supply and reports it as a binding constraint', async () => {
    const a = opportunity({ id: 'a', demand: 400 });
    const b = opportunity({ id: 'b', customer_id: 'c2', route_id: 'r2', demand: 400, production_cost: 820 });
    const result = await client.solve(buildAllocationProblem({ opportunities: [a, b], productSupply: { p1: 500 }, routeCapacity: { r1: 500, r2: 500 } }));
    const total = result.allocations.reduce((sum, entry) => sum + entry.quantity, 0);
    expect(total).toBeCloseTo(500, 3);
    expect(result.diagnostics.bindingConstraints).toContain('product_supply:p1');
  });

  it('honours a feasible strategic commitment and flags an infeasible one', async () => {
    const feasible = opportunity({ id: 'strat', strategic: true, commitment: 50, production_cost: 980 }); // thin margin but strategic
    const feasibleResult = await client.solve(buildAllocationProblem({ opportunities: [feasible], productSupply: { p1: 500 }, routeCapacity: { r1: 500 } }));
    expect(feasibleResult.allocations[0].quantity).toBeGreaterThanOrEqual(50);

    const infeasible = opportunity({ id: 'strat2', strategic: true, commitment: 200, demand: 80 });
    const infeasibleResult = await client.solve(buildAllocationProblem({ opportunities: [infeasible], productSupply: { p1: 500 }, routeCapacity: { r1: 500 } }));
    expect(infeasibleResult.diagnostics.infeasibleRequirements[0]).toMatchObject({ opportunityId: 'strat2', requirement: 'strategic_commitment' });
  });
});
