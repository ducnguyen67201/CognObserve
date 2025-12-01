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
import { domainsRouter } from "./domains";
import { costsRouter } from "./costs";
import { alertsRouter } from "./alerts";
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
   * - analytics.getProjectAnalytics   - Get project dashboard data
   * - analytics.getWorkspaceAnalytics - Get workspace-wide dashboard data
   */
  analytics: analyticsRouter,

  /**
   * Allowed Domains (Domain Matcher)
   * @see ./domains.ts
   *
   * - domains.list   - List allowed domains for a workspace
   * - domains.create - Add a domain for auto-join
   * - domains.delete - Remove an allowed domain
   */
  domains: domainsRouter,

  /**
   * Cost Analytics
   * @see ./costs.ts
   *
   * - costs.getOverview   - Get cost overview for a project
   * - costs.getByModel    - Get cost breakdown by model
   * - costs.getTimeSeries - Get cost time series data
   * - costs.listPricing   - List all model pricing
   */
  costs: costsRouter,

  /**
   * Alerts
   * @see ./alerts.ts
   *
   * - alerts.list        - List alerts for a project
   * - alerts.get         - Get alert details
   * - alerts.create      - Create new alert
   * - alerts.update      - Update alert config
   * - alerts.delete      - Delete alert
   * - alerts.toggle      - Enable/disable alert
   * - alerts.history     - Get alert history
   * - alerts.addChannel  - Add notification channel
   * - alerts.removeChannel - Remove channel
   * - alerts.testChannel - Test notification channel
   * - alerts.getProviders - Get available providers
   */
  alerts: alertsRouter,

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
export {
  apiKeysRouter,
  workspacesRouter,
  projectsRouter,
  tracesRouter,
  analyticsRouter,
  domainsRouter,
  costsRouter,
  alertsRouter,
};
