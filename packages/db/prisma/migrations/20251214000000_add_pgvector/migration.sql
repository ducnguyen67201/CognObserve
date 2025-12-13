-- Enable pgvector extension
-- This is idempotent - safe to run multiple times
CREATE EXTENSION IF NOT EXISTS vector;

-- Add embedding column to code_chunks table
-- 1536 dimensions for OpenAI text-embedding-3-small model
ALTER TABLE code_chunks
ADD COLUMN IF NOT EXISTS embedding vector(1536);

-- Create HNSW index for fast similarity search
-- HNSW (Hierarchical Navigable Small World) is faster than IVFFlat for our scale
-- Parameters:
--   m = 16: connections per node (higher = more accurate, more memory)
--   ef_construction = 64: build-time search width (higher = better recall)
CREATE INDEX IF NOT EXISTS code_chunks_embedding_idx
ON code_chunks
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- Create partial index for filtering by repo before vector search
-- This optimizes queries that filter by repo_id first
CREATE INDEX IF NOT EXISTS code_chunks_repo_has_embedding_idx
ON code_chunks (repo_id)
WHERE embedding IS NOT NULL;
