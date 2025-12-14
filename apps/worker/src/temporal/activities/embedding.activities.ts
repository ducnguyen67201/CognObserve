/**
 * Embedding Generation Activities
 *
 * Activities for generating and storing code chunk embeddings.
 * Uses LLM Center for provider-agnostic embedding generation.
 *
 * IMPORTANT: Follows READ-ONLY pattern - all storage via tRPC internal procedures.
 */

import {
  createLLMCenter,
  getConfig,
  type LLMCenter,
  type EmbedResult,
} from "@cognobserve/shared/llm";
import { getInternalCaller } from "@/lib/trpc-caller";
import type {
  GenerateEmbeddingsInput,
  GenerateEmbeddingsOutput,
  EmbeddingResult,
  StoreEmbeddingsInput,
  StoreEmbeddingsOutput,
} from "../types";

// ============================================
// Constants
// ============================================

/** Maximum texts per API call (OpenAI limit) */
const MAX_BATCH_SIZE = 100;

/** Default batch size (conservative for reliability) */
const DEFAULT_BATCH_SIZE = 50;

/** Maximum tokens per chunk (leave buffer for model limit of 8191) */
const MAX_TOKENS_PER_CHUNK = 8000;

/** Approximate characters per token (conservative estimate for code) */
const CHARS_PER_TOKEN = 3;

/** Maximum characters per chunk */
const MAX_CHARS_PER_CHUNK = MAX_TOKENS_PER_CHUNK * CHARS_PER_TOKEN;

/** Delay between batches in ms (for rate limiting) */
const BATCH_DELAY_MS = 200;

// ============================================
// LLM Center (Lazy Initialization)
// ============================================

let _llmCenter: LLMCenter | null = null;

function getLLMCenter(): LLMCenter {
  if (!_llmCenter) {
    _llmCenter = createLLMCenter(getConfig());
  }
  return _llmCenter;
}

// ============================================
// Helper Functions
// ============================================

/**
 * Truncate content to fit within token limit.
 * Uses a conservative character-based estimate.
 */
function truncateToTokenLimit(content: string): string {
  if (content.length <= MAX_CHARS_PER_CHUNK) {
    return content;
  }
  // Truncate with indicator
  return content.slice(0, MAX_CHARS_PER_CHUNK - 20) + "\n[...truncated]";
}

/**
 * Split array into batches of specified size.
 */
function batchArray<T>(array: T[], batchSize: number): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < array.length; i += batchSize) {
    batches.push(array.slice(i, i + batchSize));
  }
  return batches;
}

/**
 * Sleep for specified milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================
// Activity: Generate Embeddings
// ============================================

/**
 * Generate embeddings for code chunks using LLM Center.
 *
 * Features:
 * - Batches requests for efficiency (up to 100 per call)
 * - Truncates long content to token limit
 * - Rate limits between batches (handled by LLM Center)
 * - Automatic retry and fallback (handled by LLM Center)
 * - Tracks token usage and cost
 *
 * @param input - Chunks to generate embeddings for
 * @returns Embeddings with usage stats
 */
export async function generateEmbeddings(
  input: GenerateEmbeddingsInput
): Promise<GenerateEmbeddingsOutput> {
  const { chunks, batchSize = DEFAULT_BATCH_SIZE } = input;

  console.log(
    `[Embedding] Starting embedding generation for ${chunks.length} chunks`
  );

  if (chunks.length === 0) {
    return {
      embeddings: [],
      tokensUsed: 0,
      estimatedCost: 0,
      chunksProcessed: 0,
      batchCount: 0,
    };
  }

  const llm = getLLMCenter();
  const effectiveBatchSize = Math.min(batchSize, MAX_BATCH_SIZE);
  const batches = batchArray(chunks, effectiveBatchSize);

  const embeddings: EmbeddingResult[] = [];
  let totalTokens = 0;
  let totalCost = 0;

  console.log(
    `[Embedding] Processing ${batches.length} batches of up to ${effectiveBatchSize} chunks`
  );

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i]!;
    const batchNum = i + 1;

    console.log(
      `[Embedding] Processing batch ${batchNum}/${batches.length} (${batch.length} chunks)`
    );

    // Prepare input texts (truncated to token limit)
    const inputTexts = batch.map((chunk) => truncateToTokenLimit(chunk.content));

    // Call LLM Center for embeddings (handles retries, rate limiting, fallbacks)
    const result: EmbedResult = await llm.embed(inputTexts);

    // Validate response count
    if (result.embeddings.length !== batch.length) {
      throw new Error(
        `Embedding count mismatch: expected ${batch.length}, got ${result.embeddings.length}`
      );
    }

    // Match embeddings to chunk IDs (ordered by index)
    for (let j = 0; j < batch.length; j++) {
      const chunk = batch[j]!;
      const embeddingVector = result.embeddings[j]!;

      embeddings.push({
        chunkId: chunk.id,
        embedding: embeddingVector,
      });
    }

    // Track token usage and cost
    totalTokens += result.usage.totalTokens;
    totalCost += result.usage.estimatedCost;

    console.log(
      `[Embedding] Batch ${batchNum} complete: ${batch.length} chunks, ` +
        `${result.usage.totalTokens} tokens, $${result.usage.estimatedCost.toFixed(6)}`
    );

    // Rate limit delay (except for last batch)
    if (i < batches.length - 1) {
      await sleep(BATCH_DELAY_MS);
    }
  }

  console.log(
    `[Embedding] Generation complete: ${embeddings.length} embeddings, ` +
      `${totalTokens} tokens, $${totalCost.toFixed(6)}`
  );

  return {
    embeddings,
    tokensUsed: totalTokens,
    estimatedCost: totalCost,
    chunksProcessed: embeddings.length,
    batchCount: batches.length,
  };
}

// ============================================
// Activity: Store Embeddings
// ============================================

/**
 * Store embeddings in database via tRPC internal procedure.
 *
 * IMPORTANT: Mutations go through internal router - NOT direct database access.
 *
 * @param input - Embeddings to store
 * @returns Count of stored embeddings
 */
export async function storeEmbeddings(
  input: StoreEmbeddingsInput
): Promise<StoreEmbeddingsOutput> {
  const { embeddings } = input;

  if (embeddings.length === 0) {
    return { storedCount: 0 };
  }

  console.log(`[Embedding] Storing ${embeddings.length} embeddings`);

  const caller = getInternalCaller();
  const result = await caller.internal.storeChunkEmbeddings({
    embeddings: embeddings.map((e) => ({
      chunkId: e.chunkId,
      embedding: e.embedding,
    })),
  });

  console.log(`[Embedding] Stored ${result.storedCount} embeddings`);

  return result;
}
