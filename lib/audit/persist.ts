import { db, schema } from "@/lib/db";
import { eq, desc } from "drizzle-orm";
import type { AuditResult, AuditInput } from "./scoring";

/** Skip saving if the last snapshot for this account is < 5 min old */
const DEDUP_WINDOW_MS = 5 * 60 * 1000;

/**
 * Persist an audit snapshot for the dev dashboard.
 * Call fire-and-forget — failures are logged but don't block the audit.
 */
export async function saveAuditSnapshot(
  accountId: string,
  userId: string | null,
  result: AuditResult,
  input: AuditInput,
) {
  // Dedup: skip if a recent snapshot exists
  const [latest] = await db()
    .select({ createdAt: schema.auditSnapshots.createdAt })
    .from(schema.auditSnapshots)
    .where(eq(schema.auditSnapshots.accountId, accountId))
    .orderBy(desc(schema.auditSnapshots.createdAt))
    .limit(1);

  if (latest && Date.now() - new Date(latest.createdAt).getTime() < DEDUP_WINDOW_MS) {
    return;
  }

  const allPassItems = [
    ...result.passes.stopWasting,
    ...result.passes.captureMore,
    ...result.passes.fixFundamentals,
  ];

  const enabledCampaigns = input.campaigns.filter(
    (c) => c.status === "ENABLED" || c.status === 2,
  );

  await db().insert(schema.auditSnapshots).values({
    accountId,
    userId,
    overallScore: Math.round(result.overallScore),
    category: result.category,
    wasteRate: result.pulseMetrics.wasteRate,
    demandCaptured: result.pulseMetrics.demandCaptured,
    cpa: result.pulseMetrics.cpa,
    wastedSpend: result.wastedSpend.total,
    totalSpend: result.keyNumbers.totalSpend,
    campaignCount: enabledCampaigns.length,
    topActions: allPassItems.map((item) => ({
      action: item.action,
      impact: item.impact,
    })),
    impressionShareDiagnosis: result.impressionShareDiagnosis,
  });
}
