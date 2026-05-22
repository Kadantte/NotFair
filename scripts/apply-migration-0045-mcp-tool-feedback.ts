/**
 * One-shot, transaction-safe application of
 * `drizzle/0045_add_mcp_tool_feedback.sql`.
 *
 * Why a script instead of `drizzle-kit migrate`: the journal is stale (last
 * tracked migration is 0029); post-0029 manual migrations use explicit apply
 * runners so we don't accidentally re-apply older production migrations.
 *
 * Safety story:
 *   - CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS are idempotent.
 *   - RLS enablement is idempotent.
 *   - REVOKE is safe to run repeatedly.
 *   - No DROP, no DELETE, no rewrite of existing data.
 *   - All SQL and post-checks run inside one transaction.
 */
import postgres from "postgres";
import { existsSync, readFileSync } from "node:fs";
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

function safeDatabaseLabel(url: string) {
  try {
    const u = new URL(url);
    return `${u.hostname}:${u.port}${u.pathname}`;
  } catch {
    return "<unparseable>";
  }
}

async function main() {
  loadEnvLocal();
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("Missing DATABASE_URL — aborting.");
    process.exit(1);
  }

  console.log(`[migrate] DATABASE_URL → ${safeDatabaseLabel(url)}`);
  const sql = postgres(url, { prepare: false, max: 1 });

  try {
    const sqlPath = resolve(process.cwd(), "drizzle/0045_add_mcp_tool_feedback.sql");
    const sqlText = readFileSync(sqlPath, "utf8");
    console.log(`[migrate] applying ${sqlPath}`);

    await sql.begin(async (tx) => {
      await tx.unsafe(sqlText);

      const [{ exists: tableExists }] = await tx<{ exists: boolean }[]>`
        SELECT EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_schema = 'public'
            AND table_name = 'mcp_tool_feedback'
        ) AS exists
      `;
      if (!tableExists) {
        throw new Error("[migrate] post-check failed: mcp_tool_feedback table missing — rolling back");
      }

      const requiredColumns = [
        "id",
        "user_id",
        "session_id",
        "category",
        "affected_tool",
        "observation",
        "suggestion",
        "status",
        "triage_category",
        "priority",
        "metadata",
        "created_at",
        "updated_at",
      ];
      const columns = await tx<{ column_name: string }[]>`
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'mcp_tool_feedback'
          AND column_name = ANY(${requiredColumns})
      `;
      const colNames = new Set(columns.map((row) => row.column_name));
      for (const col of requiredColumns) {
        if (!colNames.has(col)) {
          throw new Error(`[migrate] post-check failed: mcp_tool_feedback.${col} missing — rolling back`);
        }
      }

      const [{ relrowsecurity }] = await tx<{ relrowsecurity: boolean }[]>`
        SELECT relrowsecurity
        FROM pg_class
        WHERE oid = 'public.mcp_tool_feedback'::regclass
      `;
      if (!relrowsecurity) {
        throw new Error("[migrate] post-check failed: RLS not enabled — rolling back");
      }

      const roleGrants = await tx<{ grantee: string; privilege_type: string }[]>`
        SELECT grantee, privilege_type
        FROM information_schema.role_table_grants
        WHERE table_schema = 'public'
          AND table_name = 'mcp_tool_feedback'
          AND grantee IN ('anon', 'authenticated')
      `;
      if (roleGrants.length > 0) {
        throw new Error(
          `[migrate] post-check failed: Data API role grants remain: ${roleGrants
            .map((grant) => `${grant.grantee}:${grant.privilege_type}`)
            .join(", ")} — rolling back`,
        );
      }

      const sequenceGrants = await tx<{ grantee: string; privilege_type: string }[]>`
        SELECT grantee, privilege_type
        FROM information_schema.role_usage_grants
        WHERE object_schema = 'public'
          AND object_name = 'mcp_tool_feedback_id_seq'
          AND grantee IN ('anon', 'authenticated')
      `;
      if (sequenceGrants.length > 0) {
        throw new Error(
          `[migrate] post-check failed: Data API sequence grants remain: ${sequenceGrants
            .map((grant) => `${grant.grantee}:${grant.privilege_type}`)
            .join(", ")} — rolling back`,
        );
      }

      const [{ status_check: statusCheck }] = await tx<{ status_check: string | null }[]>`
        SELECT pg_get_constraintdef(c.oid) AS status_check
        FROM pg_constraint c
        JOIN pg_class t ON c.conrelid = t.oid
        WHERE t.relname = 'mcp_tool_feedback'
          AND c.conname = 'mcp_tool_feedback_status_check'
      `;
      if (!statusCheck || !statusCheck.includes("'new'::text") || statusCheck.includes("'open'::text")) {
        throw new Error(`[migrate] post-check failed: status check constraint is stale: ${statusCheck ?? "missing"}`);
      }

      const requiredIndexes = [
        "mcp_tool_feedback_status_created_idx",
        "mcp_tool_feedback_tool_created_idx",
        "mcp_tool_feedback_session_created_idx",
      ];
      const indexes = await tx<{ indexname: string }[]>`
        SELECT indexname FROM pg_indexes
        WHERE schemaname = 'public'
          AND tablename = 'mcp_tool_feedback'
          AND indexname = ANY(${requiredIndexes})
      `;
      const indexNames = new Set(indexes.map((row) => row.indexname));
      for (const idx of requiredIndexes) {
        if (!indexNames.has(idx)) {
          throw new Error(`[migrate] post-check failed: index ${idx} missing — rolling back`);
        }
      }
    });

    const [{ count }] = await sql<{ count: number }[]>`
      SELECT COUNT(*)::int AS count FROM mcp_tool_feedback
    `;
    console.log(`[migrate] mcp_tool_feedback row count: ${count}`);
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
