// Initialize shared config before any imports that use it
import "./init";

/**
 * @cognobserve/api
 *
 * Centralized tRPC API package for CognObserve.
 *
 * Usage (Frontend):
 * ```ts
 * import { trpc } from "@/lib/trpc/client";
 *
 * // Query
 * const { data } = trpc.apiKeys.list.useQuery({ projectId: "..." });
 *
 * // Mutation
 * const mutation = trpc.apiKeys.create.useMutation();
 * await mutation.mutateAsync({ projectId: "...", name: "Production" });
 * ```
 *
 * Usage (Backend - creating new routes):
 * ```ts
 * import { createRouter, protectedProcedure } from "@cognobserve/api";
 *
 * export const myRouter = createRouter({
 *   myAction: protectedProcedure
 *     .input(z.object({ ... }))
 *     .mutation(async ({ ctx, input }) => { ... }),
 * });
 * ```
 */

// ============================================================
// Router Exports
// ============================================================

export { appRouter, type AppRouter } from "./routers";

// ============================================================
// Router Factory & Procedures
// ============================================================

export {
  createRouter,
  publicProcedure,
  protectedProcedure,
  projectAdminProcedure,
  projectAdminMiddleware,
  middleware,
  mergeRouters,
  createCallerFactory,
} from "./trpc";

// ============================================================
// Context & Types
// ============================================================

export type { Context, SessionWithProjects, ProjectAccess } from "./context";

// Re-export types from routers
export type { ApiKeyListItem, CreatedApiKey } from "./routers/apiKeys";

// ============================================================
// Auth Middleware Utilities
// ============================================================

export {
  requireAuth,
  requireProjectAccess,
  requireProjectRole,
  hasProjectAccess,
  hasProjectRole,
  ADMIN_ROLES,
  MEMBER_ROLES,
  ALL_ROLES,
} from "./middleware/auth";

// ============================================================
// Zod Schemas (source of truth for types)
// ============================================================

export {
  ProjectRoleSchema,
  type ProjectRole,
  isValidRole,
} from "./schemas";
