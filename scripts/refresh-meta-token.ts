import { loadEnvLocal } from "./_load-env";
loadEnvLocal();

import { and, eq, desc } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { exchangeForLongLivedToken } from "@/lib/meta-ads/oauth";

const TARGET_EMAIL = process.argv[2] ?? "izhongyuting@gmail.com";
const WRITE = process.argv.includes("--write");

async function main() {
  const [sess] = await db()
    .select({ userId: schema.mcpSessions.userId, googleEmail: schema.mcpSessions.googleEmail })
    .from(schema.mcpSessions)
    .where(eq(schema.mcpSessions.googleEmail, TARGET_EMAIL))
    .orderBy(desc(schema.mcpSessions.id))
    .limit(1);

  if (!sess?.userId) {
    console.error(`No mcp_sessions row found for ${TARGET_EMAIL}`);
    process.exit(1);
  }
  console.log(`Found userId=${sess.userId} for ${sess.googleEmail}`);

  const [conn] = await db()
    .select({
      id: schema.adPlatformConnections.id,
      refreshToken: schema.adPlatformConnections.refreshToken,
      accessTokenExpiresAt: schema.adPlatformConnections.accessTokenExpiresAt,
    })
    .from(schema.adPlatformConnections)
    .where(
      and(
        eq(schema.adPlatformConnections.userId, sess.userId),
        eq(schema.adPlatformConnections.platform, "meta_ads"),
      ),
    )
    .limit(1);

  if (!conn) {
    console.error(`No meta_ads connection found for userId=${sess.userId}`);
    process.exit(1);
  }
  console.log(`Connection id=${conn.id}, current expiresAt=${conn.accessTokenExpiresAt?.toISOString() ?? "null"}`);

  console.log("Calling Meta fb_exchange_token …");
  let result: { accessToken: string; expiresIn: number };
  try {
    result = await exchangeForLongLivedToken(conn.refreshToken);
  } catch (e) {
    console.error("Refresh FAILED:", e instanceof Error ? e.message : e);
    process.exit(1);
  }

  const newExpiresAt = new Date(Date.now() + result.expiresIn * 1000);
  const tokenChanged = result.accessToken !== conn.refreshToken;
  console.log(`✓ Refresh OK`);
  console.log(`  expires_in = ${result.expiresIn}s (~${Math.round(result.expiresIn / 86400)} days)`);
  console.log(`  newExpiresAt = ${newExpiresAt.toISOString()}`);
  console.log(`  token changed = ${tokenChanged}`);
  console.log(`  new token (first 12 chars) = ${result.accessToken.slice(0, 12)}…`);

  if (!WRITE) {
    console.log("\nDry run only — not writing to DB. Re-run with --write to persist.");
    return;
  }

  await db()
    .update(schema.adPlatformConnections)
    .set({
      refreshToken: result.accessToken,
      accessTokenExpiresAt: newExpiresAt,
      updatedAt: new Date(),
    })
    .where(eq(schema.adPlatformConnections.id, conn.id));
  console.log(`✓ Wrote new token + expiresAt to row id=${conn.id}`);
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
