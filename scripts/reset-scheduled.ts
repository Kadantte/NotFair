/**
 * Reset all "scheduled" contacts back to "drafted" so they can be re-scheduled.
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

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) { console.error("Missing DATABASE_URL"); process.exit(1); }

  const client = postgres(dbUrl, { prepare: false });
  const database = drizzle(client, { schema });

  const scheduled = await database
    .select({ id: schema.contacts.id, email: schema.contacts.email })
    .from(schema.contacts)
    .where(eq(schema.contacts.status, "scheduled"));

  console.log(`Resetting ${scheduled.length} scheduled contacts back to drafted...`);

  for (const c of scheduled) {
    await database.update(schema.contacts)
      .set({ status: "drafted", scheduledAt: null })
      .where(eq(schema.contacts.id, c.id));
  }

  console.log("Done.");
  await client.end();
}

main().catch((err) => { console.error("Fatal:", err); process.exit(1); });
