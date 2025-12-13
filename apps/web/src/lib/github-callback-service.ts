/**
 * GitHub OAuth Callback Service
 *
 * Shared logic for processing GitHub App installation callbacks.
 * Used by both the API route and the server component page.
 */

import { jwtVerify } from "jose";
import { prisma } from "@cognobserve/db";
import {
  getStateSecret,
  fetchInstallationDetails,
  fetchAccessibleRepositories,
} from "@/lib/github";

/**
 * State token payload from the install route
 */
export interface GitHubStatePayload {
  workspaceId: string;
  workspaceSlug: string;
  userId: string;
  nonce: string;
}

/**
 * Result of processing the GitHub callback
 */
export interface GitHubCallbackResult {
  success: boolean;
  error?: "cancelled" | "invalid_state" | "github_api_error" | "missing_installation";
  repoCount?: number;
}

/**
 * Input parameters for processing the callback
 */
export interface GitHubCallbackParams {
  installation_id?: string;
  setup_action?: string;
  state?: string;
  error?: string;
}

/**
 * Process the GitHub OAuth callback and sync repositories.
 *
 * This function:
 * 1. Validates the state token (CSRF protection)
 * 2. Fetches installation details from GitHub API
 * 3. Fetches accessible repositories
 * 4. Stores installation and repositories in database
 */
export async function processGitHubCallback(
  params: GitHubCallbackParams
): Promise<GitHubCallbackResult> {
  const { installation_id, state, error } = params;

  // 1. Handle user cancellation
  if (error === "access_denied") {
    return { success: false, error: "cancelled" };
  }

  // 2. Validate installation_id
  if (!installation_id) {
    return { success: false, error: "missing_installation" };
  }

  // 3. Validate state token
  if (!state) {
    return { success: false, error: "invalid_state" };
  }

  let payload: GitHubStatePayload;
  try {
    const stateSecret = new TextEncoder().encode(getStateSecret());
    const { payload: verified } = await jwtVerify(state, stateSecret);
    payload = verified as unknown as GitHubStatePayload;
  } catch {
    return { success: false, error: "invalid_state" };
  }

  // 4. Fetch installation details and repositories from GitHub
  const installationId = Number(installation_id);

  let installationDetails;
  let repositories;

  try {
    installationDetails = await fetchInstallationDetails(installationId);
    repositories = await fetchAccessibleRepositories(installationId);
  } catch (err) {
    console.error("[GitHub Callback] GitHub API error:", err);
    return { success: false, error: "github_api_error" };
  }

  // 5. Store installation in database (upsert to handle re-installs)
  try {
    const dbInstallation = await prisma.gitHubInstallation.upsert({
      where: { workspaceId: payload.workspaceId },
      create: {
        workspaceId: payload.workspaceId,
        installationId: BigInt(installationId),
        accountLogin: installationDetails.accountLogin,
        accountType: installationDetails.accountType,
      },
      update: {
        installationId: BigInt(installationId),
        accountLogin: installationDetails.accountLogin,
        accountType: installationDetails.accountType,
      },
    });

    // 6. Sync repositories (upsert each)
    for (const repo of repositories) {
      await prisma.gitHubRepository.upsert({
        where: { githubId: BigInt(repo.githubId) },
        create: {
          installationId: dbInstallation.id,
          githubId: BigInt(repo.githubId),
          owner: repo.owner,
          repo: repo.repo,
          fullName: repo.fullName,
          defaultBranch: repo.defaultBranch,
          isPrivate: repo.isPrivate,
          enabled: false, // User must explicitly enable
        },
        update: {
          installationId: dbInstallation.id,
          owner: repo.owner,
          repo: repo.repo,
          fullName: repo.fullName,
          defaultBranch: repo.defaultBranch,
          isPrivate: repo.isPrivate,
          // Don't update enabled status on re-install
        },
      });
    }

    return { success: true, repoCount: repositories.length };
  } catch (err) {
    console.error("[GitHub Callback] Database error:", err);
    return { success: false, error: "github_api_error" };
  }
}
