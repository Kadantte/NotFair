"use client";

import { useCallback, useEffect, useState } from "react";
import type { McpToolSummary } from "@/components/chat/mcp-tools-sheet";
import type { ToolPermissionMode } from "@/lib/tool-permissions";

let cachedMcpTools: McpToolSummary[] | null = null;
let cachedPermissions: Record<string, ToolPermissionMode> | null = null;

async function fetchMcpTools(): Promise<McpToolSummary[]> {
  if (cachedMcpTools) return cachedMcpTools;
  const res = await fetch("/api/mcp", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list",
      params: {},
    }),
  });
  if (!res.ok) throw new Error(`tools/list failed (${res.status})`);
  const raw = await res.text();
  const dataLine = raw
    .split("\n")
    .map(l => l.trim())
    .find(l => l.startsWith("data: "));
  if (!dataLine) throw new Error("Empty MCP response");
  const payload = JSON.parse(dataLine.slice(6));
  const tools = payload?.result?.tools;
  if (!Array.isArray(tools)) throw new Error("Malformed MCP response");
  cachedMcpTools = tools.map((t: { name: string; description?: string; annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean } }) => ({
    name: t.name,
    description: t.description ?? "",
    readOnly: Boolean(t.annotations?.readOnlyHint),
    destructive: Boolean(t.annotations?.destructiveHint),
  }));
  return cachedMcpTools;
}

export function useMcpTools() {
  const [toolsOpen, setToolsOpen] = useState(false);
  const [tools, setTools] = useState<McpToolSummary[] | null>(cachedMcpTools);
  const [permissions, setPermissions] = useState<Record<string, ToolPermissionMode>>(
    cachedPermissions ?? {},
  );
  const [toolsLoading, setToolsLoading] = useState(false);
  const [toolsError, setToolsError] = useState<string | null>(null);

  const openTools = useCallback(async () => {
    setToolsOpen(true);
    if ((tools && cachedPermissions) || toolsLoading) return;
    setToolsLoading(true);
    setToolsError(null);
    try {
      const [fetched, permsRes] = await Promise.all([
        fetchMcpTools(),
        fetch("/api/chat/tool-permissions", { credentials: "include" }).then(r => r.json()),
      ]);
      setTools(fetched);
      const perms = (permsRes?.permissions ?? {}) as Record<string, ToolPermissionMode>;
      cachedPermissions = perms;
      setPermissions(perms);
    } catch (e) {
      setToolsError(e instanceof Error ? e.message : "Failed to load tools");
    } finally {
      setToolsLoading(false);
    }
  }, [tools, toolsLoading]);

  useEffect(() => {
    const onChanged = (e: Event) => {
      const detail = (e as CustomEvent<{ toolName: string; mode: ToolPermissionMode }>).detail;
      if (!detail) return;
      setPermissions(prev => {
        const next = { ...prev, [detail.toolName]: detail.mode };
        cachedPermissions = next;
        return next;
      });
    };
    window.addEventListener("tool-permissions-changed", onChanged);
    return () => window.removeEventListener("tool-permissions-changed", onChanged);
  }, []);

  const updatePermissions = useCallback(
    async (updates: Array<{ toolName: string; mode: ToolPermissionMode }>) => {
      setPermissions(prev => {
        const next = { ...prev };
        for (const u of updates) next[u.toolName] = u.mode;
        cachedPermissions = next;
        return next;
      });
      try {
        const res = await fetch("/api/chat/tool-permissions", {
          method: "PUT",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ updates }),
        });
        if (res.ok) {
          const body = await res.json();
          const perms = (body?.permissions ?? {}) as Record<string, ToolPermissionMode>;
          cachedPermissions = perms;
          setPermissions(perms);
        }
      } catch {
        // swallow — UI already reflects optimistic state
      }
    },
    [],
  );

  return {
    toolsOpen,
    setToolsOpen,
    tools,
    permissions,
    toolsLoading,
    toolsError,
    openTools,
    updatePermissions,
  };
}
