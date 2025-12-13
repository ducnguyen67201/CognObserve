import { jwtVerify } from "jose";
import { prisma } from "@cognobserve/db";
import { getStateSecret } from "@/lib/github";
import {
  fetchInstallationDetails,
  fetchAccessibleRepositories,
} from "@/lib/github";
import { CallbackResult } from "./callback-result";

/**
 * State token payload from the install route
 */
interface StatePayload {
  workspaceId: string;
  workspaceSlug: string;
  userId: string;
  nonce: string;
}

/**
 * Result passed to client component
 */
export interface GitHubCallbackResult {
  success: boolean;
  error?: "cancelled" | "invalid_state" | "github_api_error" | "missing_installation";
  repoCount?: number;
}

interface PageProps {
  searchParams: Promise<{
    installation_id?: string;
    setup_action?: string;
    state?: string;
    error?: string;
  }>;
}

/**
 * GitHub OAuth Callback Page
 *
 * This page handles the callback from GitHub after app installation.
 * It processes the installation server-side, then renders a client
 * component that communicates the result to the parent window via postMessage.
 */
export default async function GitHubCallbackPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const result = await processCallback(params);

  return <CallbackResult result={result} />;
}

/**
 * Process the GitHub callback and sync repositories
 */
async function processCallback(params: {
  installation_id?: string;
  setup_action?: string;
  state?: string;
  error?: string;
}): Promise<GitHubCallbackResult> {
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

  let payload: StatePayload;
  try {
    const stateSecret = new TextEncoder().encode(getStateSecret());
    const { payload: verified } = await jwtVerify(state, stateSecret);
    payload = verified as unknown as StatePayload;
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
  } catch (error) {
    console.error("GitHub API error:", error);
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
  } catch (error) {
    console.error("Database error:", error);
    return { success: false, error: "github_api_error" };
  }
}
