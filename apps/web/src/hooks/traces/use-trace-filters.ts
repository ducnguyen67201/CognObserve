"use client";

import { useProjectFilters } from "@/components/costs/cost-context";
import type { TraceFilters, SpanType, SpanLevel } from "@cognobserve/api/schemas";

interface UseTraceFiltersReturn {
  /** Current filter state from URL */
  filters: TraceFilters;
  /** Whether any filters are active */
  hasFilters: boolean;
  /** Number of active filter categories */
  filterCount: number;
  /** Update filters (merges with existing) */
  setFilters: (newFilters: Partial<TraceFilters>) => void;
  /** Clear all filters */
  clearFilters: () => void;
  /** Toggle a value in an array filter (types, levels, models) */
  toggleArrayFilter: <K extends "types" | "levels" | "models">(
    key: K,
    value: K extends "types"
      ? SpanType
      : K extends "levels"
        ? SpanLevel
        : string
  ) => void;
  /** Apply a quick toggle preset */
  applyQuickToggle: (filter: Partial<TraceFilters>) => void;
}

/**
 * Hook for managing trace filters with URL synchronization.
 * Uses the shared ProjectFilterProvider for state.
 */
export function useTraceFilters(): UseTraceFiltersReturn {
  const {
    filters,
    hasFilters,
    filterCount,
    setFilters,
    clearFilters,
    toggleArrayFilter,
    applyQuickToggle,
  } = useProjectFilters();

  return {
    filters,
    hasFilters,
    filterCount,
    setFilters,
    clearFilters,
    toggleArrayFilter,
    applyQuickToggle,
  };
}
