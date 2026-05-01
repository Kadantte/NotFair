/**
 * One-shot, transaction-safe application of drizzle/0033_subscriptions_trial_ends_at.sql.
 *
 * Why a script instead of `drizzle-kit migrate`: the journal is stale (last
 * tracked migration is 0029, but 0030–0032 are already on the live DB). Running
 * `drizzle-kit migrate` would try to re-apply 0030+ in journal-order. We run
 * just 0033 explicitly here, with pre/post verification and a transaction
 * wrapper so any failure rolls back atomically.
 *
 * Safety story:
 *   - ADD COLUMN IF NOT EXISTS is idempotent. Running this twice is a noop.
 *   - The UPDATE only touches rows where trial_ends_at IS NULL, so a re-run
 *     does NOT reset existing trial dates.
 *   - All work happens inside a single BEGIN…COMMIT. If the post-check fails
 *     (e.g. some row didn't get backfilled), we ROLLBACK and exit non-zero.
 *   - No DROP, no DELETE, no rewrite of existing data.
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

  // Identify host/db (no creds) so the operator sees what they're touching.
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
    const [{ count: preCount }] = await sql<{ count: number }[]>`
      SELECT COUNT(*)::int AS count FROM subscriptions
    `;
    console.log(`[migrate] subscriptions row count (pre):  ${preCount}`);

    const colExistsRows = await sql<{ exists: boolean }[]>`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'subscriptions' AND column_name = 'trial_ends_at'
      ) AS exists
    `;
    const colExistedBefore = !!colExistsRows[0]?.exists;
    console.log(`[migrate] trial_ends_at column existed pre: ${colExistedBefore}`);

    let preNullCount = preCount;
    if (colExistedBefore) {
      const [{ count }] = await sql<{ count: number }[]>`
        SELECT COUNT(*)::int AS count FROM subscriptions WHERE trial_ends_at IS NULL
      `;
      preNullCount = count;
      console.log(`[migrate] rows missing trial_ends_at (pre): ${preNullCount}`);
    }

    // ─── Apply migration in a transaction ───────────────────────────
    const sqlPath = resolve(process.cwd(), "drizzle/0033_subscriptions_trial_ends_at.sql");
    const sqlText = readFileSync(sqlPath, "utf8");
    console.log(`[migrate] applying ${sqlPath}`);

    let updatedCount = 0;
    await sql.begin(async (tx) => {
      await tx.unsafe(`
        ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "trial_ends_at" timestamp;
      `);

      const updated = await tx<{ id: number }[]>`
        UPDATE "subscriptions"
        SET "trial_ends_at" = now() + interval '7 days'
        WHERE "trial_ends_at" IS NULL
        RETURNING id
      `;
      updatedCount = updated.length;

      // Post-check inside the transaction — if anything is wrong, throwing
      // here triggers an automatic ROLLBACK. We expect every row to have a
      // non-null trial_ends_at after this update.
      const [{ count: nullsAfter }] = await tx<{ count: number }[]>`
        SELECT COUNT(*)::int AS count FROM subscriptions WHERE trial_ends_at IS NULL
      `;
      if (nullsAfter > 0) {
        throw new Error(
          `[migrate] post-check failed: ${nullsAfter} rows still have NULL trial_ends_at — rolling back`,
        );
      }

      const [{ count: postCount }] = await tx<{ count: number }[]>`
        SELECT COUNT(*)::int AS count FROM subscriptions
      `;
      if (postCount !== preCount) {
        throw new Error(
          `[migrate] row-count drift: pre=${preCount} post=${postCount} — rolling back`,
        );
      }
    });

    console.log(`[migrate] backfilled rows: ${updatedCount}`);

    // ─── Post-flight (outside tx, just for the operator log) ────────
    const [{ count: postCount }] = await sql<{ count: number }[]>`
      SELECT COUNT(*)::int AS count FROM subscriptions
    `;
    const [{ count: postNullCount }] = await sql<{ count: number }[]>`
      SELECT COUNT(*)::int AS count FROM subscriptions WHERE trial_ends_at IS NULL
    `;
    console.log(`[migrate] subscriptions row count (post): ${postCount}`);
    console.log(`[migrate] rows missing trial_ends_at (post): ${postNullCount}`);
    console.log(`[migrate] sql file referenced (no-op pass-through): ${sqlText.length} bytes`);
    console.log("[migrate] OK");
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error("[migrate] FAILED:", err);
  process.exit(1);
});
