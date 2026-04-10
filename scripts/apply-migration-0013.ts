import postgres from "postgres";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

function loadEnvLocal() {
  const envPath = resolve(process.cwd(), ".env.local");
  if (!existsSync(envPath)) return;
  const content = readFileSync(envPath, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

async function main() {
  loadEnvLocal();
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL not set");

  const sql = postgres(url, { prepare: false });
  const migration = readFileSync("drizzle/0013_add_subscriptions.sql", "utf-8");
  const statements = migration
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);

  for (const stmt of statements) {
    console.log("Running:", stmt.substring(0, 80).replace(/\s+/g, " ") + "...");
    await sql.unsafe(stmt);
  }

  const rows = await sql`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_name = 'subscriptions'
    ORDER BY ordinal_position
  `;
  console.log("\nResulting columns in 'subscriptions':");
  for (const r of rows) {
    console.log(`  ${r.column_name.padEnd(26)} ${r.data_type.padEnd(28)} ${r.is_nullable === "NO" ? "NOT NULL" : ""}`);
  }

  await sql.end();
  console.log("\nMigration 0013 applied successfully.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
