// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";

const refreshMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

import { TaskLivePoller } from "./task-live-poller";

describe("TaskLivePoller", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    refreshMock.mockClear();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("polls router.refresh while status is running", () => {
    render(<TaskLivePoller status="running" />);
    expect(refreshMock).not.toHaveBeenCalled();
    vi.advanceTimersByTime(3_000);
    expect(refreshMock).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(3_000);
    expect(refreshMock).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(6_000);
    expect(refreshMock).toHaveBeenCalledTimes(4);
  });

  it("polls while status is proposed (kickoff in flight)", () => {
    render(<TaskLivePoller status="proposed" />);
    vi.advanceTimersByTime(3_000);
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

  it("does NOT poll once status is succeeded", () => {
    render(<TaskLivePoller status="succeeded" />);
    vi.advanceTimersByTime(15_000);
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("does NOT poll for failed task", () => {
    render(<TaskLivePoller status="failed" />);
    vi.advanceTimersByTime(15_000);
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("does NOT poll for cancelled task", () => {
    render(<TaskLivePoller status="cancelled" />);
    vi.advanceTimersByTime(15_000);
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("stops polling after the 10-minute cap so a stuck agent doesn't burn cycles forever", () => {
    render(<TaskLivePoller status="running" />);
    // 10 minutes = 600,000 ms = 200 ticks at 3s
    vi.advanceTimersByTime(11 * 60 * 1000);
    const callsAtCap = refreshMock.mock.calls.length;
    // Advance another minute — count should not grow.
    vi.advanceTimersByTime(60_000);
    expect(refreshMock).toHaveBeenCalledTimes(callsAtCap);
    // And the cap kicks in around 200 calls, not a 100x runaway.
    expect(callsAtCap).toBeLessThan(220);
  });

  it("tears down the interval when the component unmounts", () => {
    const { unmount } = render(<TaskLivePoller status="running" />);
    vi.advanceTimersByTime(3_000);
    expect(refreshMock).toHaveBeenCalledTimes(1);
    unmount();
    vi.advanceTimersByTime(30_000);
    // No further refreshes after unmount.
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });
});
