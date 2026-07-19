import { randomUUID } from 'node:crypto';
import { Prisma, type PrismaClient } from '@prisma/client';
import type { Customer, InventoryLocation, InventoryPosition, LogisticsRoute, Market, MarketPriceSignal, MarketSignal, Product, ProductionFacility, ProductionPlan, RecordStatus, SalesRecord } from '../domain/core-data.js';
import type { CoreDataRepository, UpsertOutcome } from './core-data-repository.js';
import { prisma } from './prisma-client.js';

// Postgres-backed repository. The Prisma schema mirrors the domain field names,
// so mapping is a straight cast of the string columns back to their domain
// literal unions.
export class PrismaCoreDataRepository implements CoreDataRepository {
  constructor(private readonly db: PrismaClient = prisma()) {}

  async products(organisationId: string): Promise<Product[]> {
    const rows = await this.db.product.findMany({ where: { organisationId }, orderBy: { code: 'asc' } });
    return rows.map(row => ({ ...row, category: row.category as 'PE' | 'PP', unitOfMeasure: 'TONNE', status: row.status as RecordStatus }));
  }
  async markets(organisationId: string): Promise<Market[]> {
    const rows = await this.db.market.findMany({ where: { organisationId }, orderBy: { id: 'asc' } });
    return rows.map(row => ({ ...row, status: row.status as RecordStatus }));
  }
  async customers(organisationId: string): Promise<Customer[]> {
    return this.db.customer.findMany({ where: { organisationId }, orderBy: { code: 'asc' } }).then(rows => rows.map(row => ({ ...row, status: row.status as RecordStatus })));
  }
  async inventoryLocations(organisationId: string): Promise<InventoryLocation[]> {
    return this.db.inventoryLocation.findMany({ where: { organisationId }, orderBy: { code: 'asc' } });
  }
  async inventoryPositions(organisationId: string): Promise<InventoryPosition[]> {
    return this.db.inventoryPosition.findMany({ where: { organisationId }, orderBy: { id: 'asc' } });
  }
  async productionFacilities(organisationId: string): Promise<ProductionFacility[]> {
    const rows = await this.db.productionFacility.findMany({ where: { organisationId }, orderBy: { code: 'asc' } });
    return rows.map(row => ({ ...row, status: row.status as RecordStatus }));
  }
  async productionPlans(organisationId: string): Promise<ProductionPlan[]> {
    const rows = await this.db.productionPlan.findMany({ where: { organisationId }, orderBy: { id: 'asc' } });
    return rows.map(row => ({ ...row, status: row.status as ProductionPlan['status'] }));
  }
  async logisticsRoutes(organisationId: string): Promise<LogisticsRoute[]> {
    const rows = await this.db.logisticsRoute.findMany({ where: { organisationId }, orderBy: { id: 'asc' } });
    return rows.map(row => ({ ...row, transportMode: row.transportMode as LogisticsRoute['transportMode'] }));
  }
  async marketPrices(organisationId: string): Promise<MarketPriceSignal[]> {
    const rows = await this.db.marketPriceSignal.findMany({ where: { organisationId }, orderBy: { id: 'asc' } });
    return rows.map(row => ({ ...row, trend: row.trend as MarketPriceSignal['trend'] }));
  }
  async marketSignals(organisationId: string): Promise<MarketSignal[]> {
    const rows = await this.db.marketSignal.findMany({ where: { organisationId }, orderBy: { observedAt: 'asc' } });
    return rows.map(row => ({ ...row, signalType: row.signalType as MarketSignal['signalType'], sentiment: row.sentiment as MarketSignal['sentiment'] }));
  }
  async salesHistory(organisationId: string): Promise<SalesRecord[]> {
    return this.db.salesOrder.findMany({ where: { organisationId }, orderBy: { period: 'asc' } });
  }

  async createProduct(organisationId: string, input: Omit<Product, 'id' | 'organisationId'>): Promise<Product> {
    const row = await this.db.product.create({ data: { ...input, id: `product-${randomUUID()}`, organisationId } });
    return { ...row, category: row.category as 'PE' | 'PP', unitOfMeasure: 'TONNE', status: row.status as RecordStatus };
  }
  async updateProduct(organisationId: string, id: string, input: Partial<Omit<Product, 'id' | 'organisationId'>>): Promise<Product | undefined> {
    const existing = await this.db.product.findFirst({ where: { id, organisationId } });
    if (!existing) return undefined;
    const row = await this.db.product.update({ where: { id }, data: input });
    return { ...row, category: row.category as 'PE' | 'PP', unitOfMeasure: 'TONNE', status: row.status as RecordStatus };
  }
  async deleteProduct(organisationId: string, id: string): Promise<boolean> {
    const result = await this.db.product.deleteMany({ where: { id, organisationId } });
    return result.count > 0;
  }

  async upsertProduct(organisationId: string, input: Omit<Product, 'id' | 'organisationId'>): Promise<UpsertOutcome> {
    const existing = await this.db.product.findFirst({ where: { organisationId, code: input.code } });
    if (existing) { await this.db.product.update({ where: { id: existing.id }, data: input }); return 'updated'; }
    await this.db.product.create({ data: { ...input, id: `product-${input.code}`, organisationId } });
    return 'created';
  }

  async upsertCustomer(organisationId: string, input: Omit<Customer, 'id' | 'organisationId'>): Promise<UpsertOutcome> {
    const existing = await this.db.customer.findFirst({ where: { organisationId, code: input.code } });
    if (existing) { await this.db.customer.update({ where: { id: existing.id }, data: input }); return 'updated'; }
    await this.db.customer.create({ data: { ...input, id: `customer-${input.code}`, organisationId } });
    return 'created';
  }

  async upsertMarketPrice(organisationId: string, input: Omit<MarketPriceSignal, 'id' | 'organisationId'>): Promise<UpsertOutcome> {
    const existing = await this.db.marketPriceSignal.findFirst({ where: { organisationId, productId: input.productId, marketId: input.marketId, signalDate: input.signalDate } });
    if (existing) { await this.db.marketPriceSignal.update({ where: { id: existing.id }, data: input }); return 'updated'; }
    await this.db.marketPriceSignal.create({ data: { ...input, id: `price-${input.productId}-${input.marketId}-${input.signalDate}`, organisationId } });
    return 'created';
  }

  async upsertSalesRecord(organisationId: string, input: Omit<SalesRecord, 'id' | 'organisationId'>): Promise<UpsertOutcome> {
    const existing = await this.db.salesOrder.findFirst({ where: { organisationId, productId: input.productId, marketId: input.marketId, period: input.period } });
    if (existing) { await this.db.salesOrder.update({ where: { id: existing.id }, data: input }); return 'updated'; }
    await this.db.salesOrder.create({ data: { ...input, id: `sales-${input.productId}-${input.marketId}-${input.period}`, organisationId } });
    return 'created';
  }

  async upsertMarketSignal(organisationId: string, input: Omit<MarketSignal, 'id' | 'organisationId'>): Promise<UpsertOutcome> {
    const existing = await this.db.marketSignal.findFirst({ where: { organisationId, marketId: input.marketId, productId: input.productId, title: input.title } });
    if (existing) { await this.db.marketSignal.update({ where: { id: existing.id }, data: input }); return 'updated'; }
    await this.db.marketSignal.create({ data: { ...input, id: `signal-${randomUUID()}`, organisationId } });
    return 'created';
  }

  async createAudit(organisationId: string, userId: string, entityType: string, entityId: string, action: string, before: unknown, after: unknown): Promise<void> {
    await this.db.auditLog.create({ data: {
      id: `audit-${randomUUID()}`, organisationId, userId, entityType, entityId, action,
      beforeJson: toJson(before), afterJson: toJson(after), createdAt: new Date().toISOString(),
    } });
  }
  async auditEvents(organisationId: string): Promise<object[]> {
    const rows = await this.db.auditLog.findMany({ where: { organisationId }, orderBy: { createdAt: 'asc' } });
    return rows.map(row => ({ id: row.id, organisationId: row.organisationId, userId: row.userId, entityType: row.entityType, entityId: row.entityId, action: row.action, before: row.beforeJson, after: row.afterJson, createdAt: row.createdAt }));
  }
}

function toJson(value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  return value === null || value === undefined ? Prisma.JsonNull : (value as Prisma.InputJsonValue);
}
