/**
 * Seed Script: Traces
 *
 * Populates database with sample data in proper hierarchy:
 * - TrackedUsers (end-users of AI apps)
 * - Sessions (conversation threads per user)
 * - Traces (individual requests within sessions)
 * - Spans (operations within traces, including LLM calls)
 */

import { prisma, SpanLevel, Prisma } from "../src/index.js";

const Decimal = Prisma.Decimal;

// Configuration
const USER_COUNT = 30;
const SESSIONS_PER_USER = { min: 2, max: 8 };
const TRACES_PER_SESSION = { min: 3, max: 12 };

// Type for model pricing lookup
interface ModelPricingInfo {
  id: string;
  inputPricePerMillion: Prisma.Decimal;
  outputPricePerMillion: Prisma.Decimal;
}

// Cache for model pricing lookup
let modelPricingCache: Map<string, ModelPricingInfo> = new Map();

// User data
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

// Session types
const SESSION_TYPES = [
  "Chat Session", "Support Conversation", "Code Review", "Bug Analysis",
  "Feature Discussion", "Onboarding", "Technical Query", "API Integration",
  "Data Analysis", "Product Demo",
];

// LLM Models to simulate (must match model-pricing.ts)
const LLM_MODELS = [
  "gpt-4", "gpt-4-turbo", "gpt-4o", "gpt-4o-mini", "gpt-3.5-turbo",
  "claude-3-opus", "claude-3-sonnet", "claude-3-haiku", "claude-3-5-sonnet",
  "gemini-1.5-pro", "gemini-1.5-flash", "mistral-large",
];

// Trace types with their typical span patterns
const TRACE_TYPES = [
  { name: "chat-completion", weight: 30, spans: ["receive-request", "validate-input", "llm-call", "format-response"] },
  { name: "document-analysis", weight: 15, spans: ["upload-document", "extract-text", "chunk-document", "llm-analysis", "store-results"] },
  { name: "search-query", weight: 20, spans: ["parse-query", "vector-search", "rerank-results", "llm-summarize"] },
  { name: "code-generation", weight: 10, spans: ["parse-prompt", "context-retrieval", "llm-generate", "syntax-validation", "format-output"] },
  { name: "translation", weight: 10, spans: ["detect-language", "llm-translate", "quality-check"] },
  { name: "summarization", weight: 10, spans: ["fetch-content", "chunk-content", "llm-summarize-chunks", "llm-merge-summaries"] },
  { name: "agent-task", weight: 5, spans: ["plan-task", "tool-call-1", "llm-reason", "tool-call-2", "llm-reason-2", "final-response"] },
];

// Sample prompts and responses
const SAMPLE_PROMPTS = [
  "What is the capital of France?",
  "Explain quantum computing in simple terms.",
  "Write a Python function to sort a list.",
  "Translate 'Hello, world!' to Spanish.",
  "Summarize the key points of machine learning.",
  "How do I fix a memory leak in Node.js?",
  "What are the best practices for API design?",
  "Explain the difference between SQL and NoSQL.",
  "Generate a React component for a todo list.",
  "What are the SOLID principles in software engineering?",
];

const SAMPLE_RESPONSES = [
  "The capital of France is Paris, which is also the country's largest city.",
  "Quantum computing uses quantum bits (qubits) that can exist in multiple states simultaneously.",
  "```python\ndef sort_list(items):\n    return sorted(items)\n```",
  "¡Hola, mundo!",
  "Machine learning is a subset of AI that enables systems to learn from data.",
  "Memory leaks in Node.js can be fixed by properly managing references and using WeakMaps.",
  "REST API best practices include versioning, proper HTTP methods, and consistent error handling.",
  "SQL databases are relational, while NoSQL databases offer flexibility with document/key-value models.",
  "```tsx\nexport function TodoList({ items }) {\n  return <ul>{items.map(item => <li key={item.id}>{item.text}</li>)}</ul>\n}\n```",
  "SOLID: Single Responsibility, Open/Closed, Liskov Substitution, Interface Segregation, Dependency Inversion.",
];

// Helper functions
function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomChoice<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function weightedRandomChoice<T extends { weight: number }>(items: T[]): T {
  const totalWeight = items.reduce((sum, item) => sum + item.weight, 0);
  let random = Math.random() * totalWeight;
  for (const item of items) {
    random -= item.weight;
    if (random <= 0) return item;
  }
  return items[items.length - 1];
}

function generateCuid(): string {
  const timestamp = Date.now().toString(36);
  const randomPart = Math.random().toString(36).substring(2, 10);
  return `c${timestamp}${randomPart}`;
}

function hoursAgo(hours: number): Date {
  return new Date(Date.now() - hours * 60 * 60 * 1000);
}

function generateSpanDuration(spanName: string): number {
  if (spanName.includes("llm")) return randomInt(500, 5000);
  if (spanName.includes("search") || spanName.includes("retrieval")) return randomInt(50, 500);
  if (spanName.includes("validate") || spanName.includes("parse")) return randomInt(5, 50);
  return randomInt(10, 200);
}

interface SpanData {
  id: string;
  parentSpanId: string | null;
  name: string;
  startTime: Date;
  endTime: Date | null;
  input: Prisma.InputJsonValue;
  output: Prisma.InputJsonValue;
  metadata: Prisma.InputJsonValue;
  model: string | null;
  modelParameters: Prisma.InputJsonValue;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  level: SpanLevel;
  statusMessage: string | null;
  inputCost: Prisma.Decimal | null;
  outputCost: Prisma.Decimal | null;
  totalCost: Prisma.Decimal | null;
  pricingId: string | null;
}

function generateSpans(baseTime: Date): SpanData[] {
  const traceType = weightedRandomChoice(TRACE_TYPES);
  const hasError = Math.random() < 0.1;
  const hasWarning = !hasError && Math.random() < 0.15;
  const errorSpanIndex = hasError ? randomInt(0, traceType.spans.length - 1) : -1;
  const warningSpanIndex = hasWarning ? randomInt(0, traceType.spans.length - 1) : -1;

  const spans: SpanData[] = [];
  let currentTime = baseTime.getTime();
  let rootSpanId: string | null = null;

  for (let i = 0; i < traceType.spans.length; i++) {
    const spanName = traceType.spans[i];
    const duration = generateSpanDuration(spanName);
    const startTime = new Date(currentTime);
    const endTime = new Date(currentTime + duration);
    const spanId = generateCuid();

    if (i === 0) rootSpanId = spanId;

    const isLLMSpan = spanName.includes("llm");
    const model = isLLMSpan ? randomChoice(LLM_MODELS) : null;

    let level: SpanLevel = SpanLevel.DEFAULT;
    let statusMessage: string | null = null;

    if (i === errorSpanIndex) {
      level = SpanLevel.ERROR;
      statusMessage = randomChoice(["Rate limit exceeded", "Model unavailable", "Context length exceeded", "Timeout after 30s"]);
    } else if (i === warningSpanIndex) {
      level = SpanLevel.WARNING;
      statusMessage = randomChoice(["High latency detected", "Retry attempt 2/3", "Partial results returned"]);
    }

    let promptTokens: number | null = null;
    let completionTokens: number | null = null;
    let totalTokens: number | null = null;
    let input: Prisma.InputJsonValue = Prisma.JsonNull;
    let output: Prisma.InputJsonValue = Prisma.JsonNull;
    let modelParameters: Prisma.InputJsonValue = Prisma.JsonNull;
    let inputCost: Prisma.Decimal | null = null;
    let outputCost: Prisma.Decimal | null = null;
    let totalCost: Prisma.Decimal | null = null;
    let pricingId: string | null = null;

    if (isLLMSpan && model) {
      promptTokens = randomInt(50, 2000);
      completionTokens = randomInt(20, 1500);
      totalTokens = promptTokens + completionTokens;
      const temperature = Math.round((Math.random() * 0.7 + 0.3) * 100) / 100;

      input = { messages: [{ role: "user", content: randomChoice(SAMPLE_PROMPTS) }] };
      output = { message: { role: "assistant", content: randomChoice(SAMPLE_RESPONSES) }, finish_reason: level === SpanLevel.ERROR ? "error" : "stop" };
      modelParameters = { temperature, max_tokens: randomInt(100, 2000), top_p: 1 };

      const pricing = modelPricingCache.get(model);
      if (pricing) {
        pricingId = pricing.id;
        inputCost = new Decimal(promptTokens).mul(pricing.inputPricePerMillion).div(1_000_000);
        outputCost = new Decimal(completionTokens).mul(pricing.outputPricePerMillion).div(1_000_000);
        totalCost = inputCost.add(outputCost);
      }
    }

    spans.push({
      id: spanId,
      parentSpanId: i > 0 ? rootSpanId : null,
      name: spanName,
      startTime,
      endTime,
      input,
      output,
      metadata: Prisma.JsonNull,
      model,
      modelParameters,
      promptTokens,
      completionTokens,
      totalTokens,
      level,
      statusMessage,
      inputCost,
      outputCost,
      totalCost,
      pricingId,
    });

    currentTime = endTime.getTime() + randomInt(1, 10);
  }

  return spans;
}

export async function seedTraces() {
  console.log("🌱 Seeding data (Users → Sessions → Traces → Spans)...\n");

  // Load model pricing into cache
  console.log("💰 Loading model pricing...");
  const pricingData = await prisma.modelPricing.findMany({ orderBy: { effectiveFrom: "desc" } });
  modelPricingCache = new Map();
  for (const pricing of pricingData) {
    if (!modelPricingCache.has(pricing.model)) {
      modelPricingCache.set(pricing.model, {
        id: pricing.id,
        inputPricePerMillion: pricing.inputPricePerMillion,
        outputPricePerMillion: pricing.outputPricePerMillion,
      });
    }
  }
  console.log(`   Loaded pricing for ${modelPricingCache.size} models\n`);

  // Get the first project
  const project = await prisma.project.findFirst({ orderBy: { createdAt: "asc" } });
  if (!project) {
    console.log("No project found. Please create a project first.");
    process.exit(1);
  }
  console.log(`📦 Using project: ${project.name} (${project.id})\n`);

  // Clean existing data
  const existingTraces = await prisma.trace.count({ where: { projectId: project.id } });
  const existingSessions = await prisma.traceSession.count({ where: { projectId: project.id } });
  const existingUsers = await prisma.trackedUser.count({ where: { projectId: project.id } });

  if (existingTraces > 0 || existingSessions > 0 || existingUsers > 0) {
    console.log(`⚠️  Found existing data: ${existingUsers} users, ${existingSessions} sessions, ${existingTraces} traces`);
    console.log("   Deleting existing data...");
    await prisma.span.deleteMany({ where: { trace: { projectId: project.id } } });
    await prisma.trace.deleteMany({ where: { projectId: project.id } });
    await prisma.traceSession.deleteMany({ where: { projectId: project.id } });
    await prisma.trackedUser.deleteMany({ where: { projectId: project.id } });
    console.log("   ✓ Deleted existing data.\n");
  }

  // Stats
  let totalUsers = 0;
  let totalSessions = 0;
  let totalTraces = 0;
  let totalSpans = 0;

  console.log(`Creating ${USER_COUNT} users with sessions, traces, and spans...\n`);

  for (let u = 0; u < USER_COUNT; u++) {
    const firstName = randomChoice(FIRST_NAMES);
    const lastName = randomChoice(LAST_NAMES);
    const userFirstSeenHoursAgo = randomInt(48, 720);

    // Create user
    const user = await prisma.trackedUser.create({
      data: {
        projectId: project.id,
        externalId: `user_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 8)}`,
        name: `${firstName} ${lastName}`,
        email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}@${randomChoice(EMAIL_DOMAINS)}`,
        metadata: { plan: randomChoice(PLANS), source: randomChoice(["organic", "referral", "paid"]) },
        firstSeenAt: hoursAgo(userFirstSeenHoursAgo),
        lastSeenAt: hoursAgo(randomInt(0, Math.max(0, Math.min(userFirstSeenHoursAgo - 1, 168)))),
      },
    });
    totalUsers++;

    // Create sessions for this user
    const sessionCount = randomInt(SESSIONS_PER_USER.min, SESSIONS_PER_USER.max);
    for (let s = 0; s < sessionCount; s++) {
      const sessionCreatedHoursAgo = randomInt(0, userFirstSeenHoursAgo - 1);
      const sessionCreatedAt = hoursAgo(sessionCreatedHoursAgo);

      const session = await prisma.traceSession.create({
        data: {
          projectId: project.id,
          externalId: `session_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 8)}`,
          name: `${randomChoice(SESSION_TYPES)} #${totalSessions + 1}`,
          userId: user.id,
          metadata: { platform: randomChoice(["web", "mobile", "api"]), version: `v${randomInt(1, 3)}.${randomInt(0, 9)}` },
          createdAt: sessionCreatedAt,
          updatedAt: sessionCreatedAt,
        },
      });
      totalSessions++;

      // Create traces for this session
      const traceCount = randomInt(TRACES_PER_SESSION.min, TRACES_PER_SESSION.max);
      let lastTraceTime = sessionCreatedAt;

      for (let t = 0; t < traceCount; t++) {
        const traceTimeOffset = randomInt(1, 30) * 60 * 1000; // 1-30 minutes
        const traceTimestamp = new Date(lastTraceTime.getTime() + traceTimeOffset);
        lastTraceTime = traceTimestamp;

        const traceType = weightedRandomChoice(TRACE_TYPES);
        const spans = generateSpans(traceTimestamp);

        await prisma.trace.create({
          data: {
            id: generateCuid(),
            projectId: project.id,
            sessionId: session.id,
            userId: user.id,
            name: traceType.name,
            timestamp: traceTimestamp,
            metadata: { turnIndex: t + 1, inputLength: randomInt(10, 500) },
            spans: { createMany: { data: spans } },
          },
        });

        totalTraces++;
        totalSpans += spans.length;
      }

      // Update session's updatedAt
      await prisma.traceSession.update({
        where: { id: session.id },
        data: { updatedAt: lastTraceTime },
      });
    }

    // Progress
    if ((u + 1) % 10 === 0 || u === USER_COUNT - 1) {
      console.log(`   Progress: ${u + 1}/${USER_COUNT} users`);
    }
  }

  // Summary statistics
  const spanStats = await prisma.span.aggregate({
    where: { trace: { projectId: project.id } },
    _sum: { totalTokens: true, totalCost: true, inputCost: true, outputCost: true },
  });

  const errorCount = await prisma.span.count({
    where: { trace: { projectId: project.id }, level: SpanLevel.ERROR },
  });

  const warningCount = await prisma.span.count({
    where: { trace: { projectId: project.id }, level: SpanLevel.WARNING },
  });

  const llmSpanCount = await prisma.span.count({
    where: { trace: { projectId: project.id }, model: { not: null } },
  });

  console.log("\n✅ Seeding complete!\n");
  console.log("📊 Statistics:");
  console.log(`   Users created: ${totalUsers}`);
  console.log(`   Sessions created: ${totalSessions}`);
  console.log(`   Traces created: ${totalTraces}`);
  console.log(`   Spans created: ${totalSpans}`);
  console.log(`   LLM spans: ${llmSpanCount}`);
  console.log(`   Total tokens: ${(spanStats._sum.totalTokens ?? 0).toLocaleString()}`);
  console.log(`   Total cost: $${(spanStats._sum.totalCost?.toNumber() ?? 0).toFixed(4)}`);
  console.log(`   Error spans: ${errorCount}`);
  console.log(`   Warning spans: ${warningCount}`);
}
