import { db, schema } from "@/lib/db";
import { eq, desc } from "drizzle-orm";
import type { AuditResult, AuditInput } from "./scoring";

/** Skip saving if the last snapshot for this account is < 5 min old */
const DEDUP_WINDOW_MS = 5 * 60 * 1000;

/**
 * Persist an audit snapshot for the dev dashboard.
 *
 * Returns the snapshot id so callers can pass it to the audit-apply UI cards;
 * dedup-skip returns the existing recent snapshot's id, and a true insert
 * returns the new id. When the snapshot can't be resolved at all (no recent
 * row AND insert fails to return), returns `null` and the audit page falls
 * back to text-only rendering.
 */
export async function saveAuditSnapshot(
  accountId: string,
  userId: string | null,
  result: AuditResult,
  input: AuditInput,
): Promise<{ snapshotId: number | null }> {
  // Dedup: skip if a recent snapshot exists
  const [latest] = await db()
    .select({ id: schema.auditSnapshots.id, createdAt: schema.auditSnapshots.createdAt })
    .from(schema.auditSnapshots)
    .where(eq(schema.auditSnapshots.accountId, accountId))
    .orderBy(desc(schema.auditSnapshots.createdAt))
    .limit(1);

  if (latest && Date.now() - new Date(latest.createdAt).getTime() < DEDUP_WINDOW_MS) {
    return { snapshotId: latest.id };
  }

  // Tag every PassItem with its source pass + array index so the Apply route
  // can look up "the recommendation at (passKey, index)" deterministically.
  // Persisting the full PassItem (was: stripped to {action, impact}) is what
  // unlocks Apply buttons — without actionType/campaignId/etc. on the row,
  // the dispatcher can't build a ToolCall. Old rows in the table will still
  // render text-only because they lack actionType.
  const allPassItems = [
    ...result.passes.stopWasting.map((item, index) => ({ ...item, passKey: "stopWasting" as const, index })),
    ...result.passes.captureMore.map((item, index) => ({ ...item, passKey: "captureMore" as const, index })),
    ...result.passes.fixFundamentals.map((item, index) => ({ ...item, passKey: "fixFundamentals" as const, index })),
  ];

  const enabledCampaigns = input.campaigns.filter(
    (c) => c.status === "ENABLED" || c.status === 2,
  );

  const [inserted] = await db()
    .insert(schema.auditSnapshots)
    .values({
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
      topActions: allPassItems,
      impressionShareDiagnosis: result.impressionShareDiagnosis,
    })
    .returning({ id: schema.auditSnapshots.id });

  return { snapshotId: inserted?.id ?? null };
}
