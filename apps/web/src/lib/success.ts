import { toast } from "sonner";

/**
 * Show a success toast.
 *
 * @example
 * ```tsx
 * showSuccess("Member added", "John has been added to the workspace.");
 * showSuccess("Saved"); // Simple message without description
 * ```
 */
export function showSuccess(title: string, message?: string): void {
  toast.success(title, { description: message });
}

/**
 * Show a success toast for a created resource.
 */
export function showCreated(resourceName: string, details?: string): void {
  toast.success(`${resourceName} created`, { description: details });
}

/**
 * Show a success toast for an updated resource.
 */
export function showUpdated(resourceName: string, details?: string): void {
  toast.success(`${resourceName} updated`, { description: details });
}

/**
 * Show a success toast for a deleted resource.
 */
export function showDeleted(resourceName: string, details?: string): void {
  toast.success(`${resourceName} removed`, { description: details });
}

/**
 * Show an info toast (not success, not error).
 */
export function showInfo(title: string, message?: string): void {
  toast.info(title, { description: message });
}

/**
 * Show a warning toast.
 */
export function showWarning(title: string, message?: string): void {
  toast.warning(title, { description: message });
}
