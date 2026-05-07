import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { syncAccountSnapshot } from "./sync-account";

const SNAPSHOT_WRITE_TOOLS = [
  "createCampaign",
  "create_campaign",
  "createShoppingCampaign",
  "create_shopping_campaign",
  "createPerformanceMaxCampaign",
  "create_pmax_campaign",
  "createDemandGenCampaign",
  "create_demand_gen_campaign",
  "createDisplayCampaign",
  "create_display_campaign",
  "createVideoCampaign",
  "create_video_campaign",
  "createAppCampaign",
  "create_app_campaign",
  "pauseCampaign",
  "pause_campaign",
  "enableCampaign",
  "enable_campaign",
  "removeCampaign",
  "remove_campaign",
  "updateCampaignBudget",
  "update_budget",
];

export type AccountSnapshotStaleReason =
  | "missing-snapshot"
  | "write-after-snapshot"
  | "zero-with-usage";

export type AccountSnapshotRefreshCandidate = {
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
  reason: AccountSnapshotStaleReason;
};

export type AccountSnapshotRefreshSummary = {
  connectedAccounts: number;
  missingSnapshots: number;
  staleAfterWrite: number;
  zeroWithUsage: number;
};

export type AccountSnapshotRefreshResult = {
  summary: AccountSnapshotRefreshSummary;
  candidates: AccountSnapshotRefreshCandidate[];
  mode: "dry-run" | "apply";
  refreshed: number;
  failed: number;
  errors: Array<{ accountId: string; message: string }>;
};

function asPositiveInt(value: number | undefined, fallback: number, max: number) {
  if (!Number.isFinite(value) || !value || value <= 0) return fallback;
  return Math.min(Math.floor(value), max);
}

function loginCustomerIdFor(
  row: Pick<
    AccountSnapshotRefreshCandidate,
    "hasEntryLoginCustomerId" | "entryLoginCustomerId" | "sessionLoginCustomerId"
  >,
) {
  if (row.hasEntryLoginCustomerId) {
    return row.entryLoginCustomerId ?? undefined;
  }
  return row.sessionLoginCustomerId ?? undefined;
}

function snapshotWriteToolNames() {
  return sql.join(SNAPSHOT_WRITE_TOOLS.map((tool) => sql`${tool}`), sql`,`);
}

function accountIdFilter(accountIds: string[] | undefined) {
  const ids = [...new Set((accountIds ?? []).map((id) => id.trim()).filter(Boolean))];
  if (ids.length === 0) return sql``;
  return sql`AND entry->>'id' IN (${sql.join(ids.map((id) => sql`${id}`), sql`,`)})`;
}

function normalizeRow(row: AccountSnapshotRefreshCandidate): AccountSnapshotRefreshCandidate {
  return {
    ...row,
    operations: Number(row.operations ?? 0),
    writes: Number(row.writes ?? 0),
    hasEntryLoginCustomerId: Boolean(row.hasEntryLoginCustomerId),
    currentDailyBudget: row.currentDailyBudget == null ? null : Number(row.currentDailyBudget),
    currentActiveCampaigns: row.currentActiveCampaigns == null ? null : Number(row.currentActiveCampaigns),
  };
}

export async function findStaleAccountSnapshotCandidates(options?: {
  limit?: number;
  minOps?: number;
  accountIds?: string[];
}): Promise<{ summary: AccountSnapshotRefreshSummary; candidates: AccountSnapshotRefreshCandidate[] }> {
  const limit = asPositiveInt(options?.limit, 50, 500);
  const minOps = asPositiveInt(options?.minOps, 20, 10_000);
  const filter = accountIdFilter(options?.accountIds);

  const summaryRows = await db().execute(sql`
    WITH op_stats AS (
      SELECT
        account_id,
        count(*)::int AS operations,
        max(created_at) AS last_operation_at,
        max(created_at) FILTER (
          WHERE op_type = 1 AND tool_name IN (${snapshotWriteToolNames()})
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
        ${filter}
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
  `) as unknown as AccountSnapshotRefreshSummary[];
  const [summary] = summaryRows;

  const rows = await db().execute(sql`
    WITH op_stats AS (
      SELECT
        account_id,
        count(*)::int AS operations,
        count(*) FILTER (WHERE op_type = 1)::int AS writes,
        max(created_at) AS last_operation_at,
        max(created_at) FILTER (
          WHERE op_type = 1 AND tool_name IN (${snapshotWriteToolNames()})
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
        ${filter}
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
  `) as unknown as AccountSnapshotRefreshCandidate[];

  return {
    summary: summary ?? {
      connectedAccounts: 0,
      missingSnapshots: 0,
      staleAfterWrite: 0,
      zeroWithUsage: 0,
    },
    candidates: rows.map(normalizeRow),
  };
}

export async function refreshStaleAccountSnapshots(options?: {
  limit?: number;
  minOps?: number;
  accountIds?: string[];
  dryRun?: boolean;
}): Promise<AccountSnapshotRefreshResult> {
  const { summary, candidates } = await findStaleAccountSnapshotCandidates(options);
  const dryRun = options?.dryRun ?? false;
  let refreshed = 0;
  let failed = 0;
  const errors: Array<{ accountId: string; message: string }> = [];

  if (!dryRun) {
    for (const candidate of candidates) {
      try {
        await syncAccountSnapshot({
          refreshToken: candidate.refreshToken,
          customerId: candidate.accountId,
          loginCustomerId: loginCustomerIdFor(candidate),
        });
        refreshed++;
      } catch (error) {
        failed++;
        const message = error instanceof Error ? error.message : String(error);
        errors.push({ accountId: candidate.accountId, message });
        console.warn(`[sync-account] Failed to refresh stale snapshot for ${candidate.accountId}:`, error);
      }
    }
  }

  return {
    summary,
    candidates,
    mode: dryRun ? "dry-run" : "apply",
    refreshed,
    failed,
    errors,
  };
}
