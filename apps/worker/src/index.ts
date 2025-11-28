import { APP_NAME, APP_VERSION } from "@cognobserve/shared";

import { createQueueConsumer } from "./queue/consumer";
import { TraceProcessor } from "./processors/trace";

console.log(`Starting ${APP_NAME} Worker v${APP_VERSION}`);

async function main() {
  // Initialize processor
  const traceProcessor = new TraceProcessor();

  // Initialize queue consumer
  const consumer = createQueueConsumer({
    redisUrl: process.env.REDIS_URL || "redis://localhost:6379",
    onTrace: (data) => traceProcessor.process(data),
  });

  // Start consuming
  await consumer.start();

  console.log("Worker initialized and consuming from queue");

  // Graceful shutdown
  const shutdown = async () => {
    console.log("Shutting down worker...");
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
