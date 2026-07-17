"use server";

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { workspaceDirFor } from "@/server/agents/provisioning";
import { resolveSessionForThread } from "@/server/sessions/transcript-tail";
import { listTranscriptEvents } from "@/server/sessions/index";
import { listProjectMcpTokens } from "@/server/mcp/tokens";
import { mcpRpcAutoRefresh } from "@/server/mcp/rpc";
import { getOrCreateMcpServerSecret } from "@/server/mcp-server/secret";

/**
 * Assemble an estimated breakdown of what sits in a goal agent's context
 * window: workspace instruction files, MCP tool schemas, and the thread's
 * conversation. Token counts are ESTIMATES (~4 chars/token) — the harness
 * doesn't expose its real accounting — and the UI says so.
 */

export type ContextChunk = {
  key: string;
  label: string;
  group: "instructions" | "tools" | "conversation";
  chars: number;
  tokens: number;
  content: string;
  /** How the UI should display `content`: prose renders as markdown. */
  format: "markdown" | "json";
  note?: string;
};

export type GoalContextResult =
  | { ok: true; chunks: ContextChunk[]; total_tokens: number }
  | { ok: false; error: string };

const est = (chars: number) => Math.ceil(chars / 4);

function chunk(
  key: string,
  label: string,
  group: ContextChunk["group"],
  content: string,
  note?: string,
  format: ContextChunk["format"] = "markdown",
): ContextChunk {
  return { key, label, group, chars: content.length, tokens: est(content.length), content, format, note };
}

async function readWorkspaceFile(agent_id: string, name: string): Promise<string | null> {
  try {
    return await readFile(join(workspaceDirFor(agent_id), name), "utf8");
  } catch {
    return null;
  }
}

type ToolsListResult = {
  tools?: Array<{ name: string; description?: string; inputSchema?: unknown }>;
};

/** tools/list against one of our internal loopback MCP servers. */
async function internalToolsList(path: string): Promise<ToolsListResult | null> {
  const port = process.env.NOTFAIR_PORT?.trim() || "3326";
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/mcp/${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        Authorization: `Bearer ${getOrCreateMcpServerSecret()}`,
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
    });
    const text = await res.text();
    // The route may answer as SSE; take the last data: line in that case.
    const raw = text.startsWith("event:") || text.includes("\ndata:")
      ? text.split("\n").filter((l) => l.startsWith("data:")).pop()?.slice(5)
      : text;
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { result?: ToolsListResult };
    return parsed.result ?? null;
  } catch {
    return null;
  }
}

function toolsChunk(key: string, label: string, result: ToolsListResult | null): ContextChunk | null {
  if (!result?.tools || result.tools.length === 0) return null;
  const content = JSON.stringify(result.tools, null, 2);
  return chunk(
    `tools:${key}`,
    `${label} · ${result.tools.length} tools`,
    "tools",
    content,
    "Tool name + description + input schema, as the harness receives them.",
    "json",
  );
}

export async function getGoalContextAction(input: {
  project_slug: string;
  agent_id: string;
  thread: string;
}): Promise<GoalContextResult> {
  const { project_slug, agent_id, thread } = input;
  try {
    const chunks: ContextChunk[] = [];

    // ── Instruction files ─────────────────────────────────────────
    const identity = await readWorkspaceFile(agent_id, "IDENTITY.md");
    if (identity) {
      // The shared-context section sits mid-file; carve out exactly that
      // section (up to the next `## ` heading) and keep the rest together.
      const marker = "\n## Shared workspace context";
      const start = identity.indexOf(marker);
      const end = start >= 0 ? identity.indexOf("\n## ", start + marker.length) : -1;
      if (start >= 0) {
        const shared = end >= 0 ? identity.slice(start, end) : identity.slice(start);
        const rest = end >= 0
          ? identity.slice(0, start) + identity.slice(end)
          : identity.slice(0, start);
        chunks.push(
          chunk("identity", "Agent instructions (identity + goal protocol)", "instructions", rest.trim(),
            "Auto-loaded by the harness at every turn (AGENTS.md / CLAUDE.md)."),
          chunk("shared-context", "Shared workspace context", "instructions", shared.trim(),
            "The PROJECT.md brief, inlined into the identity. Shared by every goal in this workspace."),
        );
      } else {
        chunks.push(
          chunk("identity", "Agent instructions (identity + goal protocol)", "instructions", identity,
            "Auto-loaded by the harness at every turn (AGENTS.md / CLAUDE.md)."),
        );
      }
    }
    // ── MCP tool definitions ──────────────────────────────────────
    const goalTools = toolsChunk("notfair-goals", "Goal tools (notfair-goals)", await internalToolsList("goals"));
    if (goalTools) chunks.push(goalTools);
    const browserTools = toolsChunk("notfair-browser", "Browser tools (notfair-browser)", await internalToolsList("browser"));
    if (browserTools) chunks.push(browserTools);

    for (const token of listProjectMcpTokens(project_slug)) {
      const rpc = await mcpRpcAutoRefresh<ToolsListResult>(
        project_slug, token.server_name, "tools/list", {}, { timeoutMs: 10_000 },
      );
      const c = toolsChunk(token.server_name, `Connected tools (${token.server_name})`, rpc.ok ? rpc.result : null);
      if (c) chunks.push(c);
    }

    // ── Conversation (this thread) ────────────────────────────────
    const session = resolveSessionForThread(project_slug, agent_id, thread);
    if (session) {
      const events = listTranscriptEvents(session.id, { limit: 10_000 });
      let briefs = "", userMsgs = "", replies = "", toolActivity = "";
      for (const e of events) {
        let payload: Record<string, unknown> = {};
        try { payload = JSON.parse(e.payload_json) as Record<string, unknown>; } catch { /* skip */ }
        if (e.kind === "user") {
          const text = typeof payload.text === "string" ? payload.text : "";
          const source = typeof payload.source === "string" ? payload.source : "";
          if (source.startsWith("goal-")) briefs += text + "\n\n";
          else userMsgs += text + "\n\n";
        } else if (e.kind === "final") {
          const text = typeof payload.text === "string" ? payload.text : "";
          replies += text + "\n\n";
        } else if (e.kind === "tool") {
          toolActivity += e.payload_json + "\n";
        }
      }
      if (briefs) {
        chunks.push(chunk("briefs", "Platform briefs (intake + checks)", "conversation", briefs.trim(),
          "The [INTAKE] and [TICK] messages the platform sends the agent."));
      }
      if (userMsgs) chunks.push(chunk("user", "Your messages", "conversation", userMsgs.trim()));
      if (replies) chunks.push(chunk("replies", "Agent replies", "conversation", replies.trim()));
      if (toolActivity) {
        chunks.push(chunk("tool-activity", "Tool activity (logged)", "conversation", toolActivity.trim(),
          "NotFair logs tool calls + result summaries. The harness keeps FULL tool outputs in its own context, so the real share is larger.",
          "json"));
      }
    }

    const total_tokens = chunks.reduce((a, c) => a + c.tokens, 0);
    return { ok: true, chunks, total_tokens };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
