// Explanation boundary. Providers receive only authorised, already-calculated
// structured fields and return prose — they must never compute or mutate an
// allocation. The deterministic provider needs no API key and stays first-class;
// an OpenAI-compatible or Anthropic adapter can be dropped in behind the same
// interface without touching domain services.

export interface RecommendationExplanationInput {
  product: string;
  customer: string;
  market: string;
  quantity: number;
  marginPercent: number;
  inventoryImpact: string;
  productionImpact: string;
  logisticsImpact: string;
  constraints: string[];
  risks: string[];
  alternatives: string[];
}

export interface ExplanationProvider {
  explainRecommendation(input: RecommendationExplanationInput): Promise<string>;
}

export class DeterministicExplanationProvider implements ExplanationProvider {
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
}

export class RecommendationExplanationService {
  constructor(private readonly provider: ExplanationProvider = new DeterministicExplanationProvider()) {}
  explain(input: RecommendationExplanationInput): Promise<string> {
    return this.provider.explainRecommendation(input);
  }
}
