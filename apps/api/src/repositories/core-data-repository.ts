import type { Customer, InventoryLocation, InventoryPosition, LogisticsRoute, Market, MarketPriceSignal, MarketSignal, Product, ProductionFacility, ProductionPlan } from '../domain/core-data.js';

export interface CoreDataRepository {
  products(organisationId: string): Product[];
  markets(organisationId: string): Market[];
  customers(organisationId: string): Customer[];
  inventoryLocations(organisationId: string): InventoryLocation[];
  inventoryPositions(organisationId: string): InventoryPosition[];
  productionFacilities(organisationId: string): ProductionFacility[];
  productionPlans(organisationId: string): ProductionPlan[];
  logisticsRoutes(organisationId: string): LogisticsRoute[];
  marketPrices(organisationId: string): MarketPriceSignal[];
  marketSignals(organisationId: string): MarketSignal[];
  createProduct(organisationId: string, input: Omit<Product, 'id' | 'organisationId'>): Product;
  updateProduct(organisationId: string, id: string, input: Partial<Omit<Product, 'id' | 'organisationId'>>): Product | undefined;
  deleteProduct(organisationId: string, id: string): boolean;
  createAudit(organisationId: string, userId: string, entityType: string, entityId: string, action: string, before: unknown, after: unknown): void;
  auditEvents(organisationId: string): object[];
}
