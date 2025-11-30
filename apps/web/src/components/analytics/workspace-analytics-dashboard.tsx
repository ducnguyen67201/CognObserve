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
import {
  Activity,
  AlertCircle,
  Clock,
  FolderKanban,
  TrendingUp,
} from "lucide-react";
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
import type { WorkspaceAnalytics } from "@cognobserve/api/client";
import { cn } from "@/lib/utils";
import Link from "next/link";

interface WorkspaceAnalyticsDashboardProps {
  workspaceSlug: string;
}

type TimeRange = "24h" | "7d" | "30d";

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

const PROJECT_COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
];

const formatDuration = (ms: number): string => {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
};

const formatNumber = (num: number): string => {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toString();
};

const formatDateLabel = (dateStr: string, range: TimeRange): string => {
  const date = new Date(dateStr);
  if (range === "24h") {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
};

export function WorkspaceAnalyticsDashboard({
  workspaceSlug,
}: WorkspaceAnalyticsDashboardProps) {
  const [timeRange, setTimeRange] = useState<TimeRange>("7d");

  const { data: analytics, isLoading } =
    trpc.analytics.getWorkspaceAnalytics.useQuery(
      { workspaceSlug, timeRange },
      { enabled: !!workspaceSlug }
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

  const hasData = analytics.summary.totalTraces > 0;

  return (
    <div className="space-y-6">
      {/* Summary Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatsCard
          title="Total Traces"
          value={formatNumber(analytics.summary.totalTraces)}
          description={`${formatNumber(analytics.summary.totalSpans)} spans`}
          icon={Activity}
        />
        <StatsCard
          title="Active Projects"
          value={analytics.summary.totalProjects.toString()}
          description={
            analytics.summary.totalProjects === 1
              ? "1 project with traces"
              : `${analytics.summary.totalProjects} projects`
          }
          icon={FolderKanban}
        />
        <StatsCard
          title="Error Rate"
          value={`${analytics.summary.errorRate.toFixed(1)}%`}
          description={`${analytics.summary.errorCount} errors total`}
          icon={AlertCircle}
          variant={analytics.summary.errorRate > 5 ? "destructive" : "default"}
        />
        <StatsCard
          title="Avg Latency"
          value={
            analytics.summary.avgLatency > 0
              ? formatDuration(analytics.summary.avgLatency)
              : "--"
          }
          description={
            analytics.summary.totalTokens > 0
              ? `${formatNumber(analytics.summary.totalTokens)} tokens`
              : "No data available"
          }
          icon={Clock}
        />
      </div>

      {/* Time range selector */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <TrendingUp className="h-4 w-4" />
          <span>Analytics Overview</span>
        </div>
        <Tabs value={timeRange} onValueChange={handleTimeRangeChange}>
          <TabsList>
            <TabsTrigger value="24h">24h</TabsTrigger>
            <TabsTrigger value="7d">7d</TabsTrigger>
            <TabsTrigger value="30d">30d</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {!hasData ? (
        <EmptyState />
      ) : (
        <>
          {/* Charts grid */}
          <div className="grid gap-4 md:grid-cols-2">
            <TraceVolumeChart
              data={analytics.traceVolume}
              timeRange={timeRange}
            />
            <LatencyChart data={analytics.latency} timeRange={timeRange} />
            <TokenUsageChart
              data={analytics.tokenUsage}
              timeRange={timeRange}
            />
            <ModelUsageChart data={analytics.modelUsage} />
          </div>

          {/* Project Breakdown */}
          {analytics.projectBreakdown.length > 0 && (
            <ProjectBreakdownChart
              data={analytics.projectBreakdown}
              workspaceSlug={workspaceSlug}
            />
          )}
        </>
      )}
    </div>
  );
}

interface StatsCardProps {
  title: string;
  value: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  variant?: "default" | "destructive";
}

function StatsCard({
  title,
  value,
  description,
  icon: Icon,
  variant = "default",
}: StatsCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon
          className={cn(
            "h-4 w-4",
            variant === "destructive"
              ? "text-destructive"
              : "text-muted-foreground"
          )}
        />
      </CardHeader>
      <CardContent>
        <div
          className={cn(
            "text-2xl font-bold",
            variant === "destructive" && "text-destructive"
          )}
        >
          {value}
        </div>
        <p className="text-xs text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}

function EmptyState() {
  return (
    <Card className="py-12">
      <CardContent className="flex flex-col items-center justify-center text-center">
        <Activity className="h-12 w-12 text-muted-foreground/50 mb-4" />
        <h3 className="text-lg font-medium">No traces recorded yet</h3>
        <p className="text-sm text-muted-foreground mt-1 max-w-sm">
          Start sending traces to your projects to see analytics data here.
          Check the documentation for integration guides.
        </p>
      </CardContent>
    </Card>
  );
}

function TraceVolumeChart({
  data,
  timeRange,
}: {
  data: WorkspaceAnalytics["traceVolume"];
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
            <Bar
              dataKey="traces"
              fill="var(--color-traces)"
              radius={[4, 4, 0, 0]}
            />
            <Bar
              dataKey="errors"
              fill="var(--color-errors)"
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}

function LatencyChart({
  data,
  timeRange,
}: {
  data: WorkspaceAnalytics["latency"];
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
              content={
                <ChartTooltipContent
                  formatter={(v) => formatDuration(v as number)}
                />
              }
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

function TokenUsageChart({
  data,
  timeRange,
}: {
  data: WorkspaceAnalytics["tokenUsage"];
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
              content={
                <ChartTooltipContent
                  formatter={(v) => formatNumber(v as number)}
                />
              }
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

function ModelUsageChart({ data }: { data: WorkspaceAnalytics["modelUsage"] }) {
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
        <div className="mt-2 flex flex-wrap justify-center gap-4 text-xs">
          {data.slice(0, 5).map((item, idx) => (
            <div key={item.model} className="flex items-center gap-1.5">
              <span
                className="h-2 w-2 rounded-full"
                style={{
                  backgroundColor: MODEL_COLORS[idx % MODEL_COLORS.length],
                }}
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

function ProjectBreakdownChart({
  data,
  workspaceSlug,
}: {
  data: WorkspaceAnalytics["projectBreakdown"];
  workspaceSlug: string;
}) {
  const chartConfig = useMemo(() => {
    const config: ChartConfig = {};
    data.forEach((item, idx) => {
      config[item.name] = {
        label: item.name,
        color: PROJECT_COLORS[idx % PROJECT_COLORS.length],
      };
    });
    return config;
  }, [data]);

  const chartData = useMemo(() => {
    return data.slice(0, 10).map((p) => ({
      name: p.name,
      traces: p.traceCount,
      errors: p.errorCount,
      tokens: p.totalTokens,
    }));
  }, [data]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Project Breakdown</CardTitle>
        <CardDescription>
          Traces per project (top 10 by activity)
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="h-[300px] w-full">
          <BarChart
            data={chartData}
            layout="vertical"
            margin={{ left: 120 }}
            accessibilityLayer
          >
            <CartesianGrid horizontal={false} />
            <XAxis type="number" tickLine={false} axisLine={false} />
            <YAxis
              dataKey="name"
              type="category"
              tickLine={false}
              axisLine={false}
              width={110}
              tick={{ fontSize: 12 }}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  formatter={(value, name) => {
                    if (name === "traces") return `${value} traces`;
                    if (name === "errors") return `${value} errors`;
                    return value;
                  }}
                />
              }
            />
            <Bar
              dataKey="traces"
              fill={CHART_COLORS.traces}
              radius={[0, 4, 4, 0]}
            />
            <Bar
              dataKey="errors"
              fill={CHART_COLORS.errors}
              radius={[0, 4, 4, 0]}
            />
          </BarChart>
        </ChartContainer>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {data.slice(0, 6).map((project, idx) => (
            <Link
              key={project.id}
              href={`/workspace/${workspaceSlug}/projects/${project.id}`}
              className="flex items-center justify-between rounded-lg border p-3 hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-center gap-2">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{
                    backgroundColor:
                      PROJECT_COLORS[idx % PROJECT_COLORS.length],
                  }}
                />
                <span className="text-sm font-medium truncate max-w-[120px]">
                  {project.name}
                </span>
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span>{formatNumber(project.traceCount)} traces</span>
                {project.errorCount > 0 && (
                  <span className="text-destructive">
                    {project.errorCount} errors
                  </span>
                )}
              </div>
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Skeleton className="h-[120px]" />
        <Skeleton className="h-[120px]" />
        <Skeleton className="h-[120px]" />
        <Skeleton className="h-[120px]" />
      </div>
      <div className="flex items-center justify-between">
        <Skeleton className="h-5 w-36" />
        <Skeleton className="h-9 w-36" />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-[280px]" />
        <Skeleton className="h-[280px]" />
        <Skeleton className="h-[280px]" />
        <Skeleton className="h-[280px]" />
      </div>
      <Skeleton className="h-[400px]" />
    </div>
  );
}
