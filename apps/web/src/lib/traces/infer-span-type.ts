import type { SpanItem } from "@cognobserve/api/client";
import type { SpanType } from "./types";

/**
 * Infers the span type from available span data.
 * Since the database doesn't have a type column, we infer it from:
 * - model field (LLM spans)
 * - name patterns (function, HTTP, DB)
 * - level (LOG for DEBUG without model)
 */
export function inferSpanType(span: Pick<SpanItem, "model" | "name" | "level">): SpanType {
  // LLM span if model is present
  if (span.model) {
    return "LLM";
  }

  const nameLower = span.name.toLowerCase();

  // HTTP patterns
  if (
    nameLower.includes("http") ||
    nameLower.includes("fetch") ||
    nameLower.includes("request") ||
    nameLower.includes("api call")
  ) {
    return "HTTP";
  }

  // Database patterns
  if (
    nameLower.includes("db") ||
    nameLower.includes("database") ||
    nameLower.includes("query") ||
    nameLower.includes("sql") ||
    nameLower.includes("prisma")
  ) {
    return "DB";
  }

  // Function patterns
  if (
    nameLower.includes("function") ||
    nameLower.includes("tool") ||
    nameLower.includes("invoke")
  ) {
    return "FUNCTION";
  }

  // Log patterns (DEBUG level without model)
  if (span.level === "DEBUG") {
    return "LOG";
  }

  // Default to CUSTOM
  return "CUSTOM";
}
