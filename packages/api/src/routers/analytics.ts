import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { prisma } from "@cognobserve/db";
import { createRouter, protectedProcedure, workspaceMiddleware } from "../trpc";

/**
 * Time range for analytics queries
 */
const TimeRangeSchema = z.enum(["24h", "7d", "30d"]);
type TimeRange = z.infer<typeof TimeRangeSchema>;

/**
 * Get date range based on time range enum
 */
const getDateRange = (range: TimeRange): { start: Date; end: Date } => {
  const end = new Date();
  const start = new Date();

  switch (range) {
    case "24h":
      start.setHours(start.getHours() - 24);
      break;
    case "7d":
      start.setDate(start.getDate() - 7);
      break;
    case "30d":
      start.setDate(start.getDate() - 30);
      break;
  }

  return { start, end };
};

/**
 * Output types
 */
export interface TimeSeriesPoint {
  date: string;
  value: number;
}

export interface TraceVolumePoint {
  date: string;
  traces: number;
  errors: number;
}

export interface LatencyPoint {
  date: string;
  p50: number;
  p95: number;
  avg: number;
}

export interface TokenUsagePoint {
  date: string;
  prompt: number;
  completion: number;
  total: number;
}

export interface ModelUsage {
  model: string;
  count: number;
  tokens: number;
}

export interface ProjectAnalytics {
  /** Summary stats */
  summary: {
    totalTraces: number;
    totalSpans: number;
    errorCount: number;
    errorRate: number;
    avgLatency: number;
    totalTokens: number;
  };
  /** Trace volume over time with error count */
  traceVolume: TraceVolumePoint[];
  /** Latency percentiles over time */
  latency: LatencyPoint[];
  /** Token usage over time */
  tokenUsage: TokenUsagePoint[];
  /** Model usage breakdown */
  modelUsage: ModelUsage[];
}

export interface ProjectSummary {
  id: string;
  name: string;
  traceCount: number;
  errorCount: number;
  totalTokens: number;
}

export interface WorkspaceAnalytics {
  /** Summary stats across all projects */
  summary: {
    totalProjects: number;
    totalTraces: number;
    totalSpans: number;
    errorCount: number;
    errorRate: number;
    avgLatency: number;
    totalTokens: number;
  };
  /** Trace volume over time with error count */
  traceVolume: TraceVolumePoint[];
  /** Latency percentiles over time */
  latency: LatencyPoint[];
  /** Token usage over time */
  tokenUsage: TokenUsagePoint[];
  /** Model usage breakdown */
  modelUsage: ModelUsage[];
  /** Per-project breakdown */
  projectBreakdown: ProjectSummary[];
}

/**
 * Analytics Router
 */
export const analyticsRouter = createRouter({
  /**
   * Get project analytics dashboard data
   */
  getProjectAnalytics: protectedProcedure
    .input(
      z.object({
        workspaceSlug: z.string().min(1),
        projectId: z.string().min(1),
        timeRange: TimeRangeSchema.default("7d"),
      })
    )
    .use(workspaceMiddleware)
    .query(async ({ ctx, input }): Promise<ProjectAnalytics> => {
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

      const { start, end } = getDateRange(input.timeRange);

      // Fetch traces with spans for the time range
      const traces = await prisma.trace.findMany({
        where: {
          projectId: input.projectId,
          timestamp: { gte: start, lte: end },
        },
        select: {
          id: true,
          timestamp: true,
          spans: {
            select: {
              startTime: true,
              endTime: true,
              level: true,
              model: true,
              promptTokens: true,
              completionTokens: true,
              totalTokens: true,
            },
          },
        },
        orderBy: { timestamp: "asc" },
      });

      // Calculate summary stats
      let totalSpans = 0;
      let errorCount = 0;
      let totalLatency = 0;
      let latencyCount = 0;
      let totalTokens = 0;

      for (const trace of traces) {
        totalSpans += trace.spans.length;
        for (const span of trace.spans) {
          if (span.level === "ERROR") errorCount++;
          if (span.totalTokens) totalTokens += span.totalTokens;
          if (span.startTime && span.endTime) {
            const duration = span.endTime.getTime() - span.startTime.getTime();
            totalLatency += duration;
            latencyCount++;
          }
        }
      }

      const summary = {
        totalTraces: traces.length,
        totalSpans,
        errorCount,
        errorRate: traces.length > 0 ? (errorCount / traces.length) * 100 : 0,
        avgLatency: latencyCount > 0 ? totalLatency / latencyCount : 0,
        totalTokens,
      };

      // Group by date for time series
      const groupByDate = input.timeRange === "24h" ? "hour" : "day";
      const dateGroups = new Map<string, {
        traces: number;
        errors: number;
        latencies: number[];
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
      }>();

      // Initialize date groups
      const dateFormat = groupByDate === "hour"
        ? (d: Date) => d.toISOString().slice(0, 13) + ":00"
        : (d: Date) => d.toISOString().slice(0, 10);

      for (const trace of traces) {
        const dateKey = dateFormat(trace.timestamp);

        if (!dateGroups.has(dateKey)) {
          dateGroups.set(dateKey, {
            traces: 0,
            errors: 0,
            latencies: [],
            promptTokens: 0,
            completionTokens: 0,
            totalTokens: 0,
          });
        }

        const group = dateGroups.get(dateKey)!;
        group.traces++;

        for (const span of trace.spans) {
          if (span.level === "ERROR") group.errors++;
          if (span.promptTokens) group.promptTokens += span.promptTokens;
          if (span.completionTokens) group.completionTokens += span.completionTokens;
          if (span.totalTokens) group.totalTokens += span.totalTokens;
          if (span.startTime && span.endTime) {
            group.latencies.push(span.endTime.getTime() - span.startTime.getTime());
          }
        }
      }

      // Convert to arrays
      const sortedDates = Array.from(dateGroups.keys()).sort();

      const traceVolume: TraceVolumePoint[] = sortedDates.map((date) => {
        const group = dateGroups.get(date)!;
        return { date, traces: group.traces, errors: group.errors };
      });

      const calculatePercentile = (arr: number[], p: number): number => {
        if (arr.length === 0) return 0;
        const sorted = [...arr].sort((a, b) => a - b);
        const idx = Math.ceil((p / 100) * sorted.length) - 1;
        return sorted[Math.max(0, idx)] ?? 0;
      };

      const latency: LatencyPoint[] = sortedDates.map((date) => {
        const group = dateGroups.get(date)!;
        const avg = group.latencies.length > 0
          ? group.latencies.reduce((a, b) => a + b, 0) / group.latencies.length
          : 0;
        return {
          date,
          p50: calculatePercentile(group.latencies, 50),
          p95: calculatePercentile(group.latencies, 95),
          avg: Math.round(avg),
        };
      });

      const tokenUsage: TokenUsagePoint[] = sortedDates.map((date) => {
        const group = dateGroups.get(date)!;
        return {
          date,
          prompt: group.promptTokens,
          completion: group.completionTokens,
          total: group.totalTokens,
        };
      });

      // Model usage breakdown
      const modelCounts = new Map<string, { count: number; tokens: number }>();
      for (const trace of traces) {
        for (const span of trace.spans) {
          if (span.model) {
            const existing = modelCounts.get(span.model) ?? { count: 0, tokens: 0 };
            existing.count++;
            existing.tokens += span.totalTokens ?? 0;
            modelCounts.set(span.model, existing);
          }
        }
      }

      const modelUsage: ModelUsage[] = Array.from(modelCounts.entries())
        .map(([model, data]) => ({ model, count: data.count, tokens: data.tokens }))
        .sort((a, b) => b.count - a.count);

      return {
        summary,
        traceVolume,
        latency,
        tokenUsage,
        modelUsage,
      };
    }),

  /**
   * Get workspace-wide analytics dashboard data
   */
  getWorkspaceAnalytics: protectedProcedure
    .input(
      z.object({
        workspaceSlug: z.string().min(1),
        timeRange: TimeRangeSchema.default("7d"),
      })
    )
    .use(workspaceMiddleware)
    .query(async ({ ctx, input }): Promise<WorkspaceAnalytics> => {
      const { start, end } = getDateRange(input.timeRange);

      // Get all projects in workspace
      const projects = await prisma.project.findMany({
        where: { workspaceId: ctx.workspace.id },
        select: { id: true, name: true },
      });

      if (projects.length === 0) {
        return {
          summary: {
            totalProjects: 0,
            totalTraces: 0,
            totalSpans: 0,
            errorCount: 0,
            errorRate: 0,
            avgLatency: 0,
            totalTokens: 0,
          },
          traceVolume: [],
          latency: [],
          tokenUsage: [],
          modelUsage: [],
          projectBreakdown: [],
        };
      }

      const projectIds = projects.map((p) => p.id);

      // Fetch traces with spans for the time range across all projects
      const traces = await prisma.trace.findMany({
        where: {
          projectId: { in: projectIds },
          timestamp: { gte: start, lte: end },
        },
        select: {
          id: true,
          projectId: true,
          timestamp: true,
          spans: {
            select: {
              startTime: true,
              endTime: true,
              level: true,
              model: true,
              promptTokens: true,
              completionTokens: true,
              totalTokens: true,
            },
          },
        },
        orderBy: { timestamp: "asc" },
      });

      // Calculate summary stats and per-project breakdown
      let totalSpans = 0;
      let errorCount = 0;
      let totalLatency = 0;
      let latencyCount = 0;
      let totalTokens = 0;

      // Per-project stats
      const projectStats = new Map<string, {
        traceCount: number;
        errorCount: number;
        totalTokens: number;
      }>();

      for (const project of projects) {
        projectStats.set(project.id, { traceCount: 0, errorCount: 0, totalTokens: 0 });
      }

      for (const trace of traces) {
        const pStats = projectStats.get(trace.projectId)!;
        pStats.traceCount++;
        totalSpans += trace.spans.length;

        for (const span of trace.spans) {
          if (span.level === "ERROR") {
            errorCount++;
            pStats.errorCount++;
          }
          if (span.totalTokens) {
            totalTokens += span.totalTokens;
            pStats.totalTokens += span.totalTokens;
          }
          if (span.startTime && span.endTime) {
            const duration = span.endTime.getTime() - span.startTime.getTime();
            totalLatency += duration;
            latencyCount++;
          }
        }
      }

      const summary = {
        totalProjects: projects.length,
        totalTraces: traces.length,
        totalSpans,
        errorCount,
        errorRate: traces.length > 0 ? (errorCount / traces.length) * 100 : 0,
        avgLatency: latencyCount > 0 ? totalLatency / latencyCount : 0,
        totalTokens,
      };

      // Project breakdown
      const projectBreakdown: ProjectSummary[] = projects.map((p) => {
        const stats = projectStats.get(p.id)!;
        return {
          id: p.id,
          name: p.name,
          traceCount: stats.traceCount,
          errorCount: stats.errorCount,
          totalTokens: stats.totalTokens,
        };
      }).sort((a, b) => b.traceCount - a.traceCount);

      // Group by date for time series
      const groupByDate = input.timeRange === "24h" ? "hour" : "day";
      const dateGroups = new Map<string, {
        traces: number;
        errors: number;
        latencies: number[];
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
      }>();

      const dateFormat = groupByDate === "hour"
        ? (d: Date) => d.toISOString().slice(0, 13) + ":00"
        : (d: Date) => d.toISOString().slice(0, 10);

      for (const trace of traces) {
        const dateKey = dateFormat(trace.timestamp);

        if (!dateGroups.has(dateKey)) {
          dateGroups.set(dateKey, {
            traces: 0,
            errors: 0,
            latencies: [],
            promptTokens: 0,
            completionTokens: 0,
            totalTokens: 0,
          });
        }

        const group = dateGroups.get(dateKey)!;
        group.traces++;

        for (const span of trace.spans) {
          if (span.level === "ERROR") group.errors++;
          if (span.promptTokens) group.promptTokens += span.promptTokens;
          if (span.completionTokens) group.completionTokens += span.completionTokens;
          if (span.totalTokens) group.totalTokens += span.totalTokens;
          if (span.startTime && span.endTime) {
            group.latencies.push(span.endTime.getTime() - span.startTime.getTime());
          }
        }
      }

      // Convert to arrays
      const sortedDates = Array.from(dateGroups.keys()).sort();

      const traceVolume: TraceVolumePoint[] = sortedDates.map((date) => {
        const group = dateGroups.get(date)!;
        return { date, traces: group.traces, errors: group.errors };
      });

      const calculatePercentile = (arr: number[], p: number): number => {
        if (arr.length === 0) return 0;
        const sorted = [...arr].sort((a, b) => a - b);
        const idx = Math.ceil((p / 100) * sorted.length) - 1;
        return sorted[Math.max(0, idx)] ?? 0;
      };

      const latency: LatencyPoint[] = sortedDates.map((date) => {
        const group = dateGroups.get(date)!;
        const avg = group.latencies.length > 0
          ? group.latencies.reduce((a, b) => a + b, 0) / group.latencies.length
          : 0;
        return {
          date,
          p50: calculatePercentile(group.latencies, 50),
          p95: calculatePercentile(group.latencies, 95),
          avg: Math.round(avg),
        };
      });

      const tokenUsage: TokenUsagePoint[] = sortedDates.map((date) => {
        const group = dateGroups.get(date)!;
        return {
          date,
          prompt: group.promptTokens,
          completion: group.completionTokens,
          total: group.totalTokens,
        };
      });

      // Model usage breakdown
      const modelCounts = new Map<string, { count: number; tokens: number }>();
      for (const trace of traces) {
        for (const span of trace.spans) {
          if (span.model) {
            const existing = modelCounts.get(span.model) ?? { count: 0, tokens: 0 };
            existing.count++;
            existing.tokens += span.totalTokens ?? 0;
            modelCounts.set(span.model, existing);
          }
        }
      }

      const modelUsage: ModelUsage[] = Array.from(modelCounts.entries())
        .map(([model, data]) => ({ model, count: data.count, tokens: data.tokens }))
        .sort((a, b) => b.count - a.count);

      return {
        summary,
        traceVolume,
        latency,
        tokenUsage,
        modelUsage,
        projectBreakdown,
      };
    }),
});

export type AnalyticsRouter = typeof analyticsRouter;
