import type { CoreDataRepository } from '../repositories/core-data-repository.js';
import type { ScenarioService } from './scenario-service.js';
import { createAiProvider, type AiProvider, type ExtractedSignal, type PlanQuestionInput } from './ai-provider.js';

export interface PlanAnswer { provider: string; answer: string }
export interface SignalExtractionResult { provider: string; signals: ExtractedSignal[]; persisted: number }

// Read-only AI assistant over the current plan. It never mutates allocations —
// it explains and answers using the structured facts the optimiser produced, and
// turns free-text market news into structured signals for review.
export class AssistantService {
  constructor(
    private readonly scenarios: ScenarioService,
    private readonly coreData: CoreDataRepository,
    private readonly ai: AiProvider = createAiProvider(),
  ) {}

  async ask(organisationId: string, scenarioId: string, question: string): Promise<PlanAnswer | undefined> {
    const scenario = await this.scenarios.get(organisationId, scenarioId);
    if (!scenario) return undefined;
    const recommendations = await this.scenarios.recommendations(organisationId, scenarioId);
    const run = scenario.lastRun;
    const input: PlanQuestionInput = {
      question,
      scenarioName: scenario.name,
      run: {
        engine: run?.engine ?? 'n/a',
        solverStatus: run?.solverStatus ?? 'NOT_RUN',
        expectedRevenue: run?.expectedRevenue ?? 0,
        marginPercent: run?.marginPercent ?? 0,
        recommendationCount: run?.recommendationCount ?? recommendations.length,
      },
      recommendations: recommendations.slice(0, 40).map(rec => ({
        rank: rec.rank, product: rec.product, customer: rec.customer, market: rec.market, quantity: rec.quantity,
        marginPercent: rec.marginPercent, feasibility: rec.feasibility, status: rec.status, constraints: rec.constraints,
      })),
      diagnostics: {
        bindingConstraints: run?.diagnostics.bindingConstraints ?? [],
        unmetDemand: run?.diagnostics.unmetDemand.length ?? 0,
        excludedOpportunities: run?.diagnostics.excludedOpportunities.length ?? 0,
        infeasibleRequirements: run?.diagnostics.infeasibleRequirements.length ?? 0,
      },
    };
    const answer = await this.ai.answerPlanQuestion(input);
    return { provider: this.ai.name, answer };
  }

  async extractSignals(organisationId: string, text: string, commit = false): Promise<SignalExtractionResult> {
    const [markets, products] = await Promise.all([this.coreData.markets(organisationId), this.coreData.products(organisationId)]);
    const signals = await this.ai.extractSignals(text, {
      markets: markets.map(market => market.country),
      productCodes: products.map(product => product.code),
    });
    let persisted = 0;
    if (commit) {
      const marketByCountry = new Map(markets.map(market => [market.country.toLowerCase(), market]));
      const productByCode = new Map(products.map(product => [product.code.toLowerCase(), product]));
      const observedAt = new Date().toISOString().slice(0, 10);
      for (const signal of signals) {
        const market = marketByCountry.get(signal.marketCountry.toLowerCase());
        if (!market) continue;
        const product = signal.productCode ? productByCode.get(signal.productCode.toLowerCase()) : undefined;
        await this.coreData.upsertMarketSignal(organisationId, {
          marketId: market.id,
          productId: product?.id ?? '', // '' = market-wide (all products)
          title: signal.title,
          signalType: signal.signalType,
          summary: signal.summary,
          sentiment: signal.sentiment,
          impactScore: signal.impactScore,
          source: `${this.ai.name} extraction`,
          observedAt,
        });
        persisted++;
      }
    }
    return { provider: this.ai.name, signals, persisted };
  }
}
