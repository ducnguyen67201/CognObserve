"use client";

import { useEffect, useRef, useCallback } from "react";
import type { Virtualizer } from "@tanstack/react-virtual";
import type { FlatWaterfallSpan } from "@/lib/traces/types";

interface UseScrollToErrorOptions {
  /** Virtualized list of spans */
  spans: FlatWaterfallSpan[];
  /** Reference to the virtualizer instance */
  virtualizer: Virtualizer<HTMLDivElement, Element> | null;
  /** Whether to enable auto-scroll to first error on load */
  enabled?: boolean;
  /** Callback when scrolling to an error span */
  onScrollToError?: (spanId: string) => void;
}

interface UseScrollToErrorReturn {
  /** Scroll to the first error span */
  scrollToFirstError: () => string | null;
  /** Scroll to a specific span by ID */
  scrollToSpan: (spanId: string) => boolean;
  /** Whether there are any error spans */
  hasErrors: boolean;
  /** The first error span ID, if any */
  firstErrorSpanId: string | null;
}

/**
 * Hook for scrolling to error spans in the waterfall view.
 * Automatically scrolls to the first error on initial load if enabled.
 */
export function useScrollToError({
  spans,
  virtualizer,
  enabled = true,
  onScrollToError,
}: UseScrollToErrorOptions): UseScrollToErrorReturn {
  const hasScrolledRef = useRef(false);

  // Find all error spans
  const errorSpans = spans.filter((span) => span.level === "ERROR");
  const hasErrors = errorSpans.length > 0;
  const firstErrorSpanId = errorSpans[0]?.id ?? null;

  // Scroll to a specific span by ID
  const scrollToSpan = useCallback(
    (spanId: string): boolean => {
      if (!virtualizer) return false;

      const index = spans.findIndex((span) => span.id === spanId);
      if (index === -1) return false;

      virtualizer.scrollToIndex(index, {
        align: "center",
        behavior: "smooth",
      });

      return true;
    },
    [spans, virtualizer]
  );

  // Scroll to the first error span
  const scrollToFirstError = useCallback((): string | null => {
    if (!firstErrorSpanId) return null;

    const success = scrollToSpan(firstErrorSpanId);
    if (success) {
      onScrollToError?.(firstErrorSpanId);
    }

    return success ? firstErrorSpanId : null;
  }, [firstErrorSpanId, scrollToSpan, onScrollToError]);

  // Auto-scroll to first error on initial load
  useEffect(() => {
    if (!enabled || !hasErrors || !virtualizer || hasScrolledRef.current) {
      return;
    }

    // Small delay to ensure virtualizer is ready
    const timeoutId = setTimeout(() => {
      if (hasScrolledRef.current) return;
      hasScrolledRef.current = true;
      scrollToFirstError();
    }, 100);

    return () => clearTimeout(timeoutId);
  }, [enabled, hasErrors, virtualizer, scrollToFirstError]);

  // Reset scroll state when spans change (new trace loaded)
  useEffect(() => {
    hasScrolledRef.current = false;
  }, [spans]);

  return {
    scrollToFirstError,
    scrollToSpan,
    hasErrors,
    firstErrorSpanId,
  };
}
