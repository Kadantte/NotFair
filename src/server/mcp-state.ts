import { openclaw, OpenClawError } from "@/server/openclaw/cli";

/**
 * Read the merged state of a configured MCP server from OpenClaw + a fast
 * health probe. We keep this thin: source of truth is openclaw.json (the
 * config the CLI manages); we don't shadow-store tokens locally.
 *
 * `connection_state`:
 *  - "not_configured": no row in `openclaw mcp` for this key
 *  - "configured_no_token": row exists but lacks an Authorization header
 *  - "connected": row + token + probe succeeded
 *  - "stale_token": row + token but probe came back 401/403
 *  - "unreachable": row + token but probe failed (network/timeout/5xx)
 */

export type McpRuntimeStatus =
  | { state: "not_configured" }
  | { state: "configured_no_token"; url: string }
  | {
      state: "connected";
      url: string;
      tools_count: number | null;
      last_checked_at: string;
    }
  | {
      state: "stale_token";
      url: string;
      http_status: number;
      last_checked_at: string;
    }
  | {
      state: "unreachable";
      url: string;
      error: string;
      last_checked_at: string;
    };

type McpConfigRow = {
  url?: string;
  transport?: string;
  headers?: Record<string, string>;
};

async function readMcpConfig(key: string): Promise<McpConfigRow | null> {
  try {
    const out = await openclaw(["mcp", "show", key], { json: true });
    if (!out || typeof out !== "object") return null;
    return out as McpConfigRow;
  } catch (err) {
    // OpenClaw exits non-zero when the key is unknown — treat as "not configured".
    if (err instanceof OpenClawError) return null;
    throw err;
  }
}

function bearerFromHeaders(headers: Record<string, string> | undefined): string | null {
  if (!headers) return null;
  // Headers can arrive case-mixed; check both common spellings.
  const raw = headers.Authorization ?? headers.authorization;
  if (!raw) return null;
  const m = raw.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

export async function getMcpStatus(key: string): Promise<McpRuntimeStatus> {
  const config = await readMcpConfig(key);
  if (!config || !config.url) return { state: "not_configured" };
  const url = config.url;
  const token = bearerFromHeaders(config.headers);
  if (!token) return { state: "configured_no_token", url };
  return probe(url, token);
}

/**
 * Lightweight liveness probe. We POST a JSON-RPC `tools/list` — that's the
 * cheapest MCP call that exercises auth + transport in one round-trip.
 * 2s timeout: this is rendered server-side on the MCP tab and we'd rather
 * show "unreachable" than block the page.
 */
async function probe(url: string, token: string): Promise<McpRuntimeStatus> {
  const last_checked_at = new Date().toISOString();
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 2000);
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/list",
          params: {},
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(t);
    }
    if (res.status === 401 || res.status === 403) {
      return { state: "stale_token", url, http_status: res.status, last_checked_at };
    }
    if (!res.ok) {
      return {
        state: "unreachable",
        url,
        error: `HTTP ${res.status}`,
        last_checked_at,
      };
    }
    // MCP can stream SSE for tools/list. Either format carries the JSON in a
    // single frame, so a substring count of `"name"` is a decent
    // tool-count proxy without paying for full SSE parsing here.
    const text = await res.text();
    const tools_count = countTools(text);
    return { state: "connected", url, tools_count, last_checked_at };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { state: "unreachable", url, error: msg, last_checked_at };
  }
}

function countTools(payload: string): number | null {
  // Tools come as `{"name":"...","description":"...","inputSchema":{...}}`.
  // We don't fully parse SSE here — count occurrences of `"name":` inside a
  // `"tools":[...]` array to avoid double-counting server/client name fields.
  const idx = payload.indexOf('"tools"');
  if (idx < 0) return null;
  const slice = payload.slice(idx);
  const matches = slice.match(/"name"\s*:/g);
  if (!matches) return null;
  // Subtract 1 for any spurious match outside the array — heuristic, good
  // enough for UI display.
  return Math.max(0, matches.length);
}

export async function disconnectMcp(key: string): Promise<void> {
  try {
    await openclaw(["mcp", "unset", key], { json: false });
  } catch (err) {
    // If the row was already gone, treat as success — UI calls this on a
    // "Disconnect" button that should be idempotent.
    if (err instanceof OpenClawError && err.exitCode !== 0) {
      const msg = (err.stderr ?? "").toLowerCase();
      if (msg.includes("not found") || msg.includes("unknown")) return;
    }
    throw err;
  }
}

export async function setMcpBearer(
  key: string,
  url: string,
  token: string,
): Promise<void> {
  // Project scoping is via the openclaw key namespace alone (project slug
  // prefix). We deliberately do not write `codex.agents`: it only worked
  // for the Codex app-server runtime and was silently ignored on other
  // backends (DeepSeek, Claude, etc.), so its semantics were inconsistent.
  // Per-project tokens + project-prefixed keys give us a uniform "soft
  // isolation" model that's the same across every runtime.
  const config = {
    url,
    transport: "streamable-http",
    headers: { Authorization: `Bearer ${token}` },
  };
  await openclaw(["mcp", "set", key, JSON.stringify(config)], { json: false });
}
