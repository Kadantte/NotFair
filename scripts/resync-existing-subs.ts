/**
 * One-shot: walk every row in the subscriptions table and re-sync from Stripe
 * using the canonical sync function. Run this after migration 0014 so existing
 * rows get the new columns (email, cancel_at, trial_end, data) populated.
 */
import postgres from "postgres";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

function loadEnvLocal() {
  const envPath = resolve(process.cwd(), ".env.local");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf-8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 0) continue;
    const k = t.slice(0, eq).trim();
    const v = t.slice(eq + 1).trim();
    if (!process.env[k]) process.env[k] = v;
  }
}

async function main() {
  loadEnvLocal();

  // Dynamic import after env is loaded so the Stripe client picks up the secret.
  const { syncStripeSubscription } = await import("@/lib/stripe/sync");

  const sql = postgres(process.env.DATABASE_URL!, { prepare: false });
  const rows = await sql<{ user_id: string; stripe_customer_id: string | null }[]>`
    SELECT user_id, stripe_customer_id FROM subscriptions WHERE stripe_customer_id IS NOT NULL
  `;
  console.log(`Found ${rows.length} row(s) with a Stripe customer id.\n`);

  for (const row of rows) {
    if (!row.stripe_customer_id) continue;
    console.log(`Syncing ${row.user_id} (customer: ${row.stripe_customer_id})...`);
    try {
      const result = await syncStripeSubscription(row.stripe_customer_id);
      console.log(`  → ${JSON.stringify(result)}`);
    } catch (err) {
      console.error(`  ✗ failed:`, err);
    }
  }

  await sql.end();
  console.log("\nDone.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
