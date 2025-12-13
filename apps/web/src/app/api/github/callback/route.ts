/**
 * GitHub OAuth Callback API Route
 *
 * Processes the GitHub App installation callback and redirects to a result page.
 */

import { NextRequest, NextResponse } from "next/server";
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
interface StatePayload {
  workspaceId: string;
  workspaceSlug: string;
  userId: string;
  nonce: string;
}

export async function GET(request: NextRequest) {
  console.log("[GitHub Callback API] Request received");

  const searchParams = request.nextUrl.searchParams;
  const installation_id = searchParams.get("installation_id");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  console.log("[GitHub Callback API] Params:", {
    installation_id,
    hasState: !!state,
    error,
  });

  // Build redirect URL with result
  const resultUrl = new URL("/github/callback/result", request.nextUrl.origin);

  // 1. Handle user cancellation
  if (error === "access_denied") {
    console.log("[GitHub Callback API] User cancelled");
    resultUrl.searchParams.set("error", "cancelled");
    return NextResponse.redirect(resultUrl);
  }

  // 2. Validate installation_id
  if (!installation_id) {
    console.log("[GitHub Callback API] Missing installation_id");
    resultUrl.searchParams.set("error", "missing_installation");
    return NextResponse.redirect(resultUrl);
  }

  // 3. Validate state token
  if (!state) {
    console.log("[GitHub Callback API] Missing state");
    resultUrl.searchParams.set("error", "invalid_state");
    return NextResponse.redirect(resultUrl);
  }

  let payload: StatePayload;
  try {
    const stateSecret = new TextEncoder().encode(getStateSecret());
    const { payload: verified } = await jwtVerify(state, stateSecret);
    payload = verified as unknown as StatePayload;
    console.log("[GitHub Callback API] State verified for workspace:", payload.workspaceId);
  } catch (err) {
    console.error("[GitHub Callback API] State verification failed:", err);
    resultUrl.searchParams.set("error", "invalid_state");
    return NextResponse.redirect(resultUrl);
  }

  // 4. Fetch installation details and repositories from GitHub
  const installationId = Number(installation_id);
  console.log("[GitHub Callback API] Fetching GitHub data for installation:", installationId);

  let installationDetails;
  let repositories;

  try {
    installationDetails = await fetchInstallationDetails(installationId);
    console.log("[GitHub Callback API] Installation details:", installationDetails);
    repositories = await fetchAccessibleRepositories(installationId);
    console.log("[GitHub Callback API] Found repositories:", repositories.length);
  } catch (err) {
    console.error("[GitHub Callback API] GitHub API error:", err);
    if (err instanceof Error) {
      console.error("[GitHub Callback API] Error message:", err.message);
    }
    resultUrl.searchParams.set("error", "github_api_error");
    return NextResponse.redirect(resultUrl);
  }

  // 5. Store installation in database
  try {
    console.log("[GitHub Callback API] Saving to database...");
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

    // 6. Sync repositories
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
          enabled: false,
        },
        update: {
          installationId: dbInstallation.id,
          owner: repo.owner,
          repo: repo.repo,
          fullName: repo.fullName,
          defaultBranch: repo.defaultBranch,
          isPrivate: repo.isPrivate,
        },
      });
    }

    console.log("[GitHub Callback API] Success! Saved", repositories.length, "repos");
    resultUrl.searchParams.set("success", "true");
    resultUrl.searchParams.set("repoCount", String(repositories.length));
    return NextResponse.redirect(resultUrl);
  } catch (err) {
    console.error("[GitHub Callback API] Database error:", err);
    resultUrl.searchParams.set("error", "github_api_error");
    return NextResponse.redirect(resultUrl);
  }
}
