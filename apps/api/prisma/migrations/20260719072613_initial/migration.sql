-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMINISTRATOR', 'COMMERCIAL_PLANNER', 'SUPPLY_CHAIN_PLANNER', 'PRODUCTION_PLANNER', 'LOGISTICS_PLANNER', 'EXECUTIVE_VIEWER');

-- CreateTable
CREATE TABLE "Organisation" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "baseCurrency" TEXT NOT NULL DEFAULT 'USD',
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Kuala_Lumpur',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organisation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "polymerType" TEXT NOT NULL,
    "grade" TEXT NOT NULL,
    "application" TEXT NOT NULL,
    "unitOfMeasure" TEXT NOT NULL DEFAULT 'TONNE',
    "productionCostPerUnit" DOUBLE PRECISION NOT NULL,
    "minimumOrderQuantity" DOUBLE PRECISION NOT NULL,
    "shelfLifeDays" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Market" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "marketSegment" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "riskScore" DOUBLE PRECISION NOT NULL,
    "strategicPriority" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "Market_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "marketId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "segment" TEXT NOT NULL,
    "industry" TEXT NOT NULL,
    "creditLimit" DOUBLE PRECISION NOT NULL,
    "outstandingCredit" DOUBLE PRECISION NOT NULL,
    "priorityScore" DOUBLE PRECISION NOT NULL,
    "strategicAccount" BOOLEAN NOT NULL,
    "paymentRiskScore" DOUBLE PRECISION NOT NULL,
    "serviceLevelTarget" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryLocation" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "locationType" TEXT NOT NULL,

    CONSTRAINT "InventoryLocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryPosition" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "availableQuantity" DOUBLE PRECISION NOT NULL,
    "reservedQuantity" DOUBLE PRECISION NOT NULL,
    "qualityHoldQuantity" DOUBLE PRECISION NOT NULL,
    "expectedInboundQuantity" DOUBLE PRECISION NOT NULL,
    "inventoryAgeDays" INTEGER NOT NULL,
    "snapshotDate" TEXT NOT NULL,

    CONSTRAINT "InventoryPosition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductionFacility" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "capacityPerPeriod" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL,

    CONSTRAINT "ProductionFacility_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductionPlan" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "planningPeriod" TEXT NOT NULL,
    "plannedQuantity" DOUBLE PRECISION NOT NULL,
    "confirmedQuantity" DOUBLE PRECISION NOT NULL,
    "availableQuantity" DOUBLE PRECISION NOT NULL,
    "productionReadyDate" TEXT NOT NULL,
    "changeoverRequired" BOOLEAN NOT NULL,
    "changeoverCost" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL,

    CONSTRAINT "ProductionPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LogisticsRoute" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "originLocationId" TEXT NOT NULL,
    "destinationMarketId" TEXT NOT NULL,
    "transportMode" TEXT NOT NULL,
    "estimatedLeadTimeDays" INTEGER NOT NULL,
    "capacityPerPeriod" DOUBLE PRECISION NOT NULL,
    "freightCostPerUnit" DOUBLE PRECISION NOT NULL,
    "handlingCostPerUnit" DOUBLE PRECISION NOT NULL,
    "carbonCostPerUnit" DOUBLE PRECISION NOT NULL,
    "reliabilityScore" DOUBLE PRECISION NOT NULL,
    "active" BOOLEAN NOT NULL,

    CONSTRAINT "LogisticsRoute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketPriceSignal" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "marketId" TEXT NOT NULL,
    "signalDate" TEXT NOT NULL,
    "marketPricePerUnit" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "reliabilityScore" DOUBLE PRECISION NOT NULL,
    "trend" TEXT NOT NULL,
    "percentageChange" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "MarketPriceSignal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketSignal" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "marketId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "signalType" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "sentiment" TEXT NOT NULL,
    "impactScore" DOUBLE PRECISION NOT NULL,
    "source" TEXT NOT NULL,
    "observedAt" TEXT NOT NULL,

    CONSTRAINT "MarketSignal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Scenario" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "scenarioType" TEXT NOT NULL,
    "baselineScenarioId" TEXT,
    "status" TEXT NOT NULL,
    "assumptions" JSONB NOT NULL,
    "lastRun" JSONB,
    "createdBy" TEXT NOT NULL,
    "createdAt" TEXT NOT NULL,
    "updatedAt" TEXT NOT NULL,
    "executedAt" TEXT,

    CONSTRAINT "Scenario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScenarioRecommendation" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "scenarioId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "marketId" TEXT NOT NULL,
    "product" TEXT NOT NULL,
    "customer" TEXT NOT NULL,
    "market" TEXT NOT NULL,
    "route" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "revenue" DOUBLE PRECISION NOT NULL,
    "netMargin" DOUBLE PRECISION NOT NULL,
    "marginPercent" DOUBLE PRECISION NOT NULL,
    "leadTimeDays" INTEGER NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "feasibility" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "rationale" TEXT NOT NULL,
    "explanation" TEXT NOT NULL,
    "constraints" JSONB NOT NULL,
    "originalQuantity" DOUBLE PRECISION,
    "decisionReason" TEXT,
    "decidedBy" TEXT,
    "decidedAt" TEXT,

    CONSTRAINT "ScenarioRecommendation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "beforeJson" JSONB,
    "afterJson" JSONB,
    "createdAt" TEXT NOT NULL,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_organisationId_idx" ON "User"("organisationId");

-- CreateIndex
CREATE UNIQUE INDEX "Product_organisationId_code_key" ON "Product"("organisationId", "code");

-- CreateIndex
CREATE INDEX "Market_organisationId_country_idx" ON "Market"("organisationId", "country");

-- CreateIndex
CREATE INDEX "Customer_organisationId_marketId_idx" ON "Customer"("organisationId", "marketId");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_organisationId_code_key" ON "Customer"("organisationId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryLocation_organisationId_code_key" ON "InventoryLocation"("organisationId", "code");

-- CreateIndex
CREATE INDEX "InventoryPosition_organisationId_productId_idx" ON "InventoryPosition"("organisationId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductionFacility_organisationId_code_key" ON "ProductionFacility"("organisationId", "code");

-- CreateIndex
CREATE INDEX "ProductionPlan_organisationId_planningPeriod_idx" ON "ProductionPlan"("organisationId", "planningPeriod");

-- CreateIndex
CREATE INDEX "LogisticsRoute_organisationId_destinationMarketId_active_idx" ON "LogisticsRoute"("organisationId", "destinationMarketId", "active");

-- CreateIndex
CREATE INDEX "MarketPriceSignal_organisationId_signalDate_idx" ON "MarketPriceSignal"("organisationId", "signalDate");

-- CreateIndex
CREATE INDEX "MarketSignal_organisationId_observedAt_idx" ON "MarketSignal"("organisationId", "observedAt");

-- CreateIndex
CREATE INDEX "Scenario_organisationId_status_idx" ON "Scenario"("organisationId", "status");

-- CreateIndex
CREATE INDEX "ScenarioRecommendation_organisationId_scenarioId_idx" ON "ScenarioRecommendation"("organisationId", "scenarioId");

-- CreateIndex
CREATE INDEX "AuditLog_organisationId_createdAt_idx" ON "AuditLog"("organisationId", "createdAt");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScenarioRecommendation" ADD CONSTRAINT "ScenarioRecommendation_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "Scenario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
