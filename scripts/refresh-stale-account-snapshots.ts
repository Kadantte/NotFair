/**
 * Refresh derived `accounts` snapshots when the cache is missing, stale relative
 * to account-changing writes, or suspiciously zero despite meaningful usage.
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
  refreshToken: string;
  sessionLoginCustomerId: string | null;
  entryLoginCustomerId: string | null;
  hasEntryLoginCustomerId: boolean;
  reason: "missing-snapshot" | "write-after-snapshot" | "zero-with-usage";
};

type SummaryRow = {
  connectedAccounts: number;
  missingSnapshots: number;
  staleAfterWrite: number;
  zeroWithUsage: number;
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

function loginCustomerIdFor(row: Pick<CandidateRow, "hasEntryLoginCustomerId" | "entryLoginCustomerId" | "sessionLoginCustomerId">) {
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
    const [summary] = await sql<SummaryRow[]>`
      WITH op_stats AS (
        SELECT
          account_id,
          count(*)::int AS operations,
          max(created_at) AS last_operation_at,
          max(created_at) FILTER (
            WHERE op_type = 1 AND tool_name = ANY(${SNAPSHOT_WRITE_TOOLS})
          ) AS last_snapshot_write_at
        FROM operations
        GROUP BY account_id
      ), latest_account_session AS (
        SELECT DISTINCT ON (entry->>'id')
          entry->>'id' AS account_id
        FROM mcp_sessions s
        CROSS JOIN LATERAL jsonb_array_elements(s.customer_ids::jsonb) entry
        WHERE s.customer_ids IS NOT NULL
          AND s.customer_ids != '[]'
          AND coalesce(entry->>'id', '') <> ''
          AND coalesce(s.refresh_token, '') <> ''
        ORDER BY entry->>'id', s.created_at DESC
      ), classified AS (
        SELECT
          las.account_id,
          a.account_id IS NULL AS missing_snapshot,
          (
            o.last_snapshot_write_at IS NOT NULL
            AND (a.last_synced_at IS NULL OR a.last_synced_at < o.last_snapshot_write_at)
          ) AS stale_after_write,
          (
            coalesce(a.daily_budget, 0) = 0
            AND coalesce(a.active_campaigns, 0) = 0
            AND coalesce(o.operations, 0) >= ${minOps}
            AND (a.last_synced_at IS NULL OR a.last_synced_at < o.last_operation_at)
          ) AS zero_with_usage
        FROM latest_account_session las
        LEFT JOIN accounts a ON a.account_id = las.account_id
        LEFT JOIN op_stats o ON o.account_id = las.account_id
      )
      SELECT
        count(*)::int AS "connectedAccounts",
        count(*) FILTER (WHERE missing_snapshot)::int AS "missingSnapshots",
        count(*) FILTER (WHERE stale_after_write)::int AS "staleAfterWrite",
        count(*) FILTER (WHERE zero_with_usage)::int AS "zeroWithUsage"
      FROM classified
    `;

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
      ), latest_account_session AS (
        SELECT DISTINCT ON (entry->>'id')
          entry->>'id' AS account_id,
          s.refresh_token AS refresh_token,
          s.login_customer_id AS session_login_customer_id,
          entry->>'loginCustomerId' AS entry_login_customer_id,
          (entry ? 'loginCustomerId') AS has_entry_login_customer_id,
          s.google_email
        FROM mcp_sessions s
        CROSS JOIN LATERAL jsonb_array_elements(s.customer_ids::jsonb) entry
        WHERE s.customer_ids IS NOT NULL
          AND s.customer_ids != '[]'
          AND coalesce(entry->>'id', '') <> ''
          AND coalesce(s.refresh_token, '') <> ''
        ORDER BY entry->>'id', s.created_at DESC
      ), classified AS (
        SELECT
          las.account_id,
          las.refresh_token,
          las.session_login_customer_id,
          las.entry_login_customer_id,
          las.has_entry_login_customer_id,
          las.google_email,
          a.daily_budget,
          a.active_campaigns,
          a.last_synced_at,
          coalesce(o.operations, 0)::int AS operations,
          coalesce(o.writes, 0)::int AS writes,
          o.last_operation_at,
          o.last_snapshot_write_at,
          CASE
            WHEN a.account_id IS NULL THEN 'missing-snapshot'
            WHEN o.last_snapshot_write_at IS NOT NULL
              AND (a.last_synced_at IS NULL OR a.last_synced_at < o.last_snapshot_write_at)
              THEN 'write-after-snapshot'
            WHEN coalesce(a.daily_budget, 0) = 0
              AND coalesce(a.active_campaigns, 0) = 0
              AND coalesce(o.operations, 0) >= ${minOps}
              AND (a.last_synced_at IS NULL OR a.last_synced_at < o.last_operation_at)
              THEN 'zero-with-usage'
            ELSE NULL
          END AS reason
        FROM latest_account_session las
        LEFT JOIN accounts a ON a.account_id = las.account_id
        LEFT JOIN op_stats o ON o.account_id = las.account_id
      )
      SELECT
        account_id AS "accountId",
        daily_budget AS "currentDailyBudget",
        active_campaigns AS "currentActiveCampaigns",
        last_synced_at AS "lastSyncedAt",
        operations,
        writes,
        last_operation_at AS "lastOperationAt",
        last_snapshot_write_at AS "lastSnapshotWriteAt",
        google_email AS "googleEmail",
        refresh_token AS "refreshToken",
        session_login_customer_id AS "sessionLoginCustomerId",
        entry_login_customer_id AS "entryLoginCustomerId",
        has_entry_login_customer_id AS "hasEntryLoginCustomerId",
        reason
      FROM classified
      WHERE reason IS NOT NULL
      ORDER BY
        (reason = 'missing-snapshot') DESC,
        operations DESC,
        account_id ASC
      LIMIT ${limit}
    `;

    console.log(
      `snapshot backlog: connected=${summary?.connectedAccounts ?? 0}; ` +
      `missing=${summary?.missingSnapshots ?? 0}; ` +
      `staleAfterWrite=${summary?.staleAfterWrite ?? 0}; ` +
      `zeroWithUsage=${summary?.zeroWithUsage ?? 0}`,
    );
    console.log(`candidates selected: ${candidates.length}`);
    console.log(`mode: ${shouldApply ? "apply" : "dry-run"}; minOps=${minOps}; limit=${limit}`);

    if (candidates.length === 0) return;

    let refreshed = 0;
    let failed = 0;

    for (const c of candidates) {
      console.log(
        `${shouldApply ? "refresh" : "would refresh"} ${c.accountId}` +
        ` email=${c.googleEmail ?? "unknown"}` +
        ` reason=${c.reason}` +
        ` ops=${c.operations}` +
        ` writes=${c.writes}` +
        ` current=${c.currentDailyBudget ?? "null"}/${c.currentActiveCampaigns ?? "null"}` +
        ` loginCustomerId=${loginCustomerIdFor(c) ?? "direct"}` +
        ` lastSynced=${c.lastSyncedAt?.toISOString() ?? "null"}` +
        ` lastSnapshotWrite=${c.lastSnapshotWriteAt?.toISOString() ?? "null"}`,
      );

      if (!shouldApply) continue;

      try {
        await syncAccountSnapshot({
          refreshToken: c.refreshToken,
          customerId: c.accountId,
          loginCustomerId: loginCustomerIdFor(c),
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

    console.log(`\nDone. refreshed=${refreshed}; failed=${failed}`);
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
