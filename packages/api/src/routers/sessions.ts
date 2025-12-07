import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { prisma, SpanLevel, Prisma } from "@cognobserve/db";
import { createRouter, protectedProcedure, workspaceMiddleware } from "../trpc";
import {
  CreateSessionSchema,
  UpdateSessionSchema,
  type SessionWithStats,
} from "../schemas/sessions";

/**
 * Sessions Router - Manage trace sessions (multi-turn conversations)
 */
export const sessionsRouter = createRouter({
  /**
   * List sessions for a project with aggregated stats
   */
  list: protectedProcedure
    .input(
      z.object({
        workspaceSlug: z.string().min(1),
        projectId: z.string().min(1),
        search: z.string().optional(),
        from: z.date().optional(),
        to: z.date().optional(),
        limit: z.number().int().min(1).max(100).default(50),
        cursor: z.string().optional(),
      })
    )
    .use(workspaceMiddleware)
    .query(async ({ ctx, input }) => {
      const { projectId, search, from, to, limit, cursor } = input;

      // Verify project belongs to workspace
      const project = await prisma.project.findFirst({
        where: {
          id: projectId,
          workspaceId: ctx.workspace.id,
        },
        select: { id: true },
      });

      if (!project) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Project not found",
        });
      }

      const where = {
        projectId,
        ...(search && {
          OR: [
            { name: { contains: search, mode: "insensitive" as const } },
            { externalId: { contains: search, mode: "insensitive" as const } },
          ],
        }),
        ...(from && { createdAt: { gte: from } }),
        ...(to && { createdAt: { lte: to } }),
      };

      const sessions = await prisma.traceSession.findMany({
        where,
        take: limit + 1,
        cursor: cursor ? { id: cursor } : undefined,
        orderBy: { updatedAt: "desc" },
        include: {
          _count: { select: { traces: true } },
          traces: {
            select: {
              spans: {
                select: {
                  totalTokens: true,
                  totalCost: true,
                  level: true,
                  startTime: true,
                  endTime: true,
                },
              },
            },
          },
        },
      });

      // Calculate aggregated stats
      const sessionsWithStats: SessionWithStats[] = sessions
        .slice(0, limit)
        .map((session) => {
          let totalTokens = 0;
          let totalCost = 0;
          let errorCount = 0;
          let totalLatency = 0;
          let spanCount = 0;

          for (const trace of session.traces) {
            for (const span of trace.spans) {
              totalTokens += span.totalTokens ?? 0;
              totalCost += Number(span.totalCost ?? 0);
              if (span.level === SpanLevel.ERROR) errorCount++;
              if (span.endTime && span.startTime) {
                totalLatency +=
                  span.endTime.getTime() - span.startTime.getTime();
                spanCount++;
              }
            }
          }

          return {
            id: session.id,
            projectId: session.projectId,
            externalId: session.externalId,
            name: session.name,
            metadata: session.metadata as Record<string, unknown> | null,
            createdAt: session.createdAt,
            updatedAt: session.updatedAt,
            traceCount: session._count.traces,
            totalTokens,
            totalCost,
            errorCount,
            avgLatencyMs: spanCount > 0 ? totalLatency / spanCount : null,
          };
        });

      let nextCursor: string | undefined;
      if (sessions.length > limit) {
        nextCursor = sessions[limit]?.id;
      }

      return { items: sessionsWithStats, nextCursor };
    }),

  /**
   * Get single session with traces
   */
  get: protectedProcedure
    .input(
      z.object({
        workspaceSlug: z.string().min(1),
        id: z.string(),
      })
    )
    .use(workspaceMiddleware)
    .query(async ({ ctx, input }) => {
      const session = await prisma.traceSession.findUnique({
        where: { id: input.id },
        include: {
          project: { select: { workspaceId: true } },
          traces: {
            orderBy: { timestamp: "asc" },
            include: {
              spans: {
                orderBy: { startTime: "asc" },
              },
            },
          },
        },
      });

      if (!session || session.project.workspaceId !== ctx.workspace.id) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Session not found" });
      }

      return session;
    }),

  /**
   * Create session manually (usually auto-created by worker)
   */
  create: protectedProcedure
    .input(
      z.object({
        workspaceSlug: z.string().min(1),
        projectId: z.string(),
        externalId: z.string().min(1).max(255).optional(),
        name: z.string().max(255).optional(),
        metadata: z.record(z.string(), z.unknown()).optional(),
      })
    )
    .use(workspaceMiddleware)
    .mutation(async ({ ctx, input }) => {
      const { workspaceSlug: _, metadata, ...rest } = input;

      // Verify project belongs to workspace
      const project = await prisma.project.findFirst({
        where: {
          id: input.projectId,
          workspaceId: ctx.workspace.id,
        },
        select: { id: true },
      });

      if (!project) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Project not found",
        });
      }

      return prisma.traceSession.create({
        data: {
          ...rest,
          metadata: (metadata as Prisma.InputJsonValue) ?? Prisma.JsonNull,
        },
      });
    }),

  /**
   * Update session name/metadata
   */
  update: protectedProcedure
    .input(
      z.object({
        workspaceSlug: z.string().min(1),
        id: z.string(),
        name: z.string().max(255).optional(),
        metadata: z.record(z.string(), z.unknown()).optional(),
      })
    )
    .use(workspaceMiddleware)
    .mutation(async ({ ctx, input }) => {
      const { workspaceSlug: _, id, metadata, ...rest } = input;

      // Verify session belongs to workspace
      const session = await prisma.traceSession.findUnique({
        where: { id },
        select: { project: { select: { workspaceId: true } } },
      });

      if (!session || session.project.workspaceId !== ctx.workspace.id) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Session not found",
        });
      }

      return prisma.traceSession.update({
        where: { id },
        data: {
          ...rest,
          ...(metadata !== undefined && {
            metadata: (metadata as Prisma.InputJsonValue) ?? Prisma.JsonNull,
          }),
        },
      });
    }),

  /**
   * Delete session (traces are unlinked, not deleted)
   */
  delete: protectedProcedure
    .input(
      z.object({
        workspaceSlug: z.string().min(1),
        id: z.string(),
      })
    )
    .use(workspaceMiddleware)
    .mutation(async ({ ctx, input }) => {
      // Verify session belongs to workspace
      const session = await prisma.traceSession.findUnique({
        where: { id: input.id },
        select: { project: { select: { workspaceId: true } } },
      });

      if (!session || session.project.workspaceId !== ctx.workspace.id) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Session not found",
        });
      }

      await prisma.traceSession.delete({ where: { id: input.id } });
      return { success: true };
    }),

  /**
   * Get session timeline (ordered traces for visualization)
   */
  timeline: protectedProcedure
    .input(
      z.object({
        workspaceSlug: z.string().min(1),
        id: z.string(),
      })
    )
    .use(workspaceMiddleware)
    .query(async ({ ctx, input }) => {
      // Verify session belongs to workspace
      const session = await prisma.traceSession.findUnique({
        where: { id: input.id },
        select: { project: { select: { workspaceId: true } } },
      });

      if (!session || session.project.workspaceId !== ctx.workspace.id) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Session not found",
        });
      }

      const traces = await prisma.trace.findMany({
        where: { sessionId: input.id },
        orderBy: { timestamp: "asc" },
        select: {
          id: true,
          name: true,
          timestamp: true,
          spans: {
            select: {
              id: true,
              name: true,
              startTime: true,
              endTime: true,
              level: true,
              model: true,
              totalTokens: true,
              totalCost: true,
            },
            orderBy: { startTime: "asc" },
          },
        },
      });

      return traces;
    }),
});

export type SessionsRouter = typeof sessionsRouter;
