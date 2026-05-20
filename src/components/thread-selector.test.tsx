// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

import { ThreadSelector, type SessionLite } from "./thread-selector";

function openTrigger() {
  const trigger = screen.getByRole("button");
  fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false });
  fireEvent.click(trigger);
}

beforeEach(() => {
  pushMock.mockReset();
  // jsdom + radix dropdown rely on these primitives that older jsdom is missing.
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    writable: true,
    value: vi.fn(),
  });
  // Radix uses pointer events; jsdom lacks hasPointerCapture/setPointerCapture/releasePointerCapture
  Object.defineProperty(HTMLElement.prototype, "hasPointerCapture", {
    configurable: true,
    writable: true,
    value: () => false,
  });
  Object.defineProperty(HTMLElement.prototype, "setPointerCapture", {
    configurable: true,
    writable: true,
    value: () => {},
  });
  Object.defineProperty(HTMLElement.prototype, "releasePointerCapture", {
    configurable: true,
    writable: true,
    value: () => {},
  });
});

function makeSession(overrides: Partial<SessionLite> = {}): SessionLite {
  return {
    sessionId: "s-1",
    sessionKey: "agent:demo-cmo:s-1",
    label: "main",
    lastInteractionAt: Date.now() - 30_000,
    pending: false,
    ...overrides,
  };
}

describe("ThreadSelector trigger label", () => {
  it("renders 'Main thread' when active session.label is main", () => {
    const sessions = [makeSession({ label: "main" })];
    render(
      <ThreadSelector
        projectSlug="demo"
        agentSlug="cmo"
        sessions={sessions}
        activeSessionId="s-1"
      />,
    );
    expect(
      screen.getByRole("button", { name: /Main thread/ }),
    ).toBeInTheDocument();
  });

  it("renders 'New thread · <prefix>' for pending sessions", () => {
    const sessions = [
      makeSession({ pending: true, sessionId: "1234567890abcdef", label: "ignored" }),
    ];
    render(
      <ThreadSelector
        projectSlug="demo"
        agentSlug="cmo"
        sessions={sessions}
        activeSessionId="1234567890abcdef"
      />,
    );
    expect(
      screen.getByRole("button", { name: /New thread · 12345678/ }),
    ).toBeInTheDocument();
  });

  it("truncates long labels at 32 chars with an ellipsis", () => {
    const longLabel = "this-is-a-very-long-thread-label-that-exceeds-32-characters";
    const sessions = [makeSession({ label: longLabel })];
    render(
      <ThreadSelector
        projectSlug="demo"
        agentSlug="cmo"
        sessions={sessions}
        activeSessionId="s-1"
      />,
    );
    const trigger = screen.getByRole("button");
    expect(trigger.textContent).toContain(`${longLabel.slice(0, 32)}...`);
    expect(trigger.textContent).not.toContain(longLabel);
  });

  it("shows 'Pick a thread' when no active session matches", () => {
    render(
      <ThreadSelector
        projectSlug="demo"
        agentSlug="cmo"
        sessions={[makeSession()]}
        activeSessionId="not-here"
      />,
    );
    expect(
      screen.getByRole("button", { name: /Pick a thread/ }),
    ).toBeInTheDocument();
  });
});

describe("ThreadSelector dropdown interactions", () => {
  it("opens the menu and lists sessions including counts", async () => {
    const sessions = [
      makeSession({ sessionId: "s-1", label: "main" }),
      makeSession({
        sessionId: "s-2-other",
        label: "feature branch",
        lastInteractionAt: Date.now() - 3_600_000,
      }),
    ];
    render(
      <ThreadSelector
        projectSlug="demo"
        agentSlug="cmo"
        sessions={sessions}
        activeSessionId="s-1"
      />,
    );
    openTrigger();
    await waitFor(() => {
      expect(screen.getByText(/Threads \(2\)/)).toBeInTheDocument();
      expect(screen.getByText("feature branch")).toBeInTheDocument();
      // session id prefix appears in the menu line.
      expect(screen.getAllByText(/s-1/).length).toBeGreaterThan(0);
    });
  });

  it("shows 'No threads yet' when sessions array is empty", async () => {
    render(
      <ThreadSelector
        projectSlug="demo"
        agentSlug="cmo"
        sessions={[]}
        activeSessionId=""
      />,
    );
    openTrigger();
    await waitFor(() => {
      expect(screen.getByText("No threads yet")).toBeInTheDocument();
      expect(screen.getByText(/Threads \(0\)/)).toBeInTheDocument();
    });
  });

  it("clicking a non-active session pushes to its chat URL", async () => {
    const sessions = [
      makeSession({ sessionId: "s-1", label: "main" }),
      makeSession({ sessionId: "s-2", label: "draft" }),
    ];
    render(
      <ThreadSelector
        projectSlug="demo"
        agentSlug="cmo"
        sessions={sessions}
        activeSessionId="s-1"
      />,
    );
    openTrigger();
    await waitFor(() => {
      expect(screen.getByText("draft")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("draft"));
    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith("/demo/agents/cmo/chat/s-2");
    });
  });

  it("clicking the active session is a no-op (no router.push)", async () => {
    const sessions = [makeSession({ sessionId: "s-1", label: "main" })];
    render(
      <ThreadSelector
        projectSlug="demo"
        agentSlug="cmo"
        sessions={sessions}
        activeSessionId="s-1"
      />,
    );
    openTrigger();
    let menuitem: HTMLElement | null = null;
    await waitFor(() => {
      menuitem = screen.getByRole("menuitem", { name: /Main thread/ });
      expect(menuitem).toBeInTheDocument();
    });
    fireEvent.click(menuitem!);
    await new Promise((r) => setTimeout(r, 10));
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("clicking 'New thread' navigates to a fresh uuid", async () => {
    // Stub crypto.randomUUID for determinism.
    const uuid = "11111111-2222-3333-4444-555555555555";
    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      value: { randomUUID: () => uuid },
    });
    render(
      <ThreadSelector
        projectSlug="demo"
        agentSlug="cmo"
        sessions={[makeSession()]}
        activeSessionId="s-1"
      />,
    );
    openTrigger();
    await waitFor(() => {
      expect(screen.getByText("New thread")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("New thread"));
    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith(`/demo/agents/cmo/chat/${uuid}`);
    });
  });
});
