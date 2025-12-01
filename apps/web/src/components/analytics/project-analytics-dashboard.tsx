"use client";

import * as React from "react";
import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  Line,
  LineChart,
  Area,
  AreaChart,
  Pie,
  PieChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Cell,
} from "recharts";
import { Activity, AlertCircle, Clock, Zap } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc/client";
import type { ProjectAnalytics } from "@cognobserve/api/client";
import { cn } from "@/lib/utils";

type TimeRange = "24h" | "7d" | "30d";

interface ProjectAnalyticsDashboardProps {
  workspaceSlug: string;
  projectId: string;
  timeRange?: TimeRange;
  onTimeRangeChange?: (range: TimeRange) => void;
}

// Chart colors
const CHART_COLORS = {
  traces: "hsl(var(--chart-1))",
  errors: "hsl(var(--destructive))",
  p50: "hsl(var(--chart-2))",
  p95: "hsl(var(--chart-3))",
  prompt: "hsl(var(--chart-4))",
  completion: "hsl(var(--chart-5))",
};

const MODEL_COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
];

/**
 * Format duration in ms to human readable
 */
const formatDuration = (ms: number): string => {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
};

/**
 * Format large numbers with K/M suffix
 */
const formatNumber = (num: number): string => {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toString();
};

/**
 * Format date for chart axis
 */
const formatDateLabel = (dateStr: string, range: TimeRange): string => {
  const date = new Date(dateStr);
  if (range === "24h") {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
};

export function ProjectAnalyticsDashboard({
  workspaceSlug,
  projectId,
  timeRange: controlledTimeRange,
  onTimeRangeChange,
}: ProjectAnalyticsDashboardProps) {
  const [internalTimeRange, setInternalTimeRange] = useState<TimeRange>("7d");

  // Use controlled or internal state
  const timeRange = controlledTimeRange ?? internalTimeRange;
  const setTimeRange = onTimeRangeChange ?? setInternalTimeRange;

  const { data: analytics, isLoading } =
    trpc.analytics.getProjectAnalytics.useQuery(
      { workspaceSlug, projectId, timeRange },
      { enabled: !!workspaceSlug && !!projectId }
    );

  const handleTimeRangeChange = (value: string) => {
    setTimeRange(value as TimeRange);
  };

  if (isLoading) {
    return <DashboardSkeleton />;
  }

  if (!analytics) {
    return null;
  }

  return (
    <div className="space-y-4">
      {/* Time range selector + Compact stats */}
      <div className="flex items-center justify-between">
        <CompactStats analytics={analytics} />
        <Tabs value={timeRange} onValueChange={handleTimeRangeChange}>
          <TabsList>
            <TabsTrigger value="24h">24h</TabsTrigger>
            <TabsTrigger value="7d">7d</TabsTrigger>
            <TabsTrigger value="30d">30d</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Charts grid */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Trace Volume */}
        <TraceVolumeChart data={analytics.traceVolume} timeRange={timeRange} />

        {/* Latency */}
        <LatencyChart data={analytics.latency} timeRange={timeRange} />

        {/* Token Usage */}
        <TokenUsageChart data={analytics.tokenUsage} timeRange={timeRange} />

        {/* Model Usage */}
        <ModelUsageChart data={analytics.modelUsage} />
      </div>
    </div>
  );
}

/**
 * Compact stats bar
 */
function CompactStats({ analytics }: { analytics: ProjectAnalytics }) {
  const { summary } = analytics;

  return (
    <div className="flex items-center gap-6 text-sm">
      <div className="flex items-center gap-2">
        <Activity className="h-4 w-4 text-muted-foreground" />
        <span className="font-medium">{formatNumber(summary.totalTraces)}</span>
        <span className="text-muted-foreground">traces</span>
      </div>
      <div className="flex items-center gap-2">
        <AlertCircle
          className={cn(
            "h-4 w-4",
            summary.errorRate > 5 ? "text-destructive" : "text-muted-foreground"
          )}
        />
        <span className="font-medium">{summary.errorRate.toFixed(1)}%</span>
        <span className="text-muted-foreground">error rate</span>
      </div>
      <div className="flex items-center gap-2">
        <Clock className="h-4 w-4 text-muted-foreground" />
        <span className="font-medium">{formatDuration(summary.avgLatency)}</span>
        <span className="text-muted-foreground">avg</span>
      </div>
      <div className="flex items-center gap-2">
        <Zap className="h-4 w-4 text-muted-foreground" />
        <span className="font-medium">{formatNumber(summary.totalTokens)}</span>
        <span className="text-muted-foreground">tokens</span>
      </div>
    </div>
  );
}

/**
 * Trace volume chart with error overlay
 */
function TraceVolumeChart({
  data,
  timeRange,
}: {
  data: ProjectAnalytics["traceVolume"];
  timeRange: TimeRange;
}) {
  const chartConfig: ChartConfig = {
    traces: { label: "Traces", color: CHART_COLORS.traces },
    errors: { label: "Errors", color: CHART_COLORS.errors },
  };

  const chartData = useMemo(() => {
    return data.map((d) => ({
      ...d,
      dateLabel: formatDateLabel(d.date, timeRange),
    }));
  }, [data, timeRange]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Trace Volume</CardTitle>
        <CardDescription>Requests over time with error count</CardDescription>
      </CardHeader>
      <CardContent className="px-2 pb-2">
        <ChartContainer config={chartConfig} className="h-[200px] w-full">
          <BarChart data={chartData} accessibilityLayer>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="dateLabel"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
            />
            <YAxis tickLine={false} axisLine={false} tickMargin={8} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Bar dataKey="traces" fill="var(--color-traces)" radius={[4, 4, 0, 0]} />
            <Bar dataKey="errors" fill="var(--color-errors)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}

/**
 * Latency percentiles chart
 */
function LatencyChart({
  data,
  timeRange,
}: {
  data: ProjectAnalytics["latency"];
  timeRange: TimeRange;
}) {
  const chartConfig: ChartConfig = {
    p50: { label: "P50", color: CHART_COLORS.p50 },
    p95: { label: "P95", color: CHART_COLORS.p95 },
  };

  const chartData = useMemo(() => {
    return data.map((d) => ({
      ...d,
      dateLabel: formatDateLabel(d.date, timeRange),
    }));
  }, [data, timeRange]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Response Latency</CardTitle>
        <CardDescription>P50 and P95 latency over time</CardDescription>
      </CardHeader>
      <CardContent className="px-2 pb-2">
        <ChartContainer config={chartConfig} className="h-[200px] w-full">
          <LineChart data={chartData} accessibilityLayer>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="dateLabel"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              tickFormatter={(v) => formatDuration(v)}
            />
            <ChartTooltip
              content={<ChartTooltipContent formatter={(v) => formatDuration(v as number)} />}
            />
            <Line
              type="monotone"
              dataKey="p50"
              stroke="var(--color-p50)"
              strokeWidth={2}
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="p95"
              stroke="var(--color-p95)"
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}

/**
 * Token usage area chart
 */
function TokenUsageChart({
  data,
  timeRange,
}: {
  data: ProjectAnalytics["tokenUsage"];
  timeRange: TimeRange;
}) {
  const chartConfig: ChartConfig = {
    prompt: { label: "Prompt", color: CHART_COLORS.prompt },
    completion: { label: "Completion", color: CHART_COLORS.completion },
  };

  const chartData = useMemo(() => {
    return data.map((d) => ({
      ...d,
      dateLabel: formatDateLabel(d.date, timeRange),
    }));
  }, [data, timeRange]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Token Usage</CardTitle>
        <CardDescription>Prompt vs completion tokens</CardDescription>
      </CardHeader>
      <CardContent className="px-2 pb-2">
        <ChartContainer config={chartConfig} className="h-[200px] w-full">
          <AreaChart data={chartData} accessibilityLayer>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="dateLabel"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              tickFormatter={(v) => formatNumber(v)}
            />
            <ChartTooltip
              content={<ChartTooltipContent formatter={(v) => formatNumber(v as number)} />}
            />
            <Area
              type="monotone"
              dataKey="prompt"
              stackId="1"
              stroke="var(--color-prompt)"
              fill="var(--color-prompt)"
              fillOpacity={0.4}
            />
            <Area
              type="monotone"
              dataKey="completion"
              stackId="1"
              stroke="var(--color-completion)"
              fill="var(--color-completion)"
              fillOpacity={0.4}
            />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}

/**
 * Model usage pie chart
 */
function ModelUsageChart({ data }: { data: ProjectAnalytics["modelUsage"] }) {
  const chartConfig = useMemo(() => {
    const config: ChartConfig = {};
    data.forEach((item, idx) => {
      config[item.model] = {
        label: item.model,
        color: MODEL_COLORS[idx % MODEL_COLORS.length],
      };
    });
    return config;
  }, [data]);

  if (data.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Model Usage</CardTitle>
          <CardDescription>Distribution by model</CardDescription>
        </CardHeader>
        <CardContent className="flex h-[200px] items-center justify-center px-2 pb-2 text-muted-foreground">
          No model data available
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Model Usage</CardTitle>
        <CardDescription>Distribution by model</CardDescription>
      </CardHeader>
      <CardContent className="px-2 pb-2">
        <ChartContainer config={chartConfig} className="h-[200px] w-full">
          <PieChart accessibilityLayer>
            <ChartTooltip content={<ChartTooltipContent />} />
            <Pie
              data={data}
              dataKey="count"
              nameKey="model"
              cx="50%"
              cy="50%"
              innerRadius={40}
              outerRadius={70}
              paddingAngle={2}
            >
              {data.map((entry, idx) => (
                <Cell
                  key={entry.model}
                  fill={MODEL_COLORS[idx % MODEL_COLORS.length]}
                />
              ))}
            </Pie>
          </PieChart>
        </ChartContainer>
        {/* Legend */}
        <div className="mt-2 flex flex-wrap justify-center gap-4 text-xs">
          {data.slice(0, 5).map((item, idx) => (
            <div key={item.model} className="flex items-center gap-1.5">
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: MODEL_COLORS[idx % MODEL_COLORS.length] }}
              />
              <span className="text-muted-foreground">{item.model}</span>
              <span className="font-medium">{item.count}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Loading skeleton
 */
function DashboardSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-5 w-24" />
        </div>
        <Skeleton className="h-9 w-36" />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-[280px]" />
        <Skeleton className="h-[280px]" />
        <Skeleton className="h-[280px]" />
        <Skeleton className="h-[280px]" />
      </div>
    </div>
  );
}
