import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";

/**
 * Client-identity helpers used by the MCP factory to attribute traffic.
 * Lifted out of `handler-factory.ts` with no behavior change.
 */

/**
 * The `mcp-remote` wrapper (used by the Claude Code plugin) does not forward
 * the downstream client's clientInfo.name through the MCP handshake — every
 * such request arrives tagged `mcp-remote-fallback-test`. Without this
 * normalization, ~100% of Claude Code traffic is mis-attributed and surface
 * analyses are broken.
 */
export function normalizeClientName(
  rawName: string,
  authMethod: string | null | undefined,
  userAgent: string | null | undefined,
): string {
  if (rawName !== "mcp-remote-fallback-test") return rawName;
  if (authMethod === "direct") return "claude-code";
  const ua = userAgent?.toLowerCase() ?? "";
  if (ua.includes("claude-code")) return "claude-code";
  return rawName;
}

/**
 * Best-effort capture of clientInfo from an MCP `initialize` request body.
 * Persists `clientName` / `clientVersion` onto the bound `mcp_sessions` row
 * so subsequent telemetry can attribute traffic. Never throws — tracking
 * failures must not block the request.
 */
export async function captureClientInfo(
  cloned: Request,
  sessionId: number,
  authMethod: string | null | undefined,
  userAgent: string | null | undefined,
): Promise<void> {
  try {
    const body = await cloned.json();
    if (body?.method !== "initialize") return;
    const rawName = body?.params?.clientInfo?.name;
    const clientVersion = body?.params?.clientInfo?.version;
    if (typeof rawName !== "string" || !rawName) return;
    const clientName = normalizeClientName(rawName, authMethod, userAgent);
    await db()
      .update(schema.mcpSessions)
      .set({
        clientName,
        clientVersion: typeof clientVersion === "string" ? clientVersion : null,
      })
      .where(eq(schema.mcpSessions.id, sessionId));
  } catch {
    // Never block the request for tracking failures
  }
}
