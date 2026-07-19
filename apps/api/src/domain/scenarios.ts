import { z } from 'zod';
import type { OptimizerOpportunity, OptimizerWeights } from '../services/optimizer-client.js';
import { DEFAULT_WEIGHTS } from '../services/optimizer-client.js';

// Scenario assumptions are the planner-facing knobs. They only ever adjust the
// authorised structured inputs handed to the optimiser — they never compute an
// allocation themselves. Everything has a default so a freshly created scenario
// is immediately runnable.
export const assumptionsSchema = z.object({
  forecastMethod: z.enum(['MOVING_AVERAGE', 'WEIGHTED_MOVING_AVERAGE', 'EXPONENTIAL_SMOOTHING', 'SEASONAL_TREND']).default('WEIGHTED_MOVING_AVERAGE'),
  demandUpliftPercent: z.number().min(-90).max(300).default(0),
  demandUpliftByMarket: z.record(z.string(), z.number().min(-90).max(300)).default({}),
  priceAdjustmentPercent: z.number().min(-50).max(100).default(0),
  productionCostAdjustmentPercent: z.number().min(-50).max(100).default(0),
  logisticsCostAdjustmentPercent: z.number().min(-50).max(200).default(0),
  safetyStockFactor: z.number().min(0).max(0.9).default(0.1),
  marginThreshold: z.number().min(0).max(1).default(0.09),
  marginWeight: z.number().min(0).max(100).default(DEFAULT_WEIGHTS.margin),
  strategicWeight: z.number().min(0).max(100).default(DEFAULT_WEIGHTS.strategic),
  riskWeight: z.number().min(0).max(100).default(DEFAULT_WEIGHTS.risk),
  inventoryWeight: z.number().min(0).max(100).default(DEFAULT_WEIGHTS.inventory),
  enforceStrategicCommitments: z.boolean().default(true),
  includeInventoryHoldingCost: z.boolean().default(true),
});

export type ScenarioAssumptions = z.infer<typeof assumptionsSchema>;

export function defaultAssumptions(): ScenarioAssumptions {
  return assumptionsSchema.parse({});
}

export type ScenarioStatus = 'DRAFT' | 'RUNNING' | 'COMPLETED' | 'FAILED';

export interface ScenarioRunSummary {
  runId: string;
  solverStatus: string;
  engine: string;
  objectiveValue: number;
  expectedRevenue: number;
  expectedNetMargin: number;
  marginPercent: number;
  totalAllocatedQuantity: number;
  recommendationCount: number;
  executionDurationMs: number;
  generatedAt: string;
  diagnostics: {
    bindingConstraints: string[];
    unmetDemand: Array<{ opportunityId: string; quantity: number }>;
    unusedInventory: Record<string, number>;
    excludedOpportunities: Array<{ opportunityId: string; reason: string }>;
    infeasibleRequirements: Array<{ opportunityId: string; requirement: string; shortfall: number }>;
  };
}

export interface Scenario {
  id: string;
  organisationId: string;
  name: string;
  description: string;
  scenarioType: 'BASELINE' | 'WHAT_IF' | 'CLONE';
  baselineScenarioId?: string;
  status: ScenarioStatus;
  assumptions: ScenarioAssumptions;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  executedAt?: string;
  lastRun?: ScenarioRunSummary;
}

export type DecisionStatus = 'PENDING_REVIEW' | 'APPROVED' | 'MODIFIED' | 'REJECTED';

export interface ScenarioRecommendation {
  id: string;
  organisationId: string;
  scenarioId: string;
  runId: string;
  rank: number;
  opportunityId: string;
  productId: string;
  customerId: string;
  marketId: string;
  product: string;
  customer: string;
  market: string;
  route: string;
  quantity: number;
  price: number;
  revenue: number;
  netMargin: number;
  marginPercent: number;
  leadTimeDays: number;
  confidence: number;
  feasibility: 'FEASIBLE' | 'CONSTRAINT_WARNING';
  status: DecisionStatus;
  rationale: string;
  explanation: string;
  constraints: string[];
  originalQuantity?: number;
  decisionReason?: string;
  decidedBy?: string;
  decidedAt?: string;
}

export interface RecommendationDecisionInput {
  decision: Exclude<DecisionStatus, 'PENDING_REVIEW'>;
  finalQuantity?: number;
  reason: string;
}

// Apply a planner decision to a recommendation. MODIFIED with a final quantity
// rescales revenue and net margin at the unchanged per-unit economics; the
// decision is pure so the service and any future persistence layer share it.
export function decideRecommendation(recommendation: ScenarioRecommendation, input: RecommendationDecisionInput, userId: string, decidedAt: string): ScenarioRecommendation {
  const original = recommendation.originalQuantity ?? recommendation.quantity;
  const unitMargin = recommendation.quantity ? recommendation.netMargin / recommendation.quantity : 0;
  const quantity = input.decision === 'MODIFIED' && input.finalQuantity !== undefined ? input.finalQuantity : recommendation.quantity;
  return {
    ...recommendation,
    status: input.decision,
    quantity: round(quantity),
    revenue: round(quantity * recommendation.price, 2),
    netMargin: round(quantity * unitMargin, 2),
    originalQuantity: round(original),
    decisionReason: input.reason,
    decidedBy: userId,
    decidedAt,
  };
}

export function weightsFromAssumptions(assumptions: ScenarioAssumptions): OptimizerWeights {
  return { margin: assumptions.marginWeight, strategic: assumptions.strategicWeight, risk: assumptions.riskWeight, inventory: assumptions.inventoryWeight };
}

// Apply assumptions to a single base opportunity. Pure: the returned opportunity
// is a new object with the adjusted structured facts the optimiser will consume.
export function applyAssumptions(opportunity: OptimizerOpportunity, assumptions: ScenarioAssumptions): OptimizerOpportunity {
  const marketUplift = assumptions.demandUpliftByMarket[opportunity.market_id] ?? 0;
  const demandFactor = (1 + assumptions.demandUpliftPercent / 100) * (1 + marketUplift / 100);
  return {
    ...opportunity,
    demand: round(Math.max(0, opportunity.demand * demandFactor)),
    price: round(Math.max(0, opportunity.price * (1 + assumptions.priceAdjustmentPercent / 100)), 2),
    production_cost: round(Math.max(0, opportunity.production_cost * (1 + assumptions.productionCostAdjustmentPercent / 100)), 2),
    logistics_cost: round(Math.max(0, opportunity.logistics_cost * (1 + assumptions.logisticsCostAdjustmentPercent / 100)), 2),
    inventory_cost: assumptions.includeInventoryHoldingCost ? opportunity.inventory_cost : 0,
    margin_threshold: assumptions.marginThreshold,
    commitment: assumptions.enforceStrategicCommitments ? opportunity.commitment : 0,
  };
}

export interface ScenarioComparison {
  baselineScenarioId: string;
  candidateScenarioId: string;
  objectiveDelta: number;
  revenueDelta: number;
  revenueDeltaPercent: number;
  netMarginDelta: number;
  netMarginDeltaPercent: number;
  marginPercentDelta: number;
  allocatedQuantityDelta: number;
  recommendationCountDelta: number;
}

export function compareScenarios(baseline: Scenario, candidate: Scenario): ScenarioComparison {
  const a = baseline.lastRun;
  const b = candidate.lastRun;
  if (!a || !b) throw new Error('Both scenarios must be run before they can be compared');
  return {
    baselineScenarioId: baseline.id,
    candidateScenarioId: candidate.id,
    objectiveDelta: round(b.objectiveValue - a.objectiveValue, 2),
    revenueDelta: round(b.expectedRevenue - a.expectedRevenue, 2),
    revenueDeltaPercent: percentDelta(a.expectedRevenue, b.expectedRevenue),
    netMarginDelta: round(b.expectedNetMargin - a.expectedNetMargin, 2),
    netMarginDeltaPercent: percentDelta(a.expectedNetMargin, b.expectedNetMargin),
    marginPercentDelta: round(b.marginPercent - a.marginPercent, 2),
    allocatedQuantityDelta: round(b.totalAllocatedQuantity - a.totalAllocatedQuantity),
    recommendationCountDelta: b.recommendationCount - a.recommendationCount,
  };
}

function percentDelta(from: number, to: number): number {
  if (from === 0) return to === 0 ? 0 : 100;
  return round(((to - from) / Math.abs(from)) * 100, 2);
}

function round(value: number, dp = 3): number { return Number(value.toFixed(dp)); }
