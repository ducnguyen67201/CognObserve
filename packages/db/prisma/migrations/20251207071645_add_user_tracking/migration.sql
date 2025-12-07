-- AlterTable
ALTER TABLE "Trace" ADD COLUMN     "userId" TEXT;

-- AlterTable
ALTER TABLE "trace_sessions" ADD COLUMN     "userId" TEXT;

-- CreateTable
CREATE TABLE "tracked_users" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "metadata" JSONB,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tracked_users_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tracked_users_projectId_lastSeenAt_idx" ON "tracked_users"("projectId", "lastSeenAt" DESC);

-- CreateIndex
CREATE INDEX "tracked_users_projectId_email_idx" ON "tracked_users"("projectId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "tracked_users_projectId_externalId_key" ON "tracked_users"("projectId", "externalId");

-- CreateIndex
CREATE INDEX "Trace_userId_idx" ON "Trace"("userId");

-- CreateIndex
CREATE INDEX "trace_sessions_userId_idx" ON "trace_sessions"("userId");

-- AddForeignKey
ALTER TABLE "Trace" ADD CONSTRAINT "Trace_userId_fkey" FOREIGN KEY ("userId") REFERENCES "tracked_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tracked_users" ADD CONSTRAINT "tracked_users_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trace_sessions" ADD CONSTRAINT "trace_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "tracked_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
