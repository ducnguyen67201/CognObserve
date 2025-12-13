/**
 * GitHub Router
 *
 * tRPC router for workspace-level GitHub repository management.
 * Handles GitHub App installation, repository listing, and indexing controls.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { prisma } from "@cognobserve/db";
import {
  createRouter,
  protectedProcedure,
  workspaceMiddleware,
} from "../trpc";
import { WORKSPACE_ADMIN_ROLES, type WorkspaceRole } from "../middleware/workspace";

// ============================================
// Input Schemas
// ============================================

const GetInstallationSchema = z.object({
  workspaceSlug: z.string(),
});

const ListRepositoriesSchema = z.object({
  workspaceSlug: z.string(),
  filter: z.enum(["enabled", "disabled", "all"]).default("all"),
  search: z.string().optional(),
  page: z.number().min(1).default(1),
  pageSize: z.number().min(1).max(100).default(20),
});

const RepositoryActionSchema = z.object({
  workspaceSlug: z.string(),
  repositoryId: z.string(),
});

// ============================================
// Router
// ============================================

export const githubRouter = createRouter({
  /**
   * Get GitHub installation status for workspace
   */
  getInstallation: protectedProcedure
    .input(GetInstallationSchema)
    .use(workspaceMiddleware)
    .query(async ({ ctx }) => {
      const installation = await prisma.gitHubInstallation.findUnique({
        where: { workspaceId: ctx.workspace.id },
        select: {
          id: true,
          installationId: true,
          accountLogin: true,
          accountType: true,
          createdAt: true,
        },
      });

      return installation;
    }),

  /**
   * List all repositories for a workspace
   */
  listRepositories: protectedProcedure
    .input(ListRepositoriesSchema)
    .use(workspaceMiddleware)
    .query(async ({ ctx, input }) => {
      const { filter, search, page, pageSize } = input;

      const installation = await prisma.gitHubInstallation.findUnique({
        where: { workspaceId: ctx.workspace.id },
      });

      if (!installation) {
        return {
          repositories: [],
          counts: { enabled: 0, disabled: 0, all: 0 },
          pagination: { page: 1, pageSize, totalCount: 0, totalPages: 0 },
        };
      }

      // Build where clause
      const where: {
        installationId: string;
        enabled?: boolean;
        fullName?: { contains: string; mode: "insensitive" };
      } = {
        installationId: installation.id,
      };

      if (filter === "enabled") {
        where.enabled = true;
      } else if (filter === "disabled") {
        where.enabled = false;
      }

      if (search) {
        where.fullName = { contains: search, mode: "insensitive" };
      }

      const skip = (page - 1) * pageSize;

      const [repositories, totalCount, enabledCount, disabledCount] =
        await Promise.all([
          prisma.gitHubRepository.findMany({
            where,
            orderBy: [{ enabled: "desc" }, { fullName: "asc" }],
            skip,
            take: pageSize,
            select: {
              id: true,
              fullName: true,
              owner: true,
              repo: true,
              defaultBranch: true,
              isPrivate: true,
              enabled: true,
              indexStatus: true,
              lastIndexedAt: true,
              _count: { select: { chunks: true } },
            },
          }),
          prisma.gitHubRepository.count({ where }),
          prisma.gitHubRepository.count({
            where: { installationId: installation.id, enabled: true },
          }),
          prisma.gitHubRepository.count({
            where: { installationId: installation.id, enabled: false },
          }),
        ]);

      return {
        repositories: repositories.map((r) => ({
          ...r,
          chunkCount: r._count.chunks,
        })),
        counts: {
          enabled: enabledCount,
          disabled: disabledCount,
          all: enabledCount + disabledCount,
        },
        pagination: {
          page,
          pageSize,
          totalCount,
          totalPages: Math.ceil(totalCount / pageSize),
        },
      };
    }),

  /**
   * Enable indexing for a repository
   */
  enableRepository: protectedProcedure
    .input(RepositoryActionSchema)
    .use(workspaceMiddleware)
    .mutation(async ({ ctx, input }) => {
      const { repositoryId } = input;

      // Only admins can enable repositories
      const role = ctx.workspace.role as WorkspaceRole;
      if (!WORKSPACE_ADMIN_ROLES.includes(role)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only workspace admins can enable repositories",
        });
      }

      // Verify repository belongs to workspace's installation
      const repo = await prisma.gitHubRepository.findFirst({
        where: {
          id: repositoryId,
          installation: {
            workspaceId: ctx.workspace.id,
          },
        },
      });

      if (!repo) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Repository not found" });
      }

      // Enable and set to pending
      await prisma.gitHubRepository.update({
        where: { id: repositoryId },
        data: {
          enabled: true,
          indexStatus: "PENDING",
        },
      });

      // TODO: Trigger initial indexing workflow via Temporal

      return { success: true };
    }),

  /**
   * Disable indexing for a repository
   */
  disableRepository: protectedProcedure
    .input(RepositoryActionSchema)
    .use(workspaceMiddleware)
    .mutation(async ({ ctx, input }) => {
      const { repositoryId } = input;

      // Only admins can disable repositories
      const role = ctx.workspace.role as WorkspaceRole;
      if (!WORKSPACE_ADMIN_ROLES.includes(role)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only workspace admins can disable repositories",
        });
      }

      // Verify repository belongs to workspace's installation
      const repo = await prisma.gitHubRepository.findFirst({
        where: {
          id: repositoryId,
          installation: {
            workspaceId: ctx.workspace.id,
          },
        },
      });

      if (!repo) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Repository not found" });
      }

      // Disable repository and clear chunks
      await prisma.$transaction([
        prisma.gitHubRepository.update({
          where: { id: repositoryId },
          data: { enabled: false },
        }),
        // Delete all chunks to free space
        prisma.codeChunk.deleteMany({
          where: { repoId: repositoryId },
        }),
      ]);

      return { success: true };
    }),

  /**
   * Trigger re-index for a repository
   */
  reindexRepository: protectedProcedure
    .input(RepositoryActionSchema)
    .use(workspaceMiddleware)
    .mutation(async ({ ctx, input }) => {
      const { repositoryId } = input;

      // Verify repository belongs to workspace's installation and is enabled
      const repo = await prisma.gitHubRepository.findFirst({
        where: {
          id: repositoryId,
          enabled: true,
          installation: {
            workspaceId: ctx.workspace.id,
          },
        },
      });

      if (!repo) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Repository not found or not enabled",
        });
      }

      // Set status to INDEXING
      await prisma.gitHubRepository.update({
        where: { id: repositoryId },
        data: { indexStatus: "INDEXING" },
      });

      // TODO: Trigger full re-index workflow via Temporal

      return { success: true };
    }),

  /**
   * Get repository details with stats
   */
  getRepository: protectedProcedure
    .input(RepositoryActionSchema)
    .use(workspaceMiddleware)
    .query(async ({ ctx, input }) => {
      const { repositoryId } = input;

      const repo = await prisma.gitHubRepository.findFirst({
        where: {
          id: repositoryId,
          installation: {
            workspaceId: ctx.workspace.id,
          },
        },
        include: {
          _count: {
            select: {
              chunks: true,
              commits: true,
              prs: true,
            },
          },
        },
      });

      if (!repo) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Repository not found" });
      }

      return {
        ...repo,
        stats: {
          chunks: repo._count.chunks,
          commits: repo._count.commits,
          prs: repo._count.prs,
        },
      };
    }),
});

export type GitHubRouter = typeof githubRouter;
