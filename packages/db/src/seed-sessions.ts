/**
 * Seed script to create mock sessions with traces, spans, AND USERS for UI testing
 * Creates 200-300 sessions, each with 2-10 traces and 1-5 spans per trace
 * Creates 30-50 tracked users linked to sessions and traces
 */

import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

// Load .env from project root BEFORE importing prisma
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

// Dynamic import after env is loaded
const { prisma } = await import("./index.js");

// Constants for realistic data generation
const SESSION_PREFIXES = [
  "Chat Session",
  "Support Conversation",
  "Code Review",
  "Bug Analysis",
  "Feature Discussion",
  "Onboarding",
  "Technical Query",
  "API Integration",
  "Data Analysis",
  "Product Demo",
];

const TRACE_NAMES = [
  "User Query",
  "Assistant Response",
  "Tool Call",
  "Follow-up Question",
  "Clarification",
  "Code Generation",
  "Error Analysis",
  "Summary Request",
  "Context Retrieval",
  "Final Response",
];

const SPAN_NAMES = [
  "llm.completion",
  "llm.embedding",
  "tool.search",
  "tool.code_interpreter",
  "retrieval.vector_search",
  "retrieval.rerank",
  "function.call",
  "chain.process",
  "agent.think",
  "agent.act",
];

const MODELS = [
  "gpt-4o",
  "gpt-4o-mini",
  "claude-3-5-sonnet",
  "claude-3-opus",
  "claude-3-haiku",
  "gemini-1.5-pro",
  "gemini-1.5-flash",
];

// Span levels are defined in SpanLevel enum from Prisma

// User data for realistic profiles
const FIRST_NAMES = [
  "James", "Emma", "Oliver", "Sophia", "William", "Ava", "Benjamin", "Isabella",
  "Lucas", "Mia", "Henry", "Charlotte", "Alexander", "Amelia", "Daniel", "Harper",
  "Matthew", "Evelyn", "Sebastian", "Abigail", "Jack", "Emily", "Aiden", "Elizabeth",
];

const LAST_NAMES = [
  "Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis",
  "Rodriguez", "Martinez", "Hernandez", "Lopez", "Gonzalez", "Wilson", "Anderson",
];

const EMAIL_DOMAINS = ["gmail.com", "yahoo.com", "outlook.com", "company.com", "enterprise.io"];
const PLANS = ["free", "starter", "pro", "enterprise"];

// Utility functions
const randomInt = (min: number, max: number): number =>
  Math.floor(Math.random() * (max - min + 1)) + min;

const randomChoice = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)]!;

const randomFloat = (min: number, max: number): number =>
  Math.random() * (max - min) + min;

const generateExternalId = (): string =>
  `session_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

const generateExternalUserId = (): string =>
  `user_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 8)}`;

const hoursAgo = (hours: number): Date =>
  new Date(Date.now() - hours * 60 * 60 * 1000);

interface TrackedUserData {
  id?: string;
  externalId: string;
  name: string;
  email: string;
  metadata: Record<string, unknown>;
  firstSeenAt: Date;
  lastSeenAt: Date;
}

function generateUserData(): Omit<TrackedUserData, 'id'> {
  const firstName = randomChoice(FIRST_NAMES);
  const lastName = randomChoice(LAST_NAMES);
  const name = `${firstName} ${lastName}`;
  const email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}@${randomChoice(EMAIL_DOMAINS)}`;
  const firstSeenHoursAgo = randomInt(48, 720);

  return {
    externalId: generateExternalUserId(),
    name,
    email,
    metadata: {
      plan: randomChoice(PLANS),
      source: randomChoice(["organic", "referral", "paid", "social"]),
    },
    firstSeenAt: hoursAgo(firstSeenHoursAgo),
    lastSeenAt: hoursAgo(randomInt(0, firstSeenHoursAgo - 1)),
  };
}

async function main() {
  console.log("Seeding sessions data...\n");

  // Get the first project
  const project = await prisma.project.findFirst({
    select: { id: true, name: true },
  });

  if (!project) {
    console.error("No project found. Please create a project first.");
    process.exit(1);
  }

  console.log(`Using project: ${project.name} (${project.id})\n`);

  // Ask for confirmation before deleting existing data
  const existingSessionCount = await prisma.traceSession.count({
    where: { projectId: project.id },
  });
  const existingUserCount = await prisma.trackedUser.count({
    where: { projectId: project.id },
  });

  if (existingSessionCount > 0 || existingUserCount > 0) {
    console.log(`Found ${existingSessionCount} existing sessions, ${existingUserCount} users.`);
    console.log("Deleting existing sessions, traces, spans, and users...\n");
  }

  // Delete existing data (cascade will handle related records)
  await prisma.traceSession.deleteMany({
    where: { projectId: project.id },
  });

  // Also delete orphan traces without sessions
  await prisma.trace.deleteMany({
    where: { projectId: project.id, sessionId: null },
  });

  // Delete existing tracked users
  await prisma.trackedUser.deleteMany({
    where: { projectId: project.id },
  });

  // Create 30-50 tracked users first
  const userCount = randomInt(30, 50);
  console.log(`Creating ${userCount} tracked users...\n`);

  const createdUsers: { id: string; name: string }[] = [];
  for (let i = 0; i < userCount; i++) {
    const userData = generateUserData();
    const user = await prisma.trackedUser.create({
      data: {
        projectId: project.id,
        externalId: userData.externalId,
        name: userData.name,
        email: userData.email,
        metadata: userData.metadata as object,
        firstSeenAt: userData.firstSeenAt,
        lastSeenAt: userData.lastSeenAt,
      },
      select: { id: true, name: true },
    });
    createdUsers.push({ id: user.id, name: user.name ?? "Unknown" });
  }
  console.log(`Created ${createdUsers.length} users.\n`);

  // Generate 200-300 sessions
  const sessionCount = randomInt(200, 300);
  console.log(`Creating ${sessionCount} sessions with traces and spans...\n`);

  let totalTraces = 0;
  let totalSpans = 0;
  let totalTokens = 0;
  let totalCost = 0;

  for (let i = 0; i < sessionCount; i++) {
    // Session created 0-30 days ago
    const sessionCreatedHoursAgo = randomInt(0, 720);
    const sessionCreatedAt = hoursAgo(sessionCreatedHoursAgo);

    // Session metadata
    const sessionMetadata = {
      userAgent: randomChoice([
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)",
        "Mozilla/5.0 (Linux; Android 14)",
      ]),
      platform: randomChoice(["web", "mobile", "api", "cli"]),
      version: `v${randomInt(1, 3)}.${randomInt(0, 9)}.${randomInt(0, 20)}`,
    };

    // 70% of sessions have a user
    const sessionUser = Math.random() < 0.7 ? randomChoice(createdUsers) : null;

    // Create session
    const session = await prisma.traceSession.create({
      data: {
        projectId: project.id,
        externalId: generateExternalId(),
        name: `${randomChoice(SESSION_PREFIXES)} #${i + 1}`,
        metadata: sessionMetadata,
        createdAt: sessionCreatedAt,
        updatedAt: sessionCreatedAt,
        ...(sessionUser && { userId: sessionUser.id }),
      },
    });

    // Create 2-10 traces per session
    const traceCount = randomInt(2, 10);
    let lastTraceTime = sessionCreatedAt;

    for (let j = 0; j < traceCount; j++) {
      // Each trace is 1-30 minutes after the previous
      const traceTimeOffset = randomInt(1, 30) * 60 * 1000;
      const traceTimestamp = new Date(lastTraceTime.getTime() + traceTimeOffset);
      lastTraceTime = traceTimestamp;

      // Trace metadata
      const traceMetadata = {
        turnIndex: j + 1,
        inputLength: randomInt(10, 500),
        tags: randomChoice([
          ["general"],
          ["technical", "code"],
          ["support", "urgent"],
          ["documentation"],
          ["debug", "error"],
        ]),
      };

      const trace = await prisma.trace.create({
        data: {
          projectId: project.id,
          sessionId: session.id,
          name: randomChoice(TRACE_NAMES),
          timestamp: traceTimestamp,
          metadata: traceMetadata,
          // Link trace to same user as session
          ...(sessionUser && { userId: sessionUser.id }),
        },
      });

      totalTraces++;

      // Create 1-5 spans per trace
      const spanCount = randomInt(1, 5);
      let spanStartTime = traceTimestamp;

      for (let k = 0; k < spanCount; k++) {
        // Span duration: 100ms - 30s
        const spanDurationMs = randomInt(100, 30000);
        const spanEndTime = new Date(spanStartTime.getTime() + spanDurationMs);

        // Token counts (vary by span type)
        const isLLMSpan = k === 0 || Math.random() > 0.5;
        const promptTokens = isLLMSpan ? randomInt(50, 2000) : null;
        const completionTokens = isLLMSpan ? randomInt(50, 4000) : null;
        const spanTotalTokens =
          promptTokens && completionTokens ? promptTokens + completionTokens : null;

        // Cost calculation (approximate)
        const inputCost = promptTokens ? (promptTokens / 1000) * randomFloat(0.001, 0.03) : null;
        const outputCost = completionTokens
          ? (completionTokens / 1000) * randomFloat(0.002, 0.06)
          : null;
        const spanTotalCost = inputCost && outputCost ? inputCost + outputCost : null;

        if (spanTotalTokens) totalTokens += spanTotalTokens;
        if (spanTotalCost) totalCost += spanTotalCost;

        // Determine span level (mostly DEFAULT, some errors/warnings)
        let level: (typeof SPAN_LEVELS)[number] = "DEFAULT";
        if (Math.random() < 0.03) level = "ERROR";
        else if (Math.random() < 0.08) level = "WARNING";
        else if (Math.random() < 0.15) level = "DEBUG";

        const model = isLLMSpan ? randomChoice(MODELS) : null;

        // Span metadata
        const spanMetadata = {
          spanIndex: k + 1,
          isStreaming: Math.random() > 0.3,
          temperature: isLLMSpan ? randomFloat(0, 1) : null,
        };

        // Input/output examples
        const input = isLLMSpan
          ? {
              messages: [
                { role: "user", content: `Example user message for span ${k + 1}` },
              ],
            }
          : { query: `Search query ${k + 1}` };

        const output = isLLMSpan
          ? {
              choices: [
                {
                  message: {
                    role: "assistant",
                    content: `Example assistant response for span ${k + 1}`,
                  },
                },
              ],
            }
          : { results: [`Result ${k + 1}`] };

        await prisma.span.create({
          data: {
            traceId: trace.id,
            parentSpanId: k > 0 ? null : null, // Could add parent-child relationships
            name: randomChoice(SPAN_NAMES),
            startTime: spanStartTime,
            endTime: spanEndTime,
            input,
            output,
            metadata: spanMetadata,
            model,
            modelParameters: model ? { temperature: 0.7, maxTokens: 4096 } : undefined,
            promptTokens,
            completionTokens,
            totalTokens: spanTotalTokens,
            level,
            statusMessage: level === "ERROR" ? "Rate limit exceeded" : null,
            inputCost,
            outputCost,
            totalCost: spanTotalCost,
          },
        });

        totalSpans++;

        // Next span starts after current one ends (with small gap)
        spanStartTime = new Date(spanEndTime.getTime() + randomInt(10, 100));
      }

      // Update session's updatedAt to the last trace time
      await prisma.traceSession.update({
        where: { id: session.id },
        data: { updatedAt: traceTimestamp },
      });
    }

    // Progress indicator
    if ((i + 1) % 50 === 0) {
      console.log(`  Created ${i + 1}/${sessionCount} sessions...`);
    }
  }

  console.log("\nDone! Seeding complete.\n");

  // Count users with sessions/traces
  const usersWithSessions = await prisma.trackedUser.count({
    where: {
      projectId: project.id,
      sessions: { some: {} },
    },
  });
  const usersWithTraces = await prisma.trackedUser.count({
    where: {
      projectId: project.id,
      traces: { some: {} },
    },
  });

  // Print summary
  console.log("=== Summary ===");
  console.log(`Tracked users created: ${createdUsers.length}`);
  console.log(`  - Users with sessions: ${usersWithSessions}`);
  console.log(`  - Users with traces: ${usersWithTraces}`);
  console.log(`Sessions created: ${sessionCount}`);
  console.log(`Traces created: ${totalTraces}`);
  console.log(`Spans created: ${totalSpans}`);
  console.log(`Total tokens: ${totalTokens.toLocaleString()}`);
  console.log(`Total cost: $${totalCost.toFixed(4)}`);
  console.log(`Average traces per session: ${(totalTraces / sessionCount).toFixed(1)}`);
  console.log(`Average spans per trace: ${(totalSpans / totalTraces).toFixed(1)}`);

  // Show sample sessions
  const sampleSessions = await prisma.traceSession.findMany({
    where: { projectId: project.id },
    include: {
      _count: { select: { traces: true } },
    },
    orderBy: { updatedAt: "desc" },
    take: 5,
  });

  console.log("\n=== Recent Sessions ===");
  for (const session of sampleSessions) {
    console.log(
      `  - ${session.name} (${session._count.traces} traces) - ${session.updatedAt.toISOString()}`
    );
  }

  // Show sample users
  const sampleUsers = await prisma.trackedUser.findMany({
    where: { projectId: project.id },
    include: {
      _count: { select: { sessions: true, traces: true } },
    },
    orderBy: { lastSeenAt: "desc" },
    take: 5,
  });

  console.log("\n=== Recent Users ===");
  for (const user of sampleUsers) {
    console.log(
      `  - ${user.name} (${user._count.sessions} sessions, ${user._count.traces} traces) - ${user.email}`
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
