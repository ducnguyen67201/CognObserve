/**
 * Internal Router - Server-to-Server Procedures
 *
 * These procedures are called by Temporal activities (worker → API).
 * They use internal secret authentication, NOT user sessions.
 *
 * IMPORTANT: All database mutations go through this router.
 * Temporal activities are READ-ONLY and call these procedures.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { prisma, Prisma, SpanLevel } from "@cognobserve/db";
import { createRouter, publicProcedure, middleware } from "../trpc";
import { calculateSpanCost } from "../lib/cost";
import { SEVERITY_DEFAULTS, type AlertPayload, type ChannelProvider } from "../schemas/alerting";
import { StoreGitHubIndexSchema } from "../schemas/github";
import { AdapterRegistry } from "../lib/alerting/registry";
import { GitHubService } from "../services";

type Decimal = Prisma.Decimal;
const Decimal = Prisma.Decimal;

// ============================================================
// INTERNAL AUTH MIDDLEWARE
// ============================================================

/**
 * Internal procedure middleware - verifies internal API secret.
 * Used instead of session auth for server-to-server calls.
 */
const internalMiddleware = middleware(({ ctx, next }) => {
  // For internal calls, we check the internalSecret in context
  // The caller must set this when creating the context
  const internalCtx = ctx as { internalSecret?: string };

  if (!internalCtx.internalSecret) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Internal secret required",
    });
  }

  const expectedSecret = process.env.INTERNAL_API_SECRET;
  if (!expectedSecret || internalCtx.internalSecret !== expectedSecret) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Invalid internal secret",
    });
  }

  return next();
});

const internalProcedure = publicProcedure.use(internalMiddleware);

// ============================================================
// INPUT SCHEMAS
// ============================================================

const UserInputSchema = z.object({
  name: z.string().optional(),
  email: z.string().optional(),
}).optional();

const SpanInputSchema = z.object({
  id: z.string(),
  parentSpanId: z.string().optional(),
  name: z.string(),
  startTime: z.string(),
  endTime: z.string().optional(),
  input: z.unknown().optional(),
  output: z.unknown().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  model: z.string().optional(),
  modelParameters: z.record(z.string(), z.unknown()).optional(),
  promptTokens: z.number().optional(),
  completionTokens: z.number().optional(),
  totalTokens: z.number().optional(),
  level: z.string().optional(),
  statusMessage: z.string().optional(),
});

const TraceIngestSchema = z.object({
  trace: z.object({
    id: z.string(),
    projectId: z.string(),
    name: z.string(),
    timestamp: z.string(),
    sessionId: z.string().optional(),
    userId: z.string().optional(),
    user: UserInputSchema,
    metadata: z.record(z.string(), z.unknown()).optional(),
  }),
  spans: z.array(SpanInputSchema),
});

const ScoreIngestSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  configId: z.string().optional(),
  traceId: z.string().optional(),
  spanId: z.string().optional(),
  sessionId: z.string().optional(),
  trackedUserId: z.string().optional(),
  name: z.string(),
  value: z.union([z.number(), z.string(), z.boolean()]),
  comment: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

// ============================================================
// HELPER FUNCTIONS
// ============================================================

function parseDate(dateStr: string | undefined | null): Date {
  if (!dateStr) return new Date();
  const date = new Date(dateStr);
  if (isNaN(date.getTime()) || date.getFullYear() < 2000) {
    return new Date();
  }
  return date;
}

function convertSpanLevel(level?: string): SpanLevel {
  switch (level) {
    case "DEBUG": return SpanLevel.DEBUG;
    case "WARNING": return SpanLevel.WARNING;
    case "ERROR": return SpanLevel.ERROR;
    default: return SpanLevel.DEFAULT;
  }
}

async function resolveUserId(
  tx: Prisma.TransactionClient,
  projectId: string,
  externalUserId: string | undefined,
  userMetadata?: { name?: string; email?: string }
): Promise<string | null> {
  if (!externalUserId) return null;

  const user = await tx.trackedUser.upsert({
    where: {
      projectId_externalId: { projectId, externalId: externalUserId },
    },
    create: {
      projectId,
      externalId: externalUserId,
      name: userMetadata?.name ?? null,
      email: userMetadata?.email ?? null,
      firstSeenAt: new Date(),
      lastSeenAt: new Date(),
    },
    update: {
      ...(userMetadata?.name?.trim() && { name: userMetadata.name.trim() }),
      ...(userMetadata?.email?.trim() && { email: userMetadata.email.trim() }),
      lastSeenAt: new Date(),
    },
  });

  return user.id;
}

async function resolveSessionId(
  tx: Prisma.TransactionClient,
  projectId: string,
  externalSessionId: string | undefined,
  userId: string | null
): Promise<string | null> {
  if (!externalSessionId) return null;

  const session = await tx.traceSession.upsert({
    where: {
      projectId_externalId: { projectId, externalId: externalSessionId },
    },
    create: {
      projectId,
      externalId: externalSessionId,
      ...(userId && { userId }),
    },
    update: {
      updatedAt: new Date(),
      ...(userId && { userId }),
    },
    select: { id: true },
  });

  return session.id;
}

// ============================================================
// INTERNAL ROUTER
// ============================================================

export const internalRouter = createRouter({
  /**
   * Persist a trace with spans
   * Called by: trace.activities.ts → persistTrace
   */
  ingestTrace: internalProcedure
    .input(TraceIngestSchema)
    .mutation(async ({ input }) => {
      const { trace, spans } = input;

      const result = await prisma.$transaction(async (tx) => {
        // Resolve user if provided
        const userId = await resolveUserId(
          tx,
          trace.projectId,
          trace.userId,
          trace.user
        );

        // Resolve session if provided
        const sessionId = await resolveSessionId(
          tx,
          trace.projectId,
          trace.sessionId,
          userId
        );

        // Create trace
        const createdTrace = await tx.trace.create({
          data: {
            id: trace.id,
            name: trace.name,
            timestamp: parseDate(trace.timestamp),
            metadata: (trace.metadata as Prisma.InputJsonValue) ?? Prisma.JsonNull,
            project: { connect: { id: trace.projectId } },
            ...(sessionId && { session: { connect: { id: sessionId } } }),
            ...(userId && { user: { connect: { id: userId } } }),
          },
        });

        // Create spans
        if (spans.length > 0) {
          await tx.span.createMany({
            data: spans.map((span) => ({
              id: span.id,
              traceId: trace.id,
              parentSpanId: span.parentSpanId ?? null,
              name: span.name,
              startTime: parseDate(span.startTime),
              endTime: span.endTime ? parseDate(span.endTime) : null,
              input: (span.input as Prisma.InputJsonValue) ?? Prisma.JsonNull,
              output: (span.output as Prisma.InputJsonValue) ?? Prisma.JsonNull,
              metadata: (span.metadata as Prisma.InputJsonValue) ?? Prisma.JsonNull,
              model: span.model ?? null,
              modelParameters: (span.modelParameters as Prisma.InputJsonValue) ?? Prisma.JsonNull,
              promptTokens: span.promptTokens ?? null,
              completionTokens: span.completionTokens ?? null,
              totalTokens: span.totalTokens ?? null,
              level: convertSpanLevel(span.level),
              statusMessage: span.statusMessage ?? null,
            })),
          });
        }

        return createdTrace;
      });

      console.log(`[Internal:ingestTrace] Trace ${result.id} persisted with ${spans.length} spans`);
      return { traceId: result.id };
    }),

  /**
   * Calculate costs for a trace's spans
   * Called by: trace.activities.ts → calculateTraceCosts
   */
  calculateTraceCosts: internalProcedure
    .input(z.object({ traceId: z.string() }))
    .mutation(async ({ input }) => {
      const { traceId } = input;

      // Find spans with model and tokens but no cost
      const spans = await prisma.span.findMany({
        where: {
          traceId,
          model: { not: null },
          OR: [
            { promptTokens: { gt: 0 } },
            { completionTokens: { gt: 0 } },
          ],
          totalCost: null,
        },
        select: {
          id: true,
          model: true,
          promptTokens: true,
          completionTokens: true,
        },
      });

      if (spans.length === 0) {
        return { updatedCount: 0 };
      }

      let updatedCount = 0;

      for (const span of spans) {
        if (!span.model) continue;

        const cost = await calculateSpanCost({
          model: span.model,
          promptTokens: span.promptTokens,
          completionTokens: span.completionTokens,
        });

        if (cost) {
          await prisma.span.update({
            where: { id: span.id },
            data: {
              inputCost: cost.inputCost,
              outputCost: cost.outputCost,
              totalCost: cost.totalCost,
              pricingId: cost.pricingId,
            },
          });
          updatedCount++;
        }
      }

      console.log(`[Internal:calculateTraceCosts] Updated costs for ${updatedCount} spans`);
      return { updatedCount };
    }),

  /**
   * Update daily cost summaries for a project
   * Called by: trace.activities.ts → updateCostSummaries
   */
  updateCostSummaries: internalProcedure
    .input(z.object({
      projectId: z.string(),
      date: z.string(),
    }))
    .mutation(async ({ input }) => {
      const { projectId, date: dateStr } = input;

      const date = parseDate(dateStr);
      const dateOnly = date.toISOString().split("T")[0]!;
      const startOfDay = new Date(dateOnly);
      const endOfDay = new Date(startOfDay);
      endOfDay.setDate(endOfDay.getDate() + 1);

      // Get spans with costs for this day
      const spans = await prisma.span.findMany({
        where: {
          trace: { projectId },
          startTime: { gte: startOfDay, lt: endOfDay },
          totalCost: { not: null },
        },
        select: {
          model: true,
          promptTokens: true,
          completionTokens: true,
          totalTokens: true,
          inputCost: true,
          outputCost: true,
          totalCost: true,
        },
      });

      if (spans.length === 0) {
        return { success: true };
      }

      // Aggregate by model
      const aggregations = new Map<string, {
        spanCount: number;
        inputTokens: bigint;
        outputTokens: bigint;
        totalTokens: bigint;
        inputCost: Prisma.Decimal;
        outputCost: Prisma.Decimal;
        totalCost: Prisma.Decimal;
      }>();

      for (const span of spans) {
        const model = span.model?.toLowerCase() ?? "__unknown__";

        if (!aggregations.has(model)) {
          aggregations.set(model, {
            spanCount: 0,
            inputTokens: BigInt(0),
            outputTokens: BigInt(0),
            totalTokens: BigInt(0),
            inputCost: new Decimal(0),
            outputCost: new Decimal(0),
            totalCost: new Decimal(0),
          });
        }

        const agg = aggregations.get(model)!;
        agg.spanCount += 1;
        agg.inputTokens += BigInt(span.promptTokens ?? 0);
        agg.outputTokens += BigInt(span.completionTokens ?? 0);
        agg.totalTokens += BigInt(span.totalTokens ?? 0);
        agg.inputCost = agg.inputCost.add(span.inputCost ?? new Decimal(0));
        agg.outputCost = agg.outputCost.add(span.outputCost ?? new Decimal(0));
        agg.totalCost = agg.totalCost.add(span.totalCost ?? new Decimal(0));
      }

      // Upsert summaries
      await prisma.$transaction(async (tx) => {
        for (const [model, agg] of aggregations) {
          await tx.costDailySummary.upsert({
            where: {
              projectId_date_model: { projectId, date: startOfDay, model },
            },
            create: {
              projectId,
              date: startOfDay,
              model,
              ...agg,
            },
            update: agg,
          });
        }
      });

      console.log(`[Internal:updateCostSummaries] Updated ${aggregations.size} model summaries`);
      return { success: true };
    }),

  /**
   * Persist a score
   * Called by: score.activities.ts → persistScore
   * TODO(Issue #104): Enable when Score model is added
   */
  ingestScore: internalProcedure
    .input(ScoreIngestSchema)
    .mutation(async ({ input }) => {
      // TODO(Issue #104): Implement when Score model exists
      console.log(`[Internal:ingestScore] STUB: Would persist score ${input.id}`);
      return { scoreId: input.id };
    }),

  /**
   * Validate score against config
   * Called by: score.activities.ts → validateScoreConfig
   * TODO(Issue #104): Enable when ScoreConfig model is added
   */
  validateScoreConfig: internalProcedure
    .input(z.object({
      configId: z.string(),
      value: z.unknown(),
    }))
    .mutation(async ({ input }) => {
      // TODO(Issue #104): Implement when ScoreConfig model exists
      console.log(`[Internal:validateScoreConfig] STUB: Would validate against ${input.configId}`);
      return { valid: true };
    }),

  /**
   * Transition alert state
   * Called by: alert.activities.ts → transitionAlertState
   */
  transitionAlertState: internalProcedure
    .input(z.object({
      alertId: z.string(),
      conditionMet: z.boolean(),
    }))
    .mutation(async ({ input }) => {
      const { alertId, conditionMet } = input;

      const alert = await prisma.alert.findUnique({ where: { id: alertId } });
      if (!alert) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Alert not found" });
      }

      const previousState = alert.state;
      let newState = previousState;
      let shouldNotify = false;

      const now = new Date();
      const stateAge = alert.stateChangedAt
        ? now.getTime() - alert.stateChangedAt.getTime()
        : Infinity;

      const MS_PER_MINUTE = 60_000;
      const defaults = SEVERITY_DEFAULTS[alert.severity as keyof typeof SEVERITY_DEFAULTS];
      const pendingMs = (alert.pendingMins ?? defaults?.pendingMins ?? 3) * MS_PER_MINUTE;
      const cooldownMs = (alert.cooldownMins ?? defaults?.cooldownMins ?? 30) * MS_PER_MINUTE;

      // State machine transitions
      if (conditionMet) {
        switch (previousState) {
          case "INACTIVE":
            newState = "PENDING";
            break;
          case "PENDING":
            if (stateAge >= pendingMs) {
              newState = "FIRING";
              shouldNotify = true;
            }
            break;
          case "RESOLVED":
            newState = "PENDING";
            break;
          case "FIRING":
            const lastNotifyAge = alert.lastTriggeredAt
              ? now.getTime() - alert.lastTriggeredAt.getTime()
              : Infinity;
            shouldNotify = lastNotifyAge >= cooldownMs;
            break;
        }
      } else {
        switch (previousState) {
          case "FIRING":
            newState = "RESOLVED";
            shouldNotify = true;
            break;
          case "PENDING":
          case "RESOLVED":
            newState = "INACTIVE";
            break;
        }
      }

      // Update database
      if (newState !== previousState || shouldNotify) {
        await prisma.alert.update({
          where: { id: alertId },
          data: {
            state: newState,
            lastEvaluatedAt: now,
            ...(newState !== previousState && { stateChangedAt: now }),
            ...(shouldNotify && { lastTriggeredAt: now }),
          },
        });
      }

      console.log(`[Internal:transitionAlertState] ${previousState} → ${newState} (notify: ${shouldNotify})`);
      return { alertId, previousState, newState, shouldNotify };
    }),

  /**
   * Dispatch notification for an alert
   * Called by: alert.activities.ts → dispatchNotification
   */
  dispatchNotification: internalProcedure
    .input(z.object({
      alertId: z.string(),
      state: z.string(),
      value: z.number(),
      threshold: z.number(),
    }))
    .mutation(async ({ input }) => {
      const { alertId, state, value, threshold } = input;

      const alert = await prisma.alert.findUnique({
        where: { id: alertId },
        include: {
          project: true,
          channelLinks: {
            include: { channel: true },
          },
        },
      });

      if (!alert) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Alert not found" });
      }

      if (alert.channelLinks.length === 0) {
        console.log(`[Internal:dispatchNotification] No channels configured`);
        return { channelCount: 0, sentCount: 0, failedCount: 0 };
      }

      // Build alert payload
      const payload: AlertPayload = {
        alertId: alert.id,
        alertName: alert.name,
        projectId: alert.projectId,
        projectName: alert.project.name,
        type: alert.type as AlertPayload["type"],
        threshold: alert.threshold,
        actualValue: value,
        operator: alert.operator as AlertPayload["operator"],
        triggeredAt: new Date().toISOString(),
      };

      // Send to each channel
      let sentCount = 0;
      let failedCount = 0;
      const notifiedProviders: string[] = [];

      for (const link of alert.channelLinks) {
        const { channel } = link;
        const provider = channel.provider as ChannelProvider;

        try {
          // Check if adapter is registered
          if (!AdapterRegistry.has(provider)) {
            console.warn(`[Internal:dispatchNotification] No adapter for ${provider}`);
            failedCount++;
            continue;
          }

          const adapter = AdapterRegistry.get(provider);
          const result = await adapter.send(channel.config, payload);

          if (result.success) {
            sentCount++;
            notifiedProviders.push(provider);
            console.log(`[Internal:dispatchNotification] Sent to ${provider} channel: ${channel.name}`);
          } else {
            failedCount++;
            console.error(`[Internal:dispatchNotification] Failed ${provider}: ${result.error}`);
          }
        } catch (error) {
          failedCount++;
          console.error(`[Internal:dispatchNotification] Error sending to ${provider}:`, error);
        }
      }

      // Record in alert history
      await prisma.alertHistory.create({
        data: {
          alertId,
          value,
          threshold,
          state: state as "INACTIVE" | "PENDING" | "FIRING" | "RESOLVED",
          previousState: alert.state,
          notifiedVia: notifiedProviders,
        },
      });

      console.log(`[Internal:dispatchNotification] Sent to ${sentCount}/${alert.channelLinks.length} channels`);
      return { channelCount: alert.channelLinks.length, sentCount, failedCount };
    }),

  /**
   * Store GitHub indexed data
   * Called by: github.activities.ts → storeIndexedData
   */
  storeGitHubIndex: internalProcedure
    .input(StoreGitHubIndexSchema)
    .mutation(({ input }) => GitHubService.storeIndexedData(input)),
});

export type InternalRouter = typeof internalRouter;
