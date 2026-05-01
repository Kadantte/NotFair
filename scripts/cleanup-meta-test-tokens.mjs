/**
 * Delete every `oat_meta_ads_test_*` bearer token. Pair to
 * mint-meta-test-token.mjs.
 *
 * USAGE:
 *   node --env-file=.env.local scripts/cleanup-meta-test-tokens.mjs
 */

import postgres from "postgres";

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
  const result = await sql`
    DELETE FROM oauth_access_tokens
    WHERE token LIKE 'oat_meta_ads_test_%'
  `;
  console.error(`Deleted ${result.count} test token(s).`);
} finally {
  await sql.end();
}
