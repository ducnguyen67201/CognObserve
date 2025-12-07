# Implementation Guide: Issue #115 - Temporal Worker Migration

**Issue:** #115 Temporal Worker Migration
**Points:** 13 | **Priority:** P1
**Spec:** `docs/specs/infrastructure/115_TEMPORAL_MIGRATION_SPEC.md`

---

## Table of Contents

1. [Overview](#1-overview)
2. [Architecture](#2-architecture)
3. [Phase 1: Infrastructure Setup](#3-phase-1-infrastructure-setup)
4. [Phase 2: Environment Configuration](#4-phase-2-environment-configuration)
5. [Phase 3: Temporal Foundation](#5-phase-3-temporal-foundation)
6. [Phase 4: Activities Implementation](#6-phase-4-activities-implementation)
7. [Phase 5: Workflows Implementation](#7-phase-5-workflows-implementation)
8. [Phase 6: Go Ingest Integration](#8-phase-6-go-ingest-integration)
9. [Phase 7: Worker Entry Point](#9-phase-7-worker-entry-point)
10. [Phase 8: Migration & Testing](#10-phase-8-migration--testing)
11. [File Reference](#11-file-reference)

---

## 1. Overview

Migrate the CognObserve worker from Redis-based queue processing (LPUSH/BRPOP) to Temporal workflow orchestration for better reliability, visibility, retry handling, and long-running task support.

### Current vs Target Architecture

```
CURRENT (Redis Queue):
┌─────────────┐     LPUSH      ┌─────────────┐     BRPOP      ┌─────────────┐
│   Ingest    │ ────────────► │    Redis    │ ◄──────────── │   Worker    │
│   (Go)      │               │   Queue     │               │   (Node)    │
└─────────────┘               └─────────────┘               └─────────────┘

TARGET (Temporal):
┌─────────────┐    gRPC     ┌─────────────┐   Schedule   ┌─────────────┐
│   Ingest    │ ──────────► │  Temporal   │ ◄──────────► │   Worker    │
│   (Go)      │             │   Server    │              │   (Node)    │
└─────────────┘             └─────────────┘              └─────────────┘
                                  │                           │
                           ┌──────┴──────┐             ┌──────┴──────┐
                           │  Workflow   │             │  Activity   │
                           │  History    │             │  Workers    │
                           └─────────────┘             └─────────────┘
```

### Components to Migrate

| Current Component | Location | Target |
|-------------------|----------|--------|
| Queue Consumer | `apps/worker/src/queue/consumer.ts` | Temporal Worker |
| Trace Processor | `apps/worker/src/processors/trace.ts` | Trace Activities + Workflow |
| Alert Evaluator | `apps/worker/src/jobs/alert-evaluator.ts` | Alert Workflow |
| Queue Producer | `apps/ingest/internal/queue/producer.go` | Temporal Client |

---

## 2. Architecture

### Best Practices Applied

1. **Centralized Imports** - Single entry point for workflows and activities
2. **Separation of Concerns** - Activities handle side effects, workflows handle orchestration
3. **Type Safety** - Shared types between workflows and activities
4. **Testability** - Activities can be unit tested independently
5. **Feature Flags** - Gradual migration with rollback capability
6. **READ-ONLY Activities** - All database mutations go through Web API

### 🔴 CRITICAL: Temporal Activities Are READ-ONLY

**All database mutations MUST go through Web tRPC API endpoints.**

```
┌──────────────────┐         ┌──────────────────┐
│  Temporal Worker │         │   Web (Next.js)  │
│                  │         │                  │
│  ┌────────────┐  │  HTTP   │  ┌────────────┐  │
│  │  Activity  │──┼────────▶│  │ Internal   │──┼──▶ PostgreSQL
│  │ READ-ONLY  │  │         │  │ API Route  │  │
│  └────────────┘  │         │  └────────────┘  │
└──────────────────┘         └──────────────────┘

ALLOWED in Activities:
  ✅ Database READS (findUnique, findMany, count, aggregate)
  ✅ HTTP calls to Web internal API via fetchInternal()
  ✅ Pure computations and validations

FORBIDDEN in Activities:
  ❌ Database WRITES (create, update, delete, upsert)
  ❌ Direct mutations to any database table
```

**Rationale:**
- Web API is the single source of truth for business logic
- Proper authorization and validation in one place
- Consistent audit trails
- Decoupled architecture for better testability

### Directory Structure

```
apps/worker/src/
├── index.ts                      # Entry point (dual-mode support)
├── lib/
│   └── env.ts                    # Environment config (extended)
├── temporal/
│   ├── index.ts                  # ⭐ CENTRALIZED EXPORT
│   ├── client.ts                 # Temporal client singleton
│   ├── worker.ts                 # Worker factory
│   ├── types.ts                  # Shared workflow/activity types
│   └── activities/
│       ├── index.ts              # Activities barrel export
│       ├── fetch.ts              # Type-safe internal API helper
│       ├── trace.activities.ts   # Trace processing activities
│       ├── score.activities.ts   # Score processing activities
│       └── alert.activities.ts   # Alert evaluation activities
├── workflows/
│   ├── index.ts                  # ⭐ WORKFLOWS BARREL EXPORT
│   ├── trace.workflow.ts         # Trace ingestion workflow
│   ├── score.workflow.ts         # Score ingestion workflow
│   └── alert.workflow.ts         # Alert evaluation workflow
├── queue/                        # (Legacy - to be removed)
│   └── consumer.ts
├── processors/                   # (Legacy - migrated to activities)
│   └── trace.ts
└── jobs/                         # (Legacy - migrated to workflows)
    └── alert-evaluator.ts
```

### Import Pattern

```typescript
// ✅ GOOD - Centralized import
import { traceWorkflow, scoreWorkflow } from "./workflows";
import { persistTrace, calculateCosts } from "./temporal/activities";
import { getTemporalClient, createTemporalWorker } from "./temporal";

// ❌ BAD - Direct imports
import { traceWorkflow } from "./workflows/trace.workflow";
```

---

## 3. Phase 1: Infrastructure Setup

### 3.1 Docker Compose

**File:** `docker-compose.yml`

Add Temporal server and UI services:

```yaml
services:
  # ... existing postgres and redis ...

  temporal:
    image: temporalio/auto-setup:1.24
    container_name: cognobserve-temporal
    ports:
      - "7233:7233"
    environment:
      - DB=postgresql
      - DB_PORT=5432
      - POSTGRES_USER=${POSTGRES_USER:-postgres}
      - POSTGRES_PWD=${POSTGRES_PASSWORD:-postgres}
      - POSTGRES_SEEDS=postgres
      - DYNAMIC_CONFIG_FILE_PATH=config/dynamicconfig/development.yaml
    volumes:
      - ./temporal-config:/etc/temporal/config/dynamicconfig
    depends_on:
      postgres:
        condition: service_healthy
    networks:
      - cognobserve-network
    healthcheck:
      test: ["CMD", "tctl", "cluster", "health"]
      interval: 10s
      timeout: 5s
      retries: 5

  temporal-ui:
    image: temporalio/ui:2.26
    container_name: cognobserve-temporal-ui
    ports:
      - "8088:8080"
    environment:
      - TEMPORAL_ADDRESS=temporal:7233
      - TEMPORAL_CORS_ORIGINS=http://localhost:3000
    depends_on:
      - temporal
    networks:
      - cognobserve-network
```

### 3.2 Temporal Config

**File:** `temporal-config/development.yaml`

```yaml
# Temporal dynamic configuration
system.forceSearchAttributesCacheRefreshOnRead:
  - value: true
    constraints: {}
frontend.enableClientVersionCheck:
  - value: false
    constraints: {}
```

### 3.3 Environment Variables

**File:** `.env.example` (additions)

```bash
# Temporal Configuration
TEMPORAL_ADDRESS=localhost:7233
TEMPORAL_NAMESPACE=cognobserve
TEMPORAL_TASK_QUEUE=cognobserve-tasks
USE_TEMPORAL_WORKFLOWS=false
```

### 3.4 Verification

```bash
# Start infrastructure
make docker-up

# Verify Temporal is running
curl -s http://localhost:7233/health | jq

# Access Temporal UI
open http://localhost:8088
```

---

## 4. Phase 2: Environment Configuration

### 4.1 Worker Environment

**File:** `apps/worker/src/lib/env.ts`

Add Temporal configuration to existing schema:

```typescript
// Add to server schema
TEMPORAL_ADDRESS: z.string().default("localhost:7233"),
TEMPORAL_NAMESPACE: z.string().default("cognobserve"),
TEMPORAL_TASK_QUEUE: z.string().default("cognobserve-tasks"),
USE_TEMPORAL_WORKFLOWS: z
  .string()
  .transform((val) => val === "true")
  .default("false"),

// Add to runtimeEnv
TEMPORAL_ADDRESS: process.env.TEMPORAL_ADDRESS,
TEMPORAL_NAMESPACE: process.env.TEMPORAL_NAMESPACE,
TEMPORAL_TASK_QUEUE: process.env.TEMPORAL_TASK_QUEUE,
USE_TEMPORAL_WORKFLOWS: process.env.USE_TEMPORAL_WORKFLOWS,
```

### 4.2 Shared Constants

**File:** `packages/shared/src/constants.ts`

```typescript
export const TEMPORAL = {
  DEFAULT_ADDRESS: "localhost:7233",
  DEFAULT_NAMESPACE: "cognobserve",
  DEFAULT_TASK_QUEUE: "cognobserve-tasks",
  WORKFLOWS: {
    TRACE: "traceWorkflow",
    SCORE: "scoreWorkflow",
    ALERT_EVALUATION: "alertEvaluationWorkflow",
  },
} as const;

export const WORKFLOW_TIMEOUTS = {
  TRACE: {
    WORKFLOW_EXECUTION: "5m",
    ACTIVITY: "30s",
  },
  SCORE: {
    WORKFLOW_EXECUTION: "2m",
    ACTIVITY: "30s",
  },
  ALERT: {
    WORKFLOW_EXECUTION: "24h",
    ACTIVITY: "10s",
    EVALUATION_INTERVAL: "10s",
  },
} as const;
```

### 4.3 Go Config

**File:** `apps/ingest/internal/config/config.go`

```go
// Add to Config struct
TemporalAddress      string `env:"TEMPORAL_ADDRESS" envDefault:"localhost:7233"`
TemporalNamespace    string `env:"TEMPORAL_NAMESPACE" envDefault:"cognobserve"`
TemporalTaskQueue    string `env:"TEMPORAL_TASK_QUEUE" envDefault:"cognobserve-tasks"`
UseTemporalWorkflows bool   `env:"USE_TEMPORAL_WORKFLOWS" envDefault:"false"`
```

---

## 5. Phase 3: Temporal Foundation

### 5.1 Shared Types

**File:** `apps/worker/src/temporal/types.ts`

```typescript
// Workflow input/output types shared between activities and workflows

export interface TraceWorkflowInput {
  id: string;
  projectId: string;
  name: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
  sessionId?: string;
  userId?: string;
  user?: UserInput;
  spans: SpanInput[];
}

export interface UserInput {
  name?: string;
  email?: string;
  [key: string]: unknown;
}

export interface SpanInput {
  id: string;
  parentSpanId?: string;
  name: string;
  startTime: string;
  endTime?: string;
  input?: unknown;
  output?: unknown;
  metadata?: Record<string, unknown>;
  model?: string;
  modelParameters?: Record<string, unknown>;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  level?: "DEBUG" | "DEFAULT" | "WARNING" | "ERROR";
  statusMessage?: string;
}

export interface ScoreWorkflowInput {
  id: string;
  projectId: string;
  configId?: string;
  traceId?: string;
  spanId?: string;
  sessionId?: string;
  trackedUserId?: string;
  name: string;
  value: number | string | boolean;
  comment?: string;
  metadata?: Record<string, unknown>;
}

export interface AlertWorkflowInput {
  alertId: string;
  projectId: string;
  alertName: string;
  severity: string;
  evaluationIntervalMs: number;
}

export interface AlertEvaluationResult {
  alertId: string;
  conditionMet: boolean;
  currentValue: number;
  threshold: number;
  sampleCount: number;
}

export interface AlertStateTransition {
  alertId: string;
  previousState: string;
  newState: string;
  shouldNotify: boolean;
}
```

### 5.2 Temporal Client

**File:** `apps/worker/src/temporal/client.ts`

```typescript
import { Client, Connection } from "@temporalio/client";
import { env } from "../lib/env";

let clientInstance: Client | null = null;
let connectionInstance: Connection | null = null;

export async function getTemporalClient(): Promise<Client> {
  if (clientInstance) return clientInstance;

  connectionInstance = await Connection.connect({
    address: env.TEMPORAL_ADDRESS,
  });

  clientInstance = new Client({
    connection: connectionInstance,
    namespace: env.TEMPORAL_NAMESPACE,
  });

  return clientInstance;
}

export async function closeTemporalClient(): Promise<void> {
  if (connectionInstance) {
    await connectionInstance.close();
    connectionInstance = null;
    clientInstance = null;
  }
}

export function isTemporalEnabled(): boolean {
  return env.USE_TEMPORAL_WORKFLOWS;
}
```

### 5.3 Worker Factory

**File:** `apps/worker/src/temporal/worker.ts`

```typescript
import { Worker, NativeConnection } from "@temporalio/worker";
import { env } from "../lib/env";
import * as activities from "./activities";

let workerInstance: Worker | null = null;

export async function createTemporalWorker(): Promise<Worker> {
  if (workerInstance) return workerInstance;

  const connection = await NativeConnection.connect({
    address: env.TEMPORAL_ADDRESS,
  });

  workerInstance = await Worker.create({
    connection,
    namespace: env.TEMPORAL_NAMESPACE,
    taskQueue: env.TEMPORAL_TASK_QUEUE,
    workflowsPath: require.resolve("../workflows"),
    activities,
    // Performance tuning
    maxConcurrentActivityTaskExecutions: 100,
    maxConcurrentWorkflowTaskExecutions: 100,
    // Graceful shutdown
    shutdownGraceTime: "30s",
  });

  return workerInstance;
}

export async function runTemporalWorker(): Promise<void> {
  const worker = await createTemporalWorker();
  await worker.run();
}

export function shutdownTemporalWorker(): void {
  if (workerInstance) {
    workerInstance.shutdown();
    workerInstance = null;
  }
}
```

### 5.4 Centralized Export

**File:** `apps/worker/src/temporal/index.ts`

```typescript
// ============================================================
// TEMPORAL MODULE - CENTRALIZED EXPORTS
// ============================================================
// Always import from this file, never from individual modules
// ============================================================

// Client
export {
  getTemporalClient,
  closeTemporalClient,
  isTemporalEnabled,
} from "./client";

// Worker
export {
  createTemporalWorker,
  runTemporalWorker,
  shutdownTemporalWorker,
} from "./worker";

// Types (re-export for convenience)
export type {
  TraceWorkflowInput,
  SpanInput,
  UserInput,
  ScoreWorkflowInput,
  AlertWorkflowInput,
  AlertEvaluationResult,
  AlertStateTransition,
} from "./types";

// Activities (re-export from activities/index.ts)
export * from "./activities";
```

---

## 6. Phase 4: Activities Implementation

### 6.1 Trace Activities

**File:** `apps/worker/src/temporal/activities/trace.activities.ts`

```typescript
import { prisma } from "@cognobserve/db";
import { Decimal } from "@cognobserve/db/generated/prisma/runtime/library";
import type { TraceWorkflowInput, SpanInput } from "../types";

/**
 * Persist trace and spans to database (atomic transaction)
 */
export async function persistTrace(input: TraceWorkflowInput): Promise<string> {
  const trace = await prisma.$transaction(async (tx) => {
    // Resolve user if provided
    let internalUserId: string | null = null;
    if (input.userId) {
      const user = await tx.trackedUser.upsert({
        where: {
          projectId_externalId: {
            projectId: input.projectId,
            externalId: input.userId,
          },
        },
        create: {
          projectId: input.projectId,
          externalId: input.userId,
          name: input.user?.name ?? null,
          email: input.user?.email ?? null,
          metadata: input.user ?? {},
        },
        update: {
          lastSeenAt: new Date(),
          ...(input.user?.name && { name: input.user.name }),
          ...(input.user?.email && { email: input.user.email }),
        },
      });
      internalUserId = user.id;
    }

    // Resolve session if provided
    let internalSessionId: string | null = null;
    if (input.sessionId) {
      const session = await tx.traceSession.upsert({
        where: {
          projectId_externalId: {
            projectId: input.projectId,
            externalId: input.sessionId,
          },
        },
        create: {
          projectId: input.projectId,
          externalId: input.sessionId,
          userId: internalUserId,
        },
        update: {
          updatedAt: new Date(),
          ...(internalUserId && { userId: internalUserId }),
        },
      });
      internalSessionId = session.id;
    }

    // Create trace
    const trace = await tx.trace.create({
      data: {
        id: input.id,
        projectId: input.projectId,
        name: input.name,
        timestamp: new Date(input.timestamp),
        metadata: input.metadata ?? {},
        sessionId: internalSessionId,
        userId: internalUserId,
      },
    });

    // Create spans
    if (input.spans.length > 0) {
      await tx.span.createMany({
        data: input.spans.map((span) => convertSpan(span, trace.id)),
      });
    }

    return trace;
  });

  return trace.id;
}

function convertSpan(span: SpanInput, traceId: string) {
  return {
    id: span.id,
    traceId,
    parentSpanId: span.parentSpanId ?? null,
    name: span.name,
    startTime: new Date(span.startTime),
    endTime: span.endTime ? new Date(span.endTime) : null,
    input: span.input ?? null,
    output: span.output ?? null,
    metadata: span.metadata ?? null,
    model: span.model ?? null,
    modelParameters: span.modelParameters ?? null,
    promptTokens: span.promptTokens ?? null,
    completionTokens: span.completionTokens ?? null,
    totalTokens: span.totalTokens ?? null,
    level: span.level ?? "DEFAULT",
    statusMessage: span.statusMessage ?? null,
  };
}

/**
 * Calculate costs for spans with LLM usage
 */
export async function calculateTraceCosts(traceId: string): Promise<number> {
  const spans = await prisma.span.findMany({
    where: {
      traceId,
      model: { not: null },
      totalTokens: { gt: 0 },
      totalCost: null,
    },
  });

  let updatedCount = 0;

  for (const span of spans) {
    if (!span.model) continue;

    const pricing = await prisma.modelPricing.findFirst({
      where: {
        model: span.model,
        effectiveFrom: { lte: span.startTime },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: span.startTime } }],
      },
      orderBy: { effectiveFrom: "desc" },
    });

    if (!pricing) continue;

    const inputTokens = span.promptTokens ?? 0;
    const outputTokens = span.completionTokens ?? 0;

    const inputCost = new Decimal(inputTokens)
      .mul(pricing.inputPricePerMillion)
      .div(1_000_000);
    const outputCost = new Decimal(outputTokens)
      .mul(pricing.outputPricePerMillion)
      .div(1_000_000);
    const totalCost = inputCost.add(outputCost);

    await prisma.span.update({
      where: { id: span.id },
      data: { inputCost, outputCost, totalCost, pricingId: pricing.id },
    });

    updatedCount++;
  }

  return updatedCount;
}

/**
 * Update daily cost summary aggregates
 */
export async function updateCostSummaries(
  projectId: string,
  dateStr: string
): Promise<void> {
  const date = new Date(dateStr);
  const dateOnly = date.toISOString().split("T")[0]!;
  const startOfDay = new Date(dateOnly);
  const endOfDay = new Date(startOfDay);
  endOfDay.setDate(endOfDay.getDate() + 1);

  const summaries = await prisma.span.groupBy({
    by: ["model"],
    where: {
      trace: { projectId },
      startTime: { gte: startOfDay, lt: endOfDay },
      totalCost: { not: null },
    },
    _sum: {
      promptTokens: true,
      completionTokens: true,
      totalTokens: true,
      inputCost: true,
      outputCost: true,
      totalCost: true,
    },
    _count: true,
  });

  for (const summary of summaries) {
    if (!summary.model) continue;

    await prisma.costDailySummary.upsert({
      where: {
        projectId_date_model: { projectId, date: startOfDay, model: summary.model },
      },
      create: {
        projectId,
        date: startOfDay,
        model: summary.model,
        inputTokens: BigInt(summary._sum.promptTokens ?? 0),
        outputTokens: BigInt(summary._sum.completionTokens ?? 0),
        totalTokens: BigInt(summary._sum.totalTokens ?? 0),
        inputCost: summary._sum.inputCost ?? new Decimal(0),
        outputCost: summary._sum.outputCost ?? new Decimal(0),
        totalCost: summary._sum.totalCost ?? new Decimal(0),
        spanCount: summary._count,
      },
      update: {
        inputTokens: BigInt(summary._sum.promptTokens ?? 0),
        outputTokens: BigInt(summary._sum.completionTokens ?? 0),
        totalTokens: BigInt(summary._sum.totalTokens ?? 0),
        inputCost: summary._sum.inputCost ?? new Decimal(0),
        outputCost: summary._sum.outputCost ?? new Decimal(0),
        totalCost: summary._sum.totalCost ?? new Decimal(0),
        spanCount: summary._count,
      },
    });
  }
}
```

### 6.2 Score Activities

**File:** `apps/worker/src/temporal/activities/score.activities.ts`

```typescript
import { prisma } from "@cognobserve/db";
import type { ScoreWorkflowInput } from "../types";

type ScoreDataType = "NUMERIC" | "CATEGORICAL" | "BOOLEAN";

function inferDataType(value: unknown): ScoreDataType {
  if (typeof value === "number") return "NUMERIC";
  if (typeof value === "boolean") return "BOOLEAN";
  return "CATEGORICAL";
}

/**
 * Persist score to database with ID resolution
 */
export async function persistScore(input: ScoreWorkflowInput): Promise<string> {
  // Resolve external session ID
  let internalSessionId: string | null = null;
  if (input.sessionId) {
    const session = await prisma.traceSession.findFirst({
      where: { projectId: input.projectId, externalId: input.sessionId },
    });
    internalSessionId = session?.id ?? null;
  }

  // Resolve external user ID
  let internalUserId: string | null = null;
  if (input.trackedUserId) {
    const user = await prisma.trackedUser.findFirst({
      where: { projectId: input.projectId, externalId: input.trackedUserId },
    });
    internalUserId = user?.id ?? null;
  }

  const dataType = inferDataType(input.value);

  const score = await prisma.score.create({
    data: {
      id: input.id,
      projectId: input.projectId,
      configId: input.configId ?? null,
      traceId: input.traceId ?? null,
      spanId: input.spanId ?? null,
      sessionId: internalSessionId,
      trackedUserId: internalUserId,
      name: input.name,
      dataType,
      numericValue: dataType === "NUMERIC" ? (input.value as number) : null,
      categoricalValue: dataType === "CATEGORICAL" ? (input.value as string) : null,
      booleanValue: dataType === "BOOLEAN" ? (input.value as boolean) : null,
      source: "SDK",
      comment: input.comment ?? null,
      metadata: input.metadata ?? null,
    },
  });

  return score.id;
}

/**
 * Validate score against config bounds
 */
export async function validateScoreConfig(
  configId: string,
  value: unknown
): Promise<{ valid: boolean; error?: string }> {
  const config = await prisma.scoreConfig.findUnique({ where: { id: configId } });

  if (!config) return { valid: false, error: "Score config not found" };
  if (config.isArchived) return { valid: false, error: "Score config is archived" };

  if (config.dataType === "NUMERIC") {
    if (typeof value !== "number") return { valid: false, error: "Value must be numeric" };
    if (config.minValue !== null && value < config.minValue)
      return { valid: false, error: `Value must be >= ${config.minValue}` };
    if (config.maxValue !== null && value > config.maxValue)
      return { valid: false, error: `Value must be <= ${config.maxValue}` };
  }

  if (config.dataType === "CATEGORICAL") {
    if (typeof value !== "string") return { valid: false, error: "Value must be string" };
    const categories = config.categories as string[] | null;
    if (categories && !categories.includes(value))
      return { valid: false, error: `Value must be one of: ${categories.join(", ")}` };
  }

  if (config.dataType === "BOOLEAN") {
    if (typeof value !== "boolean") return { valid: false, error: "Value must be boolean" };
  }

  return { valid: true };
}
```

### 6.3 Alert Activities

**File:** `apps/worker/src/temporal/activities/alert.activities.ts`

```typescript
import { prisma } from "@cognobserve/db";
import { env } from "../../lib/env";
import type { AlertEvaluationResult, AlertStateTransition } from "../types";

/**
 * Evaluate alert condition against current metrics
 */
export async function evaluateAlert(alertId: string): Promise<AlertEvaluationResult> {
  const alert = await prisma.alert.findUnique({
    where: { id: alertId },
    include: { project: true },
  });

  if (!alert || !alert.enabled) {
    return {
      alertId,
      conditionMet: false,
      currentValue: 0,
      threshold: alert?.threshold ?? 0,
      sampleCount: 0,
    };
  }

  const windowStart = new Date(Date.now() - alert.windowMins * 60 * 1000);
  let currentValue = 0;
  let sampleCount = 0;

  if (alert.type === "ERROR_RATE") {
    const counts = await prisma.span.groupBy({
      by: ["level"],
      where: {
        trace: { projectId: alert.projectId },
        startTime: { gte: windowStart },
      },
      _count: true,
    });

    const total = counts.reduce((sum, c) => sum + c._count, 0);
    const errors = counts.find((c) => c.level === "ERROR")?._count ?? 0;
    currentValue = total > 0 ? (errors / total) * 100 : 0;
    sampleCount = total;
  } else if (alert.type.startsWith("LATENCY_")) {
    const percentile =
      alert.type === "LATENCY_P50" ? 0.5 : alert.type === "LATENCY_P95" ? 0.95 : 0.99;

    const spans = await prisma.$queryRaw<Array<{ latency: number }>>`
      SELECT EXTRACT(EPOCH FROM (end_time - start_time)) * 1000 as latency
      FROM spans s
      JOIN traces t ON s.trace_id = t.id
      WHERE t.project_id = ${alert.projectId}
        AND s.start_time >= ${windowStart}
        AND s.end_time IS NOT NULL
      ORDER BY latency
    `;

    sampleCount = spans.length;
    if (sampleCount > 0) {
      const idx = Math.floor(sampleCount * percentile);
      currentValue = spans[Math.min(idx, sampleCount - 1)]?.latency ?? 0;
    }
  }

  const conditionMet =
    alert.operator === "GREATER_THAN"
      ? currentValue > alert.threshold
      : currentValue < alert.threshold;

  await prisma.alert.update({
    where: { id: alertId },
    data: { lastEvaluatedAt: new Date() },
  });

  return { alertId, conditionMet, currentValue, threshold: alert.threshold, sampleCount };
}

/**
 * Transition alert state based on evaluation result
 */
export async function transitionAlertState(
  alertId: string,
  conditionMet: boolean
): Promise<AlertStateTransition> {
  const alert = await prisma.alert.findUnique({ where: { id: alertId } });
  if (!alert) throw new Error(`Alert not found: ${alertId}`);

  const previousState = alert.state;
  let newState = previousState;
  let shouldNotify = false;

  const now = new Date();
  const stateAge = alert.stateChangedAt
    ? now.getTime() - alert.stateChangedAt.getTime()
    : Infinity;
  const pendingMs = alert.pendingMins * 60 * 1000;
  const cooldownMs = alert.cooldownMins * 60 * 1000;

  // State machine
  if (conditionMet) {
    if (previousState === "INACTIVE") newState = "PENDING";
    else if (previousState === "PENDING" && stateAge >= pendingMs) {
      newState = "FIRING";
      shouldNotify = true;
    } else if (previousState === "RESOLVED") newState = "PENDING";
    else if (previousState === "FIRING") {
      const lastNotifyAge = alert.lastTriggeredAt
        ? now.getTime() - alert.lastTriggeredAt.getTime()
        : Infinity;
      shouldNotify = lastNotifyAge >= cooldownMs;
    }
  } else {
    if (previousState === "FIRING") {
      newState = "RESOLVED";
      shouldNotify = true;
    } else if (previousState === "PENDING" || previousState === "RESOLVED") {
      newState = "INACTIVE";
    }
  }

  if (newState !== previousState || shouldNotify) {
    await prisma.alert.update({
      where: { id: alertId },
      data: {
        state: newState,
        ...(newState !== previousState && { stateChangedAt: now }),
        ...(shouldNotify && { lastTriggeredAt: now }),
      },
    });
  }

  return { alertId, previousState, newState, shouldNotify };
}

/**
 * Dispatch notification to configured channels
 */
export async function dispatchNotification(
  alertId: string,
  state: string,
  value: number,
  threshold: number
): Promise<boolean> {
  const alert = await prisma.alert.findUnique({
    where: { id: alertId },
    include: { channelLinks: { include: { channel: true } } },
  });

  if (!alert || alert.channelLinks.length === 0) return true;

  const response = await fetch(`${env.WEB_API_URL}/api/internal/alerts/trigger-batch`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Internal-Secret": env.INTERNAL_API_SECRET,
    },
    body: JSON.stringify({
      items: [
        {
          alertId,
          severity: alert.severity,
          state,
          value,
          threshold,
          channels: alert.channelLinks.map((l) => ({
            id: l.channel.id,
            provider: l.channel.provider,
            config: l.channel.config,
          })),
        },
      ],
    }),
  });

  if (!response.ok) {
    console.error(`Failed to dispatch notification: ${response.status}`);
    return false;
  }

  await prisma.alertHistory.create({
    data: {
      alertId,
      value,
      threshold,
      state: state as any,
      notifiedVia: alert.channelLinks.map((l) => l.channel.provider),
    },
  });

  return true;
}
```

### 6.4 Activities Index

**File:** `apps/worker/src/temporal/activities/index.ts`

```typescript
// ============================================================
// ACTIVITIES - CENTRALIZED EXPORTS
// ============================================================
// All activities are exported from here for worker registration
// ============================================================

// Trace activities
export {
  persistTrace,
  calculateTraceCosts,
  updateCostSummaries,
} from "./trace.activities";

// Score activities
export {
  persistScore,
  validateScoreConfig,
} from "./score.activities";

// Alert activities
export {
  evaluateAlert,
  transitionAlertState,
  dispatchNotification,
} from "./alert.activities";
```

---

## 7. Phase 5: Workflows Implementation

### 7.1 Trace Workflow

**File:** `apps/worker/src/workflows/trace.workflow.ts`

```typescript
import { proxyActivities, log } from "@temporalio/workflow";
import type * as activities from "../temporal/activities";
import type { TraceWorkflowInput } from "../temporal/types";

const { persistTrace, calculateTraceCosts, updateCostSummaries } =
  proxyActivities<typeof activities>({
    startToCloseTimeout: "30s",
    retry: {
      maximumAttempts: 3,
      initialInterval: "1s",
      backoffCoefficient: 2,
      maximumInterval: "30s",
    },
  });

export async function traceWorkflow(input: TraceWorkflowInput): Promise<string> {
  log.info("Starting trace workflow", { traceId: input.id });

  // Step 1: Persist trace (critical)
  const traceId = await persistTrace(input);
  log.info("Trace persisted", { traceId });

  // Step 2: Calculate costs (non-critical)
  try {
    const updatedSpans = await calculateTraceCosts(traceId);
    log.info("Costs calculated", { traceId, updatedSpans });
  } catch (error) {
    log.warn("Cost calculation failed", { traceId, error: String(error) });
  }

  // Step 3: Update summaries (non-critical)
  try {
    await updateCostSummaries(input.projectId, input.timestamp);
    log.info("Summaries updated", { projectId: input.projectId });
  } catch (error) {
    log.warn("Summary update failed", { projectId: input.projectId, error: String(error) });
  }

  return traceId;
}
```

### 7.2 Score Workflow

**File:** `apps/worker/src/workflows/score.workflow.ts`

```typescript
import { proxyActivities, ApplicationFailure, log } from "@temporalio/workflow";
import type * as activities from "../temporal/activities";
import type { ScoreWorkflowInput } from "../temporal/types";

const { persistScore, validateScoreConfig } = proxyActivities<typeof activities>({
  startToCloseTimeout: "30s",
  retry: {
    maximumAttempts: 3,
    initialInterval: "1s",
    backoffCoefficient: 2,
  },
});

export async function scoreWorkflow(input: ScoreWorkflowInput): Promise<string> {
  log.info("Starting score workflow", { scoreId: input.id, name: input.name });

  // Validate against config if provided
  if (input.configId) {
    const validation = await validateScoreConfig(input.configId, input.value);
    if (!validation.valid) {
      throw ApplicationFailure.create({
        type: "VALIDATION_ERROR",
        message: validation.error ?? "Validation failed",
        nonRetryable: true,
      });
    }
  }

  const scoreId = await persistScore(input);
  log.info("Score persisted", { scoreId });

  return scoreId;
}
```

### 7.3 Alert Workflow

**File:** `apps/worker/src/workflows/alert.workflow.ts`

```typescript
import {
  proxyActivities,
  sleep,
  condition,
  defineSignal,
  setHandler,
  log,
} from "@temporalio/workflow";
import type * as activities from "../temporal/activities";
import type { AlertWorkflowInput } from "../temporal/types";

const { evaluateAlert, transitionAlertState, dispatchNotification } =
  proxyActivities<typeof activities>({
    startToCloseTimeout: "10s",
    retry: {
      maximumAttempts: 3,
      initialInterval: "500ms",
      backoffCoefficient: 2,
    },
  });

export const triggerEvaluationSignal = defineSignal("triggerEvaluation");
export const stopEvaluationSignal = defineSignal("stopEvaluation");

export async function alertEvaluationWorkflow(input: AlertWorkflowInput): Promise<void> {
  let shouldEvaluate = false;
  let shouldStop = false;

  setHandler(triggerEvaluationSignal, () => {
    shouldEvaluate = true;
  });

  setHandler(stopEvaluationSignal, () => {
    shouldStop = true;
  });

  log.info("Starting alert evaluation workflow", { alertId: input.alertId });

  while (!shouldStop) {
    await condition(() => shouldEvaluate || shouldStop, input.evaluationIntervalMs);

    if (shouldStop) break;
    shouldEvaluate = false;

    try {
      const result = await evaluateAlert(input.alertId);
      const transition = await transitionAlertState(input.alertId, result.conditionMet);

      if (transition.shouldNotify) {
        await dispatchNotification(
          input.alertId,
          transition.newState,
          result.currentValue,
          result.threshold
        );
        log.info("Notification dispatched", {
          alertId: input.alertId,
          state: transition.newState,
        });
      }
    } catch (error) {
      log.warn("Alert evaluation failed", { alertId: input.alertId, error: String(error) });
    }
  }

  log.info("Alert evaluation workflow stopped", { alertId: input.alertId });
}
```

### 7.4 Workflows Index

**File:** `apps/worker/src/workflows/index.ts`

```typescript
// ============================================================
// WORKFLOWS - CENTRALIZED EXPORTS
// ============================================================
// All workflows are exported from here
// Worker uses workflowsPath to load this file
// ============================================================

export { traceWorkflow } from "./trace.workflow";
export { scoreWorkflow } from "./score.workflow";
export {
  alertEvaluationWorkflow,
  triggerEvaluationSignal,
  stopEvaluationSignal,
} from "./alert.workflow";
```

---

## 8. Phase 6: Go Ingest Integration

### 8.1 Temporal Client (Go)

**File:** `apps/ingest/internal/temporal/client.go`

```go
package temporal

import (
	"context"
	"fmt"
	"time"

	"go.temporal.io/sdk/client"
)

type Client struct {
	client    client.Client
	taskQueue string
}

func New(address, namespace, taskQueue string) (*Client, error) {
	c, err := client.Dial(client.Options{
		HostPort:  address,
		Namespace: namespace,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to connect to Temporal: %w", err)
	}

	return &Client{client: c, taskQueue: taskQueue}, nil
}

func (c *Client) StartTraceWorkflow(ctx context.Context, input TraceWorkflowInput) (string, error) {
	opts := client.StartWorkflowOptions{
		ID:                       "trace-" + input.ID,
		TaskQueue:                c.taskQueue,
		WorkflowExecutionTimeout: 5 * time.Minute,
	}

	we, err := c.client.ExecuteWorkflow(ctx, opts, "traceWorkflow", input)
	if err != nil {
		return "", fmt.Errorf("failed to start trace workflow: %w", err)
	}

	return we.GetID(), nil
}

func (c *Client) StartScoreWorkflow(ctx context.Context, input ScoreWorkflowInput) (string, error) {
	opts := client.StartWorkflowOptions{
		ID:                       "score-" + input.ID,
		TaskQueue:                c.taskQueue,
		WorkflowExecutionTimeout: 2 * time.Minute,
	}

	we, err := c.client.ExecuteWorkflow(ctx, opts, "scoreWorkflow", input)
	if err != nil {
		return "", fmt.Errorf("failed to start score workflow: %w", err)
	}

	return we.GetID(), nil
}

func (c *Client) Close() {
	c.client.Close()
}
```

### 8.2 Workflow Types (Go)

**File:** `apps/ingest/internal/temporal/types.go`

```go
package temporal

type TraceWorkflowInput struct {
	ID        string                 `json:"id"`
	ProjectID string                 `json:"projectId"`
	Name      string                 `json:"name"`
	Timestamp string                 `json:"timestamp"`
	Metadata  map[string]interface{} `json:"metadata,omitempty"`
	SessionID string                 `json:"sessionId,omitempty"`
	UserID    string                 `json:"userId,omitempty"`
	User      map[string]interface{} `json:"user,omitempty"`
	Spans     []SpanInput            `json:"spans"`
}

type SpanInput struct {
	ID               string                 `json:"id"`
	ParentSpanID     string                 `json:"parentSpanId,omitempty"`
	Name             string                 `json:"name"`
	StartTime        string                 `json:"startTime"`
	EndTime          string                 `json:"endTime,omitempty"`
	Input            interface{}            `json:"input,omitempty"`
	Output           interface{}            `json:"output,omitempty"`
	Metadata         map[string]interface{} `json:"metadata,omitempty"`
	Model            string                 `json:"model,omitempty"`
	ModelParameters  map[string]interface{} `json:"modelParameters,omitempty"`
	PromptTokens     int                    `json:"promptTokens,omitempty"`
	CompletionTokens int                    `json:"completionTokens,omitempty"`
	TotalTokens      int                    `json:"totalTokens,omitempty"`
	Level            string                 `json:"level,omitempty"`
	StatusMessage    string                 `json:"statusMessage,omitempty"`
}

type ScoreWorkflowInput struct {
	ID            string                 `json:"id"`
	ProjectID     string                 `json:"projectId"`
	ConfigID      string                 `json:"configId,omitempty"`
	TraceID       string                 `json:"traceId,omitempty"`
	SpanID        string                 `json:"spanId,omitempty"`
	SessionID     string                 `json:"sessionId,omitempty"`
	TrackedUserID string                 `json:"trackedUserId,omitempty"`
	Name          string                 `json:"name"`
	Value         interface{}            `json:"value"`
	Comment       string                 `json:"comment,omitempty"`
	Metadata      map[string]interface{} `json:"metadata,omitempty"`
}
```

---

## 9. Phase 7: Worker Entry Point

### 9.1 Updated Entry Point

**File:** `apps/worker/src/index.ts`

```typescript
import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(__dirname, "../../../.env") });

import { prisma } from "@cognobserve/db";
import { QUEUE_KEYS } from "@cognobserve/shared";
import { env } from "./lib/env";
import { QueueConsumer } from "./queue/consumer";
import { TraceProcessor } from "./processors/trace";
import { AlertEvaluator } from "./jobs/alert-evaluator";
import {
  PrismaAlertStore,
  MemoryTriggerQueue,
  SimpleDispatcher,
  IntervalScheduler,
} from "@cognobserve/api/lib/alerting";
import {
  runTemporalWorker,
  shutdownTemporalWorker,
  closeTemporalClient,
  isTemporalEnabled,
} from "./temporal";

async function main() {
  console.log("========================================");
  console.log("       CognObserve Worker Starting      ");
  console.log("========================================");
  console.log(`Mode: ${isTemporalEnabled() ? "🚀 Temporal" : "📦 Redis Queue"}`);
  console.log(`Environment: ${env.NODE_ENV}`);
  console.log("");

  // Alert evaluator (runs in both modes for now)
  const alertEvaluator = new AlertEvaluator(
    new PrismaAlertStore(),
    new MemoryTriggerQueue(),
    new SimpleDispatcher(env.WEB_API_URL, env.INTERNAL_API_SECRET),
    new IntervalScheduler()
  );

  let queueConsumer: QueueConsumer | null = null;

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    console.log(`\n[${signal}] Shutting down gracefully...`);

    try {
      alertEvaluator.stop();

      if (queueConsumer) {
        await queueConsumer.stop();
        console.log("✓ Redis consumer stopped");
      }

      if (isTemporalEnabled()) {
        shutdownTemporalWorker();
        await closeTemporalClient();
        console.log("✓ Temporal worker stopped");
      }

      await prisma.$disconnect();
      console.log("✓ Database disconnected");
      console.log("Shutdown complete");
      process.exit(0);
    } catch (error) {
      console.error("Error during shutdown:", error);
      process.exit(1);
    }
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  // Start alert evaluator
  alertEvaluator.start();
  console.log("✓ Alert evaluator started");

  if (isTemporalEnabled()) {
    console.log(`Connecting to Temporal at ${env.TEMPORAL_ADDRESS}...`);
    console.log(`Namespace: ${env.TEMPORAL_NAMESPACE}`);
    console.log(`Task Queue: ${env.TEMPORAL_TASK_QUEUE}`);
    console.log("");
    console.log("Temporal worker running. Press Ctrl+C to stop.");
    await runTemporalWorker();
  } else {
    const traceProcessor = new TraceProcessor(prisma);

    queueConsumer = new QueueConsumer({
      queueKey: QUEUE_KEYS.TRACES,
      redisUrl: env.REDIS_URL,
      onMessage: async (data) => traceProcessor.process(data as any),
      onError: (error) => console.error("Queue error:", error),
    });

    queueConsumer.start();
    console.log("✓ Redis queue consumer started");
    console.log("");
    console.log("Worker running. Press Ctrl+C to stop.");
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
```

---

## 10. Phase 8: Migration & Testing

### 10.1 Migration Steps

```bash
# Step 1: Deploy infrastructure
make docker-down
make docker-up

# Step 2: Verify Temporal
curl http://localhost:7233/health
open http://localhost:8088

# Step 3: Test with Redis (default)
USE_TEMPORAL_WORKFLOWS=false pnpm dev

# Step 4: Test with Temporal
USE_TEMPORAL_WORKFLOWS=true pnpm dev

# Step 5: Gradual rollout
# Update .env: USE_TEMPORAL_WORKFLOWS=true
```

### 10.2 Testing Checklist

- [ ] Temporal server healthy
- [ ] Temporal UI accessible
- [ ] Trace workflow completes
- [ ] Score workflow validates correctly
- [ ] Alert workflow evaluates and notifies
- [ ] Graceful shutdown works
- [ ] Redis fallback works

### 10.3 Rollback

```bash
# If issues:
USE_TEMPORAL_WORKFLOWS=false
# Restart worker
```

---

## 11. File Reference

### New Files

| Path | Description |
|------|-------------|
| `temporal-config/development.yaml` | Temporal dynamic config |
| `apps/worker/src/temporal/index.ts` | Centralized Temporal exports |
| `apps/worker/src/temporal/types.ts` | Shared workflow types |
| `apps/worker/src/temporal/client.ts` | Temporal client singleton |
| `apps/worker/src/temporal/worker.ts` | Worker factory |
| `apps/worker/src/temporal/activities/index.ts` | Activities barrel |
| `apps/worker/src/temporal/activities/trace.activities.ts` | Trace activities |
| `apps/worker/src/temporal/activities/score.activities.ts` | Score activities |
| `apps/worker/src/temporal/activities/alert.activities.ts` | Alert activities |
| `apps/worker/src/workflows/index.ts` | Workflows barrel |
| `apps/worker/src/workflows/trace.workflow.ts` | Trace workflow |
| `apps/worker/src/workflows/score.workflow.ts` | Score workflow |
| `apps/worker/src/workflows/alert.workflow.ts` | Alert workflow |
| `apps/ingest/internal/temporal/client.go` | Go Temporal client |
| `apps/ingest/internal/temporal/types.go` | Go workflow types |

### Modified Files

| Path | Changes |
|------|---------|
| `docker-compose.yml` | Add Temporal services |
| `.env.example` | Add Temporal env vars |
| `apps/worker/src/lib/env.ts` | Add Temporal config |
| `apps/worker/src/index.ts` | Dual-mode support |
| `apps/worker/package.json` | Temporal dependencies |
| `apps/ingest/internal/config/config.go` | Temporal config |
| `packages/shared/src/constants.ts` | Temporal constants |

---

## Quick Start

```bash
# 1. Install Temporal deps
cd apps/worker && pnpm add @temporalio/client @temporalio/worker @temporalio/workflow @temporalio/activity

# 2. Start infrastructure
make docker-up

# 3. Run worker with Temporal
USE_TEMPORAL_WORKFLOWS=true pnpm dev

# 4. Access Temporal UI
open http://localhost:8088
```
