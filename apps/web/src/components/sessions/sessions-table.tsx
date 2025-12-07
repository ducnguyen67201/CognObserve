"use client";

import * as React from "react";
import { useCallback, useState } from "react";
import {
  AlertCircle,
  RefreshCw,
  MessagesSquare,
  Search,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { useSessions } from "@/hooks/sessions/use-sessions";
import { formatDuration, formatTokens } from "@/lib/format";
import type { SessionWithStats } from "@cognobserve/api/client";
import { cn } from "@/lib/utils";
import { SessionDetailPanel } from "./session-detail-panel";

/**
 * Format cost as currency
 */
const formatCost = (cost: number): string => {
  if (cost === 0) return "$0.00";
  if (cost >= 1000) return `$${(cost / 1000).toFixed(1)}K`;
  if (cost >= 1) return `$${cost.toFixed(2)}`;
  if (cost >= 0.01) return `$${cost.toFixed(3)}`;
  return `$${cost.toFixed(4)}`;
};

interface SessionsTableProps {
  workspaceSlug: string;
  projectId: string;
}

export function SessionsTable({ workspaceSlug, projectId }: SessionsTableProps) {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);

  // Debounce search
  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const { sessions, isLoading, error, hasMore, loadMore, isLoadingMore, refetch } = useSessions({
    workspaceSlug,
    projectId,
    search: debouncedSearch || undefined,
  });

  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
  }, []);

  const handleSessionSelect = useCallback((sessionId: string) => {
    setSelectedSessionId(sessionId);
  }, []);

  const handleClosePanel = useCallback(() => {
    setSelectedSessionId(null);
  }, []);

  if (isLoading) {
    return (
      <>
        <SearchBar value={search} onChange={handleSearchChange} />
        <SessionsTableSkeleton />
      </>
    );
  }

  if (error) {
    return (
      <>
        <SearchBar value={search} onChange={handleSearchChange} />
        <SessionsErrorState error={error} onRetry={refetch} />
      </>
    );
  }

  if (sessions.length === 0) {
    return (
      <>
        <SearchBar value={search} onChange={handleSearchChange} />
        <SessionsEmptyState hasSearch={!!debouncedSearch} />
      </>
    );
  }

  return (
    <>
      <SearchBar value={search} onChange={handleSearchChange} />
      <div className="space-y-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[200px]">Session</TableHead>
              <TableHead className="w-[100px] text-right">Traces</TableHead>
              <TableHead className="w-[100px] text-right">Tokens</TableHead>
              <TableHead className="w-[100px] text-right">Cost</TableHead>
              <TableHead className="w-[80px] text-right">Errors</TableHead>
              <TableHead className="w-[100px] text-right">Avg Latency</TableHead>
              <TableHead className="w-[150px]">Last Active</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sessions.map((session) => (
              <SessionRow
                key={session.id}
                session={session}
                isSelected={session.id === selectedSessionId}
                onSelect={handleSessionSelect}
              />
            ))}
          </TableBody>
        </Table>

        {hasMore && (
          <div className="flex justify-center">
            <Button variant="outline" onClick={loadMore} disabled={isLoadingMore}>
              {isLoadingMore ? "Loading..." : "Load More"}
            </Button>
          </div>
        )}
      </div>

      <SessionDetailPanel
        workspaceSlug={workspaceSlug}
        sessionId={selectedSessionId}
        onClose={handleClosePanel}
      />
    </>
  );
}

interface SearchBarProps {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

function SearchBar({ value, onChange }: SearchBarProps) {
  return (
    <div className="mb-4 flex items-center gap-2">
      <div className="relative max-w-sm flex-1">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search sessions by name or ID..."
          value={value}
          onChange={onChange}
          className="pl-9"
        />
      </div>
    </div>
  );
}

interface SessionRowProps {
  session: SessionWithStats;
  isSelected: boolean;
  onSelect: (sessionId: string) => void;
}

function SessionRow({ session, isSelected, onSelect }: SessionRowProps) {
  const handleClick = useCallback(() => {
    onSelect(session.id);
  }, [session.id, onSelect]);

  return (
    <TableRow
      className={cn(
        "cursor-pointer hover:bg-muted/30",
        isSelected && "bg-muted/50"
      )}
      onClick={handleClick}
    >
      <TableCell className="py-3">
        <div className="flex flex-col gap-1">
          <span className="font-medium">
            {session.name || session.externalId || session.id.slice(0, 8)}
          </span>
          {session.externalId && session.name && (
            <span className="text-xs text-muted-foreground">{session.externalId}</span>
          )}
        </div>
      </TableCell>
      <TableCell className="py-3 text-right">
        <Badge variant="outline" className="font-mono">
          {session.traceCount}
        </Badge>
      </TableCell>
      <TableCell className="py-3 text-right font-mono">
        {formatTokens(session.totalTokens)}
      </TableCell>
      <TableCell className="py-3 text-right font-mono">
        {formatCost(session.totalCost)}
      </TableCell>
      <TableCell className="py-3 text-right">
        {session.errorCount > 0 ? (
          <Badge variant="destructive" className="font-mono">
            {session.errorCount}
          </Badge>
        ) : (
          <span className="text-muted-foreground">0</span>
        )}
      </TableCell>
      <TableCell className="py-3 text-right font-mono">
        {formatDuration(session.avgLatencyMs)}
      </TableCell>
      <TableCell className="py-3 text-muted-foreground">
        {formatDistanceToNow(new Date(session.updatedAt), { addSuffix: true })}
      </TableCell>
    </TableRow>
  );
}

function SessionsTableSkeleton() {
  const renderSkeletonRow = (index: number) => (
    <TableRow key={index}>
      <TableCell className="py-3">
        <Skeleton className="h-5 w-32" />
      </TableCell>
      <TableCell className="py-3 text-right">
        <Skeleton className="ml-auto h-5 w-12" />
      </TableCell>
      <TableCell className="py-3 text-right">
        <Skeleton className="ml-auto h-5 w-16" />
      </TableCell>
      <TableCell className="py-3 text-right">
        <Skeleton className="ml-auto h-5 w-14" />
      </TableCell>
      <TableCell className="py-3 text-right">
        <Skeleton className="ml-auto h-5 w-10" />
      </TableCell>
      <TableCell className="py-3 text-right">
        <Skeleton className="ml-auto h-5 w-14" />
      </TableCell>
      <TableCell className="py-3">
        <Skeleton className="h-5 w-20" />
      </TableCell>
    </TableRow>
  );

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-[200px]">Session</TableHead>
          <TableHead className="w-[100px] text-right">Traces</TableHead>
          <TableHead className="w-[100px] text-right">Tokens</TableHead>
          <TableHead className="w-[100px] text-right">Cost</TableHead>
          <TableHead className="w-[80px] text-right">Errors</TableHead>
          <TableHead className="w-[100px] text-right">Avg Latency</TableHead>
          <TableHead className="w-[150px]">Last Active</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>{[0, 1, 2, 3, 4].map(renderSkeletonRow)}</TableBody>
    </Table>
  );
}

interface SessionsEmptyStateProps {
  hasSearch: boolean;
}

function SessionsEmptyState({ hasSearch }: SessionsEmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <MessagesSquare className="h-12 w-12 text-muted-foreground/50" />
      <h3 className="mt-4 text-lg font-semibold">
        {hasSearch ? "No sessions found" : "No sessions yet"}
      </h3>
      <p className="mt-2 text-sm text-muted-foreground">
        {hasSearch
          ? "Try adjusting your search query."
          : "Sessions will appear here when your application sends traces with session IDs."}
      </p>
    </div>
  );
}

interface SessionsErrorStateProps {
  error: Error;
  onRetry: () => void;
}

function SessionsErrorState({ error, onRetry }: SessionsErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <AlertCircle className="h-12 w-12 text-destructive/50" />
      <h3 className="mt-4 text-lg font-semibold">Failed to load sessions</h3>
      <p className="mt-2 text-sm text-muted-foreground">
        {error.message || "An unexpected error occurred."}
      </p>
      <Button variant="outline" className="mt-4" onClick={onRetry}>
        <RefreshCw className="mr-2 h-4 w-4" />
        Retry
      </Button>
    </div>
  );
}
