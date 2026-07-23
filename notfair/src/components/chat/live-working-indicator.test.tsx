// @vitest-environment jsdom
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LiveWorkingIndicator } from "@/components/chat/live-working-indicator";
import type { TranscriptEvent } from "@/server/sessions/transcript-tail";

const BASE = 1_800_000_000_000;

const call = (id: string, ts: number, tcid: string): TranscriptEvent => ({
  kind: "tool_call",
  id,
  ts,
  tool_call_id: tcid,
  name: "shell",
  label: "pnpm test",
});
const lifecycle = (id: string, ts: number, phase: string): TranscriptEvent => ({
  kind: "lifecycle",
  id,
  ts,
  phase,
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(BASE);
});
afterEach(() => {
  vi.useRealTimers();
});

describe("LiveWorkingIndicator", () => {
  it("shows the in-flight committed tool and ticks the elapsed clock", () => {
    render(
      <LiveWorkingIndicator
        agentDisplayName="Growth agent"
        events={[call("c1", BASE - 5_000, "t1")]}
        turnStartedAt={BASE - 10_000}
      />,
    );
    // Elapsed anchors on the later of turn start and last event ts.
    // "Ran tests" shows as both the headline and the trajectory chip label.
    expect(screen.getAllByText("Ran tests").length).toBeGreaterThan(0);
    expect(screen.getByText("0:05")).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(2_000);
    });
    expect(screen.getByText("0:07")).toBeInTheDocument();
  });

  it("freezes into the completed state when the turn's done event lands", () => {
    render(
      <LiveWorkingIndicator
        agentDisplayName="Growth agent"
        events={[lifecycle("l1", BASE - 1_000, "done")]}
        turnStartedAt={BASE - 5_000}
      />,
    );
    const status = screen.getByRole("status", {
      name: "Growth agent Turn complete",
    });
    expect(status).toHaveAttribute("data-run-state", "complete");
    // Ended: no elapsed timer rendered or ticking.
    expect(status.querySelector(".tabular-nums")).toBeNull();
  });

  it("ignores a done event from before the current turn", () => {
    render(
      <LiveWorkingIndicator
        agentDisplayName="Growth agent"
        events={[
          lifecycle("l1", BASE - 60_000, "done"),
          call("c1", BASE - 2_000, "t1"),
        ]}
        turnStartedAt={BASE - 5_000}
      />,
    );
    expect(
      screen.getByRole("status", { name: "Growth agent Ran tests" }),
    ).toHaveAttribute("data-run-state", "running");
  });

  it("stays visibly running while pending SSE work outlives the done event", () => {
    render(
      <LiveWorkingIndicator
        agentDisplayName="Growth agent"
        events={[lifecycle("l1", BASE - 1_000, "done")]}
        turnStartedAt={BASE - 5_000}
        pendingTools={[
          {
            toolCallId: "t9",
            name: "mcp__X__runScript",
            label: null,
            result: null,
            ok: true,
            done: false,
          },
        ]}
      />,
    );
    expect(
      screen.getByRole("status", { name: "Growth agent Ran script" }),
    ).toHaveAttribute("data-run-state", "running");
  });

  it("surfaces the lifecycle phase during the pre-token wait", () => {
    render(
      <LiveWorkingIndicator
        agentDisplayName="Growth agent"
        events={[]}
        turnStartedAt={BASE - 3_000}
        lifecyclePhase="run.warming"
        hasPendingAssistant={false}
      />,
    );
    expect(
      screen.getByRole("status", { name: "Growth agent Warming up" }),
    ).toBeInTheDocument();
    // No events at all → elapsed anchors on turnStartedAt.
    expect(screen.getByText("0:03")).toBeInTheDocument();
  });
});
