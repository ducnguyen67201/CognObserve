-- CreateEnum
CREATE TYPE "AlertSeverity" AS ENUM ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "AlertState" AS ENUM ('INACTIVE', 'PENDING', 'FIRING', 'RESOLVED');

-- AlterTable
ALTER TABLE "alert_history" ADD COLUMN     "evaluationMs" INTEGER,
ADD COLUMN     "previousState" "AlertState",
ADD COLUMN     "sampleCount" INTEGER,
ADD COLUMN     "state" "AlertState";

-- AlterTable
ALTER TABLE "alerts" ADD COLUMN     "lastEvaluatedAt" TIMESTAMP(3),
ADD COLUMN     "pendingMins" INTEGER NOT NULL DEFAULT 2,
ADD COLUMN     "severity" "AlertSeverity" NOT NULL DEFAULT 'MEDIUM',
ADD COLUMN     "state" "AlertState" NOT NULL DEFAULT 'INACTIVE',
ADD COLUMN     "stateChangedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "alerts_enabled_severity_idx" ON "alerts"("enabled", "severity");

-- CreateIndex
CREATE INDEX "alerts_state_enabled_idx" ON "alerts"("state", "enabled");
