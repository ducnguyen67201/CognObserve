/**
 * RCA (Root Cause Analysis) Activities
 *
 * Activities for trace analysis as part of Sprint 3 (#136).
 * Analyzes traces and spans during alert window to extract error patterns,
 * anomalies, and contextual information for LLM-based RCA.
 *
 * IMPORTANT: Read-only operations, no mutations.
 */

import { prisma, type Prisma } from "@cognobserve/db";
import {
  MAX_SPANS_TO_ANALYZE,
  TIME_BUCKET_MINUTES,
  ANOMALY_THRESHOLDS,
} from "@cognobserve/api/schemas";
import type {
  TraceAnalysisInput,
  TraceAnalysisOutput,
  TraceAnalysisSummary,
  ErrorPattern,
  AffectedEndpoint,
  AffectedModel,
  TimeDistributionBucket,
  DetectedAnomaly,
} from "../types";

// ============================================
// Internal Types
// ============================================

/** Row returned from span query with trace info */
interface SpanRow {
  id: string;
  traceId: string;
  traceName: string;
  name: string;
  level: string;
  statusMessage: string | null;
  model: string | null;
  startTime: Date;
  endTime: Date | null;
  promptTokens: number | null;
  completionTokens: number | null;
  totalCost: Prisma.Decimal | null;
  output: Prisma.JsonValue;
}

// ============================================
// Activity: Analyze Traces
// ============================================

/**
 * Analyzes traces and spans during the alert window to extract:
 * - Error patterns grouped by normalized message
 * - Latency statistics (p50, p95, p99, mean)
 * - Affected endpoints and LLM models
 * - Time distribution for trend detection
 * - Anomalies (latency spikes, error bursts, throughput drops)
 *
 * @param input - Analysis parameters including project ID and time window
 * @returns Structured analysis output for LLM consumption
 */
export async function analyzeTraces(
  input: TraceAnalysisInput
): Promise<TraceAnalysisOutput> {
  const windowStart = new Date(input.windowStart);
  const windowEnd = new Date(input.windowEnd);

  console.log(
    `[analyzeTraces] Starting analysis for project ${input.projectId}`
  );
  console.log(
    `[analyzeTraces] Alert: ${input.alertType} = ${input.alertValue} (threshold: ${input.threshold})`
  );
  console.log(
    `[analyzeTraces] Window: ${windowStart.toISOString()} to ${windowEnd.toISOString()}`
  );

  // 1. Query spans in time window
  const spans = await querySpansInWindow(input.projectId, windowStart, windowEnd);
  console.log(`[analyzeTraces] Found ${spans.length} spans`);

  // 2. Calculate summary statistics
  const summary = calculateSummary(spans);

  // 3. Group and extract error patterns
  const errorPatterns = extractErrorPatterns(spans);

  // 4. Group by affected endpoints
  const affectedEndpoints = groupByEndpoint(spans);

  // 5. Group by affected models
  const affectedModels = groupByModel(spans);

  // 6. Calculate time distribution
  const timeDistribution = calculateTimeDistribution(
    spans,
    windowStart,
    windowEnd
  );

  // 7. Detect anomalies
  const anomalies = detectAnomalies(input.alertType, timeDistribution);

  console.log(
    `[analyzeTraces] Analysis complete: ${summary.errorCount} errors, ` +
      `${errorPatterns.length} patterns, ${anomalies.length} anomalies`
  );

  return {
    summary,
    errorPatterns,
    affectedEndpoints,
    affectedModels,
    timeDistribution,
    anomalies,
  };
}

// ============================================
// Helper Functions
// ============================================

/**
 * Query spans within the analysis window.
 * Joins with trace to get trace name and filters by project.
 */
async function querySpansInWindow(
  projectId: string,
  windowStart: Date,
  windowEnd: Date
): Promise<SpanRow[]> {
  const rows = await prisma.span.findMany({
    where: {
      trace: { projectId },
      startTime: { gte: windowStart, lte: windowEnd },
    },
    select: {
      id: true,
      name: true,
      level: true,
      statusMessage: true,
      model: true,
      startTime: true,
      endTime: true,
      promptTokens: true,
      completionTokens: true,
      totalCost: true,
      output: true,
      trace: { select: { id: true, name: true } },
    },
    take: MAX_SPANS_TO_ANALYZE,
    orderBy: { startTime: "desc" },
  });

  return rows.map((r) => ({
    id: r.id,
    traceId: r.trace.id,
    traceName: r.trace.name,
    name: r.name,
    level: r.level,
    statusMessage: r.statusMessage,
    model: r.model,
    startTime: r.startTime,
    endTime: r.endTime,
    promptTokens: r.promptTokens,
    completionTokens: r.completionTokens,
    totalCost: r.totalCost,
    output: r.output,
  }));
}

/**
 * Calculate summary statistics from spans.
 */
function calculateSummary(spans: SpanRow[]): TraceAnalysisSummary {
  const latencies = spans
    .filter((s) => s.endTime)
    .map((s) => s.endTime!.getTime() - s.startTime.getTime())
    .sort((a, b) => a - b);

  const errorSpans = spans.filter((s) => s.level === "ERROR");
  const uniqueTraces = new Set(spans.map((s) => s.traceId));

  return {
    totalTraces: uniqueTraces.size,
    totalSpans: spans.length,
    errorCount: errorSpans.length,
    errorRate: spans.length > 0 ? errorSpans.length / spans.length : 0,
    latencyP50: percentile(latencies, 50),
    latencyP95: percentile(latencies, 95),
    latencyP99: percentile(latencies, 99),
    meanLatency:
      latencies.length > 0
        ? latencies.reduce((a, b) => a + b, 0) / latencies.length
        : 0,
  };
}

/**
 * Calculate percentile from sorted array.
 */
function percentile(sortedArr: number[], p: number): number {
  if (sortedArr.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sortedArr.length) - 1;
  return sortedArr[Math.max(0, idx)] ?? 0;
}

/**
 * Normalize error message for grouping.
 * Replaces UUIDs, timestamps, IPs, line numbers with placeholders.
 */
function normalizeErrorMessage(msg: string): string {
  return msg
    .replace(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
      "<UUID>"
    )
    .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/g, "<TIMESTAMP>")
    .replace(/line \d+/gi, "line <N>")
    .replace(/:\d+:\d+/g, ":<LINE>:<COL>")
    .replace(/\d+\.\d+\.\d+\.\d+/g, "<IP>")
    .slice(0, 200);
}

/**
 * Extract stack trace from span output if available.
 */
function extractStackTrace(output: Prisma.JsonValue): string | undefined {
  if (!output || typeof output !== "object" || Array.isArray(output)) {
    return undefined;
  }

  const obj = output as Record<string, unknown>;
  const errorObj = obj.error as Record<string, unknown> | undefined;

  const stack = obj.stack ?? obj.stackTrace ?? errorObj?.stack;
  return typeof stack === "string" ? stack.slice(0, 500) : undefined;
}

/**
 * Extract and group error patterns from spans.
 */
function extractErrorPatterns(spans: SpanRow[]): ErrorPattern[] {
  const errorMap = new Map<
    string,
    {
      original: string;
      count: number;
      sampleSpanIds: string[];
      stackTrace?: string;
    }
  >();

  const errorSpans = spans.filter((s) => s.level === "ERROR" && s.statusMessage);

  for (const span of errorSpans) {
    const normalized = normalizeErrorMessage(span.statusMessage!);
    const existing = errorMap.get(normalized);

    if (existing) {
      existing.count++;
      if (existing.sampleSpanIds.length < 3) {
        existing.sampleSpanIds.push(span.id);
      }
    } else {
      errorMap.set(normalized, {
        original: span.statusMessage!,
        count: 1,
        sampleSpanIds: [span.id],
        stackTrace: extractStackTrace(span.output),
      });
    }
  }

  const totalErrors = errorSpans.length || 1;

  return Array.from(errorMap.entries())
    .map(([, data]) => ({
      message: data.original.slice(0, 200),
      count: data.count,
      percentage: (data.count / totalErrors) * 100,
      sampleSpanIds: data.sampleSpanIds,
      stackTrace: data.stackTrace,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
}

/**
 * Group spans by endpoint (span name) and calculate statistics.
 */
function groupByEndpoint(spans: SpanRow[]): AffectedEndpoint[] {
  const endpointMap = new Map<
    string,
    {
      errors: number;
      total: number;
      latencies: number[];
      sampleTraceIds: Set<string>;
    }
  >();

  for (const span of spans) {
    const existing = endpointMap.get(span.name) ?? {
      errors: 0,
      total: 0,
      latencies: [],
      sampleTraceIds: new Set(),
    };

    existing.total++;
    if (span.level === "ERROR") existing.errors++;
    if (span.endTime) {
      existing.latencies.push(span.endTime.getTime() - span.startTime.getTime());
    }
    if (existing.sampleTraceIds.size < 3) {
      existing.sampleTraceIds.add(span.traceId);
    }

    endpointMap.set(span.name, existing);
  }

  return Array.from(endpointMap.entries())
    .map(([name, data]) => {
      const sortedLatencies = [...data.latencies].sort((a, b) => a - b);
      return {
        name,
        errorCount: data.errors,
        totalCount: data.total,
        errorRate: data.total > 0 ? data.errors / data.total : 0,
        latencyP95: percentile(sortedLatencies, 95),
        sampleTraceIds: Array.from(data.sampleTraceIds),
      };
    })
    .sort((a, b) => b.errorCount - a.errorCount)
    .slice(0, 20);
}

/**
 * Group spans by LLM model and calculate statistics.
 */
function groupByModel(spans: SpanRow[]): AffectedModel[] {
  const modelMap = new Map<
    string,
    {
      errors: number;
      latencies: number[];
      tokens: number[];
      costs: number[];
    }
  >();

  const modelSpans = spans.filter((s) => s.model);

  for (const span of modelSpans) {
    const existing = modelMap.get(span.model!) ?? {
      errors: 0,
      latencies: [],
      tokens: [],
      costs: [],
    };

    if (span.level === "ERROR") existing.errors++;
    if (span.endTime) {
      existing.latencies.push(span.endTime.getTime() - span.startTime.getTime());
    }

    const tokens = (span.promptTokens ?? 0) + (span.completionTokens ?? 0);
    if (tokens > 0) existing.tokens.push(tokens);
    if (span.totalCost) existing.costs.push(Number(span.totalCost));

    modelMap.set(span.model!, existing);
  }

  return Array.from(modelMap.entries())
    .map(([model, data]) => ({
      model,
      errorCount: data.errors,
      avgLatency:
        data.latencies.length > 0
          ? data.latencies.reduce((a, b) => a + b, 0) / data.latencies.length
          : 0,
      avgTokens:
        data.tokens.length > 0
          ? data.tokens.reduce((a, b) => a + b, 0) / data.tokens.length
          : 0,
      totalCost: data.costs.reduce((a, b) => a + b, 0),
    }))
    .sort((a, b) => b.errorCount - a.errorCount)
    .slice(0, 10);
}

/**
 * Calculate time distribution in 5-minute buckets.
 */
function calculateTimeDistribution(
  spans: SpanRow[],
  windowStart: Date,
  windowEnd: Date
): TimeDistributionBucket[] {
  const bucketMs = TIME_BUCKET_MINUTES * 60 * 1000;
  const buckets = new Map<
    string,
    { errors: number; total: number; latencies: number[] }
  >();

  // Initialize all buckets in window
  let bucketStart = new Date(
    Math.floor(windowStart.getTime() / bucketMs) * bucketMs
  );
  while (bucketStart <= windowEnd) {
    buckets.set(bucketStart.toISOString(), {
      errors: 0,
      total: 0,
      latencies: [],
    });
    bucketStart = new Date(bucketStart.getTime() + bucketMs);
  }

  // Fill buckets with span data
  for (const span of spans) {
    const bucket = new Date(
      Math.floor(span.startTime.getTime() / bucketMs) * bucketMs
    );
    const key = bucket.toISOString();
    const existing = buckets.get(key);

    if (existing) {
      existing.total++;
      if (span.level === "ERROR") existing.errors++;
      if (span.endTime) {
        existing.latencies.push(
          span.endTime.getTime() - span.startTime.getTime()
        );
      }
    }
  }

  return Array.from(buckets.entries())
    .map(([bucket, data]) => ({
      bucket,
      errorCount: data.errors,
      spanCount: data.total,
      avgLatency:
        data.latencies.length > 0
          ? data.latencies.reduce((a, b) => a + b, 0) / data.latencies.length
          : 0,
    }))
    .sort((a, b) => a.bucket.localeCompare(b.bucket));
}

/**
 * Detect anomalies from time distribution data.
 * Compares each bucket to the window average.
 */
function detectAnomalies(
  alertType: string,
  timeDistribution: TimeDistributionBucket[]
): DetectedAnomaly[] {
  const anomalies: DetectedAnomaly[] = [];

  if (timeDistribution.length === 0) return anomalies;

  // Calculate baseline averages
  const avgErrors =
    timeDistribution.reduce((a, b) => a + b.errorCount, 0) /
    timeDistribution.length;
  const avgLatency =
    timeDistribution.reduce((a, b) => a + b.avgLatency, 0) /
    timeDistribution.length;
  const avgThroughput =
    timeDistribution.reduce((a, b) => a + b.spanCount, 0) /
    timeDistribution.length;

  for (const bucket of timeDistribution) {
    // Detect error bursts (> 3x average errors)
    if (
      bucket.errorCount > ANOMALY_THRESHOLDS.minErrorsForBurst &&
      bucket.errorCount > avgErrors * ANOMALY_THRESHOLDS.errorBurstMultiplier
    ) {
      const multiplier = avgErrors > 0 ? bucket.errorCount / avgErrors : 0;
      anomalies.push({
        type: "error_burst",
        timestamp: bucket.bucket,
        description: `${bucket.errorCount} errors in ${TIME_BUCKET_MINUTES} minutes (${multiplier.toFixed(1)}x average)`,
        severity:
          bucket.errorCount >
          avgErrors * ANOMALY_THRESHOLDS.highErrorBurstMultiplier
            ? "high"
            : "medium",
      });
    }

    // Detect latency spikes (> 2x average latency)
    if (
      alertType.startsWith("LATENCY") &&
      bucket.avgLatency > avgLatency * ANOMALY_THRESHOLDS.latencySpikeMultiplier &&
      bucket.avgLatency > ANOMALY_THRESHOLDS.minLatencyForSpike
    ) {
      const multiplier = avgLatency > 0 ? bucket.avgLatency / avgLatency : 0;
      anomalies.push({
        type: "latency_spike",
        timestamp: bucket.bucket,
        description: `Latency spiked to ${bucket.avgLatency.toFixed(0)}ms (${multiplier.toFixed(1)}x average)`,
        severity:
          bucket.avgLatency >
          avgLatency * ANOMALY_THRESHOLDS.highLatencySpikeMultiplier
            ? "high"
            : "medium",
      });
    }

    // Detect throughput drops (< 50% of average, minimum 10 spans baseline)
    if (
      avgThroughput > ANOMALY_THRESHOLDS.minBaselineThroughput &&
      bucket.spanCount < avgThroughput * ANOMALY_THRESHOLDS.throughputDropPercentage
    ) {
      const percentage =
        avgThroughput > 0
          ? ((bucket.spanCount / avgThroughput) * 100).toFixed(0)
          : "0";
      anomalies.push({
        type: "throughput_drop",
        timestamp: bucket.bucket,
        description: `Throughput dropped to ${bucket.spanCount} spans (${percentage}% of average)`,
        severity:
          bucket.spanCount <
          avgThroughput * ANOMALY_THRESHOLDS.highThroughputDropPercentage
            ? "high"
            : "medium",
      });
    }
  }

  // Sort by severity (high first) and limit to top 10
  return anomalies
    .sort((a, b) => (a.severity === "high" ? 0 : 1) - (b.severity === "high" ? 0 : 1))
    .slice(0, 10);
}
