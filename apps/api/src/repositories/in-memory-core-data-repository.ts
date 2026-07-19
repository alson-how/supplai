import { randomUUID } from 'node:crypto';
import { customers, facilities, inventory, locations, marketPrices, marketSignals, markets, productionPlans, products, routes } from '../demo/seed-data.js';
import type { Product } from '../domain/core-data.js';
import type { CoreDataRepository } from './core-data-repository.js';

export class InMemoryCoreDataRepository implements CoreDataRepository {
  private readonly productRecords = structuredClone(products);
  private readonly auditRecords: Array<Record<string, unknown>> = [];
  products = (organisationId: string) => this.productRecords.filter(record => record.organisationId === organisationId);
  markets = (organisationId: string) => markets.filter(record => record.organisationId === organisationId);
  customers = (organisationId: string) => customers.filter(record => record.organisationId === organisationId);
  inventoryLocations = (organisationId: string) => locations.filter(record => record.organisationId === organisationId);
  inventoryPositions = (organisationId: string) => inventory.filter(record => record.organisationId === organisationId);
  productionFacilities = (organisationId: string) => facilities.filter(record => record.organisationId === organisationId);
  productionPlans = (organisationId: string) => productionPlans.filter(record => record.organisationId === organisationId);
  logisticsRoutes = (organisationId: string) => routes.filter(record => record.organisationId === organisationId);
  marketPrices = (organisationId: string) => marketPrices.filter(record => record.organisationId === organisationId);
  marketSignals = (organisationId: string) => marketSignals.filter(record => record.organisationId === organisationId);
  createProduct(organisationId: string, input: Omit<Product, 'id'|'organisationId'>) { const product={...input,id:randomUUID(),organisationId}; this.productRecords.push(product); return product; }
  updateProduct(organisationId: string, id: string, input: Partial<Omit<Product,'id'|'organisationId'>>) { const product=this.productRecords.find(record=>record.id===id&&record.organisationId===organisationId); if(!product)return undefined; Object.assign(product,input); return product; }
  deleteProduct(organisationId: string, id: string) { const index=this.productRecords.findIndex(record=>record.id===id&&record.organisationId===organisationId); if(index<0)return false; this.productRecords.splice(index,1); return true; }
  createAudit(organisationId:string,userId:string,entityType:string,entityId:string,action:string,before:unknown,after:unknown){this.auditRecords.push({id:randomUUID(),organisationId,userId,entityType,entityId,action,before,after,createdAt:new Date().toISOString()});}
  auditEvents=(organisationId:string)=>this.auditRecords.filter(record=>record.organisationId===organisationId);
}
