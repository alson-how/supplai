import type { Scenario, ScenarioRecommendation } from '../domain/scenarios.js';
import type { ScenarioRepository } from './scenario-repository.js';

export class InMemoryScenarioRepository implements ScenarioRepository {
  private readonly scenarios: Scenario[] = [];
  private readonly recommendationsByScenario = new Map<string, ScenarioRecommendation[]>();

  listScenarios = (organisationId: string) =>
    this.scenarios.filter(scenario => scenario.organisationId === organisationId).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  getScenario = (organisationId: string, id: string) =>
    this.scenarios.find(scenario => scenario.id === id && scenario.organisationId === organisationId);

  createScenario(scenario: Scenario) {
    this.scenarios.push(scenario);
    return scenario;
  }

  saveScenario(scenario: Scenario) {
    const index = this.scenarios.findIndex(record => record.id === scenario.id && record.organisationId === scenario.organisationId);
    if (index < 0) this.scenarios.push(scenario); else this.scenarios[index] = scenario;
    return scenario;
  }

  deleteScenario(organisationId: string, id: string) {
    const index = this.scenarios.findIndex(record => record.id === id && record.organisationId === organisationId);
    if (index < 0) return false;
    this.scenarios.splice(index, 1);
    this.recommendationsByScenario.delete(id);
    return true;
  }

  setRecommendations(organisationId: string, scenarioId: string, recommendations: ScenarioRecommendation[]) {
    this.recommendationsByScenario.set(scenarioId, recommendations.filter(record => record.organisationId === organisationId));
  }

  recommendations(organisationId: string, scenarioId: string) {
    return (this.recommendationsByScenario.get(scenarioId) ?? []).filter(record => record.organisationId === organisationId);
  }

  getRecommendation(organisationId: string, scenarioId: string, recommendationId: string) {
    return this.recommendations(organisationId, scenarioId).find(record => record.id === recommendationId);
  }

  updateRecommendation(organisationId: string, scenarioId: string, recommendationId: string, patch: Partial<ScenarioRecommendation>) {
    const record = this.getRecommendation(organisationId, scenarioId, recommendationId);
    if (!record) return undefined;
    Object.assign(record, patch);
    return record;
  }
}
