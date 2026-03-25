import { NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { gte } from "drizzle-orm";
import { listCampaigns, getCampaignPerformance, toMicros, type AuthContext } from "@/lib/google-ads";

/**
 * Daily performance snapshot cron job.
 *
 * Triggered by Vercel Cron (see vercel.json).
 * For each active MCP session, captures yesterday's campaign metrics
 * and stores them in performance_snapshots for impact attribution.
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
      .where(gte(schema.mcpSessions.expiresAt, new Date()));

    let snapshotsCreated = 0;
    let errors = 0;

    for (const session of sessions) {
      try {
        const auth: AuthContext = {
          refreshToken: session.refreshToken,
          customerId: session.customerId,
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
              accountId: session.customerId,
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
        console.error(`[cron/snapshot] Error for session ${session.id}:`, error);
        errors++;
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
