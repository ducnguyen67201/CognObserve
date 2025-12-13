-- CreateEnum
CREATE TYPE "IndexStatus" AS ENUM ('PENDING', 'INDEXING', 'UPDATING', 'READY', 'FAILED');

-- CreateTable
CREATE TABLE "github_installations" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "installationId" BIGINT NOT NULL,
    "accountLogin" TEXT NOT NULL,
    "accountType" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "github_installations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "github_repositories" (
    "id" TEXT NOT NULL,
    "installationId" TEXT NOT NULL,
    "projectId" TEXT,
    "githubId" BIGINT NOT NULL,
    "owner" TEXT NOT NULL,
    "repo" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "defaultBranch" TEXT NOT NULL DEFAULT 'main',
    "isPrivate" BOOLEAN NOT NULL DEFAULT false,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "indexStatus" "IndexStatus" NOT NULL DEFAULT 'PENDING',
    "lastIndexedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "github_repositories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "git_commits" (
    "id" TEXT NOT NULL,
    "repoId" TEXT NOT NULL,
    "sha" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "author" TEXT NOT NULL,
    "authorEmail" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "git_commits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "git_pull_requests" (
    "id" TEXT NOT NULL,
    "repoId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "state" TEXT NOT NULL,
    "author" TEXT NOT NULL,
    "baseBranch" TEXT NOT NULL,
    "headBranch" TEXT NOT NULL,
    "mergedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "git_pull_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "code_chunks" (
    "id" TEXT NOT NULL,
    "repoId" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "startLine" INTEGER NOT NULL,
    "endLine" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "language" TEXT,
    "chunkType" TEXT NOT NULL DEFAULT 'block',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "code_chunks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alert_rcas" (
    "id" TEXT NOT NULL,
    "alertId" TEXT NOT NULL,
    "triggeredAt" TIMESTAMP(3) NOT NULL,
    "analysisJson" JSONB NOT NULL,
    "suspectedPRs" TEXT[],
    "suspectedCommits" TEXT[],
    "confidence" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alert_rcas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_GitCommitToGitPullRequest" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_GitCommitToGitPullRequest_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "github_installations_workspaceId_key" ON "github_installations"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "github_installations_installationId_key" ON "github_installations"("installationId");

-- CreateIndex
CREATE UNIQUE INDEX "github_repositories_projectId_key" ON "github_repositories"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "github_repositories_githubId_key" ON "github_repositories"("githubId");

-- CreateIndex
CREATE INDEX "github_repositories_installationId_idx" ON "github_repositories"("installationId");

-- CreateIndex
CREATE INDEX "github_repositories_owner_repo_idx" ON "github_repositories"("owner", "repo");

-- CreateIndex
CREATE INDEX "git_commits_repoId_timestamp_idx" ON "git_commits"("repoId", "timestamp" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "git_commits_repoId_sha_key" ON "git_commits"("repoId", "sha");

-- CreateIndex
CREATE INDEX "git_pull_requests_repoId_mergedAt_idx" ON "git_pull_requests"("repoId", "mergedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "git_pull_requests_repoId_number_key" ON "git_pull_requests"("repoId", "number");

-- CreateIndex
CREATE INDEX "code_chunks_repoId_filePath_idx" ON "code_chunks"("repoId", "filePath");

-- CreateIndex
CREATE INDEX "code_chunks_contentHash_idx" ON "code_chunks"("contentHash");

-- CreateIndex
CREATE INDEX "alert_rcas_alertId_idx" ON "alert_rcas"("alertId");

-- CreateIndex
CREATE INDEX "alert_rcas_triggeredAt_idx" ON "alert_rcas"("triggeredAt" DESC);

-- CreateIndex
CREATE INDEX "_GitCommitToGitPullRequest_B_index" ON "_GitCommitToGitPullRequest"("B");

-- AddForeignKey
ALTER TABLE "github_installations" ADD CONSTRAINT "github_installations_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "github_repositories" ADD CONSTRAINT "github_repositories_installationId_fkey" FOREIGN KEY ("installationId") REFERENCES "github_installations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "github_repositories" ADD CONSTRAINT "github_repositories_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "git_commits" ADD CONSTRAINT "git_commits_repoId_fkey" FOREIGN KEY ("repoId") REFERENCES "github_repositories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "git_pull_requests" ADD CONSTRAINT "git_pull_requests_repoId_fkey" FOREIGN KEY ("repoId") REFERENCES "github_repositories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "code_chunks" ADD CONSTRAINT "code_chunks_repoId_fkey" FOREIGN KEY ("repoId") REFERENCES "github_repositories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alert_rcas" ADD CONSTRAINT "alert_rcas_alertId_fkey" FOREIGN KEY ("alertId") REFERENCES "alerts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_GitCommitToGitPullRequest" ADD CONSTRAINT "_GitCommitToGitPullRequest_A_fkey" FOREIGN KEY ("A") REFERENCES "git_commits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_GitCommitToGitPullRequest" ADD CONSTRAINT "_GitCommitToGitPullRequest_B_fkey" FOREIGN KEY ("B") REFERENCES "git_pull_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
