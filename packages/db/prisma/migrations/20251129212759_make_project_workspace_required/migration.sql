-- Delete orphaned projects (projects without a workspace)
-- This includes their related data due to cascade deletes
DELETE FROM "Project" WHERE "workspaceId" IS NULL;

-- Now make workspaceId required
ALTER TABLE "Project" ALTER COLUMN "workspaceId" SET NOT NULL;
