import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { prisma } from "@cognobserve/db";
import type { Prisma } from "@cognobserve/db";
import { createRouter, protectedProcedure, workspaceMiddleware } from "../trpc";
import { withQueryTimeout } from "../lib/query-utils";
import { TraceFiltersSchema, type SpanType } from "../schemas/traces";

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
  primaryType: SpanType;
  inputPreview: string | null;
  outputPreview: string | null;
  sessionId: string | null;
  sessionName: string | null;
}

/**
 * Extract text preview from span input/output (handles various formats)
 */
const extractTextPreview = (data: unknown, maxLength = 100): string | null => {
  if (!data) return null;

  // If it's a string, use directly
  if (typeof data === "string") {
    return data.length > maxLength ? data.slice(0, maxLength) + "..." : data;
  }

  // If it's an array (e.g., OpenAI messages format)
  if (Array.isArray(data)) {
    const messages = data as Array<{ role?: string; content?: string }>;
    // Get the last user or assistant message
    const relevantMessage = [...messages].reverse().find(
      (m) => m.role === "user" || m.role === "assistant"
    );
    if (relevantMessage?.content) {
      const content = relevantMessage.content;
      return content.length > maxLength
        ? content.slice(0, maxLength) + "..."
        : content;
    }
  }

  // If it's an object
  if (typeof data === "object" && data !== null) {
    const obj = data as Record<string, unknown>;

    // Handle { messages: [{role, content}] } format (input)
    if (Array.isArray(obj.messages)) {
      const messages = obj.messages as Array<{ role?: string; content?: string }>;
      const userMsg = [...messages].reverse().find((m) => m.role === "user");
      if (userMsg?.content) {
        const content = userMsg.content;
        return content.length > maxLength
          ? content.slice(0, maxLength) + "..."
          : content;
      }
    }

    // Handle { message: {role, content} } format (output)
    if (obj.message && typeof obj.message === "object") {
      const msg = obj.message as { role?: string; content?: string };
      if (msg.content) {
        const content = msg.content;
        return content.length > maxLength
          ? content.slice(0, maxLength) + "..."
          : content;
      }
    }

    // Handle { choices: [{message: {content}}] } format (OpenAI response)
    if (Array.isArray(obj.choices)) {
      const choices = obj.choices as Array<{ message?: { content?: string } }>;
      const content = choices[0]?.message?.content;
      if (content) {
        return content.length > maxLength
          ? content.slice(0, maxLength) + "..."
          : content;
      }
    }

    // Handle direct content/text/message fields
    const text = (obj.content ?? obj.text) as string | undefined;
    if (typeof text === "string") {
      return text.length > maxLength ? text.slice(0, maxLength) + "..." : text;
    }
  }

  return null;
};

export interface TraceDetail {
  id: string;
  name: string;
  timestamp: string;
  metadata: unknown;
  spans: SpanItem[];
  sessionId: string | null;
  sessionName: string | null;
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
 * Infer span type from span data.
 * Priority: LLM (has model) > HTTP > DB > FUNCTION > LOG > CUSTOM
 */
const inferSpanType = (span: { name: string; model: string | null }): SpanType => {
  // If has model, it's an LLM call
  if (span.model) return "LLM";

  const nameLower = span.name.toLowerCase();

  // HTTP patterns
  if (
    nameLower.includes("http") ||
    nameLower.includes("fetch") ||
    nameLower.includes("request") ||
    nameLower.includes("api")
  ) {
    return "HTTP";
  }

  // Database patterns
  if (
    nameLower.includes("db") ||
    nameLower.includes("database") ||
    nameLower.includes("query") ||
    nameLower.includes("sql") ||
    nameLower.includes("prisma") ||
    nameLower.includes("mongo")
  ) {
    return "DB";
  }

  // Function/Tool patterns
  if (
    nameLower.includes("function") ||
    nameLower.includes("tool") ||
    nameLower.includes("call")
  ) {
    return "FUNCTION";
  }

  // Log patterns
  if (nameLower.includes("log")) {
    return "LOG";
  }

  // Default to CUSTOM
  return "CUSTOM";
};

/**
 * Infer primary type from all spans in a trace.
 * Returns the most significant type (LLM > HTTP > DB > FUNCTION > LOG > CUSTOM).
 */
const inferPrimaryType = (spans: Array<{ name: string; model: string | null }>): SpanType => {
  const TYPE_PRIORITY: SpanType[] = ["LLM", "HTTP", "DB", "FUNCTION", "LOG", "CUSTOM"];

  const typeCounts = new Map<SpanType, number>();
  for (const span of spans) {
    const type = inferSpanType(span);
    typeCounts.set(type, (typeCounts.get(type) ?? 0) + 1);
  }

  // Return highest priority type that exists
  for (const type of TYPE_PRIORITY) {
    if (typeCounts.has(type)) {
      return type;
    }
  }

  return "CUSTOM";
};

/**
 * Traces Router
 */
export const tracesRouter = createRouter({
  /**
   * List traces for a project with optional filtering.
   * Note: Type filtering for LLM is server-side (checks model field).
   * Other type/level/duration filtering happens client-side for flexibility.
   */
  list: protectedProcedure
    .input(
      z.object({
        workspaceSlug: z.string().min(1),
        projectId: z.string().min(1),
        limit: z.number().min(1).max(100).default(50),
        cursor: z.string().optional(),
        filters: TraceFiltersSchema.optional(),
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

      // Build dynamic where clause based on filters
      const where: Prisma.TraceWhereInput = { projectId: input.projectId };
      const filters = input.filters;

      if (filters) {
        // Search by trace name (case-insensitive)
        if (filters.search) {
          where.name = { contains: filters.search, mode: "insensitive" };
        }

        // Server-side type filtering for LLM (checks if span has model field)
        // Other types are filtered client-side since they're inferred from name patterns
        if (filters.types?.includes("LLM")) {
          where.spans = {
            ...((where.spans as Prisma.SpanListRelationFilter) ?? {}),
            some: { model: { not: null } },
          };
        }

        // Server-side level filtering (stored in DB)
        if (filters.levels?.length) {
          where.spans = {
            ...((where.spans as Prisma.SpanListRelationFilter) ?? {}),
            some: { level: { in: filters.levels } },
          };
        }

        // Server-side model filtering (stored in DB)
        if (filters.models?.length) {
          where.spans = {
            ...((where.spans as Prisma.SpanListRelationFilter) ?? {}),
            some: { model: { in: filters.models } },
          };
        }

        // Session filter
        if (filters.sessionId) {
          where.sessionId = filters.sessionId;
        }
      }

      const traces = await withQueryTimeout(
        prisma.trace.findMany({
          where,
          orderBy: { timestamp: "desc" },
          take: input.limit + 1,
          cursor: input.cursor ? { id: input.cursor } : undefined,
          select: {
            id: true,
            name: true,
            timestamp: true,
            sessionId: true,
            session: {
              select: {
                name: true,
                externalId: true,
              },
            },
            spans: {
              select: {
                name: true,
                startTime: true,
                endTime: true,
                totalTokens: true,
                level: true,
                model: true,
                input: true,
                output: true,
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

        // Infer primary type from spans
        const primaryType = inferPrimaryType(trace.spans);

        // Extract input from first span, output from last span (conversation flow)
        const firstSpanWithInput = trace.spans.find((s) => s.input);
        const lastSpanWithOutput = [...trace.spans].reverse().find((s) => s.output);
        const inputPreview = firstSpanWithInput ? extractTextPreview(firstSpanWithInput.input) : null;
        const outputPreview = lastSpanWithOutput ? extractTextPreview(lastSpanWithOutput.output) : null;

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
          primaryType,
          inputPreview,
          outputPreview,
          sessionId: trace.sessionId,
          sessionName: trace.session?.name ?? trace.session?.externalId ?? null,
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
          sessionId: true,
          session: {
            select: {
              name: true,
              externalId: true,
            },
          },
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
        sessionId: trace.sessionId,
        sessionName: trace.session?.name ?? trace.session?.externalId ?? null,
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
