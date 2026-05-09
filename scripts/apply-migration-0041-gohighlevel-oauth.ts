/**
 * One-shot, transaction-safe application of
 * `drizzle/0041_gohighlevel_oauth_token_binding.sql`.
 *
 * Why a script instead of `drizzle-kit migrate`: the journal is stale (last
 * tracked migration is 0029); each post-0029 migration ships its own apply
 * runner so we don't accidentally re-apply earlier ones.
 *
 * Safety story:
 *   - ADD COLUMN IF NOT EXISTS is idempotent.
 *   - DROP CONSTRAINT IF EXISTS + ADD CONSTRAINT is idempotent: re-running
 *     the migration after success drops the new constraint and re-adds it
 *     identically. The transaction makes any failure atomic.
 *   - The new XOR check requires "exactly one of three is non-null". All
 *     existing rows have either session_id OR connection_id set and the new
 *     gohighlevel_connection_id NULL, so the constraint passes without any
 *     UPDATE — verified inside the transaction before commit.
 */
import postgres from "postgres";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

function loadEnvLocal() {
  const envPath = resolve(process.cwd(), ".env.local");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf-8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 0) continue;
    const k = t.slice(0, eq).trim();
    const v = t.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[k]) process.env[k] = v;
  }
}

async function main() {
  loadEnvLocal();
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("Missing DATABASE_URL — aborting.");
    process.exit(1);
  }

  const safeHost = (() => {
    try {
      const u = new URL(url);
      return `${u.hostname}:${u.port}${u.pathname}`;
    } catch {
      return "<unparseable>";
    }
  })();
  console.log(`[migrate] DATABASE_URL → ${safeHost}`);

  const sql = postgres(url, { prepare: false, max: 1 });

  try {
    // ─── Pre-flight ─────────────────────────────────────────────────
    const [{ count: preTokensCount }] = await sql<{ count: number }[]>`
      SELECT COUNT(*)::int AS count FROM oauth_access_tokens
    `;
    const [{ count: preCodesCount }] = await sql<{ count: number }[]>`
      SELECT COUNT(*)::int AS count FROM authorization_codes
    `;
    console.log(`[migrate] oauth_access_tokens row count (pre): ${preTokensCount}`);
    console.log(`[migrate] authorization_codes row count (pre): ${preCodesCount}`);

    const sqlPath = resolve(process.cwd(), "drizzle/0041_gohighlevel_oauth_token_binding.sql");
    const sqlText = readFileSync(sqlPath, "utf8");
    console.log(`[migrate] applying ${sqlPath}`);

    await sql.begin(async (tx) => {
      await tx.unsafe(sqlText);

      // ─── Post-checks inside the transaction ───────────────────────
      // Both new columns present.
      const colCheck = await tx<{ table_name: string; column_name: string }[]>`
        SELECT table_name, column_name FROM information_schema.columns
        WHERE column_name = 'gohighlevel_connection_id'
          AND table_name IN ('oauth_access_tokens', 'authorization_codes')
      `;
      const tables = new Set(colCheck.map(r => r.table_name));
      for (const t of ["oauth_access_tokens", "authorization_codes"]) {
        if (!tables.has(t)) {
          throw new Error(`[migrate] post-check failed: ${t}.gohighlevel_connection_id missing — rolling back`);
        }
      }

      // Both XOR constraints exist and are CHECK type.
      const conCheck = await tx<{ conname: string }[]>`
        SELECT conname FROM pg_constraint
        WHERE conname IN ('oauth_access_tokens_target_xor', 'authorization_codes_target_xor')
          AND contype = 'c'
      `;
      const conNames = new Set(conCheck.map(r => r.conname));
      for (const c of ["oauth_access_tokens_target_xor", "authorization_codes_target_xor"]) {
        if (!conNames.has(c)) {
          throw new Error(`[migrate] post-check failed: constraint ${c} missing — rolling back`);
        }
      }

      // Row counts unchanged — the migration must not have touched data.
      const [{ count: postTokensCount }] = await tx<{ count: number }[]>`
        SELECT COUNT(*)::int AS count FROM oauth_access_tokens
      `;
      const [{ count: postCodesCount }] = await tx<{ count: number }[]>`
        SELECT COUNT(*)::int AS count FROM authorization_codes
      `;
      if (postTokensCount !== preTokensCount || postCodesCount !== preCodesCount) {
        throw new Error(
          `[migrate] row-count drift: tokens ${preTokensCount}→${postTokensCount}, codes ${preCodesCount}→${postCodesCount} — rolling back`,
        );
      }
    });

    console.log("[migrate] OK");
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error("[migrate] FAILED:", err);
  process.exit(1);
});
