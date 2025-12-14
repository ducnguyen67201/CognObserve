/**
 * RCA (Root Cause Analysis) Activities
 *
 * Centralized exports for RCA-related Temporal activities.
 *
 * Activities:
 * - analyzeTraces (#136): Extract error patterns, anomalies from trace data
 * - correlateCodeChanges (#137): Correlate alerts with recent code changes
 *
 * IMPORTANT: These are read-only operations, no database mutations.
 */

export { analyzeTraces } from "./analyze-traces";
export { correlateCodeChanges } from "./correlate-changes";
