// ============================================================
// TEMPORAL CLIENT - Singleton for starting workflows
// ============================================================
// Use getTemporalClient() to get the client instance.
// The client is lazily initialized on first use.
// Call closeTemporalClient() during shutdown.
// ============================================================

import { Client, Connection } from "@temporalio/client";
import { env } from "../lib/env";

let clientInstance: Client | null = null;
let connectionInstance: Connection | null = null;

/**
 * Get or create the Temporal client singleton.
 * The client is lazily initialized on first call.
 */
export async function getTemporalClient(): Promise<Client> {
  if (clientInstance) {
    return clientInstance;
  }

  console.log(`[Temporal] Connecting to ${env.TEMPORAL_ADDRESS}...`);

  connectionInstance = await Connection.connect({
    address: env.TEMPORAL_ADDRESS,
  });

  clientInstance = new Client({
    connection: connectionInstance,
    namespace: env.TEMPORAL_NAMESPACE,
  });

  console.log(`[Temporal] Connected to namespace: ${env.TEMPORAL_NAMESPACE}`);

  return clientInstance;
}

/**
 * Close the Temporal client connection.
 * Call this during graceful shutdown.
 */
export async function closeTemporalClient(): Promise<void> {
  if (connectionInstance) {
    console.log("[Temporal] Closing client connection...");
    await connectionInstance.close();
    connectionInstance = null;
    clientInstance = null;
    console.log("[Temporal] Client connection closed");
  }
}

/**
 * Get Temporal configuration from environment.
 */
export function getTemporalConfig() {
  return {
    address: env.TEMPORAL_ADDRESS,
    namespace: env.TEMPORAL_NAMESPACE,
    taskQueue: env.TEMPORAL_TASK_QUEUE,
  };
}
