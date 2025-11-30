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
import { workspacesRouter } from "./workspaces";
import { projectsRouter } from "./projects";
import { tracesRouter } from "./traces";
import { analyticsRouter } from "./analytics";
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
   * Workspaces management
   * @see ./workspaces.ts
   *
   * - workspaces.list           - List user's workspaces
   * - workspaces.listWithDetails - List with full details
   * - workspaces.getBySlug      - Get workspace by slug
   * - workspaces.create         - Create a new workspace
   * - workspaces.checkSlug      - Check if slug is available
   * - workspaces.listMembers    - List workspace members
   * - workspaces.inviteMember   - Invite a member
   * - workspaces.removeMember   - Remove a member
   */
  workspaces: workspacesRouter,

  /**
   * Projects management
   * @see ./projects.ts
   *
   * - projects.list   - List projects in a workspace
   * - projects.get    - Get a single project
   * - projects.create - Create a new project
   */
  projects: projectsRouter,

  /**
   * Traces management
   * @see ./traces.ts
   *
   * - traces.list - List traces for a project
   * - traces.get  - Get a single trace with spans
   */
  traces: tracesRouter,

  /**
   * Analytics
   * @see ./analytics.ts
   *
   * - analytics.getProjectAnalytics - Get project dashboard data
   */
  analytics: analyticsRouter,

  /**
   * Future modules:
   *
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
export { apiKeysRouter, workspacesRouter, projectsRouter, tracesRouter, analyticsRouter };
