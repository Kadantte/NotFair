/**
 * Send a single outreach email via Resend and mark the contact as "contacted".
 *
 * Usage:
 *   npx tsx scripts/send-email.ts \
 *     --to "info@example.com" \
 *     --subject "Your subject line" \
 *     --body "<p>HTML body here</p>" \
 *     --from "Tong from NotFair <tong@notfair.co>" \
 *     --reply-to "tong@notfair.co"
 *
 * The script will:
 * 1. Send the email via Resend
 * 2. Update the contact's status to "contacted" and set last_contacted_at
 */

import { readFileSync } from "fs";
import { resolve } from "path";
import { Resend } from "resend";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import * as schema from "../lib/db/schema";
import { OUTREACH_EMAIL, OUTREACH_FROM } from "../lib/brand";

// Load .env.local
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

function parseArgs(argv: string[]): Record<string, string> {
  const args: Record<string, string> = {};
  for (let i = 2; i < argv.length; i++) {
    if (argv[i].startsWith("--") && i + 1 < argv.length) {
      const key = argv[i].slice(2);
      args[key] = argv[++i];
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv);

  const to = args.to;
  const subject = args.subject;
  const body = args.body;
  const from = args.from || OUTREACH_FROM;
  const replyTo = args["reply-to"] || OUTREACH_EMAIL;

  if (!to || !subject || !body) {
    console.error("Required: --to, --subject, --body");
    process.exit(1);
  }

  // Send via Resend
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error("Missing RESEND_API_KEY in .env.local");
    process.exit(1);
  }

  const resend = new Resend(apiKey);

  console.log(`\n📧 Sending to ${to}...`);
  console.log(`   Subject: ${subject}`);
  console.log(`   From: ${from}`);
  console.log(`   Reply-To: ${replyTo}\n`);

  const { data, error } = await resend.emails.send({
    from,
    to,
    subject,
    replyTo,
    text: body,
  });

  if (error) {
    console.error("❌ Send failed:", error.message);
    process.exit(1);
  }

  console.log(`✅ Sent! Email ID: ${data?.id}`);

  // Update contact status in DB
  const dbUrl = process.env.DATABASE_URL;
  if (dbUrl) {
    const client = postgres(dbUrl, { prepare: false });
    const database = drizzle(client, { schema });

    const result = await database
      .update(schema.contacts)
      .set({ status: "contacted", lastContactedAt: new Date() })
      .where(eq(schema.contacts.email, to.toLowerCase().trim()))
      .returning({ id: schema.contacts.id, company: schema.contacts.company });

    if (result.length > 0) {
      console.log(`📝 Marked ${to} as "contacted" (${result[0].company})`);
    }

    await client.end();
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
