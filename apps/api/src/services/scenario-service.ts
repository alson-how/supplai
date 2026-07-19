import { randomUUID } from 'node:crypto';
import type { CoreDataRepository } from '../repositories/core-data-repository.js';
import type { ScenarioRepository } from '../repositories/scenario-repository.js';
import { availableCredit, availableToPromise, isRouteFeasible, latestPriceSignal, logisticsEstimate, type Customer, type InventoryPosition, type LogisticsRoute, type Market, type MarketSignal, type Product, type ProductionPlan } from '../domain/core-data.js';
import { applyAssumptions, compareScenarios, decideRecommendation, defaultAssumptions, weightsFromAssumptions, type RecommendationDecisionInput, type Scenario, type ScenarioAssumptions, type ScenarioComparison, type ScenarioRecommendation, type ScenarioRunSummary } from '../domain/scenarios.js';
import { buildAllocationProblem, type AllocationResult, type OptimizerClient, type OptimizerOpportunity } from './optimizer-client.js';
import { ForecastService, type ForecastReference } from './forecast-service.js';
import { RecommendationExplanationService } from './recommendation-explanation-service.js';

const PLAN_DISPATCH_DATE = '2026-08-01';
const PLAN_REQUIRED_DATE = '2026-08-21';

interface OpportunityContext {
  opportunity: OptimizerOpportunity;
  product: Product;
  customer: Customer;
  market: Market;
  route: LogisticsRoute;
  forecastConfidence: number;
  priceReliability: number;
}

interface AssembledProblem {
  opportunities: OptimizerOpportunity[];
  productSupply: Record<string, number>;
  routeCapacity: Record<string, number>;
  contexts: Map<string, OpportunityContext>;
  signals: MarketSignal[];
}

export interface ScenarioRunResult {
  scenario: Scenario;
  run: ScenarioRunSummary;
  recommendations: ScenarioRecommendation[];
}

export class ScenarioService {
  private readonly forecasts: ForecastService;
  private readonly explanations: RecommendationExplanationService;

  constructor(
    private readonly coreData: CoreDataRepository,
    private readonly scenarios: ScenarioRepository,
    private readonly optimizer: OptimizerClient,
    explanations = new RecommendationExplanationService(),
    forecastService?: ForecastService,
  ) {
    this.forecasts = forecastService ?? new ForecastService(coreData);
    this.explanations = explanations;
  }

  list(organisationId: string): Promise<Scenario[]> {
    return this.scenarios.listScenarios(organisationId);
  }

  get(organisationId: string, id: string): Promise<Scenario | undefined> {
    return this.scenarios.getScenario(organisationId, id);
  }

  recommendations(organisationId: string, scenarioId: string): Promise<ScenarioRecommendation[]> {
    return this.scenarios.recommendations(organisationId, scenarioId);
  }

  // Approve / modify / reject a persisted recommendation, recording an audit
  // event. Returns undefined when the scenario or recommendation is unknown.
  async decide(organisationId: string, userId: string, scenarioId: string, recommendationId: string, input: RecommendationDecisionInput): Promise<ScenarioRecommendation | undefined> {
    const existing = await this.scenarios.getRecommendation(organisationId, scenarioId, recommendationId);
    if (!existing) return undefined;
    const before = { ...existing };
    const decided = decideRecommendation(existing, input, userId, new Date().toISOString());
    const updated = await this.scenarios.updateRecommendation(organisationId, scenarioId, recommendationId, decided);
    if (!updated) return undefined;
    await this.coreData.createAudit(organisationId, userId, 'AllocationRecommendation', recommendationId, input.decision, before, updated);
    return updated;
  }

  create(organisationId: string, userId: string, input: { name: string; description?: string; assumptions?: Partial<ScenarioAssumptions> }): Promise<Scenario> {
    const now = new Date().toISOString();
    const scenario: Scenario = {
      id: `scenario-${randomUUID()}`,
      organisationId,
      name: input.name,
      description: input.description ?? '',
      scenarioType: 'WHAT_IF',
      status: 'DRAFT',
      assumptions: { ...defaultAssumptions(), ...input.assumptions },
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
    };
    return this.scenarios.createScenario(scenario);
  }

  async clone(organisationId: string, userId: string, sourceId: string, overrides: { name?: string; description?: string } = {}): Promise<Scenario | undefined> {
    const source = await this.scenarios.getScenario(organisationId, sourceId);
    if (!source) return undefined;
    const now = new Date().toISOString();
    const scenario: Scenario = {
      id: `scenario-${randomUUID()}`,
      organisationId,
      name: overrides.name ?? `${source.name} (copy)`,
      description: overrides.description ?? source.description,
      scenarioType: 'CLONE',
      baselineScenarioId: source.id,
      status: 'DRAFT',
      assumptions: { ...source.assumptions },
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
    };
    return this.scenarios.createScenario(scenario);
  }

  async updateAssumptions(organisationId: string, id: string, assumptions: ScenarioAssumptions): Promise<Scenario | undefined> {
    const scenario = await this.scenarios.getScenario(organisationId, id);
    if (!scenario) return undefined;
    scenario.assumptions = assumptions;
    scenario.status = 'DRAFT';
    scenario.updatedAt = new Date().toISOString();
    return this.scenarios.saveScenario(scenario);
  }

  async compare(organisationId: string, baselineId: string, candidateId: string): Promise<ScenarioComparison | undefined> {
    const [baseline, candidate] = await Promise.all([this.scenarios.getScenario(organisationId, baselineId), this.scenarios.getScenario(organisationId, candidateId)]);
    if (!baseline || !candidate) return undefined;
    return compareScenarios(baseline, candidate);
  }

  async run(organisationId: string, userId: string, id: string): Promise<ScenarioRunResult | undefined> {
    const scenario = await this.scenarios.getScenario(organisationId, id);
    if (!scenario) return undefined;
    scenario.status = 'RUNNING';
    scenario.updatedAt = new Date().toISOString();
    await this.scenarios.saveScenario(scenario);

    try {
      const assembled = await this.assemble(organisationId, scenario.assumptions);
      const safetyStock = Object.fromEntries(Object.entries(assembled.productSupply).map(([product, supply]) => [product, round(supply * scenario.assumptions.safetyStockFactor)]));
      const problem = buildAllocationProblem({
        opportunities: assembled.opportunities,
        productSupply: assembled.productSupply,
        safetyStock,
        routeCapacity: assembled.routeCapacity,
        weights: weightsFromAssumptions(scenario.assumptions),
      });
      const result = await this.optimizer.solve(problem);
      const runId = `run-${randomUUID()}`;
      const recommendations = await this.toRecommendations(organisationId, scenario.id, runId, result, assembled.contexts, assembled.signals);
      const run = summarise(runId, result, recommendations);

      await this.scenarios.setRecommendations(organisationId, scenario.id, recommendations);
      scenario.status = 'COMPLETED';
      scenario.executedAt = run.generatedAt;
      scenario.updatedAt = run.generatedAt;
      scenario.lastRun = run;
      await this.scenarios.saveScenario(scenario);
      await this.coreData.createAudit(organisationId, userId, 'Scenario', scenario.id, 'RUN', null, { runId, objectiveValue: run.objectiveValue, recommendationCount: run.recommendationCount });
      return { scenario, run, recommendations };
    } catch (error) {
      scenario.status = 'FAILED';
      scenario.updatedAt = new Date().toISOString();
      await this.scenarios.saveScenario(scenario);
      throw error;
    }
  }

  // Request mapper: turn authorised domain data + demand forecasts into the
  // optimiser's opportunity/supply/route inputs, then apply scenario
  // assumptions. All reference data is loaded once up front.
  private async assemble(organisationId: string, assumptions: ScenarioAssumptions): Promise<AssembledProblem> {
    const [reference, inventory, plans, routes, signals] = await Promise.all([
      this.forecasts.reference(organisationId),
      this.coreData.inventoryPositions(organisationId),
      this.coreData.productionPlans(organisationId),
      this.coreData.logisticsRoutes(organisationId),
      this.coreData.marketSignals(organisationId),
    ]);
    const products = reference.products.filter(product => product.status === 'ACTIVE');
    const customers = reference.customers.filter(customer => customer.status === 'ACTIVE');
    const marketsById = new Map(reference.markets.map(market => [market.id, market]));
    const productSupply = supplyByProduct(products, inventory, plans);
    const routeCapacity: Record<string, number> = {};
    const opportunities: OptimizerOpportunity[] = [];
    const contexts = new Map<string, OpportunityContext>();

    for (const product of products) {
      const inventoryCost = holdingCostPerUnit(inventory, product.id);
      for (const customer of customers) {
        const market = marketsById.get(customer.marketId);
        if (!market) continue;
        const route = bestRouteToMarket(routes, market.id);
        if (!route) continue; // cannot serve this market at all
        const price = latestPriceSignal(reference.prices, product.id, market.id);
        if (!price) continue;

        const forecast = this.forecasts.forecastForCustomer(reference, product, customer, market, assumptions.forecastMethod);
        const logisticsCost = round(logisticsEstimate(route, 1).costPerUnit, 2);
        const feasible = isRouteFeasible(route, PLAN_DISPATCH_DATE, PLAN_REQUIRED_DATE, product.minimumOrderQuantity).feasible;
        const base: OptimizerOpportunity = {
          id: `${product.id}__${customer.id}`,
          product_id: product.id,
          customer_id: customer.id,
          market_id: market.id,
          route_id: route.id,
          demand: forecast.predictedQuantity,
          price: round(price.marketPricePerUnit, 2),
          production_cost: round(product.productionCostPerUnit, 2),
          logistics_cost: logisticsCost,
          inventory_cost: inventoryCost,
          risk_cost: round(price.marketPricePerUnit * (customer.paymentRiskScore * 0.02 + market.riskScore * 0.01), 2),
          available_credit: availableCredit(customer),
          minimum_order: product.minimumOrderQuantity,
          margin_threshold: assumptions.marginThreshold,
          strategic: customer.strategicAccount,
          commitment: customer.strategicAccount ? Math.max(product.minimumOrderQuantity, round(forecast.predictedQuantity * 0.25)) : 0,
          delivery_feasible: feasible,
          compatible: true,
        };
        const opportunity = applyAssumptions(base, assumptions);
        opportunities.push(opportunity);
        routeCapacity[route.id] = route.capacityPerPeriod;
        contexts.set(opportunity.id, { opportunity, product, customer, market, route, forecastConfidence: forecast.confidenceScore, priceReliability: price.reliabilityScore });
      }
    }
    return { opportunities, productSupply, routeCapacity, contexts, signals };
  }

  // Response mapper: turn solver allocations into ranked, explained recommendations.
  private async toRecommendations(organisationId: string, scenarioId: string, runId: string, result: AllocationResult, contexts: Map<string, OpportunityContext>, signals: MarketSignal[]): Promise<ScenarioRecommendation[]> {
    const unmet = new Set(result.diagnostics.unmetDemand.map(entry => entry.opportunityId));
    const ordered = [...result.allocations].sort((a, b) => b.netContribution - a.netContribution);
    const recommendations: ScenarioRecommendation[] = [];

    for (const [index, allocation] of ordered.entries()) {
      const context = contexts.get(allocation.opportunityId);
      if (!context) continue;
      const { opportunity, product, customer, market, route } = context;
      const unitMargin = opportunity.price - opportunity.production_cost - opportunity.logistics_cost - opportunity.inventory_cost - opportunity.risk_cost;
      const revenue = round(allocation.quantity * opportunity.price, 2);
      const netMargin = round(allocation.quantity * unitMargin, 2);
      const marginPercent = round(opportunity.price ? (unitMargin / opportunity.price) * 100 : 0, 2);
      const creditLimited = opportunity.price ? opportunity.available_credit / opportunity.price < opportunity.demand - 0.001 : false;
      const feasibility = unmet.has(allocation.opportunityId) ? 'CONSTRAINT_WARNING' : 'FEASIBLE';
      const confidence = round(Math.min(0.98, context.forecastConfidence * context.priceReliability * (1 - market.riskScore * 0.15)), 2);

      const constraints = buildConstraints({ unmet: unmet.has(allocation.opportunityId), creditLimited, strategic: opportunity.strategic, quantity: allocation.quantity, demand: opportunity.demand });
      const risks = buildRisks(signals, product.id, market, customer);
      const rationale = `Rank ${index + 1}: ${marginPercent.toFixed(1)}% net margin on ${allocation.quantity} tonnes${opportunity.strategic ? ', protecting a strategic account' : ''}.`;
      const explanation = await this.explanations.explain({
        product: product.name,
        customer: customer.name,
        market: market.country,
        quantity: allocation.quantity,
        marginPercent,
        inventoryImpact: `Draws ${allocation.quantity} tonnes of available ${product.code} stock.`,
        productionImpact: opportunity.strategic ? 'Aligns with confirmed production for a strategic commitment.' : 'Uses uncommitted available production.',
        logisticsImpact: `Ships via ${route.transportMode} with a ${route.estimatedLeadTimeDays}-day lead time.`,
        constraints,
        risks,
        alternatives: opportunity.strategic ? ['redirect volume to a higher spot-margin market'] : ['retain inventory for a higher-margin export order'],
      });

      recommendations.push({
        id: `rec-${randomUUID()}`,
        organisationId,
        scenarioId,
        runId,
        rank: index + 1,
        opportunityId: allocation.opportunityId,
        productId: product.id,
        customerId: customer.id,
        marketId: market.id,
        product: product.name,
        customer: customer.name,
        market: market.country,
        route: `${route.originLocationId} → ${market.country}`,
        quantity: allocation.quantity,
        price: opportunity.price,
        revenue,
        netMargin,
        marginPercent,
        leadTimeDays: route.estimatedLeadTimeDays,
        confidence,
        feasibility,
        status: 'PENDING_REVIEW',
        rationale,
        explanation,
        constraints,
      });
    }
    return recommendations;
  }
}

function supplyByProduct(products: Product[], positions: InventoryPosition[], plans: ProductionPlan[]): Record<string, number> {
  const supply: Record<string, number> = {};
  for (const product of products) {
    const onHand = positions.filter(position => position.productId === product.id).reduce((sum, position) => sum + availableToPromise(position), 0);
    const planned = plans.filter(plan => plan.productId === product.id).reduce((sum, plan) => sum + plan.availableQuantity, 0);
    supply[product.id] = round(onHand + planned);
  }
  return supply;
}

function holdingCostPerUnit(positions: InventoryPosition[], productId: string): number {
  const matches = positions.filter(position => position.productId === productId);
  if (matches.length === 0) return 0;
  const averageAge = matches.reduce((sum, position) => sum + position.inventoryAgeDays, 0) / matches.length;
  return round(averageAge * 0.04, 2);
}

function bestRouteToMarket(routes: LogisticsRoute[], marketId: string): LogisticsRoute | undefined {
  return routes
    .filter(route => route.destinationMarketId === marketId && route.active)
    .sort((a, b) => logisticsEstimate(a, 1).costPerUnit - logisticsEstimate(b, 1).costPerUnit)[0];
}

function buildRisks(signals: MarketSignal[], productId: string, market: Market, customer: Customer): string[] {
  const risks: string[] = [];
  if (market.riskScore >= 0.3) risks.push(`Elevated market risk in ${market.country}`);
  if (customer.paymentRiskScore >= 0.35) risks.push('Above-average payment risk');
  const negative = signals.find(signal => signal.marketId === market.id && signal.productId === productId && signal.sentiment === 'NEGATIVE');
  if (negative) risks.push(negative.title);
  return risks;
}

function buildConstraints(input: { unmet: boolean; creditLimited: boolean; strategic: boolean; quantity: number; demand: number }): string[] {
  const constraints: string[] = [];
  if (input.creditLimited) constraints.push('Customer credit limit');
  if (input.unmet && input.quantity < input.demand) constraints.push('Supply or route capacity');
  if (input.strategic) constraints.push('Strategic commitment protected');
  return constraints;
}

function summarise(runId: string, result: AllocationResult, recommendations: ScenarioRecommendation[]): ScenarioRunSummary {
  const expectedRevenue = round(recommendations.reduce((sum, record) => sum + record.revenue, 0), 2);
  const expectedNetMargin = round(recommendations.reduce((sum, record) => sum + record.netMargin, 0), 2);
  const totalAllocatedQuantity = round(recommendations.reduce((sum, record) => sum + record.quantity, 0));
  return {
    runId,
    solverStatus: result.solverStatus,
    engine: result.engine,
    expectedRevenue,
    expectedNetMargin,
    marginPercent: round(expectedRevenue ? (expectedNetMargin / expectedRevenue) * 100 : 0, 2),
    totalAllocatedQuantity,
    recommendationCount: recommendations.length,
    executionDurationMs: result.executionDurationMs,
    generatedAt: new Date().toISOString(),
    objectiveValue: result.objectiveValue,
    diagnostics: result.diagnostics,
  };
}

function round(value: number, dp = 3): number { return Number(value.toFixed(dp)); }
