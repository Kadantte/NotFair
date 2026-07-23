// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { WorkingIndicator, type WorkingPhase } from "@/components/working-indicator";

const phase = (id: string, state: WorkingPhase["state"]): WorkingPhase => ({
  id,
  label: `phase ${id}`,
  state,
});

describe("WorkingIndicator (top-up)", () => {
  it("shows only the last three phases with per-state icons", () => {
    const { container } = render(
      <WorkingIndicator
        agentDisplayName="Agent"
        headline="Thinking"
        subtitle="Ran tests ✓"
        phases={[
          phase("p1", "done"),
          phase("p2", "done"),
          phase("p3", "failed"),
          phase("p4", "done"),
          phase("p5", "active"),
        ]}
        elapsedMs={5_000}
        mood="waiting"
      />,
    );
    // Sliced to the trailing three.
    expect(screen.queryByText("phase p1")).toBeNull();
    expect(screen.queryByText("phase p2")).toBeNull();
    expect(screen.getByText("phase p3")).toBeInTheDocument();
    expect(screen.getByText("phase p5")).toBeInTheDocument();
    // One list item per visible phase.
    expect(container.querySelectorAll("li")).toHaveLength(3);
    // Subtitle renders below the headline.
    expect(screen.getByText("Ran tests ✓")).toBeInTheDocument();
    // Sub-minute elapsed formatting.
    expect(screen.getByText("0:05")).toBeInTheDocument();
  });

  it("omits the timer when elapsed is null and the phase list when empty", () => {
    const { container } = render(
      <WorkingIndicator
        agentDisplayName="Agent"
        headline="Starting"
        subtitle={null}
        phases={[]}
        elapsedMs={null}
        mood="waiting"
      />,
    );
    expect(container.querySelector("ol")).toBeNull();
    expect(container.querySelector(".tabular-nums")).toBeNull();
    expect(screen.getByRole("status", { name: "Agent Starting" })).toHaveAttribute(
      "data-run-state",
      "running",
    );
  });
});
