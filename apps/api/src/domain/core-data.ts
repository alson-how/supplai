export type RecordStatus = 'ACTIVE' | 'INACTIVE';

export interface Product {
  id: string;
  organisationId: string;
  code: string;
  name: string;
  category: 'PE' | 'PP';
  polymerType: string;
  grade: string;
  application: string;
  unitOfMeasure: 'TONNE';
  productionCostPerUnit: number;
  minimumOrderQuantity: number;
  shelfLifeDays: number;
  status: RecordStatus;
}

export interface Market {
  id: string;
  organisationId: string;
  country: string;
  region: string;
  marketSegment: string;
  currency: string;
  riskScore: number;
  strategicPriority: number;
  status: RecordStatus;
}

export interface Customer {
  id: string;
  organisationId: string;
  marketId: string;
  code: string;
  name: string;
  segment: string;
  industry: string;
  creditLimit: number;
  outstandingCredit: number;
  priorityScore: number;
  strategicAccount: boolean;
  paymentRiskScore: number;
  serviceLevelTarget: number;
  status: RecordStatus;
}

export interface InventoryLocation {
  id: string;
  organisationId: string;
  code: string;
  name: string;
  country: string;
  locationType: string;
}

export interface InventoryPosition {
  id: string;
  organisationId: string;
  productId: string;
  locationId: string;
  availableQuantity: number;
  reservedQuantity: number;
  qualityHoldQuantity: number;
  expectedInboundQuantity: number;
  inventoryAgeDays: number;
  snapshotDate: string;
}

export interface ProductionFacility {
  id: string;
  organisationId: string;
  code: string;
  name: string;
  country: string;
  capacityPerPeriod: number;
  status: RecordStatus;
}

export interface ProductionPlan {
  id: string;
  organisationId: string;
  facilityId: string;
  productId: string;
  planningPeriod: string;
  plannedQuantity: number;
  confirmedQuantity: number;
  availableQuantity: number;
  productionReadyDate: string;
  changeoverRequired: boolean;
  changeoverCost: number;
  status: 'PLANNED' | 'CONFIRMED' | 'BLOCKED';
}

export interface LogisticsRoute {
  id: string;
  organisationId: string;
  originLocationId: string;
  destinationMarketId: string;
  transportMode: 'ROAD' | 'SEA' | 'RAIL';
  estimatedLeadTimeDays: number;
  capacityPerPeriod: number;
  freightCostPerUnit: number;
  handlingCostPerUnit: number;
  carbonCostPerUnit: number;
  reliabilityScore: number;
  active: boolean;
}

export interface MarketPriceSignal {
  id: string; organisationId: string; productId: string; marketId: string; signalDate: string;
  marketPricePerUnit: number; currency: string; source: string; reliabilityScore: number;
  trend: 'UP' | 'DOWN' | 'STABLE'; percentageChange: number;
}

export interface MarketSignal {
  id: string; organisationId: string; marketId: string; productId: string; title: string;
  signalType: 'PRICING'|'DEMAND_INCREASE'|'DEMAND_DECREASE'|'COMPETITOR_ACTIVITY'|'REGULATORY_CHANGE'|'SUPPLY_DISRUPTION'|'MACROECONOMIC';
  summary: string; sentiment: 'POSITIVE'|'NEUTRAL'|'NEGATIVE'; impactScore: number; source: string; observedAt: string;
}

export function availableToPromise(position: InventoryPosition): number {
  return Math.max(0, position.availableQuantity - position.reservedQuantity - position.qualityHoldQuantity + position.expectedInboundQuantity);
}

export function availableCredit(customer: Customer): number {
  return Math.max(0, customer.creditLimit - customer.outstandingCredit);
}

export function logisticsEstimate(route: LogisticsRoute, quantity: number, fuelSurchargePercent = 0) {
  const freight = route.freightCostPerUnit * (1 + fuelSurchargePercent / 100);
  const costPerUnit = freight + route.handlingCostPerUnit + route.carbonCostPerUnit;
  return { quantity, costPerUnit, totalCost: quantity * costPerUnit };
}

export function isRouteFeasible(route: LogisticsRoute, dispatchDate: string, requiredDate: string, quantity: number) {
  const arrival = new Date(`${dispatchDate}T00:00:00.000Z`);
  arrival.setUTCDate(arrival.getUTCDate() + route.estimatedLeadTimeDays);
  const required = new Date(`${requiredDate}T23:59:59.999Z`);
  const reasons: string[] = [];
  if (!route.active) reasons.push('Route is inactive');
  if (quantity > route.capacityPerPeriod) reasons.push('Route capacity is insufficient');
  if (arrival > required) reasons.push('Estimated arrival misses the required delivery date');
  return { feasible: reasons.length === 0, estimatedArrivalDate: arrival.toISOString().slice(0, 10), reasons };
}
