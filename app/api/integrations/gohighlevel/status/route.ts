import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { and, desc, eq, gte } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { COOKIE_NAMES } from "@/lib/auth-cookies";

export async function GET() {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(COOKIE_NAMES.token)?.value;
  if (!sessionToken) return NextResponse.json({ connected: false, connections: [] });

  const [session] = await db()
    .select({ userId: schema.mcpSessions.userId })
    .from(schema.mcpSessions)
    .where(
      and(
        eq(schema.mcpSessions.accessToken, sessionToken),
        gte(schema.mcpSessions.expiresAt, new Date().toISOString()),
      ),
    )
    .limit(1);

  if (!session?.userId) return NextResponse.json({ connected: false, connections: [] });

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
    .where(eq(schema.goHighLevelConnections.userId, session.userId))
    .orderBy(desc(schema.goHighLevelConnections.updatedAt));

  return NextResponse.json({ connected: rows.length > 0, connections: rows });
}
