import { prisma, Prisma, SpanLevel } from "@cognobserve/db";
import { calculateSpanCost } from "@cognobserve/api/lib/cost";

import type { QueueTraceData, QueueSpanData, QueueUserData } from "@/queue/consumer";

type Decimal = Prisma.Decimal;
const Decimal = Prisma.Decimal;

/**
 * TraceProcessor handles the conversion from Proto/Queue format to Prisma
 * and persists traces to the database.
 *
 * Flow:
 *   Queue (Proto-like JSON) → TraceProcessor → Prisma → PostgreSQL
 */
export class TraceProcessor {
  /**
   * Process a trace from the queue and persist to database
   */
  async process(data: QueueTraceData): Promise<void> {
    console.log(`Processing trace: ${data.ID} with ${data.Spans.length} spans`);

    // Resolve user first (needed for session linking)
    const userId = await this.resolveUserId(data.ProjectID, data.UserID, data.User);

    // Resolve session if external session ID provided (with userId for linking)
    const sessionId = await this.resolveSessionId(data.ProjectID, data.SessionID, userId);

    // Convert queue data to Prisma format
    const traceInput = this.convertTrace(data, sessionId, userId);
    const spanInputs = data.Spans.map((span) => this.convertSpan(span));

    // Use transaction to ensure atomicity
    await prisma.$transaction(async (tx) => {
      // Create trace
      await tx.trace.create({
        data: traceInput,
      });

      // Create spans in batch
      if (spanInputs.length > 0) {
        await tx.span.createMany({
          data: spanInputs,
        });
      }
    });

    const context = [
      sessionId ? `session: ${sessionId}` : null,
      userId ? `user: ${userId}` : null,
    ].filter(Boolean).join(", ");
    console.log(`Trace ${data.ID} persisted successfully${context ? ` (${context})` : ""}`);

    // Calculate and update costs for billable spans
    await this.calculateCosts(data);
  }

  /**
   * Resolve or create a TrackedUser from external user ID.
   * Uses upsert to atomically find or create the user.
   */
  private async resolveUserId(
    projectId: string,
    externalUserId: string | undefined,
    userMetadata?: QueueUserData
  ): Promise<string | null> {
    if (!externalUserId) {
      return null;
    }

    // Filter out Name and Email from metadata to avoid duplication
    // Name/Email are stored as top-level fields, not in metadata JSON
    const filteredMetadata = userMetadata
      ? Object.fromEntries(
          Object.entries(userMetadata).filter(
            ([key]) => key !== "Name" && key !== "Email"
          )
        )
      : null;

    // Upsert: create if not exists, update metadata and lastSeenAt if exists
    const user = await prisma.trackedUser.upsert({
      where: {
        projectId_externalId: {
          projectId,
          externalId: externalUserId,
        },
      },
      create: {
        projectId,
        externalId: externalUserId,
        name: userMetadata?.Name,
        email: userMetadata?.Email,
        metadata:
          filteredMetadata && Object.keys(filteredMetadata).length > 0
            ? (filteredMetadata as Prisma.InputJsonValue)
            : Prisma.JsonNull,
        firstSeenAt: new Date(),
        lastSeenAt: new Date(),
      },
      update: {
        // Only update name/email if provided (don't overwrite with undefined)
        ...(userMetadata?.Name && { name: userMetadata.Name }),
        ...(userMetadata?.Email && { email: userMetadata.Email }),
        lastSeenAt: new Date(),
      },
    });

    return user.id;
  }

  /**
   * Resolve or create a TraceSession from external session ID.
   * Uses upsert to atomically find or create the session.
   * Links session to user if userId is provided.
   */
  private async resolveSessionId(
    projectId: string,
    externalSessionId: string | undefined,
    userId: string | null
  ): Promise<string | null> {
    if (!externalSessionId) {
      return null;
    }

    // Upsert: create if not exists, update timestamp and userId if exists
    const session = await prisma.traceSession.upsert({
      where: {
        projectId_externalId: {
          projectId,
          externalId: externalSessionId,
        },
      },
      create: {
        projectId,
        externalId: externalSessionId,
        ...(userId && { userId }),
      },
      update: {
        updatedAt: new Date(),
        // Link to user if provided and not already linked
        ...(userId && { userId }),
      },
    });

    return session.id;
  }

  /**
   * Calculate costs for spans with model and tokens, update daily summary
   */
  private async calculateCosts(data: QueueTraceData): Promise<void> {
    // Filter spans that have model and tokens
    const billableSpans = data.Spans.filter(
      (span) =>
        span.Model && (span.Usage?.PromptTokens || span.Usage?.CompletionTokens)
    );

    if (billableSpans.length === 0) {
      return;
    }

    console.log(`Calculating costs for ${billableSpans.length} billable spans`);

    // Calculate costs and update spans
    const costUpdates: Array<{
      spanId: string;
      model: string;
      inputCost: Decimal;
      outputCost: Decimal;
      totalCost: Decimal;
      pricingId: string;
      promptTokens: number;
      completionTokens: number;
      startTime: Date;
    }> = [];

    for (const span of billableSpans) {
      const cost = await calculateSpanCost({
        model: span.Model!,
        promptTokens: span.Usage?.PromptTokens ?? null,
        completionTokens: span.Usage?.CompletionTokens ?? null,
      });

      if (cost) {
        costUpdates.push({
          spanId: span.ID,
          model: span.Model!.toLowerCase(),
          inputCost: cost.inputCost,
          outputCost: cost.outputCost,
          totalCost: cost.totalCost,
          pricingId: cost.pricingId,
          promptTokens: span.Usage?.PromptTokens ?? 0,
          completionTokens: span.Usage?.CompletionTokens ?? 0,
          startTime: this.parseDate(span.StartTime),
        });
      }
    }

    if (costUpdates.length === 0) {
      console.log("No pricing found for any spans");
      return;
    }

    // Update spans with costs in a transaction
    // Note: We update spans individually because each has unique cost values.
    // Prisma's updateMany doesn't support per-record data, and raw SQL batching
    // would add complexity. The transaction ensures atomicity with acceptable
    // performance for typical trace sizes (< 100 spans).
    await prisma.$transaction(async (tx) => {
      for (const update of costUpdates) {
        await tx.span.update({
          where: { id: update.spanId },
          data: {
            inputCost: update.inputCost,
            outputCost: update.outputCost,
            totalCost: update.totalCost,
            pricingId: update.pricingId,
          },
        });
      }

      // Update daily summaries
      await this.updateDailySummary(tx, data.ProjectID, costUpdates);
    });

    console.log(`Updated costs for ${costUpdates.length} spans`);
  }

  /**
   * Update daily cost summary aggregates
   */
  private async updateDailySummary(
    tx: Prisma.TransactionClient,
    projectId: string,
    updates: Array<{
      model: string;
      inputCost: Decimal;
      outputCost: Decimal;
      totalCost: Decimal;
      promptTokens: number;
      completionTokens: number;
      startTime: Date;
    }>
  ): Promise<void> {
    // Group by date and model
    const aggregations = new Map<
      string,
      {
        date: Date;
        model: string;
        spanCount: number;
        inputTokens: bigint;
        outputTokens: bigint;
        totalTokens: bigint;
        inputCost: Decimal;
        outputCost: Decimal;
        totalCost: Decimal;
      }
    >();

    for (const update of updates) {
      const date = new Date(update.startTime);
      date.setHours(0, 0, 0, 0);
      const dateStr = date.toISOString().split("T")[0];
      const key = `${dateStr}:${update.model}`;

      if (!aggregations.has(key)) {
        aggregations.set(key, {
          date,
          model: update.model,
          spanCount: 0,
          inputTokens: BigInt(0),
          outputTokens: BigInt(0),
          totalTokens: BigInt(0),
          inputCost: new Decimal(0),
          outputCost: new Decimal(0),
          totalCost: new Decimal(0),
        });
      }

      const agg = aggregations.get(key)!;
      agg.spanCount += 1;
      agg.inputTokens += BigInt(update.promptTokens);
      agg.outputTokens += BigInt(update.completionTokens);
      agg.totalTokens += BigInt(update.promptTokens + update.completionTokens);
      agg.inputCost = agg.inputCost.add(update.inputCost);
      agg.outputCost = agg.outputCost.add(update.outputCost);
      agg.totalCost = agg.totalCost.add(update.totalCost);
    }

    // Upsert daily summaries per model
    for (const agg of aggregations.values()) {
      await tx.costDailySummary.upsert({
        where: {
          projectId_date_model: {
            projectId,
            date: agg.date,
            model: agg.model,
          },
        },
        create: {
          projectId,
          date: agg.date,
          model: agg.model,
          spanCount: agg.spanCount,
          inputTokens: agg.inputTokens,
          outputTokens: agg.outputTokens,
          totalTokens: agg.totalTokens,
          inputCost: agg.inputCost,
          outputCost: agg.outputCost,
          totalCost: agg.totalCost,
        },
        update: {
          spanCount: { increment: agg.spanCount },
          inputTokens: { increment: agg.inputTokens },
          outputTokens: { increment: agg.outputTokens },
          totalTokens: { increment: agg.totalTokens },
          inputCost: { increment: agg.inputCost },
          outputCost: { increment: agg.outputCost },
          totalCost: { increment: agg.totalCost },
        },
      });
    }

    // Also update "__all__" aggregate
    const totalAgg = {
      spanCount: 0,
      inputTokens: BigInt(0),
      outputTokens: BigInt(0),
      totalTokens: BigInt(0),
      inputCost: new Decimal(0),
      outputCost: new Decimal(0),
      totalCost: new Decimal(0),
    };

    for (const agg of aggregations.values()) {
      totalAgg.spanCount += agg.spanCount;
      totalAgg.inputTokens += agg.inputTokens;
      totalAgg.outputTokens += agg.outputTokens;
      totalAgg.totalTokens += agg.totalTokens;
      totalAgg.inputCost = totalAgg.inputCost.add(agg.inputCost);
      totalAgg.outputCost = totalAgg.outputCost.add(agg.outputCost);
      totalAgg.totalCost = totalAgg.totalCost.add(agg.totalCost);
    }

    // Get unique dates
    const dates = new Set([...aggregations.values()].map((a) => a.date.toISOString()));

    for (const dateStr of dates) {
      const date = new Date(dateStr);

      await tx.costDailySummary.upsert({
        where: {
          projectId_date_model: {
            projectId,
            date,
            model: "__all__",
          },
        },
        create: {
          projectId,
          date,
          model: "__all__",
          spanCount: totalAgg.spanCount,
          inputTokens: totalAgg.inputTokens,
          outputTokens: totalAgg.outputTokens,
          totalTokens: totalAgg.totalTokens,
          inputCost: totalAgg.inputCost,
          outputCost: totalAgg.outputCost,
          totalCost: totalAgg.totalCost,
        },
        update: {
          spanCount: { increment: totalAgg.spanCount },
          inputTokens: { increment: totalAgg.inputTokens },
          outputTokens: { increment: totalAgg.outputTokens },
          totalTokens: { increment: totalAgg.totalTokens },
          inputCost: { increment: totalAgg.inputCost },
          outputCost: { increment: totalAgg.outputCost },
          totalCost: { increment: totalAgg.totalCost },
        },
      });
    }
  }

  /**
   * Convert queue trace data to Prisma create input
   */
  private convertTrace(
    data: QueueTraceData,
    sessionId: string | null,
    userId: string | null
  ): Prisma.TraceCreateInput {
    return {
      id: data.ID,
      name: data.Name,
      timestamp: new Date(data.Timestamp),
      metadata: (data.Metadata as Prisma.InputJsonValue) ?? Prisma.JsonNull,
      project: {
        connect: { id: data.ProjectID },
      },
      ...(sessionId && {
        session: {
          connect: { id: sessionId },
        },
      }),
      ...(userId && {
        user: {
          connect: { id: userId },
        },
      }),
    };
  }

  /**
   * Parse a date string, defaulting to now if invalid or zero time
   */
  private parseDate(dateStr: string | undefined | null): Date {
    if (!dateStr) {
      return new Date();
    }
    const date = new Date(dateStr);
    // Check for invalid date or Go's zero time (year 1)
    if (isNaN(date.getTime()) || date.getFullYear() < 2000) {
      return new Date();
    }
    return date;
  }

  /**
   * Convert queue span data to Prisma create input
   */
  private convertSpan(data: QueueSpanData): Prisma.SpanCreateManyInput {
    return {
      id: data.ID,
      traceId: data.TraceID,
      parentSpanId: data.ParentSpanID ?? null,
      name: data.Name,
      startTime: this.parseDate(data.StartTime),
      endTime: data.EndTime ? this.parseDate(data.EndTime) : null,
      input: (data.Input as Prisma.InputJsonValue) ?? Prisma.JsonNull,
      output: (data.Output as Prisma.InputJsonValue) ?? Prisma.JsonNull,
      metadata: (data.Metadata as Prisma.InputJsonValue) ?? Prisma.JsonNull,
      model: data.Model ?? null,
      modelParameters: (data.ModelParameters as Prisma.InputJsonValue) ?? Prisma.JsonNull,
      promptTokens: data.Usage?.PromptTokens ?? null,
      completionTokens: data.Usage?.CompletionTokens ?? null,
      totalTokens: data.Usage?.TotalTokens ?? null,
      level: this.convertSpanLevel(data.Level),
      statusMessage: data.StatusMessage ?? null,
    };
  }

  /**
   * Convert numeric span level to Prisma enum
   *
   * Proto enum values:
   *   0 = UNSPECIFIED → DEFAULT
   *   1 = DEBUG
   *   2 = DEFAULT
   *   3 = WARNING
   *   4 = ERROR
   */
  private convertSpanLevel(level: number): SpanLevel {
    switch (level) {
      case 1:
        return SpanLevel.DEBUG;
      case 2:
        return SpanLevel.DEFAULT;
      case 3:
        return SpanLevel.WARNING;
      case 4:
        return SpanLevel.ERROR;
      default:
        return SpanLevel.DEFAULT;
    }
  }

  /**
   * Close database connection
   */
  async close(): Promise<void> {
    await prisma.$disconnect();
  }
}
