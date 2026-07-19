import { createAiProvider, type AiProvider, type RecommendationExplanationInput } from './ai-provider.js';

export type { RecommendationExplanationInput } from './ai-provider.js';

// Thin wrapper kept for the scenario service's call site. Backed by the AI
// provider: deterministic by default, Claude when AI_PROVIDER=anthropic + AI_API_KEY.
// If the provider throws (e.g. a transient API error) the deterministic provider
// produces the explanation so a run never fails on the explanation step.
export class RecommendationExplanationService {
  constructor(private readonly provider: AiProvider = createAiProvider()) {}

  async explain(input: RecommendationExplanationInput): Promise<string> {
    try {
      return await this.provider.explainRecommendation(input);
    } catch (error) {
      console.warn(JSON.stringify({ level: 'warn', message: 'AI explanation failed; using deterministic fallback', error: error instanceof Error ? error.message : 'unknown' }));
      const { DeterministicAiProvider } = await import('./ai-provider.js');
      return new DeterministicAiProvider().explainRecommendation(input);
    }
  }
}
