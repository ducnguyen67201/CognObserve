import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@cognobserve/db";
import { verifyGitHubSignature } from "@cognobserve/api/lib/github";
import {
  GitHubPushPayloadSchema,
  GitHubPRPayloadSchema,
} from "@cognobserve/api/schemas";
import { env } from "@/lib/env";
import { startGitHubIndexWorkflow } from "@/lib/temporal-client";

// GitHub webhook headers
const SIGNATURE_HEADER = "x-hub-signature-256";
const EVENT_HEADER = "x-github-event";
const DELIVERY_HEADER = "x-github-delivery";

// Cache control headers
const CACHE_HEADERS = { "Cache-Control": "no-store, no-cache, must-revalidate" };

// Supported events
const SUPPORTED_EVENTS = ["push", "pull_request"] as const;
type SupportedEvent = (typeof SUPPORTED_EVENTS)[number];

export async function POST(req: NextRequest) {
  // 1. Check if webhook secret is configured
  if (!env.GITHUB_WEBHOOK_SECRET) {
    console.error("GITHUB_WEBHOOK_SECRET not configured");
    return NextResponse.json(
      { error: "Webhook not configured" },
      { status: 500, headers: CACHE_HEADERS }
    );
  }

  // 2. Get required headers
  const signature = req.headers.get(SIGNATURE_HEADER);
  const event = req.headers.get(EVENT_HEADER);
  const delivery = req.headers.get(DELIVERY_HEADER);

  if (!event || !delivery) {
    return NextResponse.json(
      { error: "Missing required headers" },
      { status: 400, headers: CACHE_HEADERS }
    );
  }

  // 3. Get raw payload for signature verification
  const rawPayload = await req.text();

  // 4. Verify signature
  if (!verifyGitHubSignature(rawPayload, signature, env.GITHUB_WEBHOOK_SECRET)) {
    console.warn("Invalid GitHub webhook signature", {
      delivery,
      event,
      ip: req.headers.get("x-forwarded-for") || "unknown",
      timestamp: new Date().toISOString(),
    });
    return NextResponse.json(
      { error: "Invalid signature" },
      { status: 401, headers: CACHE_HEADERS }
    );
  }

  // 5. Parse payload
  let payload: unknown;
  try {
    payload = JSON.parse(rawPayload);
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON payload" },
      { status: 400, headers: CACHE_HEADERS }
    );
  }

  // 6. Handle ping event (GitHub sends this when webhook is first created)
  if (event === "ping") {
    console.log("GitHub webhook ping received", { delivery });
    return NextResponse.json(
      { message: "pong" },
      { status: 200, headers: CACHE_HEADERS }
    );
  }

  // 7. Check if event is supported
  if (!SUPPORTED_EVENTS.includes(event as SupportedEvent)) {
    console.log("Unsupported GitHub event", { event, delivery });
    return NextResponse.json(
      { message: "Event not supported" },
      { status: 200, headers: CACHE_HEADERS }
    );
  }

  // 8. Extract repository info based on event type
  let owner: string;
  let repo: string;

  try {
    if (event === "push") {
      const parsed = GitHubPushPayloadSchema.parse(payload);
      const parts = parsed.repository.full_name.split("/");
      if (parts.length !== 2 || !parts[0] || !parts[1]) {
        return NextResponse.json(
          { error: "Invalid repository name format" },
          { status: 400, headers: CACHE_HEADERS }
        );
      }
      owner = parts[0];
      repo = parts[1];

      // Only process pushes to default branch
      const branch = parsed.ref.replace("refs/heads/", "");
      if (branch !== parsed.repository.default_branch) {
        console.log("Push to non-default branch, skipping", {
          delivery,
          branch,
          defaultBranch: parsed.repository.default_branch,
        });
        return NextResponse.json(
          { message: "Non-default branch push ignored" },
          { status: 200, headers: CACHE_HEADERS }
        );
      }
    } else if (event === "pull_request") {
      const parsed = GitHubPRPayloadSchema.parse(payload);
      const parts = parsed.repository.full_name.split("/");
      if (parts.length !== 2 || !parts[0] || !parts[1]) {
        return NextResponse.json(
          { error: "Invalid repository name format" },
          { status: 400, headers: CACHE_HEADERS }
        );
      }
      owner = parts[0];
      repo = parts[1];

      // Only process opened, closed, and synchronize events
      const relevantActions = ["opened", "closed", "synchronize"];
      if (!relevantActions.includes(parsed.action)) {
        console.log("PR action not relevant, skipping", {
          delivery,
          action: parsed.action,
        });
        return NextResponse.json(
          { message: "PR action not relevant" },
          { status: 200, headers: CACHE_HEADERS }
        );
      }
    } else {
      return NextResponse.json(
        { message: "Event not supported" },
        { status: 200, headers: CACHE_HEADERS }
      );
    }
  } catch (error) {
    console.error("Failed to parse webhook payload", { delivery, event, error });
    return NextResponse.json(
      { error: "Invalid payload structure" },
      { status: 400, headers: CACHE_HEADERS }
    );
  }

  // 9. Look up repository in database
  const githubRepo = await prisma.gitHubRepository.findFirst({
    where: { owner, repo },
    select: { id: true, projectId: true },
  });

  if (!githubRepo) {
    console.log("Repository not registered", { delivery, owner, repo });
    return NextResponse.json(
      { message: "Repository not registered" },
      { status: 200, headers: CACHE_HEADERS }
    );
  }

  // 10. Start Temporal workflow asynchronously
  try {
    const workflowId = await startGitHubIndexWorkflow({
      repoId: githubRepo.id,
      projectId: githubRepo.projectId,
      event: event as SupportedEvent,
      payload,
      deliveryId: delivery,
    });

    console.log("GitHub index workflow started", {
      delivery,
      event,
      owner,
      repo,
      workflowId,
    });

    return NextResponse.json(
      {
        message: "Webhook received",
        workflowId,
      },
      { status: 200, headers: CACHE_HEADERS }
    );
  } catch (error) {
    console.error("Failed to start workflow", { delivery, event, error });
    return NextResponse.json(
      { error: "Failed to process webhook" },
      { status: 500, headers: CACHE_HEADERS }
    );
  }
}
