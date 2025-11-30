"use client";

import { useCallback, useState } from "react";
import { format } from "date-fns";
import {
  Search,
  X,
  ChevronDown,
  Clock,
  Filter,
  AlertCircle,
  Sparkles,
  Timer,
  CalendarIcon,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
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
import { useProjectFilters } from "@/components/costs/cost-context";
import {
  type SpanType,
  type SpanLevel,
  type QuickToggle,
  ALL_SPAN_TYPES,
  ALL_SPAN_LEVELS,
  QUICK_TOGGLES,
} from "@/lib/traces/types";
import { getSpanTypeConfig, getSpanLevelColor } from "./span-type-config";
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
    timeRange,
    customRange,
    setTimeRange,
    setCustomDateRange,
  } = useProjectFilters();

  const [searchValue, setSearchValue] = useState(filters.search ?? "");
  const [durationMinValue, setDurationMinValue] = useState(
    filters.minDuration?.toString() ?? ""
  );
  const [durationMaxValue, setDurationMaxValue] = useState(
    filters.maxDuration?.toString() ?? ""
  );
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [showCustomCalendar, setShowCustomCalendar] = useState(timeRange === "custom");
  const [tempFromDate, setTempFromDate] = useState<Date | undefined>(
    customRange?.from ? new Date(customRange.from) : undefined
  );
  const [tempToDate, setTempToDate] = useState<Date | undefined>(
    customRange?.to ? new Date(customRange.to) : undefined
  );
  // Time state (HH:MM format)
  const [tempFromTime, setTempFromTime] = useState(() => {
    if (customRange?.from) {
      const date = new Date(customRange.from);
      return `${date.getHours().toString().padStart(2, "0")}:${date.getMinutes().toString().padStart(2, "0")}`;
    }
    return "00:00";
  });
  const [tempToTime, setTempToTime] = useState(() => {
    if (customRange?.to) {
      const date = new Date(customRange.to);
      return `${date.getHours().toString().padStart(2, "0")}:${date.getMinutes().toString().padStart(2, "0")}`;
    }
    return "23:59";
  });

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

  const handleDurationMinChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setDurationMinValue(e.target.value);
    },
    []
  );

  const handleDurationMaxChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setDurationMaxValue(e.target.value);
    },
    []
  );

  // Date range handlers
  const handlePresetSelect = useCallback(
    (preset: "24h" | "7d" | "30d") => {
      setTimeRange(preset);
      setShowCustomCalendar(false);
      setDatePickerOpen(false);
    },
    [setTimeRange]
  );

  const handleShowCustomCalendar = useCallback(() => {
    setShowCustomCalendar(true);
  }, []);

  const handleCancelCustomRange = useCallback(() => {
    setShowCustomCalendar(timeRange === "custom");
    setTempFromDate(customRange?.from ? new Date(customRange.from) : undefined);
    setTempToDate(customRange?.to ? new Date(customRange.to) : undefined);
    // Reset time values
    if (customRange?.from) {
      const fromDate = new Date(customRange.from);
      setTempFromTime(`${fromDate.getHours().toString().padStart(2, "0")}:${fromDate.getMinutes().toString().padStart(2, "0")}`);
    } else {
      setTempFromTime("00:00");
    }
    if (customRange?.to) {
      const toDate = new Date(customRange.to);
      setTempToTime(`${toDate.getHours().toString().padStart(2, "0")}:${toDate.getMinutes().toString().padStart(2, "0")}`);
    } else {
      setTempToTime("23:59");
    }
    setDatePickerOpen(false);
  }, [timeRange, customRange]);

  const handleDateSelect = useCallback(
    (range: { from?: Date; to?: Date } | undefined) => {
      if (range) {
        setTempFromDate(range.from);
        setTempToDate(range.to);
      }
    },
    []
  );

  const handleFromTimeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setTempFromTime(e.target.value);
  }, []);

  const handleToTimeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setTempToTime(e.target.value);
  }, []);

  const handleApplyCustomRange = useCallback(() => {
    if (tempFromDate && tempToDate) {
      // Combine date + time into full ISO datetime
      const fromTimeParts = tempFromTime.split(":");
      const toTimeParts = tempToTime.split(":");
      const fromHours = parseInt(fromTimeParts[0] ?? "0", 10);
      const fromMinutes = parseInt(fromTimeParts[1] ?? "0", 10);
      const toHours = parseInt(toTimeParts[0] ?? "23", 10);
      const toMinutes = parseInt(toTimeParts[1] ?? "59", 10);

      const fromDateTime = new Date(tempFromDate);
      fromDateTime.setHours(fromHours, fromMinutes, 0, 0);

      const toDateTime = new Date(tempToDate);
      toDateTime.setHours(toHours, toMinutes, 59, 999);

      setCustomDateRange(
        fromDateTime.toISOString(),
        toDateTime.toISOString()
      );
      setShowCustomCalendar(true);
      setDatePickerOpen(false);
    }
  }, [tempFromDate, tempToDate, tempFromTime, tempToTime, setCustomDateRange]);

  // Quick toggle handlers
  const handleQuickToggle = useCallback(
    (id: string) => {
      const toggle = QUICK_TOGGLES.find((t: QuickToggle) => t.id === id);
      if (toggle) {
        applyQuickToggle(toggle.filter);
      }
    },
    [applyQuickToggle]
  );

  const handleErrorsToggle = useCallback(() => {
    handleQuickToggle("errors");
  }, [handleQuickToggle]);

  const handleLlmToggle = useCallback(() => {
    handleQuickToggle("llm");
  }, [handleQuickToggle]);

  const handleSlowToggle = useCallback(() => {
    handleQuickToggle("slow");
  }, [handleQuickToggle]);

  // Check if a quick toggle is active
  const isQuickToggleActive = useCallback(
    (id: string) => {
      const toggle = QUICK_TOGGLES.find((t: QuickToggle) => t.id === id);
      return toggle ? toggle.isActive(filters) : false;
    },
    [filters]
  );

  // Render type filter item with icon and color
  const renderTypeFilterItem = useCallback(
    (type: SpanType) => {
      const config = getSpanTypeConfig(type);
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
      const colorClass = getSpanLevelColor(level);
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
              onCheckedChange={handleErrorsToggle}
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
              onCheckedChange={handleLlmToggle}
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
              onCheckedChange={handleSlowToggle}
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
          {/* Date range filter */}
          <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
            <PopoverTrigger asChild>
              <Button
                variant={timeRange === "custom" ? "secondary" : "outline"}
                size="sm"
                className="gap-1"
              >
                <CalendarIcon className="h-3.5 w-3.5" />
                {timeRange === "custom" && customRange
                  ? `${format(new Date(customRange.from), "MMM d, HH:mm")} - ${format(new Date(customRange.to), "MMM d, HH:mm")}`
                  : timeRange === "24h"
                    ? "Last 24h"
                    : timeRange === "7d"
                      ? "Last 7 days"
                      : timeRange === "30d"
                        ? "Last 30 days"
                        : "Date Range"}
                <ChevronDown className="h-3.5 w-3.5" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              {/* Preset options */}
              <div className="border-b p-2">
                <div className="grid grid-cols-2 gap-1">
                  <Button
                    variant={timeRange === "24h" ? "secondary" : "ghost"}
                    size="sm"
                    className="justify-start"
                    onClick={() => handlePresetSelect("24h")}
                  >
                    Last 24 hours
                  </Button>
                  <Button
                    variant={timeRange === "7d" ? "secondary" : "ghost"}
                    size="sm"
                    className="justify-start"
                    onClick={() => handlePresetSelect("7d")}
                  >
                    Last 7 days
                  </Button>
                  <Button
                    variant={timeRange === "30d" ? "secondary" : "ghost"}
                    size="sm"
                    className="justify-start"
                    onClick={() => handlePresetSelect("30d")}
                  >
                    Last 30 days
                  </Button>
                  <Button
                    variant={showCustomCalendar ? "secondary" : "ghost"}
                    size="sm"
                    className="justify-start"
                    onClick={handleShowCustomCalendar}
                  >
                    Custom range
                  </Button>
                </div>
              </div>
              {/* Calendar for custom range */}
              {showCustomCalendar && (
                <>
                  <Calendar
                    mode="range"
                    selected={tempFromDate && tempToDate ? { from: tempFromDate, to: tempToDate } : undefined}
                    onSelect={handleDateSelect}
                    numberOfMonths={2}
                    disabled={{ after: new Date() }}
                  />
                  {/* Time selection */}
                  <div className="border-t p-3">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label htmlFor="from-time" className="text-xs text-muted-foreground">
                          From time
                        </Label>
                        <div className="flex items-center gap-2">
                          <Clock className="h-4 w-4 text-muted-foreground" />
                          <Input
                            id="from-time"
                            type="time"
                            value={tempFromTime}
                            onChange={handleFromTimeChange}
                            className="h-8"
                          />
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="to-time" className="text-xs text-muted-foreground">
                          To time
                        </Label>
                        <div className="flex items-center gap-2">
                          <Clock className="h-4 w-4 text-muted-foreground" />
                          <Input
                            id="to-time"
                            type="time"
                            value={tempToTime}
                            onChange={handleToTimeChange}
                            className="h-8"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 border-t p-3">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleCancelCustomRange}
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleApplyCustomRange}
                      disabled={!tempFromDate || !tempToDate}
                    >
                      Apply
                    </Button>
                  </div>
                </>
              )}
            </PopoverContent>
          </Popover>

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
                    onChange={handleDurationMinChange}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="duration-max">Maximum (ms)</Label>
                  <Input
                    id="duration-max"
                    type="number"
                    placeholder="No limit"
                    value={durationMaxValue}
                    onChange={handleDurationMaxChange}
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
          {filters.types?.map((type: SpanType) => {
            const config = getSpanTypeConfig(type);
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
          {filters.levels?.map((level: SpanLevel) => {
            const colorClass = getSpanLevelColor(level);
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
          {filters.models?.map((model: string) => (
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
