// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

const pathnameRef: { current: string } = { current: "/proj" };

vi.mock("next/navigation", () => ({
  usePathname: () => pathnameRef.current,
}));

vi.mock("@/components/ui/sidebar", () => ({
  SidebarMenu: ({ children }: { children: React.ReactNode }) => <ul>{children}</ul>,
  SidebarMenuItem: ({ children }: { children: React.ReactNode }) => <li>{children}</li>,
  SidebarMenuButton: ({
    children,
    isActive,
  }: {
    children: React.ReactNode;
    isActive?: boolean;
    asChild?: boolean;
  }) => (
    <div data-active={isActive ? "true" : "false"} data-testid="sidebar-button">
      {children}
    </div>
  ),
}));

import { AgentNav } from "./agent-nav";

const agents = [
  {
    key: "proj-cmo",
    slug: "cmo-greg",
    name: "Greg",
    role_label: "CMO",
    template_key: "cmo" as const,
  },
  {
    key: "proj-google-ads",
    slug: "google-ads-ana",
    name: "Ana",
    role_label: "Google Ads",
    template_key: "google_ads" as const,
  },
  {
    key: "proj-custom",
    slug: "custom",
    name: "Custom Bot",
  },
];

beforeEach(() => {
  pathnameRef.current = "/proj";
});

afterEach(() => {
  cleanup();
});

describe("AgentNav", () => {
  it("renders one entry per agent linking to the chat tab", () => {
    render(<AgentNav projectSlug="proj" agents={agents} />);
    // The link's accessible name includes the personal name + role pill
    // text, so /Greg|CMO/i / /Ana|Google Ads/i both match.
    expect(screen.getByRole("link", { name: /Greg/i })).toHaveAttribute(
      "href",
      "/proj/agents/cmo-greg/chat",
    );
    expect(screen.getByRole("link", { name: /Ana/i })).toHaveAttribute(
      "href",
      "/proj/agents/google-ads-ana/chat",
    );
    expect(screen.getByRole("link", { name: /Custom Bot/i })).toHaveAttribute(
      "href",
      "/proj/agents/custom/chat",
    );
  });

  it("marks the active agent when the pathname equals the agent base", () => {
    pathnameRef.current = "/proj/agents/cmo-greg";
    render(<AgentNav projectSlug="proj" agents={agents} />);
    const buttons = screen.getAllByTestId("sidebar-button");
    const cmoButton = buttons.find((b) => b.textContent?.includes("Greg"));
    expect(cmoButton?.getAttribute("data-active")).toBe("true");
    const customButton = buttons.find((b) => b.textContent?.includes("Custom Bot"));
    expect(customButton?.getAttribute("data-active")).toBe("false");
  });

  it("marks the active agent when the pathname is nested under the agent base", () => {
    pathnameRef.current = "/proj/agents/google-ads-ana/skills";
    render(<AgentNav projectSlug="proj" agents={agents} />);
    const buttons = screen.getAllByTestId("sidebar-button");
    const target = buttons.find((b) => b.textContent?.includes("Ana"));
    expect(target?.getAttribute("data-active")).toBe("true");
  });

  it("renders the red attention badge and deep-links to the blocked task", () => {
    render(
      <AgentNav
        projectSlug="proj"
        agents={agents}
        attention={{ "proj-cmo": { count: 1, task_id: "demo1-1" } }}
      />,
    );
    expect(
      screen.getByLabelText("1 waiting on your answer"),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Greg/i })).toHaveAttribute(
      "href",
      "/proj/agents/cmo-greg/tasks?task=demo1-1",
    );
    // Other agents keep the default chat link.
    expect(screen.getByRole("link", { name: /Ana/i })).toHaveAttribute(
      "href",
      "/proj/agents/google-ads-ana/chat",
    );
  });

  it("falls back to the Tasks tab when no waiting item is task-anchored", () => {
    render(
      <AgentNav
        projectSlug="proj"
        agents={agents}
        attention={{ "proj-cmo": { count: 2, task_id: null } }}
      />,
    );
    expect(
      screen.getByLabelText("2 waiting on your answer"),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Greg/i })).toHaveAttribute(
      "href",
      "/proj/agents/cmo-greg/tasks",
    );
  });

  it("renders no indicator at all when nothing needs the user", () => {
    render(<AgentNav projectSlug="proj" agents={agents} />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
