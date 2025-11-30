"use client";

import { useCallback, useMemo } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import {
  type TraceFilters,
  type SpanType,
  type SpanLevel,
  FILTER_PARAM_KEYS,
  SpanTypeSchema,
  SpanLevelSchema,
  hasActiveFilters,
  countActiveFilters,
} from "@/lib/traces/types";

interface UseTraceFiltersReturn {
  /** Current filter state parsed from URL */
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
 * Parse a comma-separated URL param into an array.
 */
const parseArrayParam = (value: string | null): string[] | undefined => {
  if (!value) return undefined;
  const items = value.split(",").filter(Boolean);
  return items.length > 0 ? items : undefined;
};

/**
 * Parse a number URL param.
 */
const parseNumberParam = (value: string | null): number | undefined => {
  if (!value) return undefined;
  const num = parseInt(value, 10);
  return isNaN(num) ? undefined : num;
};

/**
 * Validate array values against a Zod enum schema.
 */
const validateArrayParam = <T extends string>(
  values: string[] | undefined,
  options: readonly T[]
): T[] | undefined => {
  if (!values) return undefined;
  const valid = values.filter((v) => options.includes(v as T)) as T[];
  return valid.length > 0 ? valid : undefined;
};

/**
 * Hook for managing trace filters with URL synchronization.
 * Filters are stored in URL query params for shareability.
 */
export function useTraceFilters(): UseTraceFiltersReturn {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  // Parse filters from URL with validation
  const filters = useMemo((): TraceFilters => {
    const search = searchParams.get(FILTER_PARAM_KEYS.search) ?? undefined;
    const typesRaw = parseArrayParam(searchParams.get(FILTER_PARAM_KEYS.types));
    const levelsRaw = parseArrayParam(
      searchParams.get(FILTER_PARAM_KEYS.levels)
    );
    const modelsRaw = parseArrayParam(
      searchParams.get(FILTER_PARAM_KEYS.models)
    );
    const minDuration = parseNumberParam(
      searchParams.get(FILTER_PARAM_KEYS.minDuration)
    );
    const maxDuration = parseNumberParam(
      searchParams.get(FILTER_PARAM_KEYS.maxDuration)
    );

    // Validate enum values
    const types = validateArrayParam(typesRaw, SpanTypeSchema.options);
    const levels = validateArrayParam(levelsRaw, SpanLevelSchema.options);

    return {
      search,
      types,
      levels,
      models: modelsRaw,
      minDuration,
      maxDuration,
    };
  }, [searchParams]);

  // Update URL with new filters
  const updateUrl = useCallback(
    (newFilters: TraceFilters) => {
      const params = new URLSearchParams();

      // Set each param if it has a value
      if (newFilters.search) {
        params.set(FILTER_PARAM_KEYS.search, newFilters.search);
      }
      if (newFilters.types?.length) {
        params.set(FILTER_PARAM_KEYS.types, newFilters.types.join(","));
      }
      if (newFilters.levels?.length) {
        params.set(FILTER_PARAM_KEYS.levels, newFilters.levels.join(","));
      }
      if (newFilters.models?.length) {
        params.set(FILTER_PARAM_KEYS.models, newFilters.models.join(","));
      }
      if (newFilters.minDuration !== undefined) {
        params.set(
          FILTER_PARAM_KEYS.minDuration,
          newFilters.minDuration.toString()
        );
      }
      if (newFilters.maxDuration !== undefined) {
        params.set(
          FILTER_PARAM_KEYS.maxDuration,
          newFilters.maxDuration.toString()
        );
      }

      const queryString = params.toString();
      const newUrl = queryString ? `${pathname}?${queryString}` : pathname;
      router.replace(newUrl, { scroll: false });
    },
    [pathname, router]
  );

  // Set filters (merge with existing)
  const setFilters = useCallback(
    (newFilters: Partial<TraceFilters>) => {
      const merged = { ...filters, ...newFilters };

      // Clean up empty arrays
      if (Array.isArray(merged.types) && merged.types.length === 0) {
        merged.types = undefined;
      }
      if (Array.isArray(merged.levels) && merged.levels.length === 0) {
        merged.levels = undefined;
      }
      if (Array.isArray(merged.models) && merged.models.length === 0) {
        merged.models = undefined;
      }

      updateUrl(merged);
    },
    [filters, updateUrl]
  );

  // Clear all filters
  const clearFilters = useCallback(() => {
    router.replace(pathname, { scroll: false });
  }, [router, pathname]);

  // Toggle a value in an array filter
  const toggleArrayFilter = useCallback(
    <K extends "types" | "levels" | "models">(
      key: K,
      value: K extends "types"
        ? SpanType
        : K extends "levels"
          ? SpanLevel
          : string
    ) => {
      const current = (filters[key] ?? []) as string[];
      const newValues = current.includes(value as string)
        ? current.filter((v) => v !== value)
        : [...current, value];

      setFilters({
        [key]: newValues.length > 0 ? newValues : undefined,
      } as Partial<TraceFilters>);
    },
    [filters, setFilters]
  );

  // Apply a quick toggle preset
  const applyQuickToggle = useCallback(
    (filter: Partial<TraceFilters>) => {
      // Check if this preset is already active (exact match)
      const isActive = Object.entries(filter).every(([key, value]) => {
        const currentValue = filters[key as keyof TraceFilters];
        if (Array.isArray(value) && Array.isArray(currentValue)) {
          return (
            value.length === currentValue.length &&
            value.every((v) => (currentValue as string[]).includes(v as string))
          );
        }
        return currentValue === value;
      });

      if (isActive) {
        // Turn off the preset by clearing those specific filters
        const clearedFilters = { ...filters };
        Object.keys(filter).forEach((key) => {
          clearedFilters[key as keyof TraceFilters] = undefined;
        });
        updateUrl(clearedFilters);
      } else {
        // Apply the preset
        setFilters(filter);
      }
    },
    [filters, setFilters, updateUrl]
  );

  return {
    filters,
    hasFilters: hasActiveFilters(filters),
    filterCount: countActiveFilters(filters),
    setFilters,
    clearFilters,
    toggleArrayFilter,
    applyQuickToggle,
  };
}
