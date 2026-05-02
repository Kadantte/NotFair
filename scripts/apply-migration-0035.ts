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
    const v = t.slice(eq + 1).replace(/\s+#.*$/, "").trim();
    if (!process.env[k]) process.env[k] = v;
  }
}

async function main() {
  loadEnvLocal();
  const sql = postgres(process.env.DATABASE_URL!, { prepare: false });

  const before = await sql`
    SELECT
      EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_name = 'waitlist_signups'
      ) AS has_table
  `;
  console.log(`Pre-flight: waitlist_signups table exists = ${before[0].has_table}`);

  const migration = readFileSync("drizzle/0035_add_waitlist_signups.sql", "utf-8");
  const cleaned = migration
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");
  const statements = cleaned.split(";").map((s) => s.trim()).filter(Boolean);

  for (const stmt of statements) {
    console.log("Running:", stmt.substring(0, 120).replace(/\s+/g, " ") + (stmt.length > 120 ? "..." : ""));
    await sql.unsafe(stmt);
  }

  const cols = await sql`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_name = 'waitlist_signups'
    ORDER BY ordinal_position
  `;
  console.log("\nwaitlist_signups columns:");
  for (const c of cols) {
    console.log(`  ${c.column_name.padEnd(14)} type=${c.data_type}, nullable=${c.is_nullable}, default=${c.column_default ?? "—"}`);
  }

  const idx = await sql`
    SELECT indexname, indexdef
    FROM pg_indexes
    WHERE tablename = 'waitlist_signups'
    ORDER BY indexname
  `;
  console.log("\nwaitlist_signups indexes:");
  for (const i of idx) {
    console.log(`  ${i.indexname}`);
    console.log(`    ${i.indexdef}`);
  }

  await sql.end();
  console.log("\nMigration 0035 applied successfully.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
