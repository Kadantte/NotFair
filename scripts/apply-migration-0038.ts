import postgres from "postgres";
import { readFileSync } from "fs";
import { loadEnvLocal } from "./_load-env";

async function main() {
  loadEnvLocal();
  const sql = postgres(process.env.DATABASE_URL!, { prepare: false });

  const before = await sql`
    SELECT
      EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='broadcasts') AS has_broadcasts,
      EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='broadcast_recipients') AS has_recipients,
      EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='email_preferences') AS has_prefs
  `;
  console.log("Pre-flight:", before[0]);

  const migration = readFileSync("drizzle/0038_add_broadcasts.sql", "utf-8");
  const cleaned = migration
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");
  const statements = cleaned.split(";").map((s) => s.trim()).filter(Boolean);

  for (const stmt of statements) {
    console.log("Running:", stmt.substring(0, 140).replace(/\s+/g, " ") + (stmt.length > 140 ? "..." : ""));
    await sql.unsafe(stmt);
  }

  const after = await sql`
    SELECT
      (SELECT count(*)::int FROM broadcasts) AS broadcasts_rows,
      (SELECT count(*)::int FROM broadcast_recipients) AS recipients_rows,
      (SELECT count(*)::int FROM email_preferences) AS prefs_rows
  `;
  console.log("\nPost-migration row counts:", after[0]);

  const indexes = await sql`
    SELECT tablename, indexname
    FROM pg_indexes
    WHERE schemaname='public' AND tablename IN ('broadcasts','broadcast_recipients','email_preferences')
    ORDER BY tablename, indexname
  `;
  console.log("\nIndexes:");
  for (const idx of indexes) console.log(`  ${idx.tablename}.${idx.indexname}`);

  await sql.end();
  console.log("\nMigration 0038 applied successfully.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
