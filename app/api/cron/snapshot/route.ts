import { NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { desc, eq, gte } from "drizzle-orm";
import {
  authForAccount,
  getCachedCustomer,
  parseCustomerIds,
  type AuthContext,
  type ConnectedAccount,
} from "@/lib/google-ads";

/**
 * Daily performance snapshot cron job.
 *
 * Triggered by Vercel Cron (see vercel.json).
 * For each active MCP session, captures yesterday's campaign metrics
 * for ALL connected accounts and stores them in performance_snapshots.
 */
export async function GET(request: Request) {
  // Verify cron secret to prevent unauthorized access
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const connections = await db()
      .select()
      .from(schema.adPlatformConnections)
      .where(eq(schema.adPlatformConnections.platform, "google_ads"))
      .orderBy(desc(schema.adPlatformConnections.updatedAt));

    const sessions = await db()
      .select()
      .from(schema.mcpSessions)
      .where(gte(schema.mcpSessions.expiresAt, new Date().toISOString()))
      .orderBy(desc(schema.mcpSessions.createdAt));

    const snapshotDate = getCompletedSnapshotDate();
    const dateRange = { start: snapshotDate, end: snapshotDate };
    const accounts = new Map<string, { candidates: Array<{ source: string; auth: AuthContext }> }>();

    for (const connection of connections) {
      const connectedAccounts = normalizeConnectedAccounts(connection.accountIds ?? []);
      const accountIds = connectedAccounts.length > 0
        ? connectedAccounts.map((account) => account.id)
        : connection.activeAccountId
          ? [connection.activeAccountId]
          : [];
      if (!connection.activeAccountId && accountIds.length === 0) continue;

      const activeAccount = connectedAccounts.find((account) => account.id === connection.activeAccountId);
      const baseAuth: AuthContext = {
        refreshToken: connection.refreshToken,
        customerId: connection.activeAccountId ?? accountIds[0],
        customerIds: connectedAccounts,
        loginCustomerId: activeAccount?.loginCustomerId ?? null,
        userId: connection.userId,
        authMethod: "oauth",
      };

      for (const accountId of accountIds) {
        addAccountCandidate(accounts, "connection", authForAccount(baseAuth, accountId));
      }
    }

    for (const session of sessions) {
      const connectedAccounts = parseCustomerIds(session.customerIds);
      const accountIds = connectedAccounts.length > 0
        ? connectedAccounts.map((account) => account.id)
        : session.customerId
          ? [session.customerId]
          : [];

      const baseAuth: AuthContext = {
        refreshToken: session.refreshToken,
        customerId: session.customerId,
        customerIds: connectedAccounts,
        loginCustomerId: session.loginCustomerId,
        userId: session.userId,
        clientName: session.clientName,
        clientVersion: session.clientVersion,
        authMethod: "oauth",
        sessionId: session.id,
      };

      for (const accountId of accountIds) {
        addAccountCandidate(accounts, `session:${session.id}`, authForAccount(baseAuth, accountId));
      }
    }

    let snapshotsCreated = 0;
    let errors = 0;
    let campaignsSeen = 0;

    for (const { candidates } of accounts.values()) {
      let completed = false;

      for (const { source, auth } of candidates) {
        try {
          const rows = await fetchAccountCampaignSnapshots(auth, dateRange);
          campaignsSeen += rows.length;
          if (rows.length > 0) {
            await db()
              .insert(schema.performanceSnapshots)
              .values(rows)
              .onConflictDoNothing(); // Skip if snapshot already exists for this date

            snapshotsCreated += rows.length;
          }
          completed = true;
          break;
        } catch (error) {
          console.warn(`[cron/snapshot] Candidate failed for ${source}, account ${auth.customerId}:`, error);
        }
      }

      if (!completed) {
        const [{ source, auth }] = candidates;
        console.error(`[cron/snapshot] All candidates failed for ${source}, account ${auth.customerId}`);
        errors++;
      }
    }

    return NextResponse.json({
      success: true,
      connectionsProcessed: connections.length,
      sessionsProcessed: sessions.length,
      accountsProcessed: accounts.size,
      dateRange,
      campaignsSeen,
      snapshotsCreated,
      errors,
    });
  } catch (error) {
    console.error("[cron/snapshot] Fatal error:", error);
    return NextResponse.json(
      { error: "Snapshot cron failed" },
      { status: 500 },
    );
  }
}

function addAccountCandidate(
  accounts: Map<string, { candidates: Array<{ source: string; auth: AuthContext }> }>,
  source: string,
  auth: AuthContext,
) {
  const key = `${auth.customerId}|${auth.loginCustomerId ?? ""}`;
  const account = accounts.get(key);
  if (account) {
    account.candidates.push({ source, auth });
  } else {
    accounts.set(key, { candidates: [{ source, auth }] });
  }
}

function getCompletedSnapshotDate(now = new Date()) {
  const date = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() - 1,
  ));
  return date.toISOString().slice(0, 10);
}

function normalizeConnectedAccounts(
  accounts: Array<{ id: string; name?: string; loginCustomerId?: string | null }>,
): ConnectedAccount[] {
  return accounts.map((account) => ({
    id: account.id,
    name: account.name ?? account.id,
    ...("loginCustomerId" in account ? { loginCustomerId: account.loginCustomerId ?? null } : {}),
  }));
}

type CampaignSnapshotRow = {
  campaign?: { id?: string | number };
  segments?: { date?: string };
  metrics?: {
    impressions?: number;
    clicks?: number;
    cost_micros?: number | string;
    conversions?: number;
  };
};

async function fetchAccountCampaignSnapshots(
  auth: AuthContext,
  dateRange: { start: string; end: string },
) {
  const customer = getCachedCustomer(auth);
  const result = await customer.query(`
    SELECT
      campaign.id,
      segments.date,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.conversions
    FROM campaign
    WHERE campaign.status != 'REMOVED'
      AND segments.date BETWEEN '${dateRange.start}' AND '${dateRange.end}'
    ORDER BY metrics.impressions DESC
    LIMIT 100
  `) as CampaignSnapshotRow[];

  return result
    .map((row) => {
      const campaignId = row.campaign?.id;
      const snapshotDate = row.segments?.date;
      if (campaignId == null || !snapshotDate) return null;

      const costMicros = Number(row.metrics?.cost_micros ?? 0);
      const conversions = row.metrics?.conversions ?? 0;

      return {
        accountId: auth.customerId,
        campaignId: String(campaignId),
        snapshotDate,
        impressions: row.metrics?.impressions ?? 0,
        clicks: row.metrics?.clicks ?? 0,
        costMicros,
        conversions,
        cpa: conversions > 0 ? costMicros / 1_000_000 / conversions : null,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);
}
