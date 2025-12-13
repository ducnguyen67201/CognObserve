-- Verify pgvector setup
-- Run with: docker exec -it cognobserve-postgres psql -U cognobserve -d cognobserve -f /path/to/verify_pgvector.sql
-- Or copy/paste into psql

DO $$
BEGIN
  -- Check extension exists
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') THEN
    RAISE EXCEPTION 'pgvector extension not installed';
  END IF;

  -- Check column exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'code_chunks' AND column_name = 'embedding'
  ) THEN
    RAISE EXCEPTION 'embedding column not found in code_chunks';
  END IF;

  -- Check HNSW index exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE indexname = 'code_chunks_embedding_idx'
  ) THEN
    RAISE EXCEPTION 'HNSW index not found';
  END IF;

  -- Check partial index exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE indexname = 'code_chunks_repo_has_embedding_idx'
  ) THEN
    RAISE EXCEPTION 'Partial index for repo filtering not found';
  END IF;

  RAISE NOTICE 'pgvector setup verified successfully!';
  RAISE NOTICE '';
  RAISE NOTICE 'Extension: vector';
  RAISE NOTICE 'Column: code_chunks.embedding (vector(1536))';
  RAISE NOTICE 'Index: code_chunks_embedding_idx (HNSW)';
  RAISE NOTICE 'Index: code_chunks_repo_has_embedding_idx (partial)';
END $$;

-- Show extension details
SELECT extname, extversion FROM pg_extension WHERE extname = 'vector';

-- Show column details
SELECT column_name, data_type, udt_name
FROM information_schema.columns
WHERE table_name = 'code_chunks' AND column_name = 'embedding';

-- Show index details
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'code_chunks' AND indexname LIKE '%embedding%';
