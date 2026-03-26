import { NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { gte } from "drizzle-orm";
import { listCampaigns, getCampaignPerformance, toMicros, parseCustomerIds, type AuthContext } from "@/lib/google-ads";

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
    // Get all active MCP sessions
    const sessions = await db()
      .select()
      .from(schema.mcpSessions)
      .where(gte(schema.mcpSessions.expiresAt, new Date().toISOString()));

    let snapshotsCreated = 0;
    let errors = 0;

    for (const session of sessions) {
      // Parse all connected account IDs
      let accountIds = parseCustomerIds(session.customerIds).map((a) => a.id);

      // Ensure at least the primary account is included
      if (accountIds.length === 0 && session.customerId) {
        accountIds = [session.customerId];
      }

      for (const accountId of accountIds) {
        try {
          const auth: AuthContext = {
            refreshToken: session.refreshToken,
            customerId: accountId,
          };

          const campaigns = await listCampaigns(auth, { limit: 100 });

          for (const campaign of campaigns) {
            if (campaign.status === "REMOVED") continue;

            // Get yesterday's performance
            const perf = await getCampaignPerformance(auth, campaign.id, 1);
            const yesterday = perf.daily[0];
            if (!yesterday) continue;

            await db()
              .insert(schema.performanceSnapshots)
              .values({
                accountId,
                campaignId: campaign.id,
                snapshotDate: yesterday.date,
                impressions: yesterday.impressions,
                clicks: yesterday.clicks,
                costMicros: toMicros(yesterday.cost),
                conversions: yesterday.conversions,
                cpa: yesterday.conversions > 0
                  ? yesterday.cost / yesterday.conversions
                  : null,
              })
              .onConflictDoNothing(); // Skip if snapshot already exists for this date

            snapshotsCreated++;
          }
        } catch (error) {
          console.error(`[cron/snapshot] Error for session ${session.id}, account ${accountId}:`, error);
          errors++;
        }
      }
    }

    return NextResponse.json({
      success: true,
      sessionsProcessed: sessions.length,
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
