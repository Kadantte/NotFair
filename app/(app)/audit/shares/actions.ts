"use server";

import { db, schema } from "@/lib/db";
import { eq, and, desc } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/session";
import type { SharedAuditPayload } from "@/lib/audit/anonymize";

export type AuditHistoryRow = {
  slug: string;
  createdAt: string; // ISO
  overallScore: number;
  category: SharedAuditPayload["category"];
  wasteRate: number;
  wastedSpendBand: string | null;
};

export type AuditHistoryDetail = {
  slug: string;
  createdAt: string;
  payload: SharedAuditPayload;
};

function requireAuth<T>(fn: () => Promise<T>): Promise<T> {
  return fn().catch((err) => {
    if (err instanceof Error && err.message === "Not authenticated") {
      redirect("/connect");
    }
    throw err;
  });
}

/**
 * List the current user's saved audits, most recent first. Only rows owned
 * by the caller are returned — we enforce `owner_user_id = session.userId`
 * at the app layer (the DB client runs as service role so RLS doesn't gate
 * this path).
 */
export async function listAuditHistory(): Promise<AuditHistoryRow[]> {
  return requireAuth(async () => {
    const { session } = await getAuthContext();
    const userId = session.userId;
    if (!userId) return [];

    const rows = await db()
      .select({
        slug: schema.sharedAudits.slug,
        createdAt: schema.sharedAudits.createdAt,
        payload: schema.sharedAudits.payload,
      })
      .from(schema.sharedAudits)
      .where(eq(schema.sharedAudits.ownerUserId, userId))
      .orderBy(desc(schema.sharedAudits.createdAt))
      .limit(100);

    return rows.map((r) => {
      const p = r.payload as SharedAuditPayload;
      return {
        slug: r.slug,
        createdAt: new Date(r.createdAt).toISOString(),
        overallScore: p.overallScore ?? 0,
        category: p.category,
        wasteRate: p.pulseMetrics?.wasteRate ?? 0,
        wastedSpendBand: p.wastedSpend?.total?.band ?? null,
      };
    });
  });
}

/**
 * Load a single audit by slug. Returns null if the row doesn't exist or
 * isn't owned by the caller — the detail page renders 404 on null. Phase 1
 * never allows reading someone else's audit, even if their `visibility`
 * got flipped to 'public'; that code path will be added intentionally in
 * Phase 2 with its own callsite.
 */
export async function getAuditHistoryEntry(
  slug: string,
): Promise<AuditHistoryDetail | null> {
  return requireAuth(async () => {
    const { session } = await getAuthContext();
    const userId = session.userId;
    if (!userId) return null;

    const [row] = await db()
      .select({
        slug: schema.sharedAudits.slug,
        createdAt: schema.sharedAudits.createdAt,
        payload: schema.sharedAudits.payload,
      })
      .from(schema.sharedAudits)
      .where(
        and(
          eq(schema.sharedAudits.slug, slug),
          eq(schema.sharedAudits.ownerUserId, userId),
        ),
      )
      .limit(1);

    if (!row) return null;
    return {
      slug: row.slug,
      createdAt: new Date(row.createdAt).toISOString(),
      payload: row.payload as SharedAuditPayload,
    };
  });
}
