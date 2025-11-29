/**
 * Central Router Registry
 *
 * All tRPC routers are defined here in one place.
 * Frontend usage: trpc.<module>.<action>
 *
 * @example
 * ```ts
 * // Frontend
 * trpc.apiKeys.list.useQuery({ projectId: "..." })
 * trpc.apiKeys.create.useMutation()
 * trpc.projects.get.useQuery({ id: "..." })
 * ```
 */

import { createRouter } from "../trpc";

// Import all route modules
import { apiKeysRouter } from "./apiKeys";
// import { projectsRouter } from "./projects";
// import { tracesRouter } from "./traces";
// import { usersRouter } from "./users";

/**
 * Main application router.
 * All sub-routers are merged here.
 *
 * Add new modules by:
 * 1. Create router file in ./routers/<module>.ts
 * 2. Import it above
 * 3. Add to appRouter below
 */
export const appRouter = createRouter({
  /**
   * API Keys management
   * @see ./apiKeys.ts
   *
   * - apiKeys.list    - List all API keys for a project
   * - apiKeys.create  - Create a new API key
   * - apiKeys.delete  - Delete an API key
   */
  apiKeys: apiKeysRouter,

  /**
   * Future modules:
   *
   * projects: projectsRouter,  // Project CRUD
   * traces: tracesRouter,      // Trace queries
   * users: usersRouter,        // User management
   * billing: billingRouter,    // Billing & subscriptions
   */
});

/**
 * Type definition for the app router.
 * Used for type inference on the client.
 */
export type AppRouter = typeof appRouter;

/**
 * Re-export individual routers for direct imports if needed.
 */
export { apiKeysRouter };
