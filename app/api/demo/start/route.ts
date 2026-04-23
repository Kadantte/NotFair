import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { setSessionCookies } from "@/lib/auth-cookies";
import { DEMO_CUSTOMER_ID, DEMO_CUSTOMER_NAME, DEMO_REFRESH_TOKEN } from "@/lib/demo/constants";

/**
 * Starts a demo session. Creates an mcp_sessions row with the sentinel
 * DEMO_CUSTOMER_ID, sets the access-token cookie, and redirects the client
 * to /dashboard. No OAuth, no real Google Ads data, no persistent state
 * beyond the session row (which expires in 30 days).
 *
 * Safe to call repeatedly: each call issues a fresh token. Prior demo
 * sessions remain in mcp_sessions until TTL cleanup — they're not linked
 * to a real user and contain no real credentials.
 */
export async function POST() {
  const token = randomUUID();
  // 30-day window matches ordinary session lifetime.
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const customerIds = JSON.stringify([{ id: DEMO_CUSTOMER_ID, name: DEMO_CUSTOMER_NAME }]);

  await db().insert(schema.mcpSessions).values({
    accessToken: token,
    refreshToken: DEMO_REFRESH_TOKEN,
    customerId: DEMO_CUSTOMER_ID,
    customerIds,
    loginCustomerId: null,
    userId: null,
    googleEmail: null,
    expiresAt,
    clientName: "demo",
    clientVersion: "1",
  });

  const response = NextResponse.json({ ok: true, redirectUrl: "/dashboard" });
  setSessionCookies(response, token, DEMO_CUSTOMER_NAME);
  return response;
}
