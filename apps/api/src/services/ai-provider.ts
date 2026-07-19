import Anthropic from '@anthropic-ai/sdk';

// The AI boundary. Providers receive only authorised, already-calculated
// structured facts and return prose or structured signals — they never compute
// or mutate an allocation. The deterministic provider needs no API key and stays
// first-class; the Anthropic provider is used only when AI_PROVIDER=anthropic and
// AI_API_KEY are set. Default model is claude-opus-4-8 (override with AI_MODEL).

export interface RecommendationExplanationInput {
  product: string; customer: string; market: string; quantity: number; marginPercent: number;
  inventoryImpact: string; productionImpact: string; logisticsImpact: string;
  constraints: string[]; risks: string[]; alternatives: string[];
}

export interface PlanRecommendationFact {
  rank: number; product: string; customer: string; market: string; quantity: number;
  marginPercent: number; feasibility: string; status: string; constraints: string[];
}
export interface PlanQuestionInput {
  question: string;
  scenarioName: string;
  run: { engine: string; solverStatus: string; expectedRevenue: number; marginPercent: number; recommendationCount: number };
  recommendations: PlanRecommendationFact[];
  diagnostics: { bindingConstraints: string[]; unmetDemand: number; excludedOpportunities: number; infeasibleRequirements: number };
}

export type SignalSentiment = 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE';
export type SignalType = 'PRICING' | 'DEMAND_INCREASE' | 'DEMAND_DECREASE' | 'COMPETITOR_ACTIVITY' | 'REGULATORY_CHANGE' | 'SUPPLY_DISRUPTION' | 'MACROECONOMIC';
export interface ExtractedSignal {
  title: string; marketCountry: string; productCode?: string; signalType: SignalType;
  sentiment: SignalSentiment; impactScore: number; summary: string;
}
export interface SignalExtractionContext { markets: string[]; productCodes: string[] }

export interface AiProvider {
  readonly name: string;
  explainRecommendation(input: RecommendationExplanationInput): Promise<string>;
  answerPlanQuestion(input: PlanQuestionInput): Promise<string>;
  extractSignals(text: string, context: SignalExtractionContext): Promise<ExtractedSignal[]>;
}

// ---- Deterministic provider (no API key) -----------------------------------

export class DeterministicAiProvider implements AiProvider {
  readonly name = 'deterministic';

  async explainRecommendation(input: RecommendationExplanationInput): Promise<string> {
    const constraints = input.constraints.length ? input.constraints.join(', ') : 'none binding';
    const risks = input.risks.length ? input.risks.join(', ') : 'none material';
    const alternative = input.alternatives[0] ?? 'retain inventory for a higher-margin order';
    return [
      `Allocate ${input.quantity} tonnes of ${input.product} to ${input.customer} in ${input.market} at an expected net margin of ${input.marginPercent.toFixed(1)}%.`,
      `${input.inventoryImpact} ${input.productionImpact} ${input.logisticsImpact}`.trim(),
      `Active constraints: ${constraints}. Key risks: ${risks}.`,
      `Best alternative considered: ${alternative}.`,
    ].join(' ');
  }

  // Rule-based answer: match the question against the plan's facts. Genuinely
  // useful without a key; a real LLM answer replaces it when configured.
  async answerPlanQuestion(input: PlanQuestionInput): Promise<string> {
    const q = input.question.toLowerCase();
    const named = input.recommendations.find(rec =>
      q.includes(rec.customer.toLowerCase()) || q.includes(rec.product.toLowerCase()) || q.includes(rec.market.toLowerCase()));
    if (named) {
      return `${named.product} → ${named.customer} (${named.market}) is ranked #${named.rank}: ${named.quantity} tonnes at ${named.marginPercent.toFixed(1)}% margin, ${named.feasibility === 'FEASIBLE' ? 'feasible' : 'with a constraint warning'}${named.constraints.length ? ` (${named.constraints.join(', ')})` : ''}. Current decision: ${named.status}.`;
    }
    if (/(top|best|highest|most profitable)/.test(q)) {
      const top = input.recommendations.slice(0, 3).map(rec => `#${rec.rank} ${rec.product} → ${rec.market} (${rec.marginPercent.toFixed(1)}%)`).join('; ');
      return `Top opportunities in "${input.scenarioName}": ${top || 'none yet'}. Expected revenue ${Math.round(input.run.expectedRevenue).toLocaleString()} at ${input.run.marginPercent.toFixed(1)}% overall margin.`;
    }
    if (/(why|constraint|limit|unmet|excluded|not )/.test(q)) {
      return `The plan is ${input.run.solverStatus} (${input.run.engine}). ${input.diagnostics.bindingConstraints.length} binding constraints, ${input.diagnostics.unmetDemand} opportunities with unmet demand, ${input.diagnostics.excludedOpportunities} excluded (margin/feasibility/credit), ${input.diagnostics.infeasibleRequirements} infeasible commitments. Binding: ${input.diagnostics.bindingConstraints.slice(0, 4).join(', ') || 'none'}.`;
    }
    return `"${input.scenarioName}": ${input.run.recommendationCount} recommendations, expected revenue ${Math.round(input.run.expectedRevenue).toLocaleString()}, ${input.run.marginPercent.toFixed(1)}% margin. Ask about a specific product, customer or market, or why something was constrained. (Configure AI_API_KEY for richer natural-language answers.)`;
  }

  // Keyword heuristic: find a market, guess sentiment/type from wording.
  async extractSignals(text: string, context: SignalExtractionContext): Promise<ExtractedSignal[]> {
    const lower = text.toLowerCase();
    const market = context.markets.find(m => lower.includes(m.toLowerCase()));
    if (!market) return [];
    const productCode = context.productCodes.find(code => lower.includes(code.toLowerCase()));
    const disruption = /(disruption|outage|congestion|force majeure|shutdown|turnaround|strike|halt)/.test(lower);
    const positive = /(surge|tight|shortage|rally|firm|rise|rising|rose|premium|strong)/.test(lower);
    const negative = /(drop|fall|falling|fell|soft|weak|oversupply|glut|decline|slump)/.test(lower) || disruption;
    const sentiment: SignalSentiment = negative ? 'NEGATIVE' : positive ? 'POSITIVE' : 'NEUTRAL';
    const signalType: SignalType = disruption ? 'SUPPLY_DISRUPTION' : positive ? 'DEMAND_INCREASE' : negative ? 'DEMAND_DECREASE' : 'PRICING';
    return [{
      title: `${market} market signal`,
      marketCountry: market,
      productCode,
      signalType,
      sentiment,
      impactScore: sentiment === 'NEUTRAL' ? 0.4 : 0.7,
      summary: text.trim().slice(0, 280),
    }];
  }
}

// ---- Anthropic (Claude) provider -------------------------------------------

export class AnthropicAiProvider implements AiProvider {
  readonly name = 'anthropic';
  private readonly model: string;
  constructor(private readonly client: Anthropic, model = process.env.AI_MODEL ?? 'claude-opus-4-8') {
    this.model = model;
  }

  private async firstText(message: Anthropic.Message): Promise<string> {
    return message.content.filter((block): block is Anthropic.TextBlock => block.type === 'text').map(block => block.text).join('\n').trim();
  }

  async explainRecommendation(input: RecommendationExplanationInput): Promise<string> {
    const message = await this.client.messages.create({
      model: this.model,
      max_tokens: 400,
      system: 'You explain a supply-allocation recommendation to a commercial planner in 2-3 sentences. Use only the facts provided; never invent numbers. Be concrete about the margin, the constraints, and the trade-off. Do not add a preamble.',
      messages: [{ role: 'user', content: JSON.stringify(input) }],
    });
    return this.firstText(message);
  }

  async answerPlanQuestion(input: PlanQuestionInput): Promise<string> {
    const message = await this.client.messages.create({
      model: this.model,
      max_tokens: 700,
      system: 'You are a supply-chain planning assistant. Answer the planner\'s question using ONLY the structured plan facts provided (the current scenario\'s run summary, ranked recommendations, and solver diagnostics). Never invent products, customers, quantities, or numbers not present. If the facts do not contain the answer, say so plainly. Be concise and specific; reference ranks and figures from the data.',
      messages: [{ role: 'user', content: `Plan facts:\n${JSON.stringify({ scenario: input.scenarioName, run: input.run, diagnostics: input.diagnostics, recommendations: input.recommendations })}\n\nQuestion: ${input.question}` }],
    });
    return this.firstText(message);
  }

  async extractSignals(text: string, context: SignalExtractionContext): Promise<ExtractedSignal[]> {
    const message = await this.client.messages.create({
      model: this.model,
      max_tokens: 1024,
      system: `Extract structured PE/PP polymer market signals from the text. Only use these market countries: ${context.markets.join(', ')}. If a product grade code is clearly referenced (${context.productCodes.join(', ')}), set productCode. signalType is one of PRICING, DEMAND_INCREASE, DEMAND_DECREASE, COMPETITOR_ACTIVITY, REGULATORY_CHANGE, SUPPLY_DISRUPTION, MACROECONOMIC. sentiment is POSITIVE, NEUTRAL, or NEGATIVE. impactScore is 0-1. Do not invent signals not supported by the text. Respond with ONLY a JSON object of the form {"signals":[{"title","marketCountry","productCode?","signalType","sentiment","impactScore","summary"}]} and no other text; return {"signals":[]} if none apply.`,
      messages: [{ role: 'user', content: text }],
    });
    const raw = await this.firstText(message);
    try {
      const start = raw.indexOf('{');
      const parsed = JSON.parse(start >= 0 ? raw.slice(start, raw.lastIndexOf('}') + 1) : raw) as { signals?: ExtractedSignal[] };
      return (parsed.signals ?? []).filter(signal => context.markets.some(m => m.toLowerCase() === signal.marketCountry.toLowerCase()));
    } catch {
      return [];
    }
  }
}

export function createAiProvider(env: NodeJS.ProcessEnv = process.env): AiProvider {
  if (env.AI_PROVIDER === 'anthropic' && env.AI_API_KEY) {
    return new AnthropicAiProvider(new Anthropic({ apiKey: env.AI_API_KEY }));
  }
  return new DeterministicAiProvider();
}
