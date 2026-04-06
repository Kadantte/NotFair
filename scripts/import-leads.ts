/**
 * One-off script to import cleaned leads into the contacts table.
 *
 * Usage: npx tsx --tsconfig tsconfig.json scripts/import-leads.ts
 */

import { readFileSync } from "fs";
import { resolve } from "path";
import postgres from "postgres";

// Load .env.local manually (no dotenv dependency)
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
  } catch {
    // .env.local not found — rely on env vars
  }
}
loadEnvLocal();

import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import * as schema from "../lib/db/schema";

interface Lead {
  email: string;
  company: string;
  website: string;
}

const rawLeads: Lead[] = [
  { email: "info@rezgo.com", company: "Rezgo", website: "rezgo.com" },
  { email: "support@rezgo.com", company: "Rezgo", website: "rezgo.com" },
  { email: "marketing@softwaresuggest.com", company: "SoftwareSuggest", website: "softwaresuggest.com" },
  { email: "support@softwaresuggest.com", company: "SoftwareSuggest", website: "softwaresuggest.com" },
  { email: "hello@prisla.com", company: "Creator Hero", website: "creator-hero.com" },
  { email: "info@creator-hero.com", company: "Creator Hero", website: "creator-hero.com" },
  { email: "info@sematext.com", company: "Sematext", website: "sematext.com" },
  { email: "sales@sematext.com", company: "Sematext", website: "sematext.com" },
  { email: "robert@emailtooltester.com", company: "EmailTooltester", website: "emailtooltester.com" },
  { email: "support@sendpulse.com", company: "SendPulse", website: "sendpulse.com" },
  { email: "support@presentations.ai", company: "Presentations.ai", website: "presentations.ai" },
  { email: "hello@simplified.com", company: "Simplified", website: "simplified.com" },
  { email: "sales@simplified.com", company: "Simplified", website: "simplified.com" },
  { email: "info@selectsoftwarereviews.com", company: "Select Software Reviews", website: "selectsoftwarereviews.com" },
  { email: "info@omri.org", company: "OMRI", website: "omri.org" },
  { email: "marketing@omri.org", company: "OMRI", website: "omri.org" },
  { email: "wecare@neuherbs.com", company: "Neuherbs", website: "neuherbs.com" },
];

// Pick best email per company: named person > info@ > hello@ > marketing@ > sales@ > support@
function emailPriority(email: string): number {
  const local = email.split("@")[0];
  const generic = ["info", "hello", "hi", "marketing", "sales", "support", "press", "jobs", "hr", "apply", "wecare", "renewals"];
  if (!generic.includes(local)) return 0;
  if (local === "info") return 1;
  if (local === "hello") return 2;
  if (local === "marketing") return 3;
  if (local === "sales") return 4;
  return 5;
}

function pickBestPerCompany(leads: Lead[]): Lead[] {
  const byDomain = new Map<string, Lead[]>();
  for (const lead of leads) {
    if (!byDomain.has(lead.website)) byDomain.set(lead.website, []);
    byDomain.get(lead.website)!.push(lead);
  }
  return [...byDomain.values()].map((group) => {
    group.sort((a, b) => emailPriority(a.email) - emailPriority(b.email));
    return group[0];
  });
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) { console.error("Missing DATABASE_URL"); process.exit(1); }

  const client = postgres(url, { prepare: false });
  const database = drizzle(client, { schema });
  const leads = pickBestPerCompany(rawLeads);

  console.log(`\n📋 ${leads.length} leads to import:\n`);
  for (const lead of leads) {
    console.log(`  ${lead.email.padEnd(40)} ${lead.company}`);
  }

  console.log(`\n📥 Importing...`);
  let imported = 0;
  for (const lead of leads) {
    const [contact] = await database
      .insert(schema.contacts)
      .values({
        email: lead.email.toLowerCase().trim(),
        company: lead.company,
      })
      .onConflictDoNothing()
      .returning();

    if (contact) {
      console.log(`  ✓ ${lead.email} (id: ${contact.id})`);
      imported++;
    } else {
      const [existing] = await database
        .select({ id: schema.contacts.id })
        .from(schema.contacts)
        .where(and(
          eq(schema.contacts.email, lead.email.toLowerCase().trim())
        ))
        .limit(1);
      console.log(`  ~ ${lead.email} (exists, id: ${existing?.id})`);
    }
  }

  console.log(`\n✅ ${imported} new leads imported. View them at /dev.\n`);
  await client.end();
}

main().catch((err) => { console.error("Fatal:", err); process.exit(1); });
