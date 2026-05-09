/**
 * Disconnect a HighLevel connection.
 *
 * - DELETE /api/integrations/gohighlevel/disconnect — removes ALL of this
 *   user's GHL connections (used by the "Disconnect" button when only one
 *   is connected).
 * - DELETE /api/integrations/gohighlevel/disconnect?connectionId=42 —
 *   removes a specific connection by id (multi-location agency case).
 *
 * Cascades:
 *   - `gohighlevel_access_tokens` rows are removed via the FK ON DELETE
 *     CASCADE.
 *   - For agency rows, child per-location rows have `agency_connection_id`
 *     set to NULL via FK ON DELETE SET NULL — they survive on purpose so a
 *     re-OAuth can stitch them back together. Pass `cascade=true` to also
 *     remove the children.
 */
import { NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { identifyUser } from "@/lib/auth/identify-user";
import { requireGhlDevAccessForApi } from "@/lib/gohighlevel/dev-gate";

export async function DELETE(request: Request) {
  // Dev-only feature — 404 for non-devs (disconnect can't surface anything
  // a non-dev was supposed to access in the first place).
  const gate = await requireGhlDevAccessForApi();
  if (gate) return gate;

  const identity = await identifyUser({ source: "gohighlevel-disconnect" });
  if (!identity) {
    // 401 = needs login (no identity at all). 403 = identified but forbidden.
    // We're in the first case here; clients use the distinction to decide
    // whether to retry after a sign-in or surface a permission error.
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  const url = new URL(request.url);
  const connectionIdParam = url.searchParams.get("connectionId");
  const cascade = url.searchParams.get("cascade") === "true";

  // Find the rows we're about to delete (scoped to this user — never trust
  // the connectionId without confirming ownership).
  const targetIds: number[] = await (async () => {
    if (connectionIdParam) {
      const id = Number(connectionIdParam);
      if (!Number.isFinite(id) || id <= 0) return [];
      const [row] = await db()
        .select({ id: schema.goHighLevelConnections.id })
        .from(schema.goHighLevelConnections)
        .where(
          and(
            eq(schema.goHighLevelConnections.id, id),
            eq(schema.goHighLevelConnections.userId, identity.userId),
          ),
        )
        .limit(1);
      return row ? [row.id] : [];
    }
    const rows = await db()
      .select({ id: schema.goHighLevelConnections.id })
      .from(schema.goHighLevelConnections)
      .where(eq(schema.goHighLevelConnections.userId, identity.userId));
    return rows.map((r) => r.id);
  })();

  if (targetIds.length === 0) {
    return NextResponse.json({ ok: true, alreadyDisconnected: true });
  }

  // Optional: also remove child rows when explicitly requested.
  if (cascade) {
    const children = await db()
      .select({ id: schema.goHighLevelConnections.id })
      .from(schema.goHighLevelConnections)
      .where(
        and(
          eq(schema.goHighLevelConnections.userId, identity.userId),
          inArray(schema.goHighLevelConnections.agencyConnectionId, targetIds),
        ),
      );
    const childIds = children.map((c) => c.id);
    if (childIds.length > 0) targetIds.push(...childIds);
  }

  await db()
    .delete(schema.goHighLevelAccessTokens)
    .where(inArray(schema.goHighLevelAccessTokens.connectionId, targetIds));

  // Cascade: revoke any Claude consumer-OAuth tokens + outstanding auth codes
  // bound to these connections. Without this, an issued oat_gohighlevel_*
  // token would 401 (the JOIN against gohighlevel_connections fails) but rows
  // would linger in the DB.
  await db()
    .delete(schema.oauthAccessTokens)
    .where(inArray(schema.oauthAccessTokens.gohighlevelConnectionId, targetIds));
  await db()
    .delete(schema.authorizationCodes)
    .where(inArray(schema.authorizationCodes.gohighlevelConnectionId, targetIds));

  await db()
    .delete(schema.goHighLevelConnections)
    .where(inArray(schema.goHighLevelConnections.id, targetIds));

  return NextResponse.json({ ok: true, deleted: targetIds.length });
}
