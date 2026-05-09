/**
 * Mint a personal access token (PAT) for the HighLevel MCP route.
 *
 * POST /api/integrations/gohighlevel/pat
 *   body: { connectionId?: number, label?: string }
 *
 * If `connectionId` is omitted, mints against the user's most recently-
 * updated connection (matches single-connection users' expectation).
 *
 * Response: `{ token, connectionId, createdAt }` — `token` is shown ONCE
 * and never retrievable again. Storage is SHA-256 of the plaintext.
 */
import { NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { identifyUser } from "@/lib/auth/identify-user";
import { issuePat } from "@/lib/gohighlevel/pat";
import { requireGhlDevAccessForApi } from "@/lib/gohighlevel/dev-gate";

export async function POST(request: Request) {
  // Dev-only feature — 404 for non-devs.
  const gate = await requireGhlDevAccessForApi();
  if (gate) return gate;

  const identity = await identifyUser({ source: "gohighlevel-pat-mint" });
  if (!identity) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  let body: { connectionId?: number; label?: string } = {};
  try {
    const text = await request.text();
    if (text) body = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  // Resolve which connection to mint against. Either:
  //   - the explicit connectionId, scoped to the current user; or
  //   - the user's most recent connection.
  let connection:
    | { id: number; userId: string; companyId: string | null; locationId: string | null; userType: string }
    | undefined;

  if (body.connectionId != null) {
    const id = Number(body.connectionId);
    if (!Number.isFinite(id) || id <= 0) {
      return NextResponse.json({ error: "invalid_connection_id" }, { status: 400 });
    }
    const [row] = await db()
      .select({
        id: schema.goHighLevelConnections.id,
        userId: schema.goHighLevelConnections.userId,
        companyId: schema.goHighLevelConnections.companyId,
        locationId: schema.goHighLevelConnections.locationId,
        userType: schema.goHighLevelConnections.userType,
      })
      .from(schema.goHighLevelConnections)
      .where(
        and(
          eq(schema.goHighLevelConnections.id, id),
          eq(schema.goHighLevelConnections.userId, identity.userId),
        ),
      )
      .limit(1);
    connection = row;
  } else {
    const [row] = await db()
      .select({
        id: schema.goHighLevelConnections.id,
        userId: schema.goHighLevelConnections.userId,
        companyId: schema.goHighLevelConnections.companyId,
        locationId: schema.goHighLevelConnections.locationId,
        userType: schema.goHighLevelConnections.userType,
      })
      .from(schema.goHighLevelConnections)
      .where(eq(schema.goHighLevelConnections.userId, identity.userId))
      .orderBy(desc(schema.goHighLevelConnections.updatedAt))
      .limit(1);
    connection = row;
  }

  if (!connection) {
    return NextResponse.json({ error: "no_connection" }, { status: 404 });
  }

  const { token, tokenHash } = issuePat(connection.id);

  await db()
    .insert(schema.goHighLevelAccessTokens)
    .values({
      connectionId: connection.id,
      userId: identity.userId,
      tokenHash,
      label: body.label ?? null,
      scopes: [],
    });

  return NextResponse.json({
    token,
    connectionId: connection.id,
    createdAt: new Date().toISOString(),
    note: "Save this token now — it will not be shown again.",
  });
}
