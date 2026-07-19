import { describe, expect, it } from 'vitest';
import { availableCredit, availableToPromise, isRouteFeasible, logisticsEstimate, type Customer, type InventoryPosition, type LogisticsRoute } from './core-data.js';

const route:LogisticsRoute={id:'r',organisationId:'o',originLocationId:'l',destinationMarketId:'m',transportMode:'SEA',estimatedLeadTimeDays:8,capacityPerPeriod:500,freightCostPerUnit:80,handlingCostPerUnit:10,carbonCostPerUnit:5,reliabilityScore:.9,active:true};
describe('operational calculations',()=>{
  it('calculates ATP without exposing unavailable stock',()=>{const position={availableQuantity:100,reservedQuantity:20,qualityHoldQuantity:15,expectedInboundQuantity:10} as InventoryPosition;expect(availableToPromise(position)).toBe(75);});
  it('caps available credit at zero',()=>{expect(availableCredit({creditLimit:100,outstandingCredit:130} as Customer)).toBe(0);});
  it('calculates fuel-adjusted logistics costs',()=>expect(logisticsEstimate(route,100,10)).toEqual({quantity:100,costPerUnit:103,totalCost:10300}));
  it('reports delivery and capacity reasons',()=>{const result=isRouteFeasible(route,'2026-07-01','2026-07-05',600);expect(result.feasible).toBe(false);expect(result.reasons).toHaveLength(2);});
});
