import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { identifyUser } from "@/lib/auth/identify-user";

export async function GET() {
  const identity = await identifyUser({ source: "gohighlevel-status" });
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
      updatedAt: schema.goHighLevelConnections.updatedAt,
    })
    .from(schema.goHighLevelConnections)
    .where(eq(schema.goHighLevelConnections.userId, identity.userId))
    .orderBy(desc(schema.goHighLevelConnections.updatedAt));

  return NextResponse.json({ connected: rows.length > 0, connections: rows });
}
