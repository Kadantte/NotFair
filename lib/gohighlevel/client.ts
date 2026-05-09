/**
 * Thin HighLevel API client used by the MCP tool surface.
 *
 * Resolves a valid access token via `getValidAccessToken`, sets the required
 * `Version` header, and exposes `ghlGet` / `ghlPost` plus a generic `ghl`
 * caller. Errors include the HTTP status and HighLevel's `message` field
 * when present so MCP tool handlers can surface useful errors back to the
 * agent.
 */
import { getValidAccessToken, GHL_API_VERSION } from "./oauth";

const BASE_URL = "https://services.leadconnectorhq.com";

export type GhlRequestOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  query?: Record<string, string | number | boolean | undefined | null>;
  body?: unknown;
  /** Override API version on a per-call basis (some endpoints require newer dates). */
  version?: string;
};

export class GhlApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, message: string, body: unknown) {
    super(`HighLevel API ${status}: ${message}`);
    this.name = "GhlApiError";
    this.status = status;
    this.body = body;
  }
}

function buildUrl(path: string, query?: GhlRequestOptions["query"]): string {
  const url = new URL(path.startsWith("/") ? path : `/${path}`, BASE_URL);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined || v === null) continue;
      url.searchParams.set(k, String(v));
    }
  }
  return url.toString();
}

export async function ghlRequest<T = unknown>(
  connectionId: number,
  path: string,
  opts: GhlRequestOptions = {},
): Promise<T> {
  const accessToken = await getValidAccessToken(connectionId);
  const method = opts.method ?? "GET";
  const url = buildUrl(path, opts.query);

  const headers: Record<string, string> = {
    Accept: "application/json",
    Authorization: `Bearer ${accessToken}`,
    Version: opts.version ?? GHL_API_VERSION,
  };
  let body: BodyInit | undefined;
  if (opts.body !== undefined && method !== "GET") {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.body);
  }

  const res = await fetch(url, { method, headers, body });
  const text = await res.text();
  let parsed: unknown = undefined;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }
  if (!res.ok) {
    const message =
      parsed && typeof parsed === "object" && "message" in (parsed as Record<string, unknown>)
        ? String((parsed as Record<string, unknown>).message)
        : `HTTP ${res.status}`;
    throw new GhlApiError(res.status, message, parsed);
  }
  return parsed as T;
}

export function ghlGet<T = unknown>(
  connectionId: number,
  path: string,
  query?: GhlRequestOptions["query"],
  opts: { version?: string } = {},
): Promise<T> {
  return ghlRequest<T>(connectionId, path, { method: "GET", query, version: opts.version });
}

export function ghlPost<T = unknown>(
  connectionId: number,
  path: string,
  body?: unknown,
  opts: { version?: string } = {},
): Promise<T> {
  return ghlRequest<T>(connectionId, path, { method: "POST", body, version: opts.version });
}
