-- CreateTable
CREATE TABLE "allowed_domains" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "role" "WorkspaceRole" NOT NULL DEFAULT 'MEMBER',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "allowed_domains_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "allowed_domains_domain_key" ON "allowed_domains"("domain");

-- CreateIndex
CREATE INDEX "allowed_domains_domain_idx" ON "allowed_domains"("domain");

-- CreateIndex
CREATE INDEX "allowed_domains_workspaceId_idx" ON "allowed_domains"("workspaceId");

-- AddForeignKey
ALTER TABLE "allowed_domains" ADD CONSTRAINT "allowed_domains_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "allowed_domains" ADD CONSTRAINT "allowed_domains_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
