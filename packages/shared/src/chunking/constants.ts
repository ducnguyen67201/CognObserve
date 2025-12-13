/**
 * Code Chunking Constants
 */

/**
 * Default chunking limits
 */
export const CHUNK_DEFAULTS = {
  MAX_LINES: 500,
  MAX_BYTES: 10 * 1024, // 10KB
  MIN_LINES: 10,
} as const;

/**
 * Language detection mapping from file extension
 */
export const EXTENSION_TO_LANGUAGE: Record<string, string> = {
  ".ts": "typescript",
  ".tsx": "typescript",
  ".js": "javascript",
  ".jsx": "javascript",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".py": "python",
  ".go": "go",
  ".rs": "rust",
  ".java": "java",
};

/**
 * Languages with AST-based chunking support
 */
export const AST_LANGUAGES = ["typescript", "javascript"] as const;

/**
 * Languages with heuristic chunking support
 */
export const HEURISTIC_LANGUAGES = ["python", "go"] as const;
