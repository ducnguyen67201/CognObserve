import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { prisma } from "@cognobserve/db";
import { createRouter, protectedProcedure, workspaceMiddleware } from "../trpc";
import { withQueryTimeout } from "../lib/query-utils";

/**
 * Output types
 */
export interface TraceListItem {
  id: string;
  name: string;
  timestamp: string;
  spanCount: number;
  totalTokens: number | null;
  duration: number | null;
  hasErrors: boolean;
  hasWarnings: boolean;
  primaryModel: string | null;
}

export interface TraceDetail {
  id: string;
  name: string;
  timestamp: string;
  metadata: unknown;
  spans: SpanItem[];
}

export interface SpanItem {
  id: string;
  name: string;
  parentSpanId: string | null;
  startTime: string;
  endTime: string | null;
  duration: number | null;
  offsetFromTraceStart: number;
  model: string | null;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  level: string;
  statusMessage: string | null;
}

export interface SpanDetail {
  id: string;
  name: string;
  parentSpanId: string | null;
  startTime: string;
  endTime: string | null;
  duration: number | null;
  model: string | null;
  modelParameters: unknown;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  level: string;
  statusMessage: string | null;
  input: unknown;
  output: unknown;
  metadata: unknown;
}

/**
 * Traces Router
 */
export const tracesRouter = createRouter({
  /**
   * List traces for a project.
   */
  list: protectedProcedure
    .input(
      z.object({
        workspaceSlug: z.string().min(1),
        projectId: z.string().min(1),
        limit: z.number().min(1).max(100).default(50),
        cursor: z.string().optional(),
      })
    )
    .use(workspaceMiddleware)
    .query(async ({ ctx, input }): Promise<{ items: TraceListItem[]; nextCursor: string | null; hasMore: boolean }> => {
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

      const traces = await withQueryTimeout(
        prisma.trace.findMany({
          where: { projectId: input.projectId },
          orderBy: { timestamp: "desc" },
          take: input.limit + 1,
          cursor: input.cursor ? { id: input.cursor } : undefined,
          select: {
            id: true,
            name: true,
            timestamp: true,
            spans: {
              select: {
                startTime: true,
                endTime: true,
                totalTokens: true,
                level: true,
                model: true,
              },
            },
          },
        }),
        "LIST",
        "traces.list"
      );

      let nextCursor: string | null = null;
      if (traces.length > input.limit) {
        const nextItem = traces.pop();
        nextCursor = nextItem?.id ?? null;
      }

      const items = traces.map((trace) => {
        const totalTokens = trace.spans.reduce(
          (sum, span) => sum + (span.totalTokens ?? 0),
          0
        );

        // Calculate duration from first span start to last span end
        let duration: number | null = null;
        if (trace.spans.length > 0) {
          const startTimes = trace.spans.map((s) => s.startTime.getTime());
          const endTimes = trace.spans
            .filter((s) => s.endTime)
            .map((s) => s.endTime!.getTime());

          if (endTimes.length > 0) {
            duration = Math.max(...endTimes) - Math.min(...startTimes);
          }
        }

        // Check for errors and warnings
        const hasErrors = trace.spans.some((s) => s.level === "ERROR");
        const hasWarnings = trace.spans.some((s) => s.level === "WARNING");

        // Find primary model (most common)
        const modelCounts = trace.spans
          .filter((s) => s.model)
          .reduce(
            (acc, s) => {
              acc[s.model!] = (acc[s.model!] || 0) + 1;
              return acc;
            },
            {} as Record<string, number>
          );

        const primaryModel =
          Object.entries(modelCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ??
          null;

        return {
          id: trace.id,
          name: trace.name,
          timestamp: trace.timestamp.toISOString(),
          spanCount: trace.spans.length,
          totalTokens: totalTokens > 0 ? totalTokens : null,
          duration,
          hasErrors,
          hasWarnings,
          primaryModel,
        };
      });

      return { items, nextCursor, hasMore: nextCursor !== null };
    }),

  /**
   * Get a single trace with all spans.
   */
  get: protectedProcedure
    .input(
      z.object({
        workspaceSlug: z.string().min(1),
        projectId: z.string().min(1),
        traceId: z.string().min(1),
      })
    )
    .use(workspaceMiddleware)
    .query(async ({ ctx, input }): Promise<TraceDetail> => {
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

      const trace = await prisma.trace.findFirst({
        where: {
          id: input.traceId,
          projectId: input.projectId,
        },
        select: {
          id: true,
          name: true,
          timestamp: true,
          metadata: true,
          spans: {
            orderBy: { startTime: "asc" },
            select: {
              id: true,
              name: true,
              parentSpanId: true,
              startTime: true,
              endTime: true,
              model: true,
              promptTokens: true,
              completionTokens: true,
              totalTokens: true,
              level: true,
              statusMessage: true,
              // NOTE: input/output excluded for performance - use getSpanDetail for full data
            },
          },
        },
      });

      if (!trace) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Trace not found",
        });
      }

      const traceStartTime = trace.timestamp.getTime();

      return {
        id: trace.id,
        name: trace.name,
        timestamp: trace.timestamp.toISOString(),
        metadata: trace.metadata,
        spans: trace.spans.map((span) => {
          const spanStartTime = span.startTime.getTime();
          const spanEndTime = span.endTime?.getTime() ?? null;

          return {
            id: span.id,
            name: span.name,
            parentSpanId: span.parentSpanId,
            startTime: span.startTime.toISOString(),
            endTime: span.endTime?.toISOString() ?? null,
            duration: spanEndTime ? spanEndTime - spanStartTime : null,
            offsetFromTraceStart: spanStartTime - traceStartTime,
            model: span.model,
            promptTokens: span.promptTokens,
            completionTokens: span.completionTokens,
            totalTokens: span.totalTokens,
            level: span.level,
            statusMessage: span.statusMessage,
          };
        }),
      };
    }),

  /**
   * Get full details for a single span (lazy loading).
   */
  getSpanDetail: protectedProcedure
    .input(
      z.object({
        workspaceSlug: z.string().min(1),
        projectId: z.string().min(1),
        traceId: z.string().min(1),
        spanId: z.string().min(1),
      })
    )
    .use(workspaceMiddleware)
    .query(async ({ ctx, input }): Promise<SpanDetail> => {
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

      const span = await withQueryTimeout(
        prisma.span.findFirst({
          where: {
            id: input.spanId,
            traceId: input.traceId,
            trace: { projectId: input.projectId },
          },
        }),
        "SPAN",
        "traces.getSpanDetail"
      );

      if (!span) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Span not found",
        });
      }

      const spanStartTime = span.startTime.getTime();
      const spanEndTime = span.endTime?.getTime() ?? null;

      return {
        id: span.id,
        name: span.name,
        parentSpanId: span.parentSpanId,
        startTime: span.startTime.toISOString(),
        endTime: span.endTime?.toISOString() ?? null,
        duration: spanEndTime ? spanEndTime - spanStartTime : null,
        model: span.model,
        modelParameters: span.modelParameters,
        promptTokens: span.promptTokens,
        completionTokens: span.completionTokens,
        totalTokens: span.totalTokens,
        level: span.level,
        statusMessage: span.statusMessage,
        input: span.input,
        output: span.output,
        metadata: span.metadata,
      };
    }),
});

export type TracesRouter = typeof tracesRouter;
