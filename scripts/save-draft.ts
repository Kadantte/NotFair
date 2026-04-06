/**
 * Save a draft outreach email for a lead.
 *
 * Usage:
 *   npx tsx scripts/save-draft.ts \
 *     --to "info@example.com" \
 *     --subject "Your subject line" \
 *     --body "<p>HTML body here</p>"
 *
 * Saves the draft to the contacts table and sets status to "drafted".
 * Review and approve the draft in the Dev page, or send via scripts/send-email.ts.
 */

import { readFileSync } from "fs";
import { resolve } from "path";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import * as schema from "../lib/db/schema";

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
      args[argv[i].slice(2)] = argv[++i];
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv);
  const to = args.to;
  const subject = args.subject;
  const body = args.body;

  if (!to || !subject || !body) {
    console.error("Required: --to, --subject, --body");
    process.exit(1);
  }

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) { console.error("Missing DATABASE_URL"); process.exit(1); }

  const client = postgres(dbUrl, { prepare: false });
  const database = drizzle(client, { schema });

  const result = await database
    .update(schema.contacts)
    .set({ draftSubject: subject, draftBody: body, status: "drafted" })
    .where(eq(schema.contacts.email, to.toLowerCase().trim()))
    .returning({ id: schema.contacts.id, company: schema.contacts.company });

  if (result.length > 0) {
    console.log(`✅ Draft saved for ${to} (${result[0].company})`);
  } else {
    console.error(`❌ No contact found with email: ${to}`);
    process.exit(1);
  }

  await client.end();
}

main().catch((err) => { console.error("Fatal:", err); process.exit(1); });
