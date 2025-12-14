/**
 * RCA Internal Types
 *
 * Internal types used by RCA activities. Not exported to workflows.
 */

import type { Prisma } from "@cognobserve/db";

/**
 * Row returned from span query with trace info
 */
export interface SpanRow {
  id: string;
  traceId: string;
  traceName: string;
  name: string;
  level: string;
  statusMessage: string | null;
  model: string | null;
  startTime: Date;
  endTime: Date | null;
  promptTokens: number | null;
  completionTokens: number | null;
  totalCost: Prisma.Decimal | null;
  output: Prisma.JsonValue;
}
