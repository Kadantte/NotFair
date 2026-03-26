/**
 * One-time migration: add customer_ids column to mcp_sessions
 * and backfill existing rows.
 *
 * Usage: npx tsx scripts/migrate-customer-ids.ts
 */
import postgres from "postgres";
import { readFileSync } from "fs";

// Load .env.local
const envContent = readFileSync(".env.local", "utf-8");
for (const line of envContent.split("\n")) {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match) process.env[match[1].trim()] = match[2].trim();
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL not found in .env.local");
  process.exit(1);
}

async function main() {
  const sql = postgres(DATABASE_URL!);

  try {
    // Check if column already exists
    const existing = await sql`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'mcp_sessions' AND column_name = 'customer_ids'
    `;

    if (existing.length > 0) {
      console.log("✓ customer_ids column already exists");
    } else {
      // Add the column
      await sql`
        ALTER TABLE mcp_sessions
        ADD COLUMN customer_ids text NOT NULL DEFAULT '[]'
      `;
      console.log("✓ Added customer_ids column");
    }

    // Check if user_id column already exists
    const userIdExists = await sql`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'mcp_sessions' AND column_name = 'user_id'
    `;

    if (userIdExists.length > 0) {
      console.log("✓ user_id column already exists");
    } else {
      await sql`
        ALTER TABLE mcp_sessions
        ADD COLUMN user_id text
      `;
      console.log("✓ Added user_id column");
    }

    // Backfill: set customer_ids from customer_id for existing rows
    const updated = await sql`
      UPDATE mcp_sessions
      SET customer_ids = '[' || '{"id":"' || customer_id || '","name":""}' || ']'
      WHERE customer_id != ''
        AND (customer_ids = '[]' OR customer_ids IS NULL)
    `;
    console.log(`✓ Backfilled ${updated.count} existing rows`);

    // Show current state
    const sessions = await sql`
      SELECT id, customer_id, customer_ids, user_id
      FROM mcp_sessions
      ORDER BY id
    `;
    console.log(`\nCurrent mcp_sessions (${sessions.length} rows):`);
    for (const s of sessions) {
      console.log(`  id=${s.id} customer_id=${s.customer_id} customer_ids=${s.customer_ids} user_id=${s.user_id}`);
    }
  } finally {
    await sql.end();
  }
}

main().catch((e) => {
  console.error("Migration failed:", e);
  process.exit(1);
});
