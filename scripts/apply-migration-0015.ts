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
  const migration = readFileSync("drizzle/0015_slim_subscriptions.sql", "utf-8");
  const cleaned = migration
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");
  const statements = cleaned.split(";").map((s) => s.trim()).filter(Boolean);

  for (const stmt of statements) {
    console.log("Running:", stmt.substring(0, 100).replace(/\s+/g, " ") + "...");
    await sql.unsafe(stmt);
  }

  const cols = await sql`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'subscriptions'
    ORDER BY ordinal_position
  `;
  console.log("\nFinal subscriptions columns:");
  for (const c of cols) {
    console.log(`  ${c.column_name.padEnd(24)} ${c.data_type.padEnd(28)} ${c.is_nullable === "NO" ? "NOT NULL" : ""}`);
  }
  console.log(`\nTotal: ${cols.length} columns`);

  await sql.end();
  console.log("\nMigration 0015 applied successfully.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
