/**
 * Fetch contacts with status "new" from the database.
 * Outputs JSON array to stdout for consumption by batch outreach agents.
 *
 * Usage:
 *   npx tsx scripts/fetch-new-leads.ts                # all new leads
 *   npx tsx scripts/fetch-new-leads.ts --limit 100    # first 100
 */

import { readFileSync } from "fs";
import { resolve } from "path";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq, asc } from "drizzle-orm";
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
  const limit = parseInt(args.limit || "0", 10);

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) { console.error("Missing DATABASE_URL"); process.exit(1); }

  const client = postgres(dbUrl, { prepare: false });
  const database = drizzle(client, { schema });

  let query = database
    .select({
      id: schema.contacts.id,
      email: schema.contacts.email,
      firstName: schema.contacts.firstName,
      lastName: schema.contacts.lastName,
      company: schema.contacts.company,
    })
    .from(schema.contacts)
    .where(eq(schema.contacts.status, "new"))
    .orderBy(asc(schema.contacts.id));

  const leads = limit > 0
    ? await query.limit(limit)
    : await query;

  console.log(JSON.stringify(leads, null, 2));
  console.error(`Fetched ${leads.length} new leads`);

  await client.end();
}

main().catch((err) => { console.error("Fatal:", err); process.exit(1); });
