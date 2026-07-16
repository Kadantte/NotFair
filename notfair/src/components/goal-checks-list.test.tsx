// @vitest-environment jsdom
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GoalChecksList } from "@/components/goal-checks-list";
import type { CheckRow } from "@/server/goals/checks";

// Mock at the server-action boundary, per repo test conventions.
const loadMore = vi.hoisted(() => vi.fn());
vi.mock("@/server/actions/goals", () => ({
  loadMoreGoalChecksAction: loadMore,
}));

/** Capture IntersectionObserver callbacks so tests can trip the sentinel. */
let ioCallbacks: IntersectionObserverCallback[];
beforeEach(() => {
  ioCallbacks = [];
  loadMore.mockReset();
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(cb: IntersectionObserverCallback) {
        ioCallbacks.push(cb);
      }
      observe() {}
      disconnect() {}
      unobserve() {}
    },
  );
});
afterEach(() => vi.unstubAllGlobals());

function row(tick_number: number, over: Partial<CheckRow> = {}): CheckRow {
  return {
    id: `tick-${tick_number}`,
    goal_id: "g1",
    tick_number,
    trigger_kind: "heartbeat",
    session_id: null,
    metric_value: 10 + tick_number,
    metric_error: null,
    status: "done",
    summary: `summary ${tick_number}`,
    started_at: "2026-07-15T00:00:00.000Z",
    finished_at: "2026-07-15T00:01:00.000Z",
    prs: [],
    ...over,
  } as CheckRow;
}

const baseProps = {
  slug: "proj",
  agentSlug: "goal-1",
  goalId: "g1",
};

async function tripSentinel() {
  await act(async () => {
    for (const cb of ioCallbacks) {
      cb(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      );
    }
  });
}

describe("GoalChecksList", () => {
  it("renders the manual tag and PR pill on the right rows", () => {
    render(
      <GoalChecksList
        {...baseProps}
        initialRows={[
          row(2, { trigger_kind: "manual" }),
          row(1, {
            prs: [
              {
                id: "pr1",
                url: "https://github.com/acme/site/pull/67",
                title: "Fix titles",
                state: "merged",
              },
            ],
          }),
        ]}
        initialHasMore={false}
      />,
    );
    expect(screen.getByText("manually triggered")).toBeInTheDocument();
    const pill = screen.getByRole("link", { name: "PR #67 · merged" });
    expect(pill).toHaveAttribute("href", "https://github.com/acme/site/pull/67");
    // hasMore=false → no sentinel, no observer registered.
    expect(ioCallbacks).toHaveLength(0);
  });

  it("loads older checks past the cursor when the sentinel appears", async () => {
    loadMore.mockResolvedValueOnce({ rows: [row(2), row(1)], hasMore: false });
    render(
      <GoalChecksList
        {...baseProps}
        initialRows={[row(4), row(3)]}
        initialHasMore={true}
      />,
    );
    await tripSentinel();
    expect(loadMore).toHaveBeenCalledWith("g1", 3); // strictly older than shown
    expect(screen.getByText("summary 1")).toBeInTheDocument();
    expect(screen.getAllByText(/^Check/)).toHaveLength(4);
  });

  it("merges a refreshed first page without dropping loaded history", async () => {
    loadMore.mockResolvedValueOnce({ rows: [row(2), row(1)], hasMore: false });
    const { rerender } = render(
      <GoalChecksList
        {...baseProps}
        initialRows={[row(4), row(3)]}
        initialHasMore={true}
      />,
    );
    await tripSentinel();

    // The page's 5s auto-refresh re-sends a fresh first page — now with a
    // new check 5 and check 4 flipped from running to done.
    rerender(
      <GoalChecksList
        {...baseProps}
        initialRows={[row(5), row(4, { summary: "updated 4" }), row(3)]}
        initialHasMore={true}
      />,
    );
    expect(screen.getAllByText(/^Check/)).toHaveLength(5);
    expect(screen.getByText("updated 4")).toBeInTheDocument();
    expect(screen.getByText("summary 1")).toBeInTheDocument(); // history kept
  });
});
