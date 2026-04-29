/**
 * Refresh derived `accounts` snapshots when the cache is stale relative to
 * account-changing writes, or suspiciously zero despite meaningful usage.
 *
 * Safe by default: dry-run only unless --apply is passed.
 *
 * Usage:
 *   npx tsx scripts/refresh-stale-account-snapshots.ts
 *   npx tsx scripts/refresh-stale-account-snapshots.ts --apply
 *   npx tsx scripts/refresh-stale-account-snapshots.ts --apply --limit 100 --min-ops 20
 */
import postgres from "postgres";
import { readFileSync } from "node:fs";
import { syncAccountSnapshot } from "@/lib/google-ads/sync-account";

function parseEnvValue(raw: string) {
  let value = raw.trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }
  return value;
}

function loadEnvFile(path: string) {
  const envContent = readFileSync(path, "utf-8");
  for (const line of envContent.split("\n")) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) process.env[match[1].trim()] = parseEnvValue(match[2]);
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

const SNAPSHOT_WRITE_TOOLS = [
  "createCampaign",
  "create_campaign",
  "pauseCampaign",
  "pause_campaign",
  "enableCampaign",
  "enable_campaign",
  "removeCampaign",
  "remove_campaign",
  "updateCampaignBudget",
  "update_budget",
];

type CandidateRow = {
  accountId: string;
  currentDailyBudget: number | null;
  currentActiveCampaigns: number | null;
  lastSyncedAt: Date | null;
  operations: number;
  writes: number;
  lastOperationAt: Date | null;
  lastSnapshotWriteAt: Date | null;
  googleEmail: string | null;
};

type AuthRow = {
  refreshToken: string;
  sessionLoginCustomerId: string | null;
  entryLoginCustomerId: string | null;
  hasEntryLoginCustomerId: boolean;
  googleEmail: string | null;
};

function numberArg(name: string, fallback: number) {
  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;
  const value = Number(process.argv[index + 1]);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive number`);
  }
  return value;
}

function loginCustomerIdFor(row: AuthRow) {
  if (row.hasEntryLoginCustomerId) {
    return row.entryLoginCustomerId ?? undefined;
  }
  return row.sessionLoginCustomerId ?? undefined;
}

async function main() {
  const sql = postgres(DATABASE_URL!, { prepare: false });
  const shouldApply = process.argv.includes("--apply");
  const minOps = numberArg("--min-ops", 20);
  const limit = numberArg("--limit", 50);

  try {
    const candidates = await sql<CandidateRow[]>`
      WITH op_stats AS (
        SELECT
          account_id,
          count(*)::int AS operations,
          count(*) FILTER (WHERE op_type = 1)::int AS writes,
          max(created_at) AS last_operation_at,
          max(created_at) FILTER (
            WHERE op_type = 1 AND tool_name = ANY(${SNAPSHOT_WRITE_TOOLS})
          ) AS last_snapshot_write_at
        FROM operations
        GROUP BY account_id
      ), latest_session AS (
        SELECT DISTINCT ON (entry->>'id')
          entry->>'id' AS account_id,
          s.google_email
        FROM mcp_sessions s
        CROSS JOIN LATERAL jsonb_array_elements(s.customer_ids::jsonb) entry
        WHERE s.customer_ids IS NOT NULL AND s.customer_ids != '[]'
        ORDER BY entry->>'id', s.created_at DESC
      )
      SELECT
        a.account_id AS "accountId",
        a.daily_budget AS "currentDailyBudget",
        a.active_campaigns AS "currentActiveCampaigns",
        a.last_synced_at AS "lastSyncedAt",
        o.operations,
        o.writes,
        o.last_operation_at AS "lastOperationAt",
        o.last_snapshot_write_at AS "lastSnapshotWriteAt",
        ls.google_email AS "googleEmail"
      FROM accounts a
      JOIN op_stats o ON o.account_id = a.account_id
      LEFT JOIN latest_session ls ON ls.account_id = a.account_id
      WHERE
        (
          o.last_snapshot_write_at IS NOT NULL
          AND (a.last_synced_at IS NULL OR a.last_synced_at < o.last_snapshot_write_at)
        )
        OR (
          coalesce(a.daily_budget, 0) = 0
          AND coalesce(a.active_campaigns, 0) = 0
          AND o.operations >= ${minOps}
          AND (a.last_synced_at IS NULL OR a.last_synced_at < o.last_operation_at)
        )
      ORDER BY
        (o.last_snapshot_write_at IS NOT NULL AND (a.last_synced_at IS NULL OR a.last_synced_at < o.last_snapshot_write_at)) DESC,
        o.operations DESC
      LIMIT ${limit}
    `;

    console.log(`stale/suspicious account snapshots: ${candidates.length}`);
    console.log(`mode: ${shouldApply ? "apply" : "dry-run"}; minOps=${minOps}; limit=${limit}`);

    if (candidates.length === 0) return;

    let refreshed = 0;
    let skipped = 0;
    let failed = 0;

    for (const c of candidates) {
      const reason = c.lastSnapshotWriteAt && (!c.lastSyncedAt || c.lastSyncedAt < c.lastSnapshotWriteAt)
        ? "write-after-snapshot"
        : "zero-with-usage";
      console.log(
        `${shouldApply ? "refresh" : "would refresh"} ${c.accountId}` +
        ` email=${c.googleEmail ?? "unknown"}` +
        ` reason=${reason}` +
        ` ops=${c.operations}` +
        ` writes=${c.writes}` +
        ` current=${c.currentDailyBudget ?? "null"}/${c.currentActiveCampaigns ?? "null"}` +
        ` lastSynced=${c.lastSyncedAt?.toISOString() ?? "null"}` +
        ` lastSnapshotWrite=${c.lastSnapshotWriteAt?.toISOString() ?? "null"}`,
      );

      if (!shouldApply) continue;

      const authRows = await sql<AuthRow[]>`
        SELECT
          s.refresh_token AS "refreshToken",
          s.login_customer_id AS "sessionLoginCustomerId",
          entry->>'loginCustomerId' AS "entryLoginCustomerId",
          (entry ? 'loginCustomerId') AS "hasEntryLoginCustomerId",
          s.google_email AS "googleEmail"
        FROM mcp_sessions s
        CROSS JOIN LATERAL jsonb_array_elements(s.customer_ids::jsonb) entry
        WHERE entry->>'id' = ${c.accountId}
        ORDER BY s.created_at DESC
        LIMIT 1
      `;

      const auth = authRows[0];
      if (!auth) {
        skipped++;
        console.warn(`skip ${c.accountId}: no MCP session auth found`);
        continue;
      }

      try {
        await syncAccountSnapshot({
          refreshToken: auth.refreshToken,
          customerId: c.accountId,
          loginCustomerId: loginCustomerIdFor(auth),
        });
        refreshed++;
      } catch (error) {
        failed++;
        console.warn(`failed ${c.accountId}:`, error);
      }
    }

    if (!shouldApply) {
      console.log("\nDry run only. Re-run with --apply to refresh snapshots.");
      return;
    }

    console.log(`\nDone. refreshed=${refreshed}; skipped=${skipped}; failed=${failed}`);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Refresh stale account snapshots failed:", error);
    process.exit(1);
  });
