import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MetricSnapshot } from "@feudal/contracts";
import { useAnalytics } from "./use-analytics";
import { fetchAnalyticsSnapshot, subscribeAnalytics } from "../lib/api";

vi.mock("../lib/api", () => ({
  fetchAnalyticsSnapshot: vi.fn(),
  subscribeAnalytics: vi.fn()
}));

const fetchAnalyticsSnapshotMock = vi.mocked(fetchAnalyticsSnapshot);
const subscribeAnalyticsMock = vi.mocked(subscribeAnalytics);

const snapshot: MetricSnapshot = {
  timestamp: "2026-05-02T00:00:00.000Z",
  tasksByStatus: { completed: 1 },
  runsByAgent: { "agent-a": 1 },
  runsByStatus: { completed: 1 },
  totalTaskCount: 1,
  totalRunCount: 1,
  awaitingApproval: 0,
  recoveryRequired: 0,
  avgApprovalLatencyMs: null,
  errorRate: 0,
  tokenUsage: {
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalTokens: 0,
    byAgent: []
  }
};

function setupSubscription() {
  let onSnapshot: ((snapshot: MetricSnapshot) => void) | undefined;
  let onError: (() => void) | undefined;
  const close = vi.fn();

  subscribeAnalyticsMock.mockImplementation((snapshotHandler, errorHandler) => {
    onSnapshot = snapshotHandler;
    onError = errorHandler;
    return {
      eventSource: {} as EventSource,
      close
    };
  });

  return {
    emit: (nextSnapshot: MetricSnapshot) => onSnapshot?.(nextSnapshot),
    error: () => onError?.(),
    close
  };
}

describe("useAnalytics", () => {
  beforeEach(() => {
    fetchAnalyticsSnapshotMock.mockReset();
    subscribeAnalyticsMock.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("starts with no snapshot and disconnected state", () => {
    fetchAnalyticsSnapshotMock.mockResolvedValue({ status: "no_data", message: "No data" });
    setupSubscription();

    const { result, unmount } = renderHook(() => useAnalytics());

    expect(result.current.snapshot).toBeNull();
    expect(result.current.connected).toBe(false);
    unmount();
  });

  it("loads the initial snapshot after mount", async () => {
    fetchAnalyticsSnapshotMock.mockResolvedValue(snapshot);
    setupSubscription();

    const { result, unmount } = renderHook(() => useAnalytics());

    await waitFor(() => expect(result.current.snapshot).toEqual(snapshot));
    expect(result.current.snapshotHistory).toEqual([snapshot]);
    unmount();
  });

  it("updates from SSE snapshots without refetching", async () => {
    fetchAnalyticsSnapshotMock.mockResolvedValue({ status: "no_data", message: "No data" });
    const subscription = setupSubscription();
    const { result, unmount } = renderHook(() => useAnalytics());

    act(() => {
      subscription.emit({ ...snapshot, totalTaskCount: 2 });
    });

    await waitFor(() => expect(result.current.snapshot?.totalTaskCount).toBe(2));
    expect(fetchAnalyticsSnapshotMock).toHaveBeenCalledTimes(1);
    unmount();
  });

  it("sets error state when initial fetch fails", async () => {
    fetchAnalyticsSnapshotMock.mockRejectedValue(new Error("offline"));
    setupSubscription();

    const { result, unmount } = renderHook(() => useAnalytics());

    await waitFor(() => expect(result.current.error).toBe("offline"));
    unmount();
  });

  it("marks the stream disconnected on SSE error", async () => {
    fetchAnalyticsSnapshotMock.mockResolvedValue(snapshot);
    const subscription = setupSubscription();
    const { result, unmount } = renderHook(() => useAnalytics());

    act(() => {
      subscription.emit(snapshot);
    });
    await waitFor(() => expect(result.current.connected).toBe(true));

    act(() => {
      subscription.error();
    });

    expect(result.current.connected).toBe(false);
    expect(result.current.error).toBe("Analytics stream disconnected");
    unmount();
  });

  it("closes the SSE connection on unmount", () => {
    fetchAnalyticsSnapshotMock.mockResolvedValue({ status: "no_data", message: "No data" });
    const subscription = setupSubscription();

    const { unmount } = renderHook(() => useAnalytics());
    unmount();

    expect(subscription.close).toHaveBeenCalledTimes(1);
  });
});
