import { Client, Connection } from "@temporalio/client";
import type { GitHubIndexWorkflowInput } from "@cognobserve/api/schemas";
import { env } from "./env";

// Re-export the type for convenience
export type { GitHubIndexWorkflowInput } from "@cognobserve/api/schemas";

let _client: Client | null = null;
let _connection: Connection | null = null;

/**
 * Get or create a Temporal client singleton.
 * Used for starting workflows from the web app.
 */
export async function getTemporalClient(): Promise<Client> {
  if (_client) {
    return _client;
  }

  _connection = await Connection.connect({
    address: env.TEMPORAL_ADDRESS ?? "localhost:7233",
  });

  _client = new Client({
    connection: _connection,
    namespace: "default",
  });

  return _client;
}

/**
 * Start the GitHub indexing workflow.
 * Returns the workflow ID for tracking.
 */
export async function startGitHubIndexWorkflow(
  input: GitHubIndexWorkflowInput
): Promise<string> {
  const client = await getTemporalClient();

  const handle = await client.workflow.start("githubIndexWorkflow", {
    taskQueue: "cognobserve-worker",
    workflowId: `github-index-${input.deliveryId}`,
    args: [input],
  });

  return handle.workflowId;
}
