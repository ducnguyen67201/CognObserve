import { toast } from "sonner";

/**
 * Application error codes.
 * Keep in sync with packages/api/src/errors/codes.ts
 */
export type AppErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "SESSION_EXPIRED"
  | "NOT_FOUND"
  | "ALREADY_EXISTS"
  | "CONFLICT"
  | "USER_NOT_FOUND"
  | "USER_NOT_SIGNED_UP"
  | "USER_ALREADY_MEMBER"
  | "WORKSPACE_NOT_FOUND"
  | "NO_WORKSPACE_ACCESS"
  | "DOMAIN_ALREADY_EXISTS"
  | "INVALID_DOMAIN"
  | "VALIDATION_ERROR"
  | "INVALID_INPUT"
  | "INTERNAL_ERROR"
  | "UNKNOWN_ERROR";

/**
 * Error data shape from API.
 */
export interface AppErrorData {
  appCode: AppErrorCode;
  message: string;
}

/**
 * Error display info extracted from an error object.
 */
export interface ErrorDisplay {
  /** Short title for the error (e.g., "User not found") */
  title: string;
  /** Longer description/message */
  message: string;
  /** App error code if available */
  code?: AppErrorCode;
}

/**
 * Human-readable titles for each error code.
 */
const ERROR_TITLES: Record<AppErrorCode, string> = {
  UNAUTHORIZED: "Unauthorized",
  FORBIDDEN: "Access Denied",
  SESSION_EXPIRED: "Session Expired",
  NOT_FOUND: "Not Found",
  ALREADY_EXISTS: "Already Exists",
  CONFLICT: "Conflict",
  USER_NOT_FOUND: "User Not Found",
  USER_NOT_SIGNED_UP: "User Not Found",
  USER_ALREADY_MEMBER: "Already a Member",
  WORKSPACE_NOT_FOUND: "Workspace Not Found",
  NO_WORKSPACE_ACCESS: "No Access",
  DOMAIN_ALREADY_EXISTS: "Domain Already Configured",
  INVALID_DOMAIN: "Invalid Domain",
  VALIDATION_ERROR: "Validation Error",
  INVALID_INPUT: "Invalid Input",
  INTERNAL_ERROR: "Error",
  UNKNOWN_ERROR: "Error",
};

/**
 * Human-readable error messages for each error code.
 */
const ERROR_MESSAGES: Record<AppErrorCode, string> = {
  UNAUTHORIZED: "You must be logged in to perform this action.",
  FORBIDDEN: "You don't have permission to perform this action.",
  SESSION_EXPIRED: "Your session has expired. Please log in again.",
  NOT_FOUND: "The requested resource was not found.",
  ALREADY_EXISTS: "This resource already exists.",
  CONFLICT: "This operation conflicts with the current state.",
  USER_NOT_FOUND: "User not found.",
  USER_NOT_SIGNED_UP: "This user must sign up first before they can be added.",
  USER_ALREADY_MEMBER: "This user is already a member of the workspace.",
  WORKSPACE_NOT_FOUND: "Workspace not found.",
  NO_WORKSPACE_ACCESS: "You don't have access to any workspace.",
  DOMAIN_ALREADY_EXISTS: "This domain is already configured.",
  INVALID_DOMAIN: "Invalid domain format.",
  VALIDATION_ERROR: "The provided data is invalid.",
  INVALID_INPUT: "Invalid input provided.",
  INTERNAL_ERROR: "An internal error occurred. Please try again later.",
  UNKNOWN_ERROR: "An unexpected error occurred.",
};

/**
 * Type guard to check if an error cause contains AppErrorData.
 */
function isAppErrorData(cause: unknown): cause is AppErrorData {
  return (
    typeof cause === "object" &&
    cause !== null &&
    "appCode" in cause &&
    "message" in cause
  );
}

/**
 * Extract error information from any error object.
 * Works with tRPC errors, AppErrors, and standard Error objects.
 *
 * @example
 * ```tsx
 * try {
 *   await mutation.mutateAsync(data);
 * } catch (error) {
 *   const { title, message } = extractErrorInfo(error);
 *   toast.error(title, { description: message });
 * }
 * ```
 */
export function extractErrorInfo(error: unknown): ErrorDisplay {
  // Default response
  const defaultError: ErrorDisplay = {
    title: "Error",
    message: "An unexpected error occurred. Please try again.",
  };

  if (!error) return defaultError;

  // Handle objects with error data
  if (typeof error === "object") {
    // Check if it's a tRPC error with our custom cause
    if ("cause" in error && isAppErrorData(error.cause)) {
      const appError = error.cause as AppErrorData;
      return {
        title: ERROR_TITLES[appError.appCode] ?? "Error",
        message: appError.message,
        code: appError.appCode,
      };
    }

    // Check for standard message property
    if ("message" in error && typeof error.message === "string") {
      const message = error.message;

      // Try to determine a better title from the message
      const title = inferTitleFromMessage(message);

      return {
        title,
        message,
      };
    }
  }

  // Handle string errors
  if (typeof error === "string") {
    return {
      title: "Error",
      message: error,
    };
  }

  return defaultError;
}

/**
 * Infer a title from an error message for better UX.
 */
function inferTitleFromMessage(message: string): string {
  const lowerMessage = message.toLowerCase();

  if (lowerMessage.includes("not found") || lowerMessage.includes("sign up first")) {
    return "Not Found";
  }
  if (lowerMessage.includes("already") && lowerMessage.includes("member")) {
    return "Already a Member";
  }
  if (lowerMessage.includes("already") && lowerMessage.includes("domain")) {
    return "Domain Already Configured";
  }
  if (lowerMessage.includes("already")) {
    return "Already Exists";
  }
  if (lowerMessage.includes("unauthorized") || lowerMessage.includes("log in")) {
    return "Unauthorized";
  }
  if (lowerMessage.includes("permission") || lowerMessage.includes("forbidden")) {
    return "Access Denied";
  }
  if (lowerMessage.includes("invalid")) {
    return "Invalid Input";
  }

  return "Error";
}

/**
 * Get the default error message for an app error code.
 */
export function getErrorMessage(code: AppErrorCode): string {
  return ERROR_MESSAGES[code];
}

/**
 * Get the title for an app error code.
 */
export function getErrorTitle(code: AppErrorCode): string {
  return ERROR_TITLES[code] ?? "Error";
}

/**
 * Show an error toast for any error.
 * Automatically extracts the title and message from the error.
 *
 * @example
 * ```tsx
 * try {
 *   await mutation.mutateAsync(data);
 * } catch (error) {
 *   showError(error);
 * }
 * ```
 */
export function showError(error: unknown): ErrorDisplay {
  const errorInfo = extractErrorInfo(error);
  toast.error(errorInfo.title, { description: errorInfo.message });
  return errorInfo;
}

/**
 * Show an error toast with a custom message.
 *
 * @example
 * ```tsx
 * showErrorMessage("Failed to save", "Please try again later");
 * ```
 */
export function showErrorMessage(title: string, message?: string): void {
  toast.error(title, { description: message });
}
