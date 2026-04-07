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
  const email = process.argv[2];
  if (!email) { console.error("Usage: npx tsx scripts/mark-bounced.ts <email>"); process.exit(1); }

  const client = postgres(process.env.DATABASE_URL!, { prepare: false });
  const db = drizzle(client, { schema });

  await db.update(schema.contacts)
    .set({ status: "bounced", unsubscribed: true, bounceCount: 1 })
    .where(eq(schema.contacts.email, email.toLowerCase().trim()));

  console.log(`Marked ${email} as bounced.`);
  await client.end();
}

main().catch((err) => { console.error("Fatal:", err); process.exit(1); });
