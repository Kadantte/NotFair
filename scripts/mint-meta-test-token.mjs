/**
 * Mint a short-lived `oat_meta_ads_test_*` bearer token bound to the most
 * recent Meta connection so we can run live integration tests without going
 * through the full OAuth dance with a connector.
 *
 * Prints the token to STDOUT. Caller is expected to pipe it into the env var
 * for the integration suite, then run `scripts/cleanup-meta-test-tokens.mjs`
 * (or just delete by prefix) once done.
 *
 * USAGE:
 *   node --env-file=.env.local scripts/mint-meta-test-token.mjs
 */

import postgres from "postgres";
import crypto from "node:crypto";

const url =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL_NON_POOLING ||
  process.env.POSTGRES_URL;
if (!url) {
  console.error("No DATABASE_URL/POSTGRES_URL_NON_POOLING/POSTGRES_URL");
  process.exit(2);
}
const sql = postgres(url, { ssl: "require" });

try {
  const [conn] = await sql`
    SELECT id, user_id, active_account_id
    FROM ad_platform_connections
    WHERE platform = 'meta_ads'
    ORDER BY id DESC
    LIMIT 1
  `;
  if (!conn) {
    console.error("No Meta connection found in ad_platform_connections.");
    process.exit(1);
  }

  const token = `oat_meta_ads_test_${crypto.randomBytes(24).toString("hex")}`;
  const RESOURCE_URL = "/api/mcp/meta_ads";

  await sql`
    INSERT INTO oauth_access_tokens (token, client_id, connection_id, session_id, resource_url, created_at)
    VALUES (${token}, 'meta-test', ${conn.id}, NULL, ${RESOURCE_URL}, NOW())
  `;

  // Token to STDOUT so the caller can capture it cleanly. Diagnostic info to
  // STDERR so it doesn't pollute the captured value.
  console.error(
    `Minted test token bound to connection_id=${conn.id} (user_id=${conn.user_id}, active_account_id=${conn.active_account_id})`,
  );
  console.error(
    "Delete after tests with: scripts/cleanup-meta-test-tokens.mjs (or DELETE WHERE token LIKE 'oat_meta_ads_test_%').",
  );
  console.log(token);
} finally {
  await sql.end();
}
