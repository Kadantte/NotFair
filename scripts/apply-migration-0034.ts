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
    // Strip inline `# comment` from the value (e.g. KEY=value # note).
    const v = t.slice(eq + 1).replace(/\s+#.*$/, "").trim();
    if (!process.env[k]) process.env[k] = v;
  }
}

async function main() {
  loadEnvLocal();
  const sql = postgres(process.env.DATABASE_URL!, { prepare: false });

  // Pre-flight: confirm the column doesn't already exist and report current row count.
  const before = await sql`
    SELECT
      EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'operations' AND column_name = 'platform'
      ) AS has_platform,
      (SELECT count(*)::int FROM operations) AS total_rows
  `;
  console.log(`Pre-flight: platform column exists = ${before[0].has_platform}, total operations rows = ${before[0].total_rows}`);

  const migration = readFileSync("drizzle/0034_operations_platform.sql", "utf-8");
  const cleaned = migration
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");
  const statements = cleaned.split(";").map((s) => s.trim()).filter(Boolean);

  for (const stmt of statements) {
    console.log("Running:", stmt.substring(0, 120).replace(/\s+/g, " ") + (stmt.length > 120 ? "..." : ""));
    await sql.unsafe(stmt);
  }

  // Verify backfill: every existing row must now have platform = 'google_ads'.
  const audit = await sql`
    SELECT platform, count(*)::int AS n
    FROM operations
    GROUP BY platform
    ORDER BY platform
  `;
  console.log("\nPost-migration platform breakdown:");
  for (const row of audit) {
    console.log(`  ${row.platform.padEnd(12)} ${row.n}`);
  }

  // Confirm column metadata.
  const cols = await sql`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_name = 'operations' AND column_name = 'platform'
  `;
  console.log("\nplatform column metadata:");
  for (const c of cols) {
    console.log(`  type=${c.data_type}, nullable=${c.is_nullable}, default=${c.column_default}`);
  }

  await sql.end();
  console.log("\nMigration 0034 applied successfully.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
