import { NextResponse } from "next/server";
import { desc, eq, inArray, isNull, and } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { identifyUser } from "@/lib/auth/identify-user";

export async function GET() {
  const identity = await identifyUser();
  if (!identity) return NextResponse.json({ connected: false, connections: [] });

  const rows = await db()
    .select({
      id: schema.goHighLevelConnections.id,
      companyId: schema.goHighLevelConnections.companyId,
      locationId: schema.goHighLevelConnections.locationId,
      userType: schema.goHighLevelConnections.userType,
      companyName: schema.goHighLevelConnections.companyName,
      locationName: schema.goHighLevelConnections.locationName,
      scopes: schema.goHighLevelConnections.scopes,
      agencyConnectionId: schema.goHighLevelConnections.agencyConnectionId,
      uninstalledAt: schema.goHighLevelConnections.uninstalledAt,
      updatedAt: schema.goHighLevelConnections.updatedAt,
    })
    .from(schema.goHighLevelConnections)
    .where(eq(schema.goHighLevelConnections.userId, identity.userId))
    .orderBy(desc(schema.goHighLevelConnections.updatedAt));

  // Count active PATs per connection so the UI can show "N tokens issued".
  const connIds = rows.map((r) => r.id);
  const patRows = connIds.length === 0 ? [] : await db()
    .select({ connectionId: schema.goHighLevelAccessTokens.connectionId })
    .from(schema.goHighLevelAccessTokens)
    .where(
      and(
        inArray(schema.goHighLevelAccessTokens.connectionId, connIds),
        isNull(schema.goHighLevelAccessTokens.revokedAt),
      ),
    );
  const patCounts = patRows.reduce<Record<number, number>>((acc, r) => {
    acc[r.connectionId] = (acc[r.connectionId] ?? 0) + 1;
    return acc;
  }, {});

  const connections = rows.map((r) => ({
    ...r,
    activePatCount: patCounts[r.id] ?? 0,
  }));

  return NextResponse.json({ connected: connections.length > 0, connections });
}
