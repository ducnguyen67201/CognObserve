"use client";

import { useEffect, useCallback, useState } from "react";
import type { Virtualizer } from "@tanstack/react-virtual";
import type { FlatWaterfallSpan } from "@/lib/traces/types";

interface UseWaterfallKeyboardOptions {
  /** Virtualized list of spans */
  spans: FlatWaterfallSpan[];
  /** Reference to the virtualizer instance */
  virtualizer: Virtualizer<HTMLDivElement, Element> | null;
  /** Currently selected span ID */
  selectedSpanId: string | null;
  /** Callback when a span is selected */
  onSpanSelect: (spanId: string) => void;
  /** Callback when detail panel should close */
  onCloseDetail?: () => void;
  /** Callback when help modal should open */
  onShowHelp?: () => void;
  /** Whether keyboard navigation is enabled */
  enabled?: boolean;
}

interface UseWaterfallKeyboardReturn {
  /** Move to the next span */
  moveToNext: () => void;
  /** Move to the previous span */
  moveToPrevious: () => void;
  /** Current keyboard focus index */
  focusIndex: number;
  /** Whether keyboard help modal should be shown */
  showHelpModal: boolean;
  /** Close the help modal */
  closeHelpModal: () => void;
}

/**
 * Keyboard shortcuts for navigating the waterfall view.
 *
 * Shortcuts:
 * - j or ArrowDown: Move to next span
 * - k or ArrowUp: Move to previous span
 * - Enter: Select current span (open detail)
 * - Escape: Close detail panel
 * - ?: Show keyboard help
 */
export function useWaterfallKeyboard({
  spans,
  virtualizer,
  selectedSpanId,
  onSpanSelect,
  onCloseDetail,
  onShowHelp,
  enabled = true,
}: UseWaterfallKeyboardOptions): UseWaterfallKeyboardReturn {
  const [focusIndex, setFocusIndex] = useState(0);
  const [showHelpModal, setShowHelpModal] = useState(false);

  // Update focus index when selection changes externally
  useEffect(() => {
    if (selectedSpanId) {
      const index = spans.findIndex((s) => s.id === selectedSpanId);
      if (index !== -1) {
        setFocusIndex(index);
      }
    }
  }, [selectedSpanId, spans]);

  // Scroll to focused span
  const scrollToFocus = useCallback(
    (index: number) => {
      if (!virtualizer) return;
      virtualizer.scrollToIndex(index, {
        align: "center",
        behavior: "smooth",
      });
    },
    [virtualizer]
  );

  // Move to next span
  const moveToNext = useCallback(() => {
    if (spans.length === 0) return;

    setFocusIndex((prev) => {
      const next = Math.min(prev + 1, spans.length - 1);
      scrollToFocus(next);
      return next;
    });
  }, [spans.length, scrollToFocus]);

  // Move to previous span
  const moveToPrevious = useCallback(() => {
    if (spans.length === 0) return;

    setFocusIndex((prev) => {
      const next = Math.max(prev - 1, 0);
      scrollToFocus(next);
      return next;
    });
  }, [spans.length, scrollToFocus]);

  // Select the currently focused span
  const selectFocused = useCallback(() => {
    const span = spans[focusIndex];
    if (span) {
      onSpanSelect(span.id);
    }
  }, [focusIndex, spans, onSpanSelect]);

  // Close help modal
  const closeHelpModal = useCallback(() => {
    setShowHelpModal(false);
  }, []);

  // Keyboard event handler
  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      // Ignore if user is typing in an input
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      switch (event.key) {
        case "j":
        case "ArrowDown":
          event.preventDefault();
          moveToNext();
          break;

        case "k":
        case "ArrowUp":
          event.preventDefault();
          moveToPrevious();
          break;

        case "Enter":
          event.preventDefault();
          selectFocused();
          break;

        case "Escape":
          event.preventDefault();
          if (showHelpModal) {
            closeHelpModal();
          } else {
            onCloseDetail?.();
          }
          break;

        case "?":
          event.preventDefault();
          if (onShowHelp) {
            onShowHelp();
          } else {
            setShowHelpModal(true);
          }
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    enabled,
    moveToNext,
    moveToPrevious,
    selectFocused,
    onCloseDetail,
    onShowHelp,
    showHelpModal,
    closeHelpModal,
  ]);

  return {
    moveToNext,
    moveToPrevious,
    focusIndex,
    showHelpModal,
    closeHelpModal,
  };
}

/**
 * Keyboard shortcut definitions for the help modal.
 */
export const KEYBOARD_SHORTCUTS = [
  { key: "j / ↓", description: "Move to next span" },
  { key: "k / ↑", description: "Move to previous span" },
  { key: "Enter", description: "Open span details" },
  { key: "Escape", description: "Close detail panel" },
  { key: "?", description: "Show keyboard shortcuts" },
] as const;
