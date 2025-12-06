import { env } from "@/lib/env";

import { APP_NAME, APP_VERSION } from "@cognobserve/shared";
import { initializeAlertingAdapters } from "@cognobserve/api/lib/alerting/init";

import { createQueueConsumer } from "@/queue/consumer";
import { TraceProcessor } from "@/processors/trace";
import { AlertEvaluator } from "@/jobs/alert-evaluator";

console.log(`Starting ${APP_NAME} Worker v${APP_VERSION}`);

async function main() {
  // Initialize alerting adapters
  initializeAlertingAdapters();

  // Initialize processor
  const traceProcessor = new TraceProcessor();

  // Initialize alert evaluator
  const alertEvaluator = new AlertEvaluator();
  alertEvaluator.start();

  // Initialize queue consumer
  const consumer = createQueueConsumer({
    redisUrl: env.REDIS_URL,
    onTrace: (data) => traceProcessor.process(data),
  });

  // Start consuming
  await consumer.start();

  console.log("Worker initialized and consuming from queue");

  // Graceful shutdown
  const shutdown = async () => {
    console.log("Shutting down worker...");
    alertEvaluator.stop();
    await consumer.stop();
    await traceProcessor.close();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((error) => {
  console.error("Worker failed to start:", error);
  process.exit(1);
});
