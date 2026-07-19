// Typed boundary to the FastAPI/OR-Tools optimiser. The wire contract uses
// snake_case exactly as the Python service expects, so these types double as the
// request/response schema. The optimiser — never the API and never an LLM —
// calculates allocations; the API only maps domain data in and results out.

export interface OptimizerOpportunity {
  id: string;
  product_id: string;
  customer_id: string;
  market_id: string;
  route_id: string;
  demand: number;
  price: number;
  production_cost: number;
  logistics_cost: number;
  inventory_cost: number;
  risk_cost: number;
  available_credit: number;
  minimum_order: number;
  margin_threshold: number;
  strategic: boolean;
  commitment: number;
  delivery_feasible: boolean;
  compatible: boolean;
}

export interface OptimizerWeights { margin: number; strategic: number; inventory: number; risk: number }

export interface AllocationProblem {
  opportunities: OptimizerOpportunity[];
  product_supply: Record<string, number>;
  safety_stock: Record<string, number>;
  route_capacity: Record<string, number>;
  weights: OptimizerWeights;
}

export interface Allocation { opportunityId: string; quantity: number; netContribution: number }
export interface OptimizerDiagnostics {
  bindingConstraints: string[];
  unmetDemand: Array<{ opportunityId: string; quantity: number }>;
  unusedInventory: Record<string, number>;
  excludedOpportunities: Array<{ opportunityId: string; reason: string }>;
  infeasibleRequirements: Array<{ opportunityId: string; requirement: string; shortfall: number }>;
}
export interface AllocationResult {
  solverStatus: string;
  engine: 'or-tools' | 'local-heuristic';
  objectiveValue: number;
  executionDurationMs: number;
  allocations: Allocation[];
  diagnostics: OptimizerDiagnostics;
}

export interface OptimizerClient { solve(problem: AllocationProblem): Promise<AllocationResult> }

export const DEFAULT_WEIGHTS: OptimizerWeights = { margin: 1, strategic: 25, inventory: 0, risk: 1 };

export interface AllocationProblemInput {
  opportunities: OptimizerOpportunity[];
  productSupply: Record<string, number>;
  safetyStock?: Record<string, number>;
  routeCapacity: Record<string, number>;
  weights?: Partial<OptimizerWeights>;
}

// Request mapper: assemble a validated AllocationProblem. Mirrors the FastAPI
// `known_products` validator so we fail fast in the API rather than on the wire.
export function buildAllocationProblem(input: AllocationProblemInput): AllocationProblem {
  const missing = input.opportunities.find(opportunity => !(opportunity.product_id in input.productSupply));
  if (missing) throw new Error(`Opportunity ${missing.id} references product ${missing.product_id} without supplied capacity`);
  return {
    opportunities: input.opportunities,
    product_supply: input.productSupply,
    safety_stock: input.safetyStock ?? {},
    route_capacity: input.routeCapacity,
    weights: { ...DEFAULT_WEIGHTS, ...input.weights },
  };
}

function unitMargin(o: OptimizerOpportunity): number {
  return o.price - o.production_cost - o.logistics_cost - o.inventory_cost - o.risk_cost;
}
function objectiveCoefficient(o: OptimizerOpportunity, weights: OptimizerWeights): number {
  const margin = o.price ? unitMargin(o) / o.price : 0;
  return weights.margin * margin + weights.strategic * (o.strategic ? 1 : 0) - weights.risk * o.risk_cost;
}

// Deterministic greedy allocator used when the OR-Tools service is not
// reachable. It respects the same eligibility, supply, safety-stock, route, MOQ,
// credit and strategic-commitment rules as the solver, and emits the same
// diagnostics. It produces a feasible (not provably optimal) plan, so it reports
// engine `local-heuristic` and never claims OPTIMAL.
export class LocalOptimizerClient implements OptimizerClient {
  async solve(problem: AllocationProblem): Promise<AllocationResult> {
    const started = performance.now();
    const weights = { ...DEFAULT_WEIGHTS, ...problem.weights };
    const supplyRemaining: Record<string, number> = {};
    for (const [product, supply] of Object.entries(problem.product_supply)) supplyRemaining[product] = Math.max(0, supply - (problem.safety_stock[product] ?? 0));
    const routeRemaining: Record<string, number> = { ...problem.route_capacity };

    const excluded: OptimizerDiagnostics['excludedOpportunities'] = [];
    const infeasible: OptimizerDiagnostics['infeasibleRequirements'] = [];
    const allocated: Record<string, number> = {};

    interface Candidate { o: OptimizerOpportunity; maxQuantity: number; coefficient: number }
    const candidates: Candidate[] = [];
    for (const o of problem.opportunities) {
      const margin = o.price ? unitMargin(o) / o.price : 0;
      const eligible = o.delivery_feasible && o.compatible && (margin >= o.margin_threshold || o.strategic);
      const maxQuantity = Math.min(o.demand, o.price ? o.available_credit / o.price : 0);
      if (!eligible || maxQuantity < o.minimum_order) {
        excluded.push({ opportunityId: o.id, reason: 'delivery_or_compatibility_or_margin_or_credit' });
        continue;
      }
      candidates.push({ o, maxQuantity, coefficient: objectiveCoefficient(o, weights) });
    }

    const take = (o: OptimizerOpportunity, requested: number): number => {
      const product = supplyRemaining[o.product_id] ?? 0;
      const route = routeRemaining[o.route_id] ?? Number.POSITIVE_INFINITY;
      const grant = Math.max(0, Math.min(requested, product, route));
      if (grant <= 0) return 0;
      supplyRemaining[o.product_id] = product - grant;
      if (Number.isFinite(route)) routeRemaining[o.route_id] = route - grant;
      allocated[o.id] = (allocated[o.id] ?? 0) + grant;
      return grant;
    };

    // Honour strategic commitments first, then fill remaining capacity by value.
    for (const candidate of candidates.filter(c => c.o.strategic && c.o.commitment > 0).sort((a, b) => b.coefficient - a.coefficient)) {
      const { o, maxQuantity } = candidate;
      if (o.commitment > maxQuantity) { infeasible.push({ opportunityId: o.id, requirement: 'strategic_commitment', shortfall: round(o.commitment - maxQuantity) }); continue; }
      take(o, o.commitment);
    }
    for (const candidate of [...candidates].sort((a, b) => b.coefficient - a.coefficient)) {
      const remainingForOpportunity = candidate.maxQuantity - (allocated[candidate.o.id] ?? 0);
      if (remainingForOpportunity > 0) take(candidate.o, remainingForOpportunity);
    }

    const allocations: Allocation[] = candidates
      .filter(candidate => (allocated[candidate.o.id] ?? 0) > 0.001)
      .map(candidate => ({ opportunityId: candidate.o.id, quantity: round((allocated[candidate.o.id] ?? 0)), netContribution: round((allocated[candidate.o.id] ?? 0) * unitMargin(candidate.o), 2) }));

    const objectiveValue = candidates.reduce((sum, candidate) => sum + candidate.coefficient * (allocated[candidate.o.id] ?? 0), 0);
    const binding: string[] = [];
    for (const [product, supply] of Object.entries(problem.product_supply)) if ((supplyRemaining[product] ?? 0) < 0.001 && supply - (problem.safety_stock[product] ?? 0) > 0) binding.push(`product_supply:${product}`);
    for (const [route, capacity] of Object.entries(problem.route_capacity)) if ((routeRemaining[route] ?? 0) < 0.001 && capacity > 0) binding.push(`route_capacity:${route}`);

    return {
      solverStatus: allocations.length ? 'FEASIBLE' : 'INFEASIBLE',
      engine: 'local-heuristic',
      objectiveValue: round(objectiveValue, 2),
      executionDurationMs: round(performance.now() - started, 2),
      allocations,
      diagnostics: {
        bindingConstraints: binding,
        unmetDemand: problem.opportunities.filter(o => o.demand > (allocated[o.id] ?? 0) + 0.001).map(o => ({ opportunityId: o.id, quantity: round(o.demand - (allocated[o.id] ?? 0)) })),
        unusedInventory: Object.fromEntries(Object.keys(problem.product_supply).map(product => [product, round(Math.max(0, supplyRemaining[product] ?? 0))])),
        excludedOpportunities: excluded,
        infeasibleRequirements: infeasible,
      },
    };
  }
}

// Calls the real OR-Tools service over HTTP. Used when OPTIMIZER_URL is set.
export class HttpOptimizerClient implements OptimizerClient {
  constructor(private readonly baseUrl: string, private readonly timeoutMs = 8000) {}
  async solve(problem: AllocationProblem): Promise<AllocationResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(`${this.baseUrl.replace(/\/$/, '')}/optimize`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(problem), signal: controller.signal,
      });
      if (!response.ok) throw new Error(`Optimizer responded ${response.status}`);
      const payload = await response.json() as Omit<AllocationResult, 'engine'>;
      return { ...payload, engine: 'or-tools' };
    } finally {
      clearTimeout(timer);
    }
  }
}

// Tries the primary client and transparently falls back on failure so a demo
// never dead-ends when the Python service is offline.
export class FallbackOptimizerClient implements OptimizerClient {
  constructor(private readonly primary: OptimizerClient, private readonly fallback: OptimizerClient) {}
  async solve(problem: AllocationProblem): Promise<AllocationResult> {
    try {
      return await this.primary.solve(problem);
    } catch (error) {
      console.warn(JSON.stringify({ level: 'warn', message: 'Optimizer primary client failed; using local heuristic', error: error instanceof Error ? error.message : 'unknown' }));
      return this.fallback.solve(problem);
    }
  }
}

export function createOptimizerClient(env: NodeJS.ProcessEnv = process.env): OptimizerClient {
  const local = new LocalOptimizerClient();
  if (!env.OPTIMIZER_URL) return local;
  return new FallbackOptimizerClient(new HttpOptimizerClient(env.OPTIMIZER_URL), local);
}

function round(value: number, dp = 3): number { return Number(value.toFixed(dp)); }
