/**
 * One-shot, transaction-safe application of `drizzle/0047_email_sends.sql`.
 *
 * Why a script instead of `drizzle-kit migrate`: the journal is stale; post-0029
 * migrations use explicit apply runners.
 *
 * Safety story:
 *   - CREATE TABLE IF NOT EXISTS + CREATE INDEX IF NOT EXISTS are idempotent.
 *   - No DROP, no DELETE, no rewrite of existing data.
 *   - Post-check validates table + all three indexes exist; failure rolls back.
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
    const sqlPath = resolve(process.cwd(), "drizzle/0047_email_sends.sql");
    const sqlText = readFileSync(sqlPath, "utf8");
    console.log(`[migrate] applying ${sqlPath}`);

    await sql.begin(async (tx) => {
      await tx.unsafe(sqlText);

      const [{ exists: tableExists }] = await tx<{ exists: boolean }[]>`
        SELECT EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_schema = 'public'
            AND table_name = 'email_sends'
        ) AS exists
      `;
      if (!tableExists) {
        throw new Error(
          "[migrate] post-check failed: email_sends table missing — rolling back",
        );
      }

      const requiredColumns = [
        "id",
        "kind",
        "user_id",
        "env",
        "email",
        "resend_id",
        "status",
        "sent_at",
        "delivered_at",
        "opened_at",
        "clicked_at",
        "bounced_at",
        "bounce_type",
        "error_message",
        "updated_at",
      ];
      const cols = await tx<{ column_name: string }[]>`
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'email_sends'
          AND column_name = ANY(${requiredColumns})
      `;
      const colNames = new Set(cols.map((r) => r.column_name));
      for (const col of requiredColumns) {
        if (!colNames.has(col)) {
          throw new Error(
            `[migrate] post-check failed: email_sends.${col} missing — rolling back`,
          );
        }
      }

      const requiredIndexes = [
        "email_sends_resend_id_uq",
        "email_sends_kind_sent_at_idx",
        "email_sends_user_idx",
      ];
      const indexes = await tx<{ indexname: string }[]>`
        SELECT indexname FROM pg_indexes
        WHERE schemaname = 'public'
          AND tablename = 'email_sends'
          AND indexname = ANY(${requiredIndexes})
      `;
      const idxNames = new Set(indexes.map((r) => r.indexname));
      for (const idx of requiredIndexes) {
        if (!idxNames.has(idx)) {
          throw new Error(
            `[migrate] post-check failed: index ${idx} missing — rolling back`,
          );
        }
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
