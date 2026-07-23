// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { GoalNeedsYouDialog } from "@/components/goal-needs-you";

// Mock at the server-action boundary, per repo test conventions.
const markHandled = vi.hoisted(() => vi.fn());
vi.mock("@/server/actions/goals", () => ({
  markUserActionHandledAction: markHandled,
}));

const refresh = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, push: vi.fn() }),
}));

const ITEMS = [
  {
    action_id: "a1",
    ask: "Replace the production OPENAI_API_KEY with one from an active project.",
    tick_number: 43,
    raised_at: new Date(Date.now() - 3_600_000).toISOString(),
  },
  {
    action_id: "a2",
    ask: "Grant the Meta app image-upload access and re-authorize.",
    tick_number: null,
    raised_at: new Date().toISOString(),
  },
];

beforeEach(() => {
  markHandled.mockReset();
  refresh.mockReset();
});

describe("GoalNeedsYouDialog", () => {
  it("renders no trigger when there are no open asks", () => {
    const { container } = render(
      <GoalNeedsYouDialog items={[]} projectSlug="acme" agentSlug="meta-errors" />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the badge count and lists every ask on open", () => {
    render(
      <GoalNeedsYouDialog items={ITEMS} projectSlug="acme" agentSlug="meta-errors" />,
    );
    const trigger = screen.getByRole("button", { name: /needs you\s*2/i });
    fireEvent.click(trigger);
    expect(screen.getByText(/OPENAI_API_KEY/)).toBeInTheDocument();
    expect(screen.getByText(/raised 1h ago · check #43/)).toBeInTheDocument();
    expect(screen.getByText(/Meta app image-upload access/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Details for check #43" })).toHaveAttribute(
      "href",
      "/acme/goals/meta-errors/checks/tick-43",
    );
    expect(screen.getByRole("link", { name: "Details in goal chat" })).toHaveAttribute(
      "href",
      "/acme/goals/meta-errors",
    );
  });

  it("marks an ask handled and refreshes", async () => {
    markHandled.mockResolvedValue({ ok: true });
    render(
      <GoalNeedsYouDialog items={ITEMS} projectSlug="acme" agentSlug="meta-errors" />,
    );
    fireEvent.click(screen.getByRole("button", { name: /needs you\s*2/i }));
    fireEvent.click(screen.getAllByRole("button", { name: /mark handled/i })[0]!);
    await waitFor(() => expect(markHandled).toHaveBeenCalledWith("a1"));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });
});
