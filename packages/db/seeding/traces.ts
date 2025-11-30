/**
 * Seed Script: Traces
 *
 * Populates database with sample traces and spans simulating:
 * - LLM API calls (chat, summarization, code generation)
 * - Various models (GPT-4, Claude, Gemini, etc.)
 * - Some errors and warnings for testing status indicators
 */

import { prisma, SpanLevel } from "../src/index.js";

// Configuration
const TRACE_COUNT = 250;

// LLM Models to simulate
const LLM_MODELS = [
  "gpt-4",
  "gpt-4-turbo",
  "gpt-3.5-turbo",
  "claude-3-opus",
  "claude-3-sonnet",
  "claude-3-haiku",
  "gemini-pro",
  "mistral-large",
];

// Trace types with their typical span patterns
const TRACE_TYPES = [
  {
    name: "chat-completion",
    weight: 30,
    spans: ["receive-request", "validate-input", "llm-call", "format-response"],
  },
  {
    name: "document-analysis",
    weight: 15,
    spans: ["upload-document", "extract-text", "chunk-document", "llm-analysis", "store-results"],
  },
  {
    name: "search-query",
    weight: 20,
    spans: ["parse-query", "vector-search", "rerank-results", "llm-summarize"],
  },
  {
    name: "code-generation",
    weight: 10,
    spans: ["parse-prompt", "context-retrieval", "llm-generate", "syntax-validation", "format-output"],
  },
  {
    name: "translation",
    weight: 10,
    spans: ["detect-language", "llm-translate", "quality-check"],
  },
  {
    name: "summarization",
    weight: 10,
    spans: ["fetch-content", "chunk-content", "llm-summarize-chunks", "llm-merge-summaries"],
  },
  {
    name: "agent-task",
    weight: 5,
    spans: ["plan-task", "tool-call-1", "llm-reason", "tool-call-2", "llm-reason-2", "final-response"],
  },
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
  "Quantum computing uses quantum bits (qubits) that can exist in multiple states simultaneously, unlike classical bits that are either 0 or 1.",
  "```python\ndef sort_list(items):\n    return sorted(items)\n```",
  "¡Hola, mundo!",
  "Machine learning is a subset of AI that enables systems to learn from data without being explicitly programmed.",
  "Memory leaks in Node.js can be fixed by properly managing references, using WeakMaps, and profiling with tools like clinic.js.",
  "REST API best practices include versioning, proper HTTP methods, clear documentation, and consistent error handling.",
  "SQL databases are relational and use structured schemas, while NoSQL databases offer flexibility with document, key-value, or graph models.",
  "```tsx\nexport function TodoList({ items }) {\n  return <ul>{items.map(item => <li key={item.id}>{item.text}</li>)}</ul>\n}\n```",
  "SOLID principles are: Single Responsibility, Open/Closed, Liskov Substitution, Interface Segregation, and Dependency Inversion.",
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

function generateTimestamp(hoursAgo: number): Date {
  const now = new Date();
  return new Date(now.getTime() - hoursAgo * 60 * 60 * 1000 - randomInt(0, 3600000));
}

function generateSpanDuration(spanName: string): number {
  // Returns duration in milliseconds
  if (spanName.includes("llm")) {
    return randomInt(500, 5000); // LLM calls: 500ms - 5s
  }
  if (spanName.includes("search") || spanName.includes("retrieval")) {
    return randomInt(50, 500); // Search operations: 50ms - 500ms
  }
  if (spanName.includes("validate") || spanName.includes("parse")) {
    return randomInt(5, 50); // Validation: 5ms - 50ms
  }
  return randomInt(10, 200); // Default: 10ms - 200ms
}

function generateCuid(): string {
  const timestamp = Date.now().toString(36);
  const randomPart = Math.random().toString(36).substring(2, 10);
  return `c${timestamp}${randomPart}`;
}

interface SpanData {
  id: string;
  parentSpanId: string | null;
  name: string;
  startTime: Date;
  endTime: Date | null;
  input: Record<string, unknown> | null;
  output: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  model: string | null;
  modelParameters: Record<string, unknown> | null;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  level: SpanLevel;
  statusMessage: string | null;
}

function generateTraceData(projectId: string, hoursAgo: number): {
  trace: {
    id: string;
    projectId: string;
    name: string;
    timestamp: Date;
    metadata: Record<string, unknown>;
  };
  spans: SpanData[];
} {
  const traceType = weightedRandomChoice(TRACE_TYPES);
  const baseTime = generateTimestamp(hoursAgo);
  const traceId = generateCuid();

  // Determine if this trace has errors/warnings (10% error, 15% warning)
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

    if (i === 0) {
      rootSpanId = spanId;
    }

    const isLLMSpan = spanName.includes("llm");
    const model = isLLMSpan ? randomChoice(LLM_MODELS) : null;

    // Determine span level
    let level: SpanLevel = SpanLevel.DEFAULT;
    let statusMessage: string | null = null;

    if (i === errorSpanIndex) {
      level = SpanLevel.ERROR;
      statusMessage = randomChoice([
        "Rate limit exceeded",
        "Model unavailable",
        "Context length exceeded",
        "Invalid API key",
        "Timeout after 30s",
      ]);
    } else if (i === warningSpanIndex) {
      level = SpanLevel.WARNING;
      statusMessage = randomChoice([
        "High latency detected",
        "Retry attempt 2/3",
        "Partial results returned",
        "Deprecated model version",
      ]);
    }

    let promptTokens: number | null = null;
    let completionTokens: number | null = null;
    let totalTokens: number | null = null;
    let input: Record<string, unknown> | null = null;
    let output: Record<string, unknown> | null = null;
    let modelParameters: Record<string, unknown> | null = null;

    // Add LLM-specific fields
    if (isLLMSpan && model) {
      promptTokens = randomInt(50, 2000);
      completionTokens = randomInt(20, 1500);
      totalTokens = promptTokens + completionTokens;

      const temperature = Math.round((Math.random() * 0.7 + 0.3) * 100) / 100;

      input = {
        messages: [
          { role: "user", content: randomChoice(SAMPLE_PROMPTS) },
        ],
      };

      output = {
        message: { role: "assistant", content: randomChoice(SAMPLE_RESPONSES) },
        finish_reason: level === SpanLevel.ERROR ? "error" : "stop",
      };

      modelParameters = {
        temperature,
        max_tokens: randomInt(100, 2000),
        top_p: 1,
      };
    }

    const span: SpanData = {
      id: spanId,
      parentSpanId: i > 0 ? rootSpanId : null, // All spans are children of root
      name: spanName,
      startTime,
      endTime,
      input,
      output,
      metadata: null,
      model,
      modelParameters,
      promptTokens,
      completionTokens,
      totalTokens,
      level,
      statusMessage,
    };

    spans.push(span);
    currentTime = endTime.getTime() + randomInt(1, 10);
  }

  return {
    trace: {
      id: traceId,
      projectId,
      name: traceType.name,
      timestamp: baseTime,
      metadata: {
        user_id: `user-${randomInt(1, 100)}`,
        session_id: `session-${randomInt(1000, 9999)}`,
        environment: randomChoice(["production", "staging", "development"]),
        version: `v${randomInt(1, 3)}.${randomInt(0, 9)}.${randomInt(0, 99)}`,
      },
    },
    spans,
  };
}

export async function seedTraces() {
  console.log("🌱 Seeding traces...\n");

  // Get the first project (or create one if none exists)
  let project = await prisma.project.findFirst({
    orderBy: { createdAt: "asc" },
  });

  if (!project) {
    console.log("No project found. Please create a project first.");
    console.log("Run the app and create a workspace/project via the UI.");
    process.exit(1);
  }

  console.log(`📦 Using project: ${project.name} (${project.id})\n`);

  // Check existing trace count
  const existingCount = await prisma.trace.count({
    where: { projectId: project.id },
  });

  if (existingCount > 0) {
    console.log(`⚠️  Project already has ${existingCount} traces.`);
    console.log("   Delete existing traces? (This will delete all traces and spans)");

    // Auto-delete for seeding
    await prisma.span.deleteMany({ where: { trace: { projectId: project.id } } });
    await prisma.trace.deleteMany({ where: { projectId: project.id } });
    console.log("   ✓ Deleted existing traces.\n");
  }

  // Generate traces distributed over the last 7 days
  const hoursPerTrace = (7 * 24) / TRACE_COUNT;
  let successCount = 0;

  console.log(`Creating ${TRACE_COUNT} traces...\n`);

  for (let i = 0; i < TRACE_COUNT; i++) {
    const hoursAgo = i * hoursPerTrace;
    const { trace, spans } = generateTraceData(project.id, hoursAgo);

    try {
      await prisma.trace.create({
        data: {
          id: trace.id,
          projectId: trace.projectId,
          name: trace.name,
          timestamp: trace.timestamp,
          metadata: trace.metadata,
          spans: {
            createMany: {
              data: spans,
            },
          },
        },
      });
      successCount++;
    } catch (error) {
      console.error(`Failed to create trace ${i + 1}:`, error);
    }

    // Progress indicator
    if ((i + 1) % 50 === 0 || i === TRACE_COUNT - 1) {
      const progress = Math.round(((i + 1) / TRACE_COUNT) * 100);
      console.log(`   Progress: ${i + 1}/${TRACE_COUNT} (${progress}%)`);
    }
  }

  // Summary statistics
  const stats = await prisma.trace.aggregate({
    where: { projectId: project.id },
    _count: true,
  });

  const spanStats = await prisma.span.aggregate({
    where: { trace: { projectId: project.id } },
    _count: true,
    _sum: { totalTokens: true },
  });

  const errorCount = await prisma.span.count({
    where: { trace: { projectId: project.id }, level: SpanLevel.ERROR },
  });

  const warningCount = await prisma.span.count({
    where: { trace: { projectId: project.id }, level: SpanLevel.WARNING },
  });

  console.log("\n✅ Seeding complete!\n");
  console.log("📊 Statistics:");
  console.log(`   Traces created: ${stats._count}`);
  console.log(`   Spans created: ${spanStats._count}`);
  console.log(`   Total tokens: ${(spanStats._sum.totalTokens ?? 0).toLocaleString()}`);
  console.log(`   Error spans: ${errorCount}`);
  console.log(`   Warning spans: ${warningCount}`);
}
