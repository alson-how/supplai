import type { Customer, InventoryLocation, InventoryPosition, LogisticsRoute, Market, MarketPriceSignal, MarketSignal, Product, ProductionFacility, ProductionPlan } from '../domain/core-data.js';

const organisationId = 'org-gifs';
export const products: Product[] = [
  ['H110MA','PP Homopolymer Grade H110MA','PP','Homopolymer','H110MA','Injection moulding',830,25,540],
  ['K8003','PP Impact Copolymer Grade K8003','PP','Impact Copolymer','K8003','Automotive components',875,25,540],
  ['F7000','HDPE Film Grade F7000','PE','HDPE','F7000','Blown film',790,20,720],
  ['R3840','LLDPE Rotomoulding Grade R3840','PE','LLDPE','R3840','Rotomoulding',810,20,720],
  ['B5502','HDPE Blow Moulding B5502','PE','HDPE','B5502','Containers',805,25,720],
  ['P4200','LDPE Coating P4200','PE','LDPE','P4200','Extrusion coating',845,20,540],
  ['T1000','PP Raffia T1000','PP','Homopolymer','T1000','Woven sacks',815,25,540],
  ['C9001','PP Random Copolymer C9001','PP','Random Copolymer','C9001','Clear packaging',890,20,540],
].map(([code,name,category,polymerType,grade,application,cost,moq,shelf]) => ({id:`product-${code}`,organisationId,code:String(code),name:String(name),category:category as 'PE'|'PP',polymerType:String(polymerType),grade:String(grade),application:String(application),unitOfMeasure:'TONNE',productionCostPerUnit:Number(cost),minimumOrderQuantity:Number(moq),shelfLifeDays:Number(shelf),status:'ACTIVE'}));

export const markets: Market[] = [
  ['my','Malaysia','Domestic',0.12,0.95,'MYR'],['vn','Vietnam','Southeast Asia',0.27,0.88,'USD'],['id','Indonesia','Southeast Asia',0.39,0.78,'USD'],['th','Thailand','Southeast Asia',0.22,0.72,'USD'],['sg','Singapore','Southeast Asia',0.08,0.63,'USD'],
].map(([id,country,region,risk,priority,currency])=>({id:`market-${id}`,organisationId,country:String(country),region:String(region),marketSegment:'Industrial polymers',currency:String(currency),riskScore:Number(risk),strategicPriority:Number(priority),status:'ACTIVE'}));

const customerNames = ['Strategic Industries','PolyPack Manufacturing','Advanced Moulders','Flexible Films','Consumer Plastics'];
export const customers: Customer[] = markets.flatMap((market, marketIndex) => customerNames.map((suffix,index)=>{
  const code=`${market.country.slice(0,2).toUpperCase()}-${String(index+1).padStart(3,'0')}`;
  const creditLimit=market.country==='Indonesia' && index===1 ? 140000 : 420000 + index*65000;
  return {id:`customer-${code}`,organisationId,marketId:market.id,code,name:`${market.country} ${suffix}`,segment:index<2?'KEY_ACCOUNT':'MID_MARKET',industry:index%2?'Packaging':'Manufacturing',creditLimit,outstandingCredit:market.country==='Indonesia'&&index===1?128000:65000+index*12000,priorityScore:90-index*7,strategicAccount:market.country==='Malaysia'&&index===0,paymentRiskScore:market.riskScore+(index*.03),serviceLevelTarget:index<2?.96:.92,status:'ACTIVE'};
}));

export const locations: InventoryLocation[] = [
  {id:'location-port-klang',organisationId,code:'PKG',name:'Port Klang Distribution Centre',country:'Malaysia',locationType:'PORT_WAREHOUSE'},
  {id:'location-pasir-gudang',organisationId,code:'PGU',name:'Pasir Gudang Terminal',country:'Malaysia',locationType:'PORT_WAREHOUSE'},
  {id:'location-gebeng',organisationId,code:'GEB',name:'Gebeng Plant Warehouse',country:'Malaysia',locationType:'PLANT_WAREHOUSE'},
];
export const inventory: InventoryPosition[] = products.flatMap((product,p)=>locations.map((location,l)=>({id:`inventory-${p}-${l}`,organisationId,productId:product.id,locationId:location.id,availableQuantity:280+p*18+l*35,reservedQuantity:35+l*8,qualityHoldQuantity:p===4&&l===1?45:0,expectedInboundQuantity:l===2?80:0,inventoryAgeDays:p===0&&l===0?168:24+p*11+l*5,snapshotDate:'2026-07-01'})));

export const facilities: ProductionFacility[] = [
  {id:'facility-gebeng',organisationId,code:'GEB-PP',name:'Gebeng Polymer Complex',country:'Malaysia',capacityPerPeriod:4200,status:'ACTIVE'},
  {id:'facility-kertih',organisationId,code:'KER-PE',name:'Kertih Polymer Complex',country:'Malaysia',capacityPerPeriod:3800,status:'ACTIVE'},
];
export const productionPlans: ProductionPlan[] = products.map((product,index)=>({id:`plan-${product.code}`,organisationId,facilityId:index%2?facilities[1].id:facilities[0].id,productId:product.id,planningPeriod:'2026-07-01',plannedQuantity:780-index*20,confirmedQuantity:650-index*18,availableQuantity:590-index*16,productionReadyDate:`2026-07-${String(5+index).padStart(2,'0')}`,changeoverRequired:index===1||index===6,changeoverCost:index===1||index===6?18000:0,status:index===5?'BLOCKED':'CONFIRMED'}));

export const routes: LogisticsRoute[] = locations.flatMap((location,li)=>markets.map((market,mi)=>({id:`route-${li}-${mi}`,organisationId,originLocationId:location.id,destinationMarketId:market.id,transportMode:market.country==='Malaysia'?'ROAD':'SEA',estimatedLeadTimeDays:market.country==='Malaysia'?2:5+mi*2+(li===1&&market.country==='Thailand'?5:0),capacityPerPeriod:market.country==='Singapore'?550:900-li*80,freightCostPerUnit:market.country==='Malaysia'?24:74+mi*13+li*5,handlingCostPerUnit:12,carbonCostPerUnit:4+mi,reliabilityScore:.96-mi*.035-(li*.01),active:!(location.id==='location-pasir-gudang'&&market.country==='Thailand')})));

export const marketPrices: MarketPriceSignal[] = products.flatMap((product,pi)=>markets.map((market,mi)=>({id:`price-${pi}-${mi}`,organisationId,productId:product.id,marketId:market.id,signalDate:'2026-07-01',marketPricePerUnit:1080+pi*14+(market.country==='Vietnam'?125:mi*18),currency:'USD',source:'ICIS demo composite',reliabilityScore:.91-mi*.025,trend:market.country==='Vietnam'?'UP':'STABLE',percentageChange:market.country==='Vietnam'?6.8:1.2+mi*.4})));
export const marketSignals: MarketSignal[] = [
  {id:'signal-vietnam-price',organisationId,marketId:'market-vn',productId:'product-H110MA',title:'Vietnam spot premium widening',signalType:'PRICING',summary:'Converter restocking lifted spot indications while regional supply remains constrained.',sentiment:'POSITIVE',impactScore:.88,source:'Demo market intelligence',observedAt:'2026-07-02'},
  {id:'signal-thailand-port',organisationId,marketId:'market-th',productId:'product-F7000',title:'Thailand port congestion',signalType:'SUPPLY_DISRUPTION',summary:'Temporary congestion adds three to five days to selected sea routes.',sentiment:'NEGATIVE',impactScore:.74,source:'Demo logistics bulletin',observedAt:'2026-07-03'},
];
