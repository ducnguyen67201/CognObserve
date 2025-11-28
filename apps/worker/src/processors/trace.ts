import { prisma, Prisma, SpanLevel } from "@cognobserve/db";

import type { QueueTraceData, QueueSpanData } from "../queue/consumer";

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

    // Convert queue data to Prisma format
    const traceInput = this.convertTrace(data);
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

    console.log(`Trace ${data.ID} persisted successfully`);
  }

  /**
   * Convert queue trace data to Prisma create input
   */
  private convertTrace(data: QueueTraceData): Prisma.TraceCreateInput {
    return {
      id: data.ID,
      name: data.Name,
      timestamp: new Date(data.Timestamp),
      metadata: data.Metadata ?? Prisma.JsonNull,
      project: {
        connect: { id: data.ProjectID },
      },
    };
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
      startTime: new Date(data.StartTime),
      endTime: data.EndTime ? new Date(data.EndTime) : null,
      input: data.Input ?? Prisma.JsonNull,
      output: data.Output ?? Prisma.JsonNull,
      metadata: data.Metadata ?? Prisma.JsonNull,
      model: data.Model ?? null,
      modelParameters: data.ModelParameters ?? Prisma.JsonNull,
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
