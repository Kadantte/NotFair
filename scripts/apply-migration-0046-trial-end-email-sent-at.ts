/**
 * One-shot, transaction-safe application of
 * `drizzle/0046_subscriptions_trial_end_email_sent_at.sql`.
 *
 * Why a script instead of `drizzle-kit migrate`: the journal is stale; post-0029
 * migrations use explicit apply runners so we don't accidentally re-apply older
 * production migrations.
 *
 * Safety story:
 *   - ADD COLUMN IF NOT EXISTS + CREATE INDEX IF NOT EXISTS are idempotent.
 *   - No DROP, no DELETE, no rewrite of existing data.
 *   - All work runs inside one BEGIN…COMMIT; post-check failure rolls back.
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
    const sqlPath = resolve(
      process.cwd(),
      "drizzle/0046_subscriptions_trial_end_email_sent_at.sql",
    );
    const sqlText = readFileSync(sqlPath, "utf8");
    console.log(`[migrate] applying ${sqlPath}`);

    await sql.begin(async (tx) => {
      await tx.unsafe(sqlText);

      const [{ exists: columnExists }] = await tx<{ exists: boolean }[]>`
        SELECT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'subscriptions'
            AND column_name = 'trial_end_email_sent_at'
        ) AS exists
      `;
      if (!columnExists) {
        throw new Error(
          "[migrate] post-check failed: subscriptions.trial_end_email_sent_at missing — rolling back",
        );
      }

      const [{ exists: indexExists }] = await tx<{ exists: boolean }[]>`
        SELECT EXISTS (
          SELECT 1 FROM pg_indexes
          WHERE schemaname = 'public'
            AND tablename = 'subscriptions'
            AND indexname = 'subscriptions_trial_end_email_pending_idx'
        ) AS exists
      `;
      if (!indexExists) {
        throw new Error(
          "[migrate] post-check failed: subscriptions_trial_end_email_pending_idx missing — rolling back",
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
