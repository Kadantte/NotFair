/**
 * One-shot, transaction-safe application of
 * `drizzle/0040_gohighlevel_mcp_and_install.sql`.
 *
 * Why a script instead of `drizzle-kit migrate`: the journal is stale (last
 * tracked migration is 0029, but 0030+ are already on the live DB). Running
 * `drizzle-kit migrate` would try to re-apply 0030+ in journal-order. We run
 * just 0040 explicitly here, with pre/post verification and a transaction
 * wrapper so any failure rolls back atomically.
 *
 * Safety story:
 *   - CREATE TABLE / ADD COLUMN are guarded with IF NOT EXISTS (idempotent).
 *   - CREATE [UNIQUE] INDEX is guarded with IF NOT EXISTS.
 *   - No DROP, no DELETE, no rewrite of existing data.
 *   - All work runs inside a single BEGIN…COMMIT. If any post-check fails the
 *     transaction rolls back atomically.
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
    const [{ count: preConnCount }] = await sql<{ count: number }[]>`
      SELECT COUNT(*)::int AS count FROM gohighlevel_connections
    `;
    console.log(`[migrate] gohighlevel_connections row count (pre): ${preConnCount}`);

    const tableExistsRows = await sql<{ exists: boolean }[]>`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_name = 'gohighlevel_access_tokens'
      ) AS exists
    `;
    const patTableExisted = !!tableExistsRows[0]?.exists;
    console.log(`[migrate] gohighlevel_access_tokens existed pre: ${patTableExisted}`);

    const colsBefore = await sql<{ column_name: string }[]>`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'gohighlevel_connections'
        AND column_name IN ('app_id', 'agency_connection_id', 'uninstalled_at')
    `;
    console.log(`[migrate] new connection columns present pre: ${colsBefore.map(r => r.column_name).join(",") || "<none>"}`);

    // ─── Apply migration in a transaction ───────────────────────────
    const sqlPath = resolve(process.cwd(), "drizzle/0040_gohighlevel_mcp_and_install.sql");
    const sqlText = readFileSync(sqlPath, "utf8");
    console.log(`[migrate] applying ${sqlPath}`);

    await sql.begin(async (tx) => {
      // The migration file is a sequence of CREATE TABLE / ALTER TABLE /
      // CREATE INDEX statements separated by semicolons. We execute the whole
      // thing as one unsafe block — every statement is idempotent.
      await tx.unsafe(sqlText);

      // ─── Post-check inside the transaction ────────────────────────
      const [{ exists: tablePost }] = await tx<{ exists: boolean }[]>`
        SELECT EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_name = 'gohighlevel_access_tokens'
        ) AS exists
      `;
      if (!tablePost) {
        throw new Error("[migrate] post-check failed: gohighlevel_access_tokens missing — rolling back");
      }

      const requiredColumns = ["app_id", "agency_connection_id", "uninstalled_at"];
      const colsAfter = await tx<{ column_name: string }[]>`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'gohighlevel_connections'
          AND column_name = ANY(${requiredColumns})
      `;
      const colNames = new Set(colsAfter.map(r => r.column_name));
      for (const col of requiredColumns) {
        if (!colNames.has(col)) {
          throw new Error(`[migrate] post-check failed: gohighlevel_connections.${col} missing — rolling back`);
        }
      }

      const requiredIndexes = [
        "ghl_access_tokens_hash_idx",
        "ghl_access_tokens_connection_idx",
        "ghl_access_tokens_user_idx",
        "ghl_connections_agency_idx",
      ];
      const idxAfter = await tx<{ indexname: string }[]>`
        SELECT indexname FROM pg_indexes
        WHERE indexname = ANY(${requiredIndexes})
      `;
      const idxNames = new Set(idxAfter.map(r => r.indexname));
      for (const idx of requiredIndexes) {
        if (!idxNames.has(idx)) {
          throw new Error(`[migrate] post-check failed: index ${idx} missing — rolling back`);
        }
      }

      const [{ count: postConnCount }] = await tx<{ count: number }[]>`
        SELECT COUNT(*)::int AS count FROM gohighlevel_connections
      `;
      if (postConnCount !== preConnCount) {
        throw new Error(
          `[migrate] row-count drift on gohighlevel_connections: pre=${preConnCount} post=${postConnCount} — rolling back`,
        );
      }
    });

    // ─── Post-flight (outside tx, just for the operator log) ────────
    const [{ count: postConnCount }] = await sql<{ count: number }[]>`
      SELECT COUNT(*)::int AS count FROM gohighlevel_connections
    `;
    const [{ count: patCount }] = await sql<{ count: number }[]>`
      SELECT COUNT(*)::int AS count FROM gohighlevel_access_tokens
    `;
    console.log(`[migrate] gohighlevel_connections row count (post): ${postConnCount}`);
    console.log(`[migrate] gohighlevel_access_tokens row count (post): ${patCount}`);
    console.log(`[migrate] sql file applied: ${sqlText.length} bytes`);
    console.log("[migrate] OK");
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error("[migrate] FAILED:", err);
  process.exit(1);
});
