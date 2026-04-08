import { randomBytes, createHash } from "crypto";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { and, eq, gte, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { COOKIE_NAMES } from "@/lib/auth-cookies";

async function getActiveSession() {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(COOKIE_NAMES.token)?.value;

  if (!sessionToken) return null;

  const [session] = await db()
    .select({ id: schema.mcpSessions.id, customerId: schema.mcpSessions.customerId })
    .from(schema.mcpSessions)
    .where(
      and(
        eq(schema.mcpSessions.accessToken, sessionToken),
        gte(schema.mcpSessions.expiresAt, new Date().toISOString()),
        sql`${schema.mcpSessions.customerId} <> ''`,
      ),
    )
    .limit(1);

  return session ?? null;
}

/**
 * Check if the user already has OAuth client credentials.
 */
export async function GET() {
  const session = await getActiveSession();
  if (!session) {
    return NextResponse.json({ exists: false });
  }

  const [existing] = await db()
    .select({
      clientId: schema.oauthClients.clientId,
      clientSecret: schema.oauthClients.clientSecret,
      createdAt: schema.oauthClients.createdAt,
    })
    .from(schema.oauthClients)
    .where(eq(schema.oauthClients.sessionId, session.id))
    .limit(1);

  if (!existing) {
    return NextResponse.json({ exists: false });
  }

  return NextResponse.json({
    exists: true,
    client_id: existing.clientId,
    client_secret: existing.clientSecret,
    mcp_server_url: "https://adsagent.org/api/mcp",
  });
}

/**
 * Generate OAuth client credentials for the Claude Connector.
 *
 * The user must be logged in (have an adsagent_token cookie with
 * a valid, fully-connected MCP session). Returns a client_id and
 * client_secret that the user pastes into Claude's custom connector form.
 */
export async function POST() {
  const session = await getActiveSession();

  if (!session) {
    return NextResponse.json(
      { error: "No active Google Ads session. Connect your account first." },
      { status: 403 },
    );
  }

  // Generate credentials
  const clientId = `adsagent_${randomBytes(16).toString("hex")}`;
  const clientSecret = randomBytes(32).toString("hex");
  const clientSecretHash = createHash("sha256").update(clientSecret).digest("hex");

  // Delete any existing client for this session (one active client per session)
  await db()
    .delete(schema.oauthClients)
    .where(eq(schema.oauthClients.sessionId, session.id));

  await db().insert(schema.oauthClients).values({
    clientId,
    clientSecret,
    clientSecretHash,
    sessionId: session.id,
  });

  return NextResponse.json({
    client_id: clientId,
    client_secret: clientSecret,
    mcp_server_url: "https://adsagent.org/api/mcp",
  });
}
