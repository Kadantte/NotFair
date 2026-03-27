/**
 * Backfill operations.user_id from mcp_sessions for rows written before userId
 * propagation existed in the app layer.
 *
 * Safe rule:
 * - backfill only when an account_id maps to exactly one distinct userId
 * - skip ambiguous or unresolved account_ids
 *
 * Usage:
 *   npx tsx scripts/backfill-operation-user-ids.ts
 *   npx tsx scripts/backfill-operation-user-ids.ts --apply
 */
import postgres from "postgres";
import { readFileSync } from "node:fs";
import {
  planOperationUserBackfill,
  type BackfillOperationRow,
  type BackfillSessionRow,
} from "@/lib/db/operation-user-backfill";

function loadEnvFile(path: string) {
  const envContent = readFileSync(path, "utf-8");
  for (const line of envContent.split("\n")) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) process.env[match[1].trim()] = match[2].trim();
  }
}

try {
  loadEnvFile(".env.local");
} catch {
  // Best effort; env may already be present.
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL not found in environment or .env.local");
  process.exit(1);
}

async function main() {
  const sql = postgres(DATABASE_URL);
  const shouldApply = process.argv.includes("--apply");

  try {
    const operations = await sql<BackfillOperationRow[]>`
      SELECT id, account_id AS "accountId", user_id AS "userId"
      FROM operations
      WHERE user_id IS NULL
      ORDER BY id
    `;

    const sessions = await sql<BackfillSessionRow[]>`
      SELECT user_id AS "userId", customer_id AS "customerId", customer_ids AS "customerIds"
      FROM mcp_sessions
      WHERE user_id IS NOT NULL
    `;

    const plan = planOperationUserBackfill(operations, sessions);

    console.log(`operations missing user_id: ${operations.length}`);
    console.log(`planned assignments: ${plan.assignments.length}`);
    console.log(`ambiguous account_ids: ${plan.ambiguousAccountIds.length}`);
    console.log(`unresolved account_ids: ${plan.unresolvedAccountIds.length}`);

    if (plan.ambiguousAccountIds.length > 0) {
      console.log("\nSkipped ambiguous account_ids:");
      for (const accountId of plan.ambiguousAccountIds) {
        console.log(`  ${accountId}`);
      }
    }

    if (plan.unresolvedAccountIds.length > 0) {
      console.log("\nSkipped unresolved account_ids:");
      for (const accountId of plan.unresolvedAccountIds) {
        console.log(`  ${accountId}`);
      }
    }

    if (!shouldApply) {
      console.log("\nDry run only. Re-run with --apply to persist updates.");
      return;
    }

    if (plan.assignments.length === 0) {
      console.log("\nNo rows eligible for backfill.");
      return;
    }

    await sql.begin(async (tx) => {
      for (const assignment of plan.assignments) {
        await tx`
          UPDATE operations
          SET user_id = ${assignment.userId}
          WHERE id = ${assignment.operationId}
            AND user_id IS NULL
        `;
      }
    });

    console.log(`\nApplied ${plan.assignments.length} user_id backfills.`);
  } finally {
    await sql.end();
  }
}

main().catch((error) => {
  console.error("Backfill failed:", error);
  process.exit(1);
});
