import type { Scenario, ScenarioRecommendation } from '../domain/scenarios.js';
import type { ScenarioRepository } from './scenario-repository.js';

export class InMemoryScenarioRepository implements ScenarioRepository {
  private readonly scenarios: Scenario[] = [];
  private readonly recommendationsByScenario = new Map<string, ScenarioRecommendation[]>();

  async listScenarios(organisationId: string) {
    return this.scenarios.filter(scenario => scenario.organisationId === organisationId).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async getScenario(organisationId: string, id: string) {
    return this.scenarios.find(scenario => scenario.id === id && scenario.organisationId === organisationId);
  }

  async createScenario(scenario: Scenario) {
    this.scenarios.push(scenario);
    return scenario;
  }

  async saveScenario(scenario: Scenario) {
    const index = this.scenarios.findIndex(record => record.id === scenario.id && record.organisationId === scenario.organisationId);
    if (index < 0) this.scenarios.push(scenario); else this.scenarios[index] = scenario;
    return scenario;
  }

  async deleteScenario(organisationId: string, id: string) {
    const index = this.scenarios.findIndex(record => record.id === id && record.organisationId === organisationId);
    if (index < 0) return false;
    this.scenarios.splice(index, 1);
    this.recommendationsByScenario.delete(id);
    return true;
  }

  async setRecommendations(organisationId: string, scenarioId: string, recommendations: ScenarioRecommendation[]) {
    this.recommendationsByScenario.set(scenarioId, recommendations.filter(record => record.organisationId === organisationId));
  }

  async recommendations(organisationId: string, scenarioId: string) {
    return (this.recommendationsByScenario.get(scenarioId) ?? []).filter(record => record.organisationId === organisationId);
  }

  async getRecommendation(organisationId: string, scenarioId: string, recommendationId: string) {
    return (await this.recommendations(organisationId, scenarioId)).find(record => record.id === recommendationId);
  }

  async updateRecommendation(organisationId: string, scenarioId: string, recommendationId: string, patch: Partial<ScenarioRecommendation>) {
    const record = await this.getRecommendation(organisationId, scenarioId, recommendationId);
    if (!record) return undefined;
    Object.assign(record, patch);
    return record;
  }
}
