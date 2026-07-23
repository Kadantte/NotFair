// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { McpToolsDialog } from "@/components/mcp-tools-dialog";
import type { ToolSummary } from "@/server/mcp-server/tool-summaries";

const TOOLS: ToolSummary[] = [
  {
    name: "createCampaign",
    description: "Create a Google Ads campaign.",
    args: [
      {
        name: "name",
        type: "string",
        required: true,
        description: "Campaign name.",
      },
      {
        name: "status",
        type: "enum: ENABLED | PAUSED",
        required: false,
        description: "",
      },
    ],
  },
  {
    name: "listKeywords",
    description: "List keywords in an ad group.",
    args: [],
  },
];

describe("McpToolsDialog with eager tools", () => {
  it("renders the tool count, arg grid, and required markers", () => {
    render(
      <McpToolsDialog
        open
        onOpenChange={vi.fn()}
        mcpName="NotFair Google Ads"
        mcpDescription="Campaigns, bids, keywords."
        tools={TOOLS}
      />,
    );
    expect(screen.getByText("NotFair Google Ads")).toBeInTheDocument();
    expect(screen.getByText("2 tools")).toBeInTheDocument();
    expect(screen.getByText("Campaigns, bids, keywords.")).toBeInTheDocument();
    expect(screen.getByText("createCampaign")).toBeInTheDocument();
    expect(screen.getByText("1/2 required")).toBeInTheDocument();
    expect(screen.getByLabelText("required")).toBeInTheDocument();
    expect(screen.getByText("enum: ENABLED | PAUSED")).toBeInTheDocument();
    // Empty arg description falls back to the italic placeholder.
    expect(screen.getByText("no description")).toBeInTheDocument();
  });

  it("filters tools by name, description, and arg names", () => {
    render(
      <McpToolsDialog
        open
        onOpenChange={vi.fn()}
        mcpName="Ads"
        tools={TOOLS}
      />,
    );
    const search = screen.getByLabelText("Search tools");

    fireEvent.change(search, { target: { value: "keyword" } });
    expect(screen.getByText("listKeywords")).toBeInTheDocument();
    expect(screen.queryByText("createCampaign")).toBeNull();

    // Matches createCampaign via its `status` arg name.
    fireEvent.change(search, { target: { value: "status" } });
    expect(screen.getByText("createCampaign")).toBeInTheDocument();
    expect(screen.queryByText("listKeywords")).toBeNull();

    fireEvent.change(search, { target: { value: "zzz-no-match" } });
    expect(screen.getByText(/No tools match/)).toBeInTheDocument();
    expect(screen.getByText("zzz-no-match")).toBeInTheDocument();
  });

  it("says so when the MCP exposes no tools", () => {
    render(
      <McpToolsDialog open onOpenChange={vi.fn()} mcpName="Empty" tools={[]} />,
    );
    expect(screen.getByText("This MCP exposes no tools.")).toBeInTheDocument();
    expect(screen.getByText("0 tools")).toBeInTheDocument();
  });
});

describe("McpToolsDialog lazy loading", () => {
  it("loads once on first open and caches the result", async () => {
    const loadTools = vi
      .fn()
      .mockResolvedValue({ ok: true, tools: [TOOLS[1]] });
    const { rerender } = render(
      <McpToolsDialog
        open={false}
        onOpenChange={vi.fn()}
        mcpName="Ext"
        loadTools={loadTools}
      />,
    );
    expect(loadTools).not.toHaveBeenCalled();

    rerender(
      <McpToolsDialog
        open
        onOpenChange={vi.fn()}
        mcpName="Ext"
        loadTools={loadTools}
      />,
    );
    expect(await screen.findByText("listKeywords")).toBeInTheDocument();
    expect(loadTools).toHaveBeenCalledTimes(1);

    // Close and reopen — the cached list is reused, no second fetch.
    rerender(
      <McpToolsDialog
        open={false}
        onOpenChange={vi.fn()}
        mcpName="Ext"
        loadTools={loadTools}
      />,
    );
    rerender(
      <McpToolsDialog
        open
        onOpenChange={vi.fn()}
        mcpName="Ext"
        loadTools={loadTools}
      />,
    );
    expect(screen.getByText("listKeywords")).toBeInTheDocument();
    expect(loadTools).toHaveBeenCalledTimes(1);
  });

  it("shows the loader error", async () => {
    const loadTools = vi
      .fn()
      .mockResolvedValue({ ok: false, error: "MCP unreachable" });
    render(
      <McpToolsDialog
        open
        onOpenChange={vi.fn()}
        mcpName="Ext"
        loadTools={loadTools}
      />,
    );
    expect(await screen.findByText("MCP unreachable")).toBeInTheDocument();
  });

  it("shows a thrown loader failure as an error message", async () => {
    const loadTools = vi.fn().mockRejectedValue(new Error("network down"));
    render(
      <McpToolsDialog
        open
        onOpenChange={vi.fn()}
        mcpName="Ext"
        loadTools={loadTools}
      />,
    );
    expect(await screen.findByText("network down")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByText(/Fetching tool list/)).toBeNull(),
    );
  });
});
