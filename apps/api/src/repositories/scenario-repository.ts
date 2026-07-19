import type { Scenario, ScenarioRecommendation } from '../domain/scenarios.js';

export interface ScenarioRepository {
  listScenarios(organisationId: string): Promise<Scenario[]>;
  getScenario(organisationId: string, id: string): Promise<Scenario | undefined>;
  createScenario(scenario: Scenario): Promise<Scenario>;
  saveScenario(scenario: Scenario): Promise<Scenario>;
  deleteScenario(organisationId: string, id: string): Promise<boolean>;
  setRecommendations(organisationId: string, scenarioId: string, recommendations: ScenarioRecommendation[]): Promise<void>;
  recommendations(organisationId: string, scenarioId: string): Promise<ScenarioRecommendation[]>;
  getRecommendation(organisationId: string, scenarioId: string, recommendationId: string): Promise<ScenarioRecommendation | undefined>;
  updateRecommendation(organisationId: string, scenarioId: string, recommendationId: string, patch: Partial<ScenarioRecommendation>): Promise<ScenarioRecommendation | undefined>;
}
