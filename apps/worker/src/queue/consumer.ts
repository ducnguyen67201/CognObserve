import Redis from "ioredis";

import { QUEUE_KEYS, safeJsonParse } from "@cognobserve/shared";

// Raw trace data from the queue (matches Go ingest service output)
export interface QueueTraceData {
  ID: string;
  ProjectID: string;
  Name: string;
  Timestamp: string;
  Metadata?: Record<string, unknown>;
  Spans: QueueSpanData[];
}

export interface QueueSpanData {
  ID: string;
  TraceID: string;
  ParentSpanID?: string;
  Name: string;
  StartTime: string;
  EndTime?: string;
  Input?: Record<string, unknown>;
  Output?: Record<string, unknown>;
  Metadata?: Record<string, unknown>;
  Model?: string;
  ModelParameters?: Record<string, unknown>;
  Usage?: {
    PromptTokens?: number;
    CompletionTokens?: number;
    TotalTokens?: number;
  };
  Level: number;
  StatusMessage?: string;
}

interface ConsumerOptions {
  redisUrl: string;
  onTrace: (data: QueueTraceData) => Promise<void>;
}

export interface QueueConsumer {
  start: () => Promise<void>;
  stop: () => Promise<void>;
}

export function createQueueConsumer(options: ConsumerOptions): QueueConsumer {
  const { redisUrl, onTrace } = options;

  let redis: Redis | null = null;
  let running = false;

  async function start() {
    redis = new Redis(redisUrl);
    running = true;

    console.log(`Connected to Redis, consuming from ${QUEUE_KEYS.TRACES}`);

    // Polling loop
    while (running) {
      try {
        // BRPOP blocks until a message is available (5 second timeout)
        const result = await redis.brpop(QUEUE_KEYS.TRACES, 5);

        if (result) {
          const [, message] = result;
          const data = safeJsonParse<QueueTraceData | null>(message, null);

          if (data) {
            try {
              await onTrace(data);
            } catch (error) {
              console.error("Failed to process trace:", error);
              // Push to dead letter queue
              await redis.lpush(QUEUE_KEYS.DEAD_LETTER, message);
            }
          }
        }
      } catch (error) {
        if (running) {
          console.error("Queue consumer error:", error);
          // Wait before retrying
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }
    }
  }

  async function stop() {
    running = false;
    if (redis) {
      await redis.quit();
      redis = null;
    }
  }

  return { start, stop };
}
