import { Prisma, type PrismaClient, type ScenarioRecommendation as ScenarioRecommendationRow, type Scenario as ScenarioRow } from '@prisma/client';
import type { Scenario, ScenarioAssumptions, ScenarioRecommendation, ScenarioRunSummary, ScenarioStatus, DecisionStatus } from '../domain/scenarios.js';
import type { ScenarioRepository } from './scenario-repository.js';
import { prisma } from './prisma-client.js';

export class PrismaScenarioRepository implements ScenarioRepository {
  constructor(private readonly db: PrismaClient = prisma()) {}

  async listScenarios(organisationId: string): Promise<Scenario[]> {
    const rows = await this.db.scenario.findMany({ where: { organisationId }, orderBy: { updatedAt: 'desc' } });
    return rows.map(toScenario);
  }

  async getScenario(organisationId: string, id: string): Promise<Scenario | undefined> {
    const row = await this.db.scenario.findFirst({ where: { id, organisationId } });
    return row ? toScenario(row) : undefined;
  }

  async createScenario(scenario: Scenario): Promise<Scenario> {
    await this.db.scenario.create({ data: scenarioData(scenario) });
    return scenario;
  }

  async saveScenario(scenario: Scenario): Promise<Scenario> {
    const data = scenarioData(scenario);
    await this.db.scenario.upsert({ where: { id: scenario.id }, create: data, update: data });
    return scenario;
  }

  async deleteScenario(organisationId: string, id: string): Promise<boolean> {
    const result = await this.db.scenario.deleteMany({ where: { id, organisationId } });
    return result.count > 0;
  }

  async setRecommendations(organisationId: string, scenarioId: string, recommendations: ScenarioRecommendation[]): Promise<void> {
    await this.db.$transaction([
      this.db.scenarioRecommendation.deleteMany({ where: { scenarioId, organisationId } }),
      this.db.scenarioRecommendation.createMany({ data: recommendations.filter(record => record.organisationId === organisationId).map(recommendationData) }),
    ]);
  }

  async recommendations(organisationId: string, scenarioId: string): Promise<ScenarioRecommendation[]> {
    const rows = await this.db.scenarioRecommendation.findMany({ where: { scenarioId, organisationId }, orderBy: { rank: 'asc' } });
    return rows.map(toRecommendation);
  }

  async getRecommendation(organisationId: string, scenarioId: string, recommendationId: string): Promise<ScenarioRecommendation | undefined> {
    const row = await this.db.scenarioRecommendation.findFirst({ where: { id: recommendationId, scenarioId, organisationId } });
    return row ? toRecommendation(row) : undefined;
  }

  async updateRecommendation(organisationId: string, scenarioId: string, recommendationId: string, patch: Partial<ScenarioRecommendation>): Promise<ScenarioRecommendation | undefined> {
    const existing = await this.getRecommendation(organisationId, scenarioId, recommendationId);
    if (!existing) return undefined;
    const merged = { ...existing, ...patch };
    await this.db.scenarioRecommendation.update({ where: { id: recommendationId }, data: recommendationData(merged) });
    return merged;
  }
}

function scenarioData(scenario: Scenario) {
  return {
    id: scenario.id,
    organisationId: scenario.organisationId,
    name: scenario.name,
    description: scenario.description,
    scenarioType: scenario.scenarioType,
    baselineScenarioId: scenario.baselineScenarioId ?? null,
    status: scenario.status,
    assumptions: scenario.assumptions as unknown as Prisma.InputJsonValue,
    lastRun: scenario.lastRun ? (scenario.lastRun as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
    createdBy: scenario.createdBy,
    createdAt: scenario.createdAt,
    updatedAt: scenario.updatedAt,
    executedAt: scenario.executedAt ?? null,
  };
}

function toScenario(row: ScenarioRow): Scenario {
  return {
    id: row.id,
    organisationId: row.organisationId,
    name: row.name,
    description: row.description,
    scenarioType: row.scenarioType as Scenario['scenarioType'],
    baselineScenarioId: row.baselineScenarioId ?? undefined,
    status: row.status as ScenarioStatus,
    assumptions: row.assumptions as unknown as ScenarioAssumptions,
    lastRun: row.lastRun ? (row.lastRun as unknown as ScenarioRunSummary) : undefined,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    executedAt: row.executedAt ?? undefined,
  };
}

function recommendationData(rec: ScenarioRecommendation) {
  return {
    id: rec.id, organisationId: rec.organisationId, scenarioId: rec.scenarioId, runId: rec.runId, rank: rec.rank,
    opportunityId: rec.opportunityId, productId: rec.productId, customerId: rec.customerId, marketId: rec.marketId,
    product: rec.product, customer: rec.customer, market: rec.market, route: rec.route, quantity: rec.quantity, price: rec.price,
    revenue: rec.revenue, netMargin: rec.netMargin, marginPercent: rec.marginPercent, leadTimeDays: rec.leadTimeDays,
    confidence: rec.confidence, feasibility: rec.feasibility, status: rec.status, rationale: rec.rationale, explanation: rec.explanation,
    constraints: rec.constraints as unknown as Prisma.InputJsonValue,
    originalQuantity: rec.originalQuantity ?? null, decisionReason: rec.decisionReason ?? null, decidedBy: rec.decidedBy ?? null, decidedAt: rec.decidedAt ?? null,
  };
}

function toRecommendation(row: ScenarioRecommendationRow): ScenarioRecommendation {
  return {
    id: row.id, organisationId: row.organisationId, scenarioId: row.scenarioId, runId: row.runId, rank: row.rank,
    opportunityId: row.opportunityId, productId: row.productId, customerId: row.customerId, marketId: row.marketId,
    product: row.product, customer: row.customer, market: row.market, route: row.route, quantity: row.quantity, price: row.price,
    revenue: row.revenue, netMargin: row.netMargin, marginPercent: row.marginPercent, leadTimeDays: row.leadTimeDays,
    confidence: row.confidence, feasibility: row.feasibility as ScenarioRecommendation['feasibility'], status: row.status as DecisionStatus,
    rationale: row.rationale, explanation: row.explanation, constraints: row.constraints as unknown as string[],
    originalQuantity: row.originalQuantity ?? undefined, decisionReason: row.decisionReason ?? undefined, decidedBy: row.decidedBy ?? undefined, decidedAt: row.decidedAt ?? undefined,
  };
}
