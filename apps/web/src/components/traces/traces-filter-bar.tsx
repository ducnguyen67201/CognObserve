"use client";

import { useCallback, useState } from "react";
import {
  Search,
  X,
  ChevronDown,
  Clock,
  Filter,
  AlertCircle,
  Sparkles,
  Timer,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useTraceFilters } from "@/hooks/traces/use-trace-filters";
import {
  type SpanType,
  type SpanLevel,
  ALL_SPAN_TYPES,
  ALL_SPAN_LEVELS,
  QUICK_TOGGLES,
} from "@/lib/traces/types";
import { SPAN_TYPE_CONFIG, SPAN_LEVEL_COLORS } from "./span-type-config";
import { cn } from "@/lib/utils";

interface TracesFilterBarProps {
  /** Available models for the model filter dropdown */
  availableModels?: string[];
}

/**
 * Hybrid filter bar with quick toggles (TreeGrid style) + dropdown filters.
 * Layout:
 * - Row 1: Search input
 * - Row 2: Quick toggles (switches) | Dropdown filters (Type, Level, Model, Duration)
 * - Row 3: Active filter chips (only when filters active)
 */
export function TracesFilterBar({
  availableModels = [],
}: TracesFilterBarProps) {
  const {
    filters,
    hasFilters,
    setFilters,
    clearFilters,
    toggleArrayFilter,
    applyQuickToggle,
  } = useTraceFilters();

  const [searchValue, setSearchValue] = useState(filters.search ?? "");
  const [durationMinValue, setDurationMinValue] = useState(
    filters.minDuration?.toString() ?? ""
  );
  const [durationMaxValue, setDurationMaxValue] = useState(
    filters.maxDuration?.toString() ?? ""
  );

  // Debounced search handler
  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setSearchValue(value);
      // Apply search filter with debounce effect (immediate for now, can add debounce later)
      setFilters({ search: value || undefined });
    },
    [setFilters]
  );

  const handleClearSearch = useCallback(() => {
    setSearchValue("");
    setFilters({ search: undefined });
  }, [setFilters]);

  // Duration filter handlers
  const handleApplyDuration = useCallback(() => {
    const min = durationMinValue ? parseInt(durationMinValue, 10) : undefined;
    const max = durationMaxValue ? parseInt(durationMaxValue, 10) : undefined;
    setFilters({
      minDuration: min && !isNaN(min) ? min : undefined,
      maxDuration: max && !isNaN(max) ? max : undefined,
    });
  }, [durationMinValue, durationMaxValue, setFilters]);

  const handleClearDuration = useCallback(() => {
    setDurationMinValue("");
    setDurationMaxValue("");
    setFilters({ minDuration: undefined, maxDuration: undefined });
  }, [setFilters]);

  // Quick toggle handlers
  const handleQuickToggle = useCallback(
    (id: string) => {
      const toggle = QUICK_TOGGLES.find((t) => t.id === id);
      if (toggle) {
        applyQuickToggle(toggle.filter);
      }
    },
    [applyQuickToggle]
  );

  // Check if a quick toggle is active
  const isQuickToggleActive = useCallback(
    (id: string) => {
      const toggle = QUICK_TOGGLES.find((t) => t.id === id);
      return toggle ? toggle.isActive(filters) : false;
    },
    [filters]
  );

  // Render type filter item with icon and color
  const renderTypeFilterItem = useCallback(
    (type: SpanType) => {
      const config = SPAN_TYPE_CONFIG[type];
      const Icon = config.icon;
      const isChecked = filters.types?.includes(type) ?? false;

      return (
        <DropdownMenuCheckboxItem
          key={type}
          checked={isChecked}
          onCheckedChange={() => toggleArrayFilter("types", type)}
        >
          <div className="flex items-center gap-2">
            <Icon className={cn("h-4 w-4", config.color)} />
            <span>{config.label}</span>
          </div>
        </DropdownMenuCheckboxItem>
      );
    },
    [filters.types, toggleArrayFilter]
  );

  // Render level filter item with color indicator
  const renderLevelFilterItem = useCallback(
    (level: SpanLevel) => {
      const colorClass = SPAN_LEVEL_COLORS[level];
      const isChecked = filters.levels?.includes(level) ?? false;

      return (
        <DropdownMenuCheckboxItem
          key={level}
          checked={isChecked}
          onCheckedChange={() => toggleArrayFilter("levels", level)}
        >
          <div className="flex items-center gap-2">
            <span className={cn("h-2 w-2 rounded-full", colorClass)} />
            <span className="capitalize">{level.toLowerCase()}</span>
          </div>
        </DropdownMenuCheckboxItem>
      );
    },
    [filters.levels, toggleArrayFilter]
  );

  // Render model filter item
  const renderModelFilterItem = useCallback(
    (model: string) => {
      const isChecked = filters.models?.includes(model) ?? false;

      return (
        <DropdownMenuCheckboxItem
          key={model}
          checked={isChecked}
          onCheckedChange={() => toggleArrayFilter("models", model)}
        >
          {model}
        </DropdownMenuCheckboxItem>
      );
    },
    [filters.models, toggleArrayFilter]
  );

  // Remove a specific filter chip
  const handleRemoveTypeFilter = useCallback(
    (type: SpanType) => {
      toggleArrayFilter("types", type);
    },
    [toggleArrayFilter]
  );

  const handleRemoveLevelFilter = useCallback(
    (level: SpanLevel) => {
      toggleArrayFilter("levels", level);
    },
    [toggleArrayFilter]
  );

  const handleRemoveModelFilter = useCallback(
    (model: string) => {
      toggleArrayFilter("models", model);
    },
    [toggleArrayFilter]
  );

  const handleRemoveSearchFilter = useCallback(() => {
    handleClearSearch();
  }, [handleClearSearch]);

  const handleRemoveDurationFilter = useCallback(() => {
    handleClearDuration();
  }, [handleClearDuration]);

  // Active filter count for dropdowns
  const typeFilterCount = filters.types?.length ?? 0;
  const levelFilterCount = filters.levels?.length ?? 0;
  const modelFilterCount = filters.models?.length ?? 0;
  const hasDurationFilter =
    filters.minDuration !== undefined || filters.maxDuration !== undefined;

  return (
    <div className="space-y-3 pb-4">
      {/* Row 1: Search input */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search traces by name..."
          value={searchValue}
          onChange={handleSearchChange}
          className="pl-9 pr-9"
        />
        {searchValue && (
          <Button
            variant="ghost"
            size="sm"
            className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2 p-0"
            onClick={handleClearSearch}
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Row 2: Quick toggles + Dropdown filters */}
      <div className="flex flex-wrap items-center gap-4">
        {/* Quick toggles section */}
        <div className="flex items-center gap-4 border-r pr-4">
          {/* Errors Only toggle */}
          <div className="flex items-center gap-2">
            <Switch
              id="toggle-errors"
              checked={isQuickToggleActive("errors")}
              onCheckedChange={() => handleQuickToggle("errors")}
            />
            <Label
              htmlFor="toggle-errors"
              className="flex cursor-pointer items-center gap-1.5 text-sm"
            >
              <AlertCircle className="h-3.5 w-3.5 text-destructive" />
              Errors Only
            </Label>
          </div>

          {/* LLM Only toggle */}
          <div className="flex items-center gap-2">
            <Switch
              id="toggle-llm"
              checked={isQuickToggleActive("llm")}
              onCheckedChange={() => handleQuickToggle("llm")}
            />
            <Label
              htmlFor="toggle-llm"
              className="flex cursor-pointer items-center gap-1.5 text-sm"
            >
              <Sparkles className="h-3.5 w-3.5 text-purple-500" />
              LLM Only
            </Label>
          </div>

          {/* Slow toggle */}
          <div className="flex items-center gap-2">
            <Switch
              id="toggle-slow"
              checked={isQuickToggleActive("slow")}
              onCheckedChange={() => handleQuickToggle("slow")}
            />
            <Label
              htmlFor="toggle-slow"
              className="flex cursor-pointer items-center gap-1.5 text-sm"
            >
              <Timer className="h-3.5 w-3.5 text-yellow-500" />
              Slow (&gt;5s)
            </Label>
          </div>
        </div>

        {/* Dropdown filters section */}
        <div className="flex items-center gap-2">
          {/* Type filter dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1">
                <Filter className="h-3.5 w-3.5" />
                Type
                {typeFilterCount > 0 && (
                  <Badge variant="secondary" className="ml-1 h-5 px-1.5">
                    {typeFilterCount}
                  </Badge>
                )}
                <ChevronDown className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuLabel>Span Types</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {ALL_SPAN_TYPES.map(renderTypeFilterItem)}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Level filter dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1">
                Level
                {levelFilterCount > 0 && (
                  <Badge variant="secondary" className="ml-1 h-5 px-1.5">
                    {levelFilterCount}
                  </Badge>
                )}
                <ChevronDown className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuLabel>Span Levels</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {ALL_SPAN_LEVELS.map(renderLevelFilterItem)}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Model filter dropdown */}
          {availableModels.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1">
                  Model
                  {modelFilterCount > 0 && (
                    <Badge variant="secondary" className="ml-1 h-5 px-1.5">
                      {modelFilterCount}
                    </Badge>
                  )}
                  <ChevronDown className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuLabel>Models</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {availableModels.map(renderModelFilterItem)}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {/* Duration filter popover */}
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant={hasDurationFilter ? "secondary" : "outline"}
                size="sm"
                className="gap-1"
              >
                <Clock className="h-3.5 w-3.5" />
                Duration
                {hasDurationFilter && (
                  <Badge variant="secondary" className="ml-1 h-5 px-1.5">
                    1
                  </Badge>
                )}
                <ChevronDown className="h-3.5 w-3.5" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64" align="start">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="duration-min">Minimum (ms)</Label>
                  <Input
                    id="duration-min"
                    type="number"
                    placeholder="0"
                    value={durationMinValue}
                    onChange={(e) => setDurationMinValue(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="duration-max">Maximum (ms)</Label>
                  <Input
                    id="duration-max"
                    type="number"
                    placeholder="No limit"
                    value={durationMaxValue}
                    onChange={(e) => setDurationMaxValue(e.target.value)}
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleClearDuration}
                    className="flex-1"
                  >
                    Clear
                  </Button>
                  <Button size="sm" onClick={handleApplyDuration} className="flex-1">
                    Apply
                  </Button>
                </div>
              </div>
            </PopoverContent>
          </Popover>

          {/* Clear all filters */}
          {hasFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearFilters}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="mr-1 h-3.5 w-3.5" />
              Clear All
            </Button>
          )}
        </div>
      </div>

      {/* Row 3: Active filter chips */}
      {hasFilters && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">Active filters:</span>

          {/* Search chip */}
          {filters.search && (
            <Badge variant="secondary" className="gap-1">
              Search: {filters.search}
              <button onClick={handleRemoveSearchFilter} className="ml-1">
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}

          {/* Type chips */}
          {filters.types?.map((type) => {
            const config = SPAN_TYPE_CONFIG[type];
            const Icon = config.icon;
            return (
              <Badge key={type} variant="secondary" className="gap-1">
                <Icon className={cn("h-3 w-3", config.color)} />
                {config.label}
                <button onClick={() => handleRemoveTypeFilter(type)} className="ml-1">
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            );
          })}

          {/* Level chips */}
          {filters.levels?.map((level) => {
            const colorClass = SPAN_LEVEL_COLORS[level];
            return (
              <Badge key={level} variant="secondary" className="gap-1">
                <span className={cn("h-2 w-2 rounded-full", colorClass)} />
                <span className="capitalize">{level.toLowerCase()}</span>
                <button onClick={() => handleRemoveLevelFilter(level)} className="ml-1">
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            );
          })}

          {/* Model chips */}
          {filters.models?.map((model) => (
            <Badge key={model} variant="secondary" className="gap-1">
              {model}
              <button onClick={() => handleRemoveModelFilter(model)} className="ml-1">
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}

          {/* Duration chip */}
          {hasDurationFilter && (
            <Badge variant="secondary" className="gap-1">
              <Clock className="h-3 w-3" />
              {filters.minDuration !== undefined && filters.maxDuration !== undefined
                ? `${filters.minDuration}ms - ${filters.maxDuration}ms`
                : filters.minDuration !== undefined
                  ? `≥${filters.minDuration}ms`
                  : `≤${filters.maxDuration}ms`}
              <button onClick={handleRemoveDurationFilter} className="ml-1">
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
        </div>
      )}
    </div>
  );
}
