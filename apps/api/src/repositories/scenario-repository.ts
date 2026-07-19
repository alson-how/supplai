import type { Scenario, ScenarioRecommendation } from '../domain/scenarios.js';

export interface ScenarioRepository {
  listScenarios(organisationId: string): Scenario[];
  getScenario(organisationId: string, id: string): Scenario | undefined;
  createScenario(scenario: Scenario): Scenario;
  saveScenario(scenario: Scenario): Scenario;
  deleteScenario(organisationId: string, id: string): boolean;
  setRecommendations(organisationId: string, scenarioId: string, recommendations: ScenarioRecommendation[]): void;
  recommendations(organisationId: string, scenarioId: string): ScenarioRecommendation[];
  getRecommendation(organisationId: string, scenarioId: string, recommendationId: string): ScenarioRecommendation | undefined;
  updateRecommendation(organisationId: string, scenarioId: string, recommendationId: string, patch: Partial<ScenarioRecommendation>): ScenarioRecommendation | undefined;
}
