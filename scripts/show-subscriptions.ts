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
  const sql = postgres(process.env.DATABASE_URL!, { prepare: false });

  const rows = await sql`
    SELECT user_id, plan, status, interval,
           cancel_at_period_end, current_period_end,
           stripe_customer_id, stripe_subscription_id,
           created_at, updated_at
    FROM subscriptions
    ORDER BY updated_at DESC
  `;

  if (rows.length === 0) {
    console.log("No rows in subscriptions table.");
  } else {
    console.log(`${rows.length} subscription row(s):\n`);
    for (const r of rows) {
      console.log(`user_id:                ${r.user_id}`);
      console.log(`plan:                   ${r.plan}`);
      console.log(`status:                 ${r.status}`);
      console.log(`interval:               ${r.interval ?? "(null)"}`);
      console.log(`cancel_at_period_end:   ${r.cancel_at_period_end}`);
      console.log(`current_period_end:     ${r.current_period_end ?? "(null)"}`);
      console.log(`stripe_customer_id:     ${r.stripe_customer_id ?? "(null)"}`);
      console.log(`stripe_subscription_id: ${r.stripe_subscription_id ?? "(null)"}`);
      console.log(`created_at:             ${r.created_at}`);
      console.log(`updated_at:             ${r.updated_at}`);
      console.log("---");
    }
  }
  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
