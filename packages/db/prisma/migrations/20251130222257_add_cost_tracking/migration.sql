-- AlterTable
ALTER TABLE "Span" ADD COLUMN     "inputCost" DECIMAL(10,6),
ADD COLUMN     "outputCost" DECIMAL(10,6),
ADD COLUMN     "pricingId" TEXT,
ADD COLUMN     "totalCost" DECIMAL(10,6);

-- CreateTable
CREATE TABLE "model_pricing" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "inputPricePerMillion" DECIMAL(10,6) NOT NULL,
    "outputPricePerMillion" DECIMAL(10,6) NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveTo" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "model_pricing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cost_daily_summary" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "model" TEXT NOT NULL,
    "spanCount" INTEGER NOT NULL DEFAULT 0,
    "inputTokens" BIGINT NOT NULL DEFAULT 0,
    "outputTokens" BIGINT NOT NULL DEFAULT 0,
    "totalTokens" BIGINT NOT NULL DEFAULT 0,
    "inputCost" DECIMAL(12,6) NOT NULL DEFAULT 0,
    "outputCost" DECIMAL(12,6) NOT NULL DEFAULT 0,
    "totalCost" DECIMAL(12,6) NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cost_daily_summary_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "model_pricing_provider_model_idx" ON "model_pricing"("provider", "model");

-- CreateIndex
CREATE UNIQUE INDEX "model_pricing_provider_model_effectiveFrom_key" ON "model_pricing"("provider", "model", "effectiveFrom");

-- CreateIndex
CREATE INDEX "cost_daily_summary_projectId_date_idx" ON "cost_daily_summary"("projectId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "cost_daily_summary_projectId_date_model_key" ON "cost_daily_summary"("projectId", "date", "model");

-- CreateIndex
CREATE INDEX "Span_pricingId_idx" ON "Span"("pricingId");

-- AddForeignKey
ALTER TABLE "Span" ADD CONSTRAINT "Span_pricingId_fkey" FOREIGN KEY ("pricingId") REFERENCES "model_pricing"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cost_daily_summary" ADD CONSTRAINT "cost_daily_summary_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
