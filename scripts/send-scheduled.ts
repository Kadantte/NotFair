/**
 * Send all scheduled emails that are due (scheduled_at <= now).
 *
 * Usage:
 *   npx tsx scripts/send-scheduled.ts
 *
 * Intended to be run via cron or Claude Code schedule.
 * Sends each due email via Resend and marks as "contacted".
 */

import { readFileSync } from "fs";
import { resolve } from "path";
import { Resend } from "resend";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq, and, lte } from "drizzle-orm";
import * as schema from "../lib/db/schema";
import { OUTREACH_EMAIL, OUTREACH_FROM } from "../lib/brand";

function loadEnvLocal() {
  try {
    const envPath = resolve(process.cwd(), ".env.local");
    const content = readFileSync(envPath, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const value = trimmed.slice(eqIdx + 1).trim();
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {}
}
loadEnvLocal();

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  const apiKey = process.env.RESEND_API_KEY;
  if (!dbUrl) { console.error("Missing DATABASE_URL"); process.exit(1); }
  if (!apiKey) { console.error("Missing RESEND_API_KEY"); process.exit(1); }

  const client = postgres(dbUrl, { prepare: false });
  const database = drizzle(client, { schema });
  const resend = new Resend(apiKey);

  const now = new Date();
  console.log(`\n🕐 Checking for scheduled emails due before ${now.toISOString()}...\n`);

  // Find all scheduled contacts where scheduled_at <= now
  const due = await database
    .select()
    .from(schema.contacts)
    .where(
      and(
        eq(schema.contacts.status, "scheduled"),
        lte(schema.contacts.scheduledAt!, now)
      )
    );

  if (due.length === 0) {
    console.log("No emails due right now.");
    await client.end();
    return;
  }

  console.log(`📧 ${due.length} email(s) to send:\n`);

  let sent = 0;
  for (const contact of due) {
    if (!contact.draftSubject || !contact.draftBody) {
      console.log(`  ⚠ ${contact.email} — no draft, skipping`);
      continue;
    }

    console.log(`  Sending to ${contact.email} (${contact.company})...`);

    const { error } = await resend.emails.send({
      from: OUTREACH_FROM,
      to: contact.email,
      subject: contact.draftSubject,
      replyTo: OUTREACH_EMAIL,
      text: contact.draftBody,
    });

    if (error) {
      console.log(`  ❌ Failed: ${error.message}`);
      continue;
    }

    await database
      .update(schema.contacts)
      .set({ status: "contacted", lastContactedAt: new Date() })
      .where(eq(schema.contacts.id, contact.id));

    console.log(`  ✅ Sent and marked as contacted`);
    sent++;

    // Small delay between sends to avoid rate limits
    if (sent < due.length) {
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  console.log(`\n✅ ${sent}/${due.length} emails sent.\n`);
  await client.end();
}

main().catch((err) => { console.error("Fatal:", err); process.exit(1); });
