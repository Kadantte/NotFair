import Stripe from "stripe";
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
  const subId = process.argv[2] ?? "sub_1TKXU0BIY3NfVCHQ7uoTpOLn";
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY_TEST!, {
    apiVersion: "2026-03-25.dahlia",
  });

  console.log(`Fetching ${subId} from Stripe (test mode)...\n`);
  const sub = await stripe.subscriptions.retrieve(subId);
  console.log(`id:                     ${sub.id}`);
  console.log(`status:                 ${sub.status}`);
  console.log(`cancel_at_period_end:   ${sub.cancel_at_period_end}`);
  console.log(`canceled_at:            ${sub.canceled_at ? new Date(sub.canceled_at * 1000).toISOString() : "(null)"}`);
  console.log(`cancel_at:              ${sub.cancel_at ? new Date(sub.cancel_at * 1000).toISOString() : "(null)"}`);
  console.log(`metadata.userId:        ${sub.metadata?.userId ?? "(missing)"}`);

  // Show last few events for this subscription
  console.log("\nLast 5 events for this subscription:");
  const events = await stripe.events.list({ limit: 25 });
  let shown = 0;
  for (const e of events.data) {
    const obj = e.data.object as { id?: string; subscription?: string };
    if (obj.id === subId || obj.subscription === subId) {
      console.log(`  ${new Date(e.created * 1000).toISOString()}  ${e.type}  (${e.id})`);
      shown++;
      if (shown >= 5) break;
    }
  }
  if (shown === 0) console.log("  (none in the most recent 25 events)");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
