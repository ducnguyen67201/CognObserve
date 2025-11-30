import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TracesTable } from "../traces-table";
import type { TraceListItem } from "@cognobserve/api/client";

// Mock the useTraces hook
const mockLoadMore = vi.fn();
const mockUseTraces = vi.fn();

vi.mock("@/hooks/traces/use-traces", () => ({
  useTraces: () => mockUseTraces(),
}));

// Mock the TraceDetailPanel component
vi.mock("../trace-detail-panel", () => ({
  TraceDetailPanel: ({ traceId }: { traceId: string | null; onClose: () => void }) => (
    traceId ? <div data-testid="trace-detail-panel">Panel Open: {traceId}</div> : null
  ),
}));

// Sample trace data
const createMockTrace = (overrides: Partial<TraceListItem> = {}): TraceListItem => ({
  id: "trace-1",
  name: "Test Trace",
  timestamp: new Date().toISOString(),
  spanCount: 5,
  duration: 1500,
  totalTokens: 1000,
  hasErrors: false,
  hasWarnings: false,
  primaryModel: "gpt-4",
  ...overrides,
});

describe("TracesTable", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Loading State", () => {
    it("should render loading skeleton when isLoading is true", () => {
      mockUseTraces.mockReturnValue({
        traces: [],
        isLoading: true,
        hasMore: false,
        loadMore: mockLoadMore,
        isLoadingMore: false,
      });

      render(
        <TracesTable workspaceSlug="test-workspace" projectId="test-project" />
      );

      // Should show skeleton rows (table with skeleton cells)
      const skeletons = document.querySelectorAll('[class*="animate-pulse"], [class*="skeleton"]');
      expect(skeletons.length).toBeGreaterThan(0);
    });
  });

  describe("Empty State", () => {
    it("should render empty state when no traces exist", () => {
      mockUseTraces.mockReturnValue({
        traces: [],
        isLoading: false,
        hasMore: false,
        loadMore: mockLoadMore,
        isLoadingMore: false,
      });

      render(
        <TracesTable workspaceSlug="test-workspace" projectId="test-project" />
      );

      expect(screen.getByText("No traces yet")).toBeInTheDocument();
      expect(
        screen.getByText("Traces will appear here once your application sends data.")
      ).toBeInTheDocument();
    });
  });

  describe("Traces Display", () => {
    it("should render table headers correctly", () => {
      mockUseTraces.mockReturnValue({
        traces: [createMockTrace()],
        isLoading: false,
        hasMore: false,
        loadMore: mockLoadMore,
        isLoadingMore: false,
      });

      render(
        <TracesTable workspaceSlug="test-workspace" projectId="test-project" />
      );

      expect(screen.getByText("Name")).toBeInTheDocument();
      expect(screen.getByText("Time")).toBeInTheDocument();
      expect(screen.getByText("Spans")).toBeInTheDocument();
      expect(screen.getByText("Duration")).toBeInTheDocument();
      expect(screen.getByText("Tokens")).toBeInTheDocument();
      expect(screen.getByText("Status")).toBeInTheDocument();
    });

    it("should render trace name and model badge", () => {
      mockUseTraces.mockReturnValue({
        traces: [createMockTrace({ name: "My Test Trace", primaryModel: "gpt-4" })],
        isLoading: false,
        hasMore: false,
        loadMore: mockLoadMore,
        isLoadingMore: false,
      });

      render(
        <TracesTable workspaceSlug="test-workspace" projectId="test-project" />
      );

      expect(screen.getByText("My Test Trace")).toBeInTheDocument();
      expect(screen.getByText("gpt-4")).toBeInTheDocument();
    });

    it("should render span count", () => {
      mockUseTraces.mockReturnValue({
        traces: [createMockTrace({ spanCount: 10 })],
        isLoading: false,
        hasMore: false,
        loadMore: mockLoadMore,
        isLoadingMore: false,
      });

      render(
        <TracesTable workspaceSlug="test-workspace" projectId="test-project" />
      );

      expect(screen.getByText("10")).toBeInTheDocument();
    });

    it("should format duration in milliseconds", () => {
      mockUseTraces.mockReturnValue({
        traces: [createMockTrace({ duration: 500 })],
        isLoading: false,
        hasMore: false,
        loadMore: mockLoadMore,
        isLoadingMore: false,
      });

      render(
        <TracesTable workspaceSlug="test-workspace" projectId="test-project" />
      );

      expect(screen.getByText("500ms")).toBeInTheDocument();
    });

    it("should format duration in seconds", () => {
      mockUseTraces.mockReturnValue({
        traces: [createMockTrace({ duration: 2500 })],
        isLoading: false,
        hasMore: false,
        loadMore: mockLoadMore,
        isLoadingMore: false,
      });

      render(
        <TracesTable workspaceSlug="test-workspace" projectId="test-project" />
      );

      expect(screen.getByText("2.50s")).toBeInTheDocument();
    });

    it("should format tokens with k suffix for large numbers", () => {
      mockUseTraces.mockReturnValue({
        traces: [createMockTrace({ totalTokens: 5000 })],
        isLoading: false,
        hasMore: false,
        loadMore: mockLoadMore,
        isLoadingMore: false,
      });

      render(
        <TracesTable workspaceSlug="test-workspace" projectId="test-project" />
      );

      expect(screen.getByText("5.0k")).toBeInTheDocument();
    });

    it("should show dash for null duration", () => {
      mockUseTraces.mockReturnValue({
        traces: [createMockTrace({ duration: null })],
        isLoading: false,
        hasMore: false,
        loadMore: mockLoadMore,
        isLoadingMore: false,
      });

      render(
        <TracesTable workspaceSlug="test-workspace" projectId="test-project" />
      );

      // Find duration column value (should be "-")
      const cells = screen.getAllByRole("cell");
      const durationCell = cells.find((cell) => cell.textContent === "-");
      expect(durationCell).toBeDefined();
    });
  });

  describe("Status Indicators", () => {
    it("should show error icon when hasErrors is true", () => {
      mockUseTraces.mockReturnValue({
        traces: [createMockTrace({ hasErrors: true, hasWarnings: false })],
        isLoading: false,
        hasMore: false,
        loadMore: mockLoadMore,
        isLoadingMore: false,
      });

      render(
        <TracesTable workspaceSlug="test-workspace" projectId="test-project" />
      );

      // AlertCircle icon should be present with destructive class
      const errorIcon = document.querySelector(".text-destructive");
      expect(errorIcon).toBeInTheDocument();
    });

    it("should show warning icon when hasWarnings is true and no errors", () => {
      mockUseTraces.mockReturnValue({
        traces: [createMockTrace({ hasErrors: false, hasWarnings: true })],
        isLoading: false,
        hasMore: false,
        loadMore: mockLoadMore,
        isLoadingMore: false,
      });

      render(
        <TracesTable workspaceSlug="test-workspace" projectId="test-project" />
      );

      // AlertTriangle icon should be present with yellow class
      const warningIcon = document.querySelector(".text-yellow-500");
      expect(warningIcon).toBeInTheDocument();
    });

    it("should show green dot when no errors or warnings", () => {
      mockUseTraces.mockReturnValue({
        traces: [createMockTrace({ hasErrors: false, hasWarnings: false })],
        isLoading: false,
        hasMore: false,
        loadMore: mockLoadMore,
        isLoadingMore: false,
      });

      render(
        <TracesTable workspaceSlug="test-workspace" projectId="test-project" />
      );

      // Green success indicator
      const successIndicator = document.querySelector(".bg-green-500");
      expect(successIndicator).toBeInTheDocument();
    });
  });

  describe("Row Click Panel", () => {
    it("should open trace detail panel on row click", async () => {
      const user = userEvent.setup();

      mockUseTraces.mockReturnValue({
        traces: [createMockTrace({ id: "trace-abc" })],
        isLoading: false,
        hasMore: false,
        loadMore: mockLoadMore,
        isLoadingMore: false,
      });

      render(
        <TracesTable workspaceSlug="my-workspace" projectId="my-project" />
      );

      // Panel should not be visible initially
      expect(screen.queryByTestId("trace-detail-panel")).not.toBeInTheDocument();

      const row = screen.getByRole("row", { name: /Test Trace/i });
      await user.click(row);

      // Panel should now be visible with the trace ID
      expect(screen.getByTestId("trace-detail-panel")).toBeInTheDocument();
      expect(screen.getByText("Panel Open: trace-abc")).toBeInTheDocument();
    });
  });

  describe("Pagination", () => {
    it("should show Load More button when hasMore is true", () => {
      mockUseTraces.mockReturnValue({
        traces: [createMockTrace()],
        isLoading: false,
        hasMore: true,
        loadMore: mockLoadMore,
        isLoadingMore: false,
      });

      render(
        <TracesTable workspaceSlug="test-workspace" projectId="test-project" />
      );

      expect(screen.getByRole("button", { name: /Load More/i })).toBeInTheDocument();
    });

    it("should not show Load More button when hasMore is false", () => {
      mockUseTraces.mockReturnValue({
        traces: [createMockTrace()],
        isLoading: false,
        hasMore: false,
        loadMore: mockLoadMore,
        isLoadingMore: false,
      });

      render(
        <TracesTable workspaceSlug="test-workspace" projectId="test-project" />
      );

      expect(screen.queryByRole("button", { name: /Load More/i })).not.toBeInTheDocument();
    });

    it("should call loadMore when Load More button is clicked", async () => {
      const user = userEvent.setup();

      mockUseTraces.mockReturnValue({
        traces: [createMockTrace()],
        isLoading: false,
        hasMore: true,
        loadMore: mockLoadMore,
        isLoadingMore: false,
      });

      render(
        <TracesTable workspaceSlug="test-workspace" projectId="test-project" />
      );

      await user.click(screen.getByRole("button", { name: /Load More/i }));

      expect(mockLoadMore).toHaveBeenCalled();
    });

    it("should show Loading... text and disable button when isLoadingMore", () => {
      mockUseTraces.mockReturnValue({
        traces: [createMockTrace()],
        isLoading: false,
        hasMore: true,
        loadMore: mockLoadMore,
        isLoadingMore: true,
      });

      render(
        <TracesTable workspaceSlug="test-workspace" projectId="test-project" />
      );

      const button = screen.getByRole("button", { name: /Loading.../i });
      expect(button).toBeInTheDocument();
      expect(button).toBeDisabled();
    });
  });

  describe("Multiple Traces", () => {
    it("should render multiple trace rows", () => {
      mockUseTraces.mockReturnValue({
        traces: [
          createMockTrace({ id: "1", name: "Trace One" }),
          createMockTrace({ id: "2", name: "Trace Two" }),
          createMockTrace({ id: "3", name: "Trace Three" }),
        ],
        isLoading: false,
        hasMore: false,
        loadMore: mockLoadMore,
        isLoadingMore: false,
      });

      render(
        <TracesTable workspaceSlug="test-workspace" projectId="test-project" />
      );

      expect(screen.getByText("Trace One")).toBeInTheDocument();
      expect(screen.getByText("Trace Two")).toBeInTheDocument();
      expect(screen.getByText("Trace Three")).toBeInTheDocument();
    });
  });
});
