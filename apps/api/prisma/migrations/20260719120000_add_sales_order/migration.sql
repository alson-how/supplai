-- CreateTable
CREATE TABLE "SalesOrder" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "marketId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "SalesOrder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SalesOrder_organisationId_period_idx" ON "SalesOrder"("organisationId", "period");

-- CreateIndex
CREATE UNIQUE INDEX "SalesOrder_organisationId_productId_marketId_period_key" ON "SalesOrder"("organisationId", "productId", "marketId", "period");
