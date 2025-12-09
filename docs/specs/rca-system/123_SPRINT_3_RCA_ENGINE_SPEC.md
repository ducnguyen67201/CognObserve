# Sprint 3: RCA Engine - Root Cause Analysis Generation

**Sprint ID:** #120 Sprint 3
**Story Points:** 26
**Priority:** P0
**Dependencies:** Sprint 2 (Vector Search) completed

---

## Sprint Goal

> RCA generation working end-to-end: When an alert fires, the system automatically analyzes traces, correlates with code changes, generates an actionable RCA report, and stores it with confidence scoring.

---

## Definition of Done

- [ ] Alert triggers RCA workflow automatically
- [ ] Trace analysis extracts error patterns and anomalies
- [ ] Code correlation finds relevant recent changes
- [ ] LLM generates structured RCA with hypothesis
- [ ] RCA stored with confidence score
- [ ] LLM cost per RCA < $0.05 (average)

---

## Stories

### Story 1: Trace Analysis Activity

**Ticket ID:** #120-9
**Points:** 8
**Priority:** P0

#### Description

Create an activity that analyzes traces and spans during the alert window to extract error patterns, anomalies, and contextual information for RCA.

#### Acceptance Criteria

- [ ] Extracts spans with errors during alert window
- [ ] Identifies common error messages and stack traces
- [ ] Calculates latency distributions and anomalies
- [ ] Groups errors by endpoint/model/operation
- [ ] Returns structured analysis for LLM consumption

#### Technical Details

**Input/Output Types:**
```typescript
interface TraceAnalysisInput {
  projectId: string;
  alertType: AlertType;        // ERROR_RATE, LATENCY_P50, etc.
  alertValue: number;          // Actual value that triggered
  threshold: number;           // Configured threshold
  windowStart: Date;           // Alert evaluation window start
  windowEnd: Date;             // Alert evaluation window end
}

interface TraceAnalysisOutput {
  summary: {
    totalTraces: number;
    totalSpans: number;
    errorCount: number;
    errorRate: number;
    latencyP50: number;
    latencyP95: number;
    latencyP99: number;
  };

  errorPatterns: Array<{
    message: string;           // Error message (deduplicated)
    count: number;             // Occurrences
    percentage: number;        // % of total errors
    sampleSpanIds: string[];   // Up to 3 example span IDs
    stackTrace?: string;       // If available
  }>;

  affectedEndpoints: Array<{
    name: string;              // Span name or operation
    errorCount: number;
    latencyP95: number;
    sampleTraceIds: string[];
  }>;

  affectedModels: Array<{
    model: string;             // LLM model name
    errorCount: number;
    avgLatency: number;
    avgTokens: number;
  }>;

  timeDistribution: Array<{
    bucket: string;            // Time bucket (e.g., "14:00-14:05")
    errorCount: number;
    avgLatency: number;
  }>;

  anomalies: Array<{
    type: "latency_spike" | "error_burst" | "throughput_drop";
    timestamp: Date;
    description: string;
    severity: "high" | "medium" | "low";
  }>;
}
```

**Activity Implementation:**
```typescript
// apps/worker/src/temporal/activities/rca.activities.ts

export async function analyzeTraces(
  input: TraceAnalysisInput
): Promise<TraceAnalysisOutput> {
  const { projectId, windowStart, windowEnd, alertType } = input;

  // 1. Fetch traces and spans in window
  const traces = await prisma.trace.findMany({
    where: {
      projectId,
      timestamp: {
        gte: windowStart,
        lte: windowEnd,
      },
    },
    include: {
      spans: {
        select: {
          id: true,
          name: true,
          level: true,
          startTime: true,
          endTime: true,
          statusMessage: true,
          model: true,
          promptTokens: true,
          completionTokens: true,
          input: true,
          output: true,
        },
      },
    },
  });

  // 2. Calculate summary statistics
  const summary = calculateSummary(traces);

  // 3. Extract error patterns
  const errorPatterns = extractErrorPatterns(traces);

  // 4. Group by affected endpoints
  const affectedEndpoints = groupByEndpoint(traces);

  // 5. Group by affected models
  const affectedModels = groupByModel(traces);

  // 6. Calculate time distribution
  const timeDistribution = calculateTimeDistribution(traces, windowStart, windowEnd);

  // 7. Detect anomalies
  const anomalies = detectAnomalies(traces, alertType, input.alertValue);

  return {
    summary,
    errorPatterns,
    affectedEndpoints,
    affectedModels,
    timeDistribution,
    anomalies,
  };
}

function extractErrorPatterns(traces: TraceWithSpans[]): ErrorPattern[] {
  const errorMap = new Map<string, ErrorPattern>();

  for (const trace of traces) {
    for (const span of trace.spans) {
      if (span.level === "ERROR" && span.statusMessage) {
        // Normalize error message (remove variable parts)
        const normalizedMsg = normalizeErrorMessage(span.statusMessage);

        const existing = errorMap.get(normalizedMsg);
        if (existing) {
          existing.count++;
          if (existing.sampleSpanIds.length < 3) {
            existing.sampleSpanIds.push(span.id);
          }
        } else {
          errorMap.set(normalizedMsg, {
            message: span.statusMessage,
            count: 1,
            percentage: 0,  // Calculate after
            sampleSpanIds: [span.id],
            stackTrace: extractStackTrace(span.output),
          });
        }
      }
    }
  }

  // Calculate percentages and sort by count
  const totalErrors = Array.from(errorMap.values()).reduce((sum, e) => sum + e.count, 0);
  const patterns = Array.from(errorMap.values())
    .map(p => ({ ...p, percentage: (p.count / totalErrors) * 100 }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);  // Top 10 patterns

  return patterns;
}

function normalizeErrorMessage(msg: string): string {
  // Remove UUIDs, timestamps, line numbers
  return msg
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "<UUID>")
    .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/g, "<TIMESTAMP>")
    .replace(/line \d+/gi, "line <N>")
    .replace(/:\d+:\d+/g, ":<LINE>:<COL>");
}

function detectAnomalies(
  traces: TraceWithSpans[],
  alertType: AlertType,
  alertValue: number
): Anomaly[] {
  const anomalies: Anomaly[] = [];

  // Group by 1-minute buckets
  const buckets = groupByMinute(traces);

  // Detect latency spikes (> 2x average)
  if (alertType.startsWith("LATENCY")) {
    const avgLatency = calculateAvgLatency(traces);
    for (const [bucket, bucketTraces] of buckets) {
      const bucketLatency = calculateAvgLatency(bucketTraces);
      if (bucketLatency > avgLatency * 2) {
        anomalies.push({
          type: "latency_spike",
          timestamp: new Date(bucket),
          description: `Latency spiked to ${bucketLatency.toFixed(0)}ms (${(bucketLatency / avgLatency).toFixed(1)}x normal)`,
          severity: bucketLatency > avgLatency * 3 ? "high" : "medium",
        });
      }
    }
  }

  // Detect error bursts (> 5 errors in 1 minute)
  for (const [bucket, bucketTraces] of buckets) {
    const errorCount = countErrors(bucketTraces);
    if (errorCount > 5) {
      anomalies.push({
        type: "error_burst",
        timestamp: new Date(bucket),
        description: `${errorCount} errors in 1 minute`,
        severity: errorCount > 20 ? "high" : "medium",
      });
    }
  }

  return anomalies;
}
```

#### Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `apps/worker/src/temporal/activities/rca.activities.ts` | Create | RCA activities |
| `apps/worker/src/temporal/types.ts` | Modify | Add RCA types |
| `packages/api/src/schemas/rca.ts` | Create | RCA Zod schemas |

---

### Story 2: Change Correlation Algorithm

**Ticket ID:** #120-10
**Points:** 8
**Priority:** P0

#### Description

Create an algorithm that correlates alerts with recent code changes by combining temporal proximity, vector similarity, and file path matching.

#### Acceptance Criteria

- [ ] Finds commits within configurable time window (default: 7 days)
- [ ] Scores correlation by multiple signals
- [ ] Uses vector similarity for semantic matching
- [ ] Handles file path matching from error stack traces
- [ ] Returns ranked list of potential causes

#### Technical Details

**Correlation Signals:**

| Signal | Weight | Description |
|--------|--------|-------------|
| Temporal | 0.3 | Recency of change (exponential decay) |
| Semantic | 0.4 | Vector similarity of error to code |
| Path Match | 0.2 | File paths in stack traces match changed files |
| Author | 0.1 | Same author as previous similar errors |

**Input/Output Types:**
```typescript
interface CorrelationInput {
  projectId: string;
  traceAnalysis: TraceAnalysisOutput;
  lookbackDays: number;        // Default: 7
}

interface CorrelatedChange {
  type: "commit" | "pr";
  id: string;                  // Commit SHA or PR number
  title: string;               // Commit message or PR title
  author: string;
  timestamp: Date;
  filesChanged: string[];
  correlationScore: number;    // 0-1, higher is more likely
  signals: {
    temporal: number;
    semantic: number;
    pathMatch: number;
  };
  matchedCodeChunks: Array<{
    filePath: string;
    startLine: number;
    endLine: number;
    similarity: number;
    snippet: string;           // First 200 chars
  }>;
}

interface CorrelationOutput {
  changes: CorrelatedChange[];
  searchQuery: string;         // Query used for semantic search
  totalChangesAnalyzed: number;
}
```

**Activity Implementation:**
```typescript
// apps/worker/src/temporal/activities/rca.activities.ts

export async function correlateChanges(
  input: CorrelationInput
): Promise<CorrelationOutput> {
  const { projectId, traceAnalysis, lookbackDays } = input;
  const cutoffDate = subDays(new Date(), lookbackDays);

  // 1. Build semantic search query from trace analysis
  const searchQuery = buildSearchQuery(traceAnalysis);

  // 2. Perform vector search for relevant code
  const codeMatches = await searchCodebase({
    projectId,
    query: searchQuery,
    topK: 20,
    minSimilarity: 0.4,
  });

  // 3. Get recent commits/PRs
  const repo = await prisma.gitHubRepository.findUnique({
    where: { projectId },
    include: {
      commits: {
        where: { timestamp: { gte: cutoffDate } },
        orderBy: { timestamp: "desc" },
        take: 100,
      },
      pullRequests: {
        where: { mergedAt: { gte: cutoffDate } },
        orderBy: { mergedAt: "desc" },
        take: 50,
      },
    },
  });

  if (!repo) {
    return { changes: [], searchQuery, totalChangesAnalyzed: 0 };
  }

  // 4. Score each change
  const scoredChanges: CorrelatedChange[] = [];

  for (const commit of repo.commits) {
    const score = scoreChange(commit, traceAnalysis, codeMatches);
    if (score.correlationScore > 0.3) {
      scoredChanges.push(score);
    }
  }

  for (const pr of repo.pullRequests) {
    const score = scorePR(pr, traceAnalysis, codeMatches);
    if (score.correlationScore > 0.3) {
      scoredChanges.push(score);
    }
  }

  // 5. Sort by correlation score
  scoredChanges.sort((a, b) => b.correlationScore - a.correlationScore);

  return {
    changes: scoredChanges.slice(0, 10),  // Top 10
    searchQuery,
    totalChangesAnalyzed: repo.commits.length + repo.pullRequests.length,
  };
}

function buildSearchQuery(analysis: TraceAnalysisOutput): string {
  const parts: string[] = [];

  // Include top error messages
  for (const error of analysis.errorPatterns.slice(0, 3)) {
    parts.push(error.message);
  }

  // Include affected endpoints
  for (const endpoint of analysis.affectedEndpoints.slice(0, 3)) {
    parts.push(endpoint.name);
  }

  // Include stack trace excerpts (function names)
  for (const error of analysis.errorPatterns) {
    if (error.stackTrace) {
      const functions = extractFunctionNames(error.stackTrace);
      parts.push(...functions.slice(0, 5));
    }
  }

  return parts.join(" ");
}

function scoreChange(
  commit: GitCommit,
  analysis: TraceAnalysisOutput,
  codeMatches: SearchResult[]
): CorrelatedChange {
  // Temporal score: exponential decay over 7 days
  const daysAgo = differenceInDays(new Date(), commit.timestamp);
  const temporalScore = Math.exp(-daysAgo / 3);  // Half-life of ~3 days

  // Semantic score: max similarity of any changed file to code matches
  const changedPaths = new Set(
    (commit.filesChanged as { path: string }[]).map(f => f.path)
  );
  let semanticScore = 0;
  const matchedChunks: CorrelatedChange["matchedCodeChunks"] = [];

  for (const match of codeMatches) {
    if (changedPaths.has(match.filePath)) {
      semanticScore = Math.max(semanticScore, match.similarity);
      matchedChunks.push({
        filePath: match.filePath,
        startLine: match.startLine,
        endLine: match.endLine,
        similarity: match.similarity,
        snippet: match.content.slice(0, 200),
      });
    }
  }

  // Path match score: stack trace files match changed files
  let pathMatchScore = 0;
  for (const error of analysis.errorPatterns) {
    if (error.stackTrace) {
      const stackPaths = extractFilePaths(error.stackTrace);
      const matchCount = stackPaths.filter(p =>
        changedPaths.has(p) || [...changedPaths].some(cp => cp.endsWith(p))
      ).length;
      pathMatchScore = Math.max(pathMatchScore, matchCount / Math.max(stackPaths.length, 1));
    }
  }

  // Weighted combination
  const correlationScore =
    temporalScore * 0.3 +
    semanticScore * 0.4 +
    pathMatchScore * 0.3;

  return {
    type: "commit",
    id: commit.sha,
    title: commit.message,
    author: commit.authorName,
    timestamp: commit.timestamp,
    filesChanged: (commit.filesChanged as { path: string }[]).map(f => f.path),
    correlationScore,
    signals: {
      temporal: temporalScore,
      semantic: semanticScore,
      pathMatch: pathMatchScore,
    },
    matchedCodeChunks: matchedChunks.slice(0, 5),
  };
}
```

#### Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `apps/worker/src/temporal/activities/rca.activities.ts` | Modify | Add correlation |
| `packages/shared/src/rca/scoring.ts` | Create | Scoring utilities |

---

### Story 3: LLM-Based RCA Generation

**Ticket ID:** #120-11
**Points:** 8
**Priority:** P0

#### Description

Create an activity that uses LLM (Claude) to synthesize trace analysis and code correlations into a structured, actionable RCA report.

#### Acceptance Criteria

- [ ] Uses Claude Haiku for HIGH/MEDIUM/LOW, Sonnet for CRITICAL
- [ ] Generates structured JSON output
- [ ] Includes confidence score (0-1)
- [ ] Suggests remediation steps
- [ ] Cost per RCA < $0.05 average
- [ ] Handles LLM failures gracefully

#### Technical Details

**Model Selection:**
```typescript
const MODEL_BY_SEVERITY: Record<AlertSeverity, string> = {
  CRITICAL: "claude-sonnet-4-20250514",  // Higher accuracy for critical
  HIGH: "claude-haiku-4-20250514",
  MEDIUM: "claude-haiku-4-20250514",
  LOW: "claude-haiku-4-20250514",
};
```

**Input/Output Types:**
```typescript
interface RCAGenerationInput {
  alertId: string;
  alertName: string;
  alertType: AlertType;
  alertValue: number;
  threshold: number;
  severity: AlertSeverity;
  traceAnalysis: TraceAnalysisOutput;
  correlatedChanges: CorrelatedChange[];
  projectName: string;
}

interface RCAReport {
  hypothesis: string;          // Main root cause hypothesis (1-2 sentences)
  confidence: number;          // 0-1 confidence score
  reasoning: string;           // Detailed reasoning (2-4 sentences)

  rootCause: {
    category: "code_change" | "infrastructure" | "external_dependency" | "data_issue" | "unknown";
    summary: string;
    evidence: string[];
  };

  relatedChanges: Array<{
    changeId: string;
    relevance: "high" | "medium" | "low";
    explanation: string;
  }>;

  affectedComponents: string[];

  remediation: {
    immediate: string[];       // Steps to mitigate now
    longTerm: string[];        // Steps to prevent recurrence
  };

  additionalContext: string;   // Any other relevant observations
}
```

**Activity Implementation:**
```typescript
// apps/worker/src/temporal/activities/rca.activities.ts
import Anthropic from "@anthropic-ai/sdk";

export async function generateRCA(
  input: RCAGenerationInput
): Promise<RCAReport & { tokensUsed: number; latencyMs: number }> {
  const startTime = Date.now();
  const model = MODEL_BY_SEVERITY[input.severity];

  const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

  const systemPrompt = `You are an expert Site Reliability Engineer (SRE) analyzing production incidents.
Your task is to determine the root cause of an alert and provide actionable remediation steps.

Guidelines:
- Be specific and actionable
- Base conclusions on evidence provided
- Assign confidence based on strength of evidence
- If uncertain, say so clearly
- Focus on the most likely root cause`;

  const userPrompt = buildRCAPrompt(input);

  const response = await anthropic.messages.create({
    model,
    max_tokens: 2000,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  });

  // Parse structured response
  const content = response.content[0];
  if (content.type !== "text") {
    throw new Error("Unexpected response type from LLM");
  }

  const rca = parseRCAResponse(content.text);
  const tokensUsed = response.usage.input_tokens + response.usage.output_tokens;

  // Log cost for monitoring
  const costPerMillion = model.includes("sonnet") ? 15 : 1;  // Approximate
  const cost = (tokensUsed / 1_000_000) * costPerMillion;
  console.log(`RCA generation: ${model}, ${tokensUsed} tokens, $${cost.toFixed(4)}`);

  return {
    ...rca,
    tokensUsed,
    latencyMs: Date.now() - startTime,
  };
}

function buildRCAPrompt(input: RCAGenerationInput): string {
  return `
# Alert Information
- **Alert:** ${input.alertName}
- **Type:** ${input.alertType}
- **Severity:** ${input.severity}
- **Triggered Value:** ${formatAlertValue(input.alertType, input.alertValue)}
- **Threshold:** ${formatAlertValue(input.alertType, input.threshold)}
- **Project:** ${input.projectName}

# Trace Analysis Summary
- **Total Traces:** ${input.traceAnalysis.summary.totalTraces}
- **Error Rate:** ${input.traceAnalysis.summary.errorRate.toFixed(1)}%
- **Latency P95:** ${input.traceAnalysis.summary.latencyP95.toFixed(0)}ms

## Top Error Patterns
${input.traceAnalysis.errorPatterns.slice(0, 5).map((e, i) =>
  `${i + 1}. "${e.message}" (${e.count} occurrences, ${e.percentage.toFixed(1)}%)`
).join("\n")}

## Affected Endpoints
${input.traceAnalysis.affectedEndpoints.slice(0, 5).map(e =>
  `- ${e.name}: ${e.errorCount} errors, P95 latency ${e.latencyP95.toFixed(0)}ms`
).join("\n")}

## Detected Anomalies
${input.traceAnalysis.anomalies.map(a =>
  `- [${a.severity.toUpperCase()}] ${a.type}: ${a.description} at ${a.timestamp.toISOString()}`
).join("\n") || "No anomalies detected"}

# Recent Code Changes (Correlated)
${input.correlatedChanges.slice(0, 5).map((c, i) => `
## Change ${i + 1} (Correlation: ${(c.correlationScore * 100).toFixed(0)}%)
- **Type:** ${c.type}
- **ID:** ${c.id}
- **Title:** ${c.title}
- **Author:** ${c.author}
- **Time:** ${c.timestamp.toISOString()}
- **Files Changed:** ${c.filesChanged.slice(0, 5).join(", ")}
${c.matchedCodeChunks.length > 0 ? `
- **Matched Code:**
\`\`\`
${c.matchedCodeChunks[0].filePath}:${c.matchedCodeChunks[0].startLine}
${c.matchedCodeChunks[0].snippet}...
\`\`\`
` : ""}`).join("\n")}

# Task
Analyze this incident and provide a structured root cause analysis in the following JSON format:

\`\`\`json
{
  "hypothesis": "One sentence stating the most likely root cause",
  "confidence": 0.0-1.0,
  "reasoning": "2-4 sentences explaining your reasoning",
  "rootCause": {
    "category": "code_change|infrastructure|external_dependency|data_issue|unknown",
    "summary": "Brief summary of the root cause",
    "evidence": ["Evidence point 1", "Evidence point 2"]
  },
  "relatedChanges": [
    {"changeId": "commit/pr id", "relevance": "high|medium|low", "explanation": "Why this change is relevant"}
  ],
  "affectedComponents": ["Component 1", "Component 2"],
  "remediation": {
    "immediate": ["Step 1 to mitigate now"],
    "longTerm": ["Step to prevent recurrence"]
  },
  "additionalContext": "Any other observations"
}
\`\`\`

Respond with ONLY the JSON, no additional text.`;
}

function parseRCAResponse(text: string): RCAReport {
  // Extract JSON from response
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("Failed to parse RCA response: no JSON found");
  }

  const parsed = JSON.parse(jsonMatch[0]);

  // Validate with Zod schema
  return RCAReportSchema.parse(parsed);
}
```

**Fallback for Low Severity:**
```typescript
function generateTemplateRCA(input: RCAGenerationInput): RCAReport {
  // For LOW severity, skip LLM and use template
  const topError = input.traceAnalysis.errorPatterns[0];
  const topChange = input.correlatedChanges[0];

  return {
    hypothesis: topChange
      ? `The alert may be related to recent changes in ${topChange.filesChanged[0]}`
      : `Error rate increased due to ${topError?.message || "unknown errors"}`,
    confidence: 0.3,
    reasoning: "This is an automated template-based analysis for low-severity alerts.",
    rootCause: {
      category: topChange ? "code_change" : "unknown",
      summary: topError?.message || "See trace analysis for details",
      evidence: [],
    },
    relatedChanges: topChange ? [{
      changeId: topChange.id,
      relevance: "medium",
      explanation: "Most recent change with temporal correlation",
    }] : [],
    affectedComponents: input.traceAnalysis.affectedEndpoints.map(e => e.name),
    remediation: {
      immediate: ["Review recent deployments", "Check service health dashboards"],
      longTerm: ["Add more granular monitoring", "Improve error handling"],
    },
    additionalContext: "Low-severity alert analyzed with template. Consider manual review if issue persists.",
  };
}
```

#### Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `apps/worker/src/temporal/activities/rca.activities.ts` | Modify | Add LLM generation |
| `packages/api/src/schemas/rca.ts` | Modify | Add RCAReport schema |

---

### Story 4: RCA Storage and Schema

**Ticket ID:** #120-12
**Points:** 2
**Priority:** P0

#### Description

Implement the tRPC internal procedure to store RCA results and link them to alert history records.

#### Acceptance Criteria

- [ ] `internal.storeRCA` procedure created
- [ ] RCA linked to AlertHistory record
- [ ] All RCA fields persisted (hypothesis, confidence, analysis, etc.)
- [ ] Related commits/PRs linked via relations
- [ ] LLM metadata (tokens, latency) stored

#### Technical Details

**Internal Procedure:**
```typescript
// packages/api/src/routers/internal.ts

storeRCA: internalProcedure
  .input(z.object({
    alertHistoryId: z.string(),
    rca: RCAReportSchema,
    relatedCommitIds: z.array(z.string()),
    relatedPRIds: z.array(z.string()),
    relatedTraceIds: z.array(z.string()),
    modelUsed: z.string().optional(),
    tokensUsed: z.number().optional(),
    latencyMs: z.number().optional(),
  }))
  .mutation(async ({ input }) => {
    const { alertHistoryId, rca, relatedCommitIds, relatedPRIds, ...metadata } = input;

    // Verify alert history exists
    const alertHistory = await prisma.alertHistory.findUnique({
      where: { id: alertHistoryId },
    });

    if (!alertHistory) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Alert history not found",
      });
    }

    // Check if RCA already exists (idempotency)
    const existing = await prisma.alertRCA.findUnique({
      where: { alertHistoryId },
    });

    if (existing) {
      // Update existing RCA
      return prisma.alertRCA.update({
        where: { id: existing.id },
        data: {
          hypothesis: rca.hypothesis,
          confidence: rca.confidence,
          analysis: rca as unknown as Prisma.JsonObject,
          relatedCommitIds,
          relatedPRIds,
          relatedTraceIds: input.relatedTraceIds,
          codeSnippets: rca.relatedChanges as unknown as Prisma.JsonArray,
          modelUsed: metadata.modelUsed,
          tokensUsed: metadata.tokensUsed,
          latencyMs: metadata.latencyMs,
        },
      });
    }

    // Create new RCA
    return prisma.alertRCA.create({
      data: {
        alertHistoryId,
        hypothesis: rca.hypothesis,
        confidence: rca.confidence,
        analysis: rca as unknown as Prisma.JsonObject,
        relatedCommitIds,
        relatedPRIds,
        relatedTraceIds: input.relatedTraceIds,
        codeSnippets: rca.relatedChanges as unknown as Prisma.JsonArray,
        modelUsed: metadata.modelUsed,
        tokensUsed: metadata.tokensUsed,
        latencyMs: metadata.latencyMs,
      },
    });
  }),
```

**RCA Workflow Integration:**
```typescript
// apps/worker/src/workflows/rca.workflow.ts

export async function rcaAnalysisWorkflow(input: RCAInput): Promise<RCAResult> {
  // 1. Analyze traces
  const traceAnalysis = await analyzeTraces({
    projectId: input.projectId,
    alertType: input.alertType,
    alertValue: input.alertValue,
    threshold: input.threshold,
    windowStart: input.windowStart,
    windowEnd: input.windowEnd,
  });

  // 2. Correlate with code changes
  const correlations = await correlateChanges({
    projectId: input.projectId,
    traceAnalysis,
    lookbackDays: 7,
  });

  // 3. Generate RCA (LLM or template)
  let rca: RCAReport & { tokensUsed: number; latencyMs: number };

  if (input.severity === "LOW" || correlations.changes.length === 0) {
    rca = {
      ...generateTemplateRCA({
        alertId: input.alertId,
        alertName: input.alertName,
        alertType: input.alertType,
        alertValue: input.alertValue,
        threshold: input.threshold,
        severity: input.severity,
        traceAnalysis,
        correlatedChanges: correlations.changes,
        projectName: input.projectName,
      }),
      tokensUsed: 0,
      latencyMs: 0,
    };
  } else {
    rca = await generateRCA({
      alertId: input.alertId,
      alertName: input.alertName,
      alertType: input.alertType,
      alertValue: input.alertValue,
      threshold: input.threshold,
      severity: input.severity,
      traceAnalysis,
      correlatedChanges: correlations.changes,
      projectName: input.projectName,
    });
  }

  // 4. Store RCA via internal procedure
  const caller = getInternalCaller();
  await caller.internal.storeRCA({
    alertHistoryId: input.alertHistoryId,
    rca,
    relatedCommitIds: correlations.changes
      .filter(c => c.type === "commit")
      .map(c => c.id),
    relatedPRIds: correlations.changes
      .filter(c => c.type === "pr")
      .map(c => c.id),
    relatedTraceIds: traceAnalysis.errorPatterns
      .flatMap(e => e.sampleSpanIds)
      .slice(0, 10),
    modelUsed: MODEL_BY_SEVERITY[input.severity],
    tokensUsed: rca.tokensUsed,
    latencyMs: rca.latencyMs,
  });

  return {
    hypothesis: rca.hypothesis,
    confidence: rca.confidence,
    tokensUsed: rca.tokensUsed,
    latencyMs: rca.latencyMs,
  };
}
```

#### Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `packages/api/src/routers/internal.ts` | Modify | Add storeRCA |
| `apps/worker/src/workflows/rca.workflow.ts` | Create | Full RCA workflow |
| `apps/worker/src/workflows/index.ts` | Modify | Export RCA workflow |

---

## Sprint Backlog Summary

| Story | Points | Assignee | Status |
|-------|--------|----------|--------|
| #120-9 Trace analysis | 8 | TBD | To Do |
| #120-10 Change correlation | 8 | TBD | To Do |
| #120-11 LLM RCA generation | 8 | TBD | To Do |
| #120-12 RCA storage | 2 | TBD | To Do |
| **Total** | **26** | | |

---

## Dependencies & Blockers

| Dependency | Status | Notes |
|------------|--------|-------|
| Sprint 2 completed | ⏳ Pending | Vector search working |
| Anthropic API key | ⚠️ Needed | Add to Doppler |
| Alert system (#90-93) | ✅ Done | Alert history table exists |

---

## Cost Analysis

| Severity | Model | Est. Tokens | Cost/RCA |
|----------|-------|-------------|----------|
| CRITICAL | Sonnet | ~3000 | ~$0.045 |
| HIGH | Haiku | ~3000 | ~$0.003 |
| MEDIUM | Haiku | ~3000 | ~$0.003 |
| LOW | Template | 0 | $0.000 |

**Expected Monthly Cost (100 alerts):**
- 10% CRITICAL: 10 × $0.045 = $0.45
- 30% HIGH: 30 × $0.003 = $0.09
- 40% MEDIUM: 40 × $0.003 = $0.12
- 20% LOW: 20 × $0.00 = $0.00
- **Total: ~$0.66/month**

---

## Definition of Ready (for Sprint 4)

By end of Sprint 3:
- [ ] RCA workflow runs successfully
- [ ] RCA stored in database
- [ ] Confidence scores are reasonable (validated manually)
- [ ] Cost per RCA within budget
