import { loadEnvLocal } from "./_load-env";
loadEnvLocal();

import { eq, desc } from "drizzle-orm";
import { db, schema } from "@/lib/db";

const TARGET_EMAIL = process.argv[2] ?? "izhongyuting@gmail.com";

/**
 * Google OAuth refresh tokens don't expire on a schedule — they're either
 * still valid, or they've been revoked / invalidated (user revoked consent,
 * password change for sensitive scopes, 6 months of disuse, app stuck in
 * Testing mode hits 7-day cap, etc.). There's no equivalent of Meta's
 * `fb_exchange_token` "extend lifetime" call.
 *
 * What we CAN do is exchange the refresh token for a fresh access token —
 * that confirms the refresh token still works. If this returns 200 with an
 * access_token, the connection is healthy. If it returns invalid_grant /
 * 4xx, the user must re-OAuth.
 */
async function main() {
  const [sess] = await db()
    .select({ refreshToken: schema.mcpSessions.refreshToken, googleEmail: schema.mcpSessions.googleEmail, customerId: schema.mcpSessions.customerId })
    .from(schema.mcpSessions)
    .where(eq(schema.mcpSessions.googleEmail, TARGET_EMAIL))
    .orderBy(desc(schema.mcpSessions.id))
    .limit(1);

  if (!sess?.refreshToken) {
    console.error(`No mcp_sessions row with refresh_token for ${TARGET_EMAIL}`);
    process.exit(1);
  }
  console.log(`Found session for ${sess.googleEmail}, customerId=${sess.customerId}`);
  console.log(`Refresh token (first 16 chars) = ${sess.refreshToken.slice(0, 16)}…`);

  console.log("Exchanging refresh_token for fresh access_token via oauth2.googleapis.com …");
  // _load-env.ts doesn't strip inline `#` comments — strip them here so a
  // `KEY=value # note` line in .env.local doesn't poison the OAuth call.
  const stripInline = (v: string | undefined) => (v ?? "").replace(/\s+#.*$/, "").trim();
  const body = new URLSearchParams({
    client_id: stripInline(process.env.GOOGLE_ADS_CLIENT_ID),
    client_secret: stripInline(process.env.GOOGLE_ADS_CLIENT_SECRET),
    refresh_token: sess.refreshToken,
    grant_type: "refresh_token",
  });
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = (await res.json()) as Record<string, unknown>;

  if (!res.ok || json.error) {
    console.error("✗ Refresh FAILED:", res.status, json);
    process.exit(1);
  }

  const accessToken = String(json.access_token ?? "");
  const expiresIn = Number(json.expires_in ?? 0);
  const scope = String(json.scope ?? "");
  console.log(`✓ Refresh OK`);
  console.log(`  access_token (first 12 chars) = ${accessToken.slice(0, 12)}…`);
  console.log(`  expires_in = ${expiresIn}s (~${Math.round(expiresIn / 60)} min)`);
  console.log(`  scope = ${scope}`);
  console.log(`\nThe refresh token is healthy. Google rotates the access token (~1h) on every`);
  console.log(`refresh, but the refresh token itself is the long-lived credential and`);
  console.log(`doesn't need DB updates.`);
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
