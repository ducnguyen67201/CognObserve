// Application constants

export const APP_NAME = "CognObserve";
export const APP_VERSION = "0.1.0";

// Pagination
export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 100;

// Redis queue keys
export const QUEUE_KEYS = {
  TRACES: "cognobserve:traces",
  SPANS: "cognobserve:spans",
  DEAD_LETTER: "cognobserve:dlq",
} as const;

// HTTP Headers
export const HEADERS = {
  PROJECT_ID: "X-Project-ID",
  API_KEY: "X-API-Key",
  REQUEST_ID: "X-Request-ID",
} as const;
