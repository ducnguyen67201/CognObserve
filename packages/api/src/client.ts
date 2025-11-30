/**
 * Client-safe exports from @cognobserve/api
 *
 * This module exports only Zod schemas and types that are safe
 * to import in client-side code ("use client" components).
 *
 * Usage:
 * ```ts
 * import { CreateWorkspaceSchema, type CreateWorkspaceInput } from "@cognobserve/api/client";
 * ```
 */

// ============================================================
// Zod Schemas (safe for client-side)
// ============================================================

export {
  // Project role schemas
  ProjectRoleSchema,
  type ProjectRole,
  isValidRole,
  // Workspace schemas
  WorkspaceRoleSchema,
  type WorkspaceRole,
  CreateWorkspaceSchema,
  type CreateWorkspaceInput,
  UpdateWorkspaceSchema,
  type UpdateWorkspaceInput,
  InviteMemberSchema,
  type InviteMemberInput,
  WorkspaceSlugSchema,
  WORKSPACE_ADMIN_ROLES,
  WORKSPACE_MEMBER_ROLES,
  ALL_WORKSPACE_ROLES,
  isValidWorkspaceRole,
  // Trace filter schemas
  SpanTypeSchema,
  type SpanType,
  ALL_SPAN_TYPES,
  SpanLevelSchema,
  type SpanLevel,
  ALL_SPAN_LEVELS,
  TraceFiltersSchema,
  type TraceFilters,
  FILTER_PARAM_KEYS,
  type QuickToggle,
  QUICK_TOGGLES,
  hasActiveFilters,
  countActiveFilters,
} from "./schemas";

// ============================================================
// Type-only exports (safe for client-side)
// ============================================================

export type { ApiKeyListItem, CreatedApiKey } from "./routers/apiKeys";
export type {
  WorkspaceListItem,
  WorkspaceDetail,
  WorkspaceMemberItem,
} from "./routers/workspaces";
export type { ProjectListItem, ProjectDetail } from "./routers/projects";
export type { TraceListItem, TraceDetail, SpanItem, SpanDetail } from "./routers/traces";
export type {
  ProjectAnalytics,
  WorkspaceAnalytics,
  ProjectSummary,
  TraceVolumePoint,
  LatencyPoint,
  TokenUsagePoint,
  ModelUsage,
} from "./routers/analytics";
