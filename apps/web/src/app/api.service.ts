import { HttpClient } from '@angular/common/http';
import { Injectable, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';

// The API base URL. In the compose topology the web app is served on :4200 and
// the API on :3000; CORS on the API allows the web origin by default.
export const API_BASE = (globalThis as { __SUPPLAI_API__?: string }).__SUPPLAI_API__ ?? 'http://localhost:3000';
const TOKEN_KEY = 'supplai_token';
const USER_KEY = 'supplai_user';

export interface AuthUser { id: string; email: string; name: string; role: string; organisationId: string }
export interface LoginResponse { accessToken: string; user: AuthUser }

export interface ExecutiveSummary {
  expectedRevenue: number; expectedNetMargin: number; marginUpliftPercent: number; forecastAccuracyPercent: number;
  demandFulfilmentPercent: number; availableInventory: number; unallocatedInventory: number; pendingApprovals: number;
  revenueAtRisk: number; onTimeFeasibilityPercent: number; capacityUtilisationPercent: number;
}

export interface DemandForecast {
  productId: string; marketId: string; customerId?: string; method: string; predictedQuantity: number;
  lowerBound: number; upperBound: number; confidenceScore: number; forecastPeriod: string; history: number[]; backtestAccuracy: number;
}
export interface DemandSummary { method: string; totalPredictedQuantity: number; averageConfidence: number; backtestAccuracyPercent: number; pairs: number }

export interface Assumptions {
  forecastMethod: string; demandUpliftPercent: number; demandUpliftByMarket: Record<string, number>; priceAdjustmentPercent: number;
  productionCostAdjustmentPercent: number; logisticsCostAdjustmentPercent: number; safetyStockFactor: number; marginThreshold: number;
  marginWeight: number; strategicWeight: number; riskWeight: number; inventoryWeight: number; enforceStrategicCommitments: boolean; includeInventoryHoldingCost: boolean;
}

export interface RunDiagnostics {
  bindingConstraints: string[];
  unmetDemand: Array<{ opportunityId: string; quantity: number }>;
  unusedInventory: Record<string, number>;
  excludedOpportunities: Array<{ opportunityId: string; reason: string }>;
  infeasibleRequirements: Array<{ opportunityId: string; requirement: string; shortfall: number }>;
}
export interface RunSummary {
  runId: string; solverStatus: string; engine: string; objectiveValue: number; expectedRevenue: number; expectedNetMargin: number;
  marginPercent: number; totalAllocatedQuantity: number; recommendationCount: number; executionDurationMs: number; generatedAt: string; diagnostics: RunDiagnostics;
}
export interface Scenario {
  id: string; organisationId: string; name: string; description: string; scenarioType: string; baselineScenarioId?: string;
  status: string; assumptions: Assumptions; createdBy: string; createdAt: string; updatedAt: string; executedAt?: string; lastRun?: RunSummary;
}
export interface Recommendation {
  id: string; rank: number; product: string; customer: string; market: string; route: string; quantity: number; price: number;
  revenue: number; netMargin: number; marginPercent: number; leadTimeDays: number; confidence: number; feasibility: string; status: string;
  rationale: string; explanation: string; constraints: string[];
  originalQuantity?: number; decisionReason?: string; decidedBy?: string; decidedAt?: string;
}
export interface RecommendationDecision { decision: 'APPROVED' | 'MODIFIED' | 'REJECTED'; finalQuantity?: number; reason: string }
export interface ScenarioRunResult { scenario: Scenario; run: RunSummary; recommendations: Recommendation[] }
export interface ScenarioComparison {
  baselineScenarioId: string; candidateScenarioId: string; objectiveDelta: number; revenueDelta: number; revenueDeltaPercent: number;
  netMarginDelta: number; netMarginDeltaPercent: number; marginPercentDelta: number; allocatedQuantityDelta: number; recommendationCountDelta: number;
}

export interface Product { id: string; code: string; name: string; category: string }
export interface Market { id: string; country: string; region: string }

export interface ImportTemplate { entity: string; label: string; headers: string[]; example: string }
export interface ImportReport {
  entity: string; mode: string; totalRows: number; valid: number; invalid: number; created: number; updated: number;
  errors: Array<{ row: number; field?: string; message: string }>;
}

@Injectable({ providedIn: 'root' })
export class ApiService {
  readonly user = signal<AuthUser | null>(readJson<AuthUser>(USER_KEY));

  constructor(private readonly http: HttpClient) {}

  isAuthenticated(): boolean { return !!localStorage.getItem(TOKEN_KEY) && !!this.user(); }

  login(email: string, password: string): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(`${API_BASE}/api/auth/login`, { email, password }).pipe(tap(response => {
      localStorage.setItem(TOKEN_KEY, response.accessToken);
      localStorage.setItem(USER_KEY, JSON.stringify(response.user));
      this.user.set(response.user);
    }));
  }
  logout(): void { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(USER_KEY); this.user.set(null); }

  executiveSummary() { return this.http.get<ExecutiveSummary>(`${API_BASE}/api/analytics/executive-summary`); }
  products() { return this.http.get<{ data: Product[] }>(`${API_BASE}/api/products?pageSize=100`); }
  markets() { return this.http.get<{ data: Market[] }>(`${API_BASE}/api/markets`); }
  recommendations() { return this.http.get<{ data: Recommendation[]; total: number }>(`${API_BASE}/api/recommendations`); }

  demandForecast(method?: string) {
    const query = method ? `?method=${encodeURIComponent(method)}` : '';
    return this.http.get<{ data: DemandForecast[]; total: number }>(`${API_BASE}/api/demand/forecast${query}`);
  }
  demandSummary(method?: string) {
    const query = method ? `?method=${encodeURIComponent(method)}` : '';
    return this.http.get<DemandSummary>(`${API_BASE}/api/demand/summary${query}`);
  }

  scenarios() { return this.http.get<{ data: Scenario[] }>(`${API_BASE}/api/scenarios`); }
  createScenario(body: { name: string; description?: string; assumptions?: Partial<Assumptions> }) { return this.http.post<Scenario>(`${API_BASE}/api/scenarios`, body); }
  cloneScenario(id: string, body: { name?: string; description?: string }) { return this.http.post<Scenario>(`${API_BASE}/api/scenarios/${id}/clone`, body); }
  updateAssumptions(id: string, assumptions: Assumptions) { return this.http.patch<Scenario>(`${API_BASE}/api/scenarios/${id}/assumptions`, assumptions); }
  runScenario(id: string) { return this.http.post<ScenarioRunResult>(`${API_BASE}/api/scenarios/${id}/run`, {}); }
  scenarioRecommendations(id: string) { return this.http.get<{ data: Recommendation[]; total: number }>(`${API_BASE}/api/scenarios/${id}/recommendations`); }
  decideRecommendation(scenarioId: string, recId: string, body: RecommendationDecision) { return this.http.patch<Recommendation>(`${API_BASE}/api/scenarios/${scenarioId}/recommendations/${recId}/decision`, body); }
  compareScenarios(baselineId: string, candidateId: string) { return this.http.get<ScenarioComparison>(`${API_BASE}/api/scenarios/compare?baselineId=${baselineId}&candidateId=${candidateId}`); }

  importTemplates() { return this.http.get<{ data: ImportTemplate[] }>(`${API_BASE}/api/imports/templates`); }
  importData(entity: string, csv: string, mode: 'validate' | 'commit') { return this.http.post<ImportReport>(`${API_BASE}/api/imports/${entity}`, { csv, mode }); }
}

function readJson<T>(key: string): T | null {
  const raw = localStorage.getItem(key);
  if (!raw) return null;
  try { return JSON.parse(raw) as T; } catch { return null; }
}
