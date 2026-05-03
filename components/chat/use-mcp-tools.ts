"use client";

import { useCallback, useEffect, useState } from "react";
import type { McpToolSummary } from "@/components/chat/mcp-tools-sheet";
import type { ToolPermissionMode } from "@/lib/tool-permissions";

// Per-platform tool cache so switching the active platform mid-session
// doesn't show the wrong list while the network call is in flight.
const cachedMcpToolsByPlatform = new Map<string, McpToolSummary[]>();
let cachedPermissions: Record<string, ToolPermissionMode> | null = null;

async function fetchMcpTools(platform: string | undefined): Promise<McpToolSummary[]> {
  const key = platform ?? "default";
  const hit = cachedMcpToolsByPlatform.get(key);
  if (hit) return hit;
  const url = platform
    ? `/api/chat/tools?platform=${encodeURIComponent(platform)}`
    : "/api/chat/tools";
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw new Error(`tools/list failed (${res.status})`);
  const payload = await res.json();
  const tools = payload?.tools;
  if (!Array.isArray(tools)) throw new Error("Malformed tools response");
  const summaries: McpToolSummary[] = tools.map(
    (t: { name: string; description?: string; readOnly?: boolean; destructive?: boolean }) => ({
      name: t.name,
      description: t.description ?? "",
      readOnly: Boolean(t.readOnly),
      destructive: Boolean(t.destructive),
    }),
  );
  cachedMcpToolsByPlatform.set(key, summaries);
  return summaries;
}

export function useMcpTools(platform?: string) {
  const platformKey = platform ?? "default";
  const [toolsOpen, setToolsOpen] = useState(false);
  const [tools, setTools] = useState<McpToolSummary[] | null>(
    cachedMcpToolsByPlatform.get(platformKey) ?? null,
  );
  const [permissions, setPermissions] = useState<Record<string, ToolPermissionMode>>(
    cachedPermissions ?? {},
  );
  const [toolsLoading, setToolsLoading] = useState(false);
  const [toolsError, setToolsError] = useState<string | null>(null);

  // When the platform prop changes (user toggled the navbar account
  // switcher), swap to the cached list for that platform and clear the
  // current one so the sheet doesn't flash the wrong tool set.
  useEffect(() => {
    const cached = cachedMcpToolsByPlatform.get(platformKey) ?? null;
    setTools(cached);
  }, [platformKey]);

  const openTools = useCallback(async () => {
    setToolsOpen(true);
    if ((cachedMcpToolsByPlatform.get(platformKey) && cachedPermissions) || toolsLoading) return;
    setToolsLoading(true);
    setToolsError(null);
    try {
      const [fetched, permsRes] = await Promise.all([
        fetchMcpTools(platform),
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
  }, [platform, platformKey, toolsLoading]);

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
