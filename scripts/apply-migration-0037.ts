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
        WHERE table_schema = 'public' AND table_name = 'user_attribution'
      ) AS has_table,
      (SELECT count(*)::int FROM auth.users) AS auth_users
  `;
  console.log(`Pre-flight: user_attribution exists = ${before[0].has_table}, auth users = ${before[0].auth_users}`);

  const migration = readFileSync("drizzle/0037_add_user_attribution.sql", "utf-8");
  const cleaned = migration
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");
  const statements = cleaned.split(";").map((s) => s.trim()).filter(Boolean);

  for (const stmt of statements) {
    console.log("Running:", stmt.substring(0, 140).replace(/\s+/g, " ") + (stmt.length > 140 ? "..." : ""));
    await sql.unsafe(stmt);
  }

  const summary = await sql`
    SELECT
      count(*)::int AS rows,
      count(*) FILTER (WHERE source IS NOT NULL)::int AS with_source,
      count(*) FILTER (WHERE source IS NULL)::int AS unknown_source,
      count(*) FILTER (WHERE signup_referrer_domain = 'accounts.google.com')::int AS oauth_polluted
    FROM user_attribution
  `;
  console.log("\nuser_attribution summary:");
  console.log(summary[0]);

  const rls = await sql`
    SELECT relrowsecurity AS rls_enabled
    FROM pg_class
    WHERE oid = 'public.user_attribution'::regclass
  `;
  console.log(`RLS enabled = ${rls[0]?.rls_enabled}`);

  const indexes = await sql`
    SELECT indexname
    FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'user_attribution'
    ORDER BY indexname
  `;
  console.log("\nIndexes:");
  for (const idx of indexes) console.log(`  ${idx.indexname}`);

  await sql.end();
  console.log("\nMigration 0037 applied successfully.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
