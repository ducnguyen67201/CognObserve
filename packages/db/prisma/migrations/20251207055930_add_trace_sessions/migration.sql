-- AlterTable
ALTER TABLE "Trace" ADD COLUMN     "sessionId" TEXT;

-- CreateTable
CREATE TABLE "trace_sessions" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "externalId" TEXT,
    "name" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trace_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "trace_sessions_projectId_createdAt_idx" ON "trace_sessions"("projectId", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "trace_sessions_projectId_externalId_key" ON "trace_sessions"("projectId", "externalId");

-- CreateIndex
CREATE INDEX "Trace_sessionId_idx" ON "Trace"("sessionId");

-- AddForeignKey
ALTER TABLE "Trace" ADD CONSTRAINT "Trace_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "trace_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trace_sessions" ADD CONSTRAINT "trace_sessions_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
