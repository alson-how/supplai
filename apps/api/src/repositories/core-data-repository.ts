import type { Customer, InventoryLocation, InventoryPosition, LogisticsRoute, Market, MarketPriceSignal, MarketSignal, Product, ProductionFacility, ProductionPlan } from '../domain/core-data.js';

export type UpsertOutcome = 'created' | 'updated';

// Repositories are async so an implementation can be backed by a database. The
// in-memory implementation resolves immediately; the Prisma implementation
// queries Postgres. Callers await every method.
export interface CoreDataRepository {
  products(organisationId: string): Promise<Product[]>;
  markets(organisationId: string): Promise<Market[]>;
  customers(organisationId: string): Promise<Customer[]>;
  inventoryLocations(organisationId: string): Promise<InventoryLocation[]>;
  inventoryPositions(organisationId: string): Promise<InventoryPosition[]>;
  productionFacilities(organisationId: string): Promise<ProductionFacility[]>;
  productionPlans(organisationId: string): Promise<ProductionPlan[]>;
  logisticsRoutes(organisationId: string): Promise<LogisticsRoute[]>;
  marketPrices(organisationId: string): Promise<MarketPriceSignal[]>;
  marketSignals(organisationId: string): Promise<MarketSignal[]>;
  createProduct(organisationId: string, input: Omit<Product, 'id' | 'organisationId'>): Promise<Product>;
  updateProduct(organisationId: string, id: string, input: Partial<Omit<Product, 'id' | 'organisationId'>>): Promise<Product | undefined>;
  deleteProduct(organisationId: string, id: string): Promise<boolean>;
  // Upsert by natural key. Returns whether a row was created or updated.
  upsertProduct(organisationId: string, input: Omit<Product, 'id' | 'organisationId'>): Promise<UpsertOutcome>;
  upsertCustomer(organisationId: string, input: Omit<Customer, 'id' | 'organisationId'>): Promise<UpsertOutcome>;
  upsertMarketPrice(organisationId: string, input: Omit<MarketPriceSignal, 'id' | 'organisationId'>): Promise<UpsertOutcome>;
  createAudit(organisationId: string, userId: string, entityType: string, entityId: string, action: string, before: unknown, after: unknown): Promise<void>;
  auditEvents(organisationId: string): Promise<object[]>;
}
