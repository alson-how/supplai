import { randomUUID } from 'node:crypto';
import { customers, facilities, inventory, locations, marketPrices, marketSignals, markets, productionPlans, products, routes } from '../demo/seed-data.js';
import type { Customer, MarketPriceSignal, Product } from '../domain/core-data.js';
import type { CoreDataRepository, UpsertOutcome } from './core-data-repository.js';

export class InMemoryCoreDataRepository implements CoreDataRepository {
  private readonly productRecords = structuredClone(products);
  private readonly customerRecords = structuredClone(customers);
  private readonly marketPriceRecords = structuredClone(marketPrices);
  private readonly auditRecords: Array<Record<string, unknown>> = [];
  products = async (organisationId: string) => this.productRecords.filter(record => record.organisationId === organisationId);
  markets = async (organisationId: string) => markets.filter(record => record.organisationId === organisationId);
  customers = async (organisationId: string) => this.customerRecords.filter(record => record.organisationId === organisationId);
  inventoryLocations = async (organisationId: string) => locations.filter(record => record.organisationId === organisationId);
  inventoryPositions = async (organisationId: string) => inventory.filter(record => record.organisationId === organisationId);
  productionFacilities = async (organisationId: string) => facilities.filter(record => record.organisationId === organisationId);
  productionPlans = async (organisationId: string) => productionPlans.filter(record => record.organisationId === organisationId);
  logisticsRoutes = async (organisationId: string) => routes.filter(record => record.organisationId === organisationId);
  marketPrices = async (organisationId: string) => this.marketPriceRecords.filter(record => record.organisationId === organisationId);
  marketSignals = async (organisationId: string) => marketSignals.filter(record => record.organisationId === organisationId);
  async createProduct(organisationId: string, input: Omit<Product, 'id'|'organisationId'>) { const product={...input,id:randomUUID(),organisationId}; this.productRecords.push(product); return product; }
  async updateProduct(organisationId: string, id: string, input: Partial<Omit<Product,'id'|'organisationId'>>) { const product=this.productRecords.find(record=>record.id===id&&record.organisationId===organisationId); if(!product)return undefined; Object.assign(product,input); return product; }
  async deleteProduct(organisationId: string, id: string) { const index=this.productRecords.findIndex(record=>record.id===id&&record.organisationId===organisationId); if(index<0)return false; this.productRecords.splice(index,1); return true; }
  async upsertProduct(organisationId: string, input: Omit<Product,'id'|'organisationId'>): Promise<UpsertOutcome> { const existing=this.productRecords.find(record=>record.organisationId===organisationId&&record.code===input.code); if(existing){Object.assign(existing,input); return 'updated';} this.productRecords.push({...input,id:`product-${input.code}`,organisationId}); return 'created'; }
  async upsertCustomer(organisationId: string, input: Omit<Customer,'id'|'organisationId'>): Promise<UpsertOutcome> { const existing=this.customerRecords.find(record=>record.organisationId===organisationId&&record.code===input.code); if(existing){Object.assign(existing,input); return 'updated';} this.customerRecords.push({...input,id:`customer-${input.code}`,organisationId}); return 'created'; }
  async upsertMarketPrice(organisationId: string, input: Omit<MarketPriceSignal,'id'|'organisationId'>): Promise<UpsertOutcome> { const existing=this.marketPriceRecords.find(record=>record.organisationId===organisationId&&record.productId===input.productId&&record.marketId===input.marketId&&record.signalDate===input.signalDate); if(existing){Object.assign(existing,input); return 'updated';} this.marketPriceRecords.push({...input,id:`price-${input.productId}-${input.marketId}-${input.signalDate}`,organisationId}); return 'created'; }
  async createAudit(organisationId:string,userId:string,entityType:string,entityId:string,action:string,before:unknown,after:unknown){this.auditRecords.push({id:randomUUID(),organisationId,userId,entityType,entityId,action,before,after,createdAt:new Date().toISOString()});}
  auditEvents=async (organisationId:string)=>this.auditRecords.filter(record=>record.organisationId===organisationId);
}
