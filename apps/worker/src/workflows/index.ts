// ============================================================
// WORKFLOWS - CENTRALIZED EXPORTS
// ============================================================
// All workflows are exported from here.
// The Temporal worker uses workflowsPath pointing to this file.
//
// IMPORTANT: This file is bundled separately by Temporal for
// workflow isolation. Only import workflow-safe code here.
// ============================================================

// Trace ingestion workflow
export { traceWorkflow } from "./trace.workflow";

// Score ingestion workflow
export { scoreWorkflow } from "./score.workflow";

// Alert evaluation workflow (long-running)
export {
  alertEvaluationWorkflow,
  triggerEvaluationSignal,
  stopEvaluationSignal,
} from "./alert.workflow";

// GitHub index workflow
export { githubIndexWorkflow } from "./github-index.workflow";
