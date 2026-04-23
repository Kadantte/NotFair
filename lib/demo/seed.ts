import "server-only";

import { createHash, randomUUID } from "crypto";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import {
  DEMO_CUSTOMER_ID,
  DEMO_CUSTOMER_NAME,
  DEMO_OAUTH_CLIENT_ID,
  DEMO_OAUTH_CLIENT_SECRET,
  DEMO_REFRESH_TOKEN,
  DEMO_SESSION_MARKER,
} from "./constants";

const FAR_FUTURE_EXPIRY = "2099-12-31T23:59:59.999Z";

/**
 * Idempotently ensures the permanent demo OAuth setup exists:
 *
 *   1. A long-lived `mcp_sessions` row pinned to DEMO_CUSTOMER_ID, marked
 *      with client_name = DEMO_SESSION_MARKER so it's findable. Expiry is
 *      set to the year 2099 so it never rolls.
 *   2. An `oauth_clients` row with fixed DEMO_OAUTH_CLIENT_ID + secret,
 *      linked to the demo session.
 *
 * Running this multiple times is safe — it short-circuits when the rows
 * already exist and their shapes match. Used by:
 *   - the seed script (scripts/seed-demo-oauth.ts)
 *   - /api/oauth/authorize on first use of DEMO_OAUTH_CLIENT_ID
 */
export async function ensureDemoOAuthClient(): Promise<{
  clientId: string;
  clientSecret: string;
  sessionId: number;
  created: boolean;
}> {
  const customerIds = JSON.stringify([
    { id: DEMO_CUSTOMER_ID, name: DEMO_CUSTOMER_NAME },
  ]);
  const clientSecretHash = createHash("sha256")
    .update(DEMO_OAUTH_CLIENT_SECRET)
    .digest("hex");

  // Step 1: find-or-create the demo mcp_sessions row by its distinctive marker.
  const [existingSession] = await db()
    .select({ id: schema.mcpSessions.id })
    .from(schema.mcpSessions)
    .where(
      and(
        eq(schema.mcpSessions.clientName, DEMO_SESSION_MARKER),
        eq(schema.mcpSessions.customerId, DEMO_CUSTOMER_ID),
      ),
    )
    .limit(1);

  let sessionId: number;
  let sessionCreated = false;
  if (existingSession) {
    sessionId = existingSession.id;
  } else {
    const accessToken = `demo_session_${randomUUID()}`;
    const [inserted] = await db()
      .insert(schema.mcpSessions)
      .values({
        accessToken,
        refreshToken: DEMO_REFRESH_TOKEN,
        customerId: DEMO_CUSTOMER_ID,
        customerIds,
        loginCustomerId: null,
        userId: null,
        googleEmail: null,
        expiresAt: FAR_FUTURE_EXPIRY,
        clientName: DEMO_SESSION_MARKER,
        clientVersion: "1",
      })
      .returning({ id: schema.mcpSessions.id });
    sessionId = inserted.id;
    sessionCreated = true;
  }

  // Step 2: find-or-create the demo oauth_clients row.
  const [existingClient] = await db()
    .select({
      id: schema.oauthClients.id,
      clientSecretHash: schema.oauthClients.clientSecretHash,
      sessionId: schema.oauthClients.sessionId,
    })
    .from(schema.oauthClients)
    .where(eq(schema.oauthClients.clientId, DEMO_OAUTH_CLIENT_ID))
    .limit(1);

  let clientCreated = false;
  if (!existingClient) {
    await db().insert(schema.oauthClients).values({
      clientId: DEMO_OAUTH_CLIENT_ID,
      clientSecret: DEMO_OAUTH_CLIENT_SECRET,
      clientSecretHash,
      sessionId,
    });
    clientCreated = true;
  } else if (
    existingClient.clientSecretHash !== clientSecretHash ||
    existingClient.sessionId !== sessionId
  ) {
    // Repair: constants changed since the row was last written. Re-align
    // without dropping+recreating so any outstanding oauth_access_token
    // columns are preserved for in-flight reviewer sessions.
    await db()
      .update(schema.oauthClients)
      .set({
        clientSecret: DEMO_OAUTH_CLIENT_SECRET,
        clientSecretHash,
        sessionId,
      })
      .where(eq(schema.oauthClients.clientId, DEMO_OAUTH_CLIENT_ID));
  }

  return {
    clientId: DEMO_OAUTH_CLIENT_ID,
    clientSecret: DEMO_OAUTH_CLIENT_SECRET,
    sessionId,
    created: sessionCreated || clientCreated,
  };
}
