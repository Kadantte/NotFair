/**
 * Shared primitives for the "narrow audit view" MCP tools in
 * `./audit/views.ts`. The monolithic `runAudit` fan-out was removed —
 * it returned >60KB responses that blew past the MCP token limit and
 * forced agents to fall back to the narrow views anyway. Keep only the
 * types + `toFindingList` helper the narrow views share.
 */

/** Pointer to the most recent change touching an entity relevant to a finding.
 *  When present, the finding's metrics span a window that pre-dates (or straddles)
 *  the change — callers should re-evaluate whether the issue is still current. */
export interface RecentChange {
  /** Whole days between the change and "now" (audit end date). 0 = today. */
  daysAgo: number;
  /** ISO datetime of the change. */
  changeDateTime: string;
  /** Fields that were modified, e.g. "status", "cpc_bid_micros". */
  changedFields: string[];
  /** "CREATE" | "UPDATE" | "REMOVE" */
  operation: string;
  /** Where the change originated: "GOOGLE_ADS_WEB_CLIENT", "GOOGLE_ADS_API", etc. */
  clientType: string;
  /** "CAMPAIGN" | "AD_GROUP" | "AD_GROUP_CRITERION" | "CAMPAIGN_BUDGET" | ... */
  resourceType: string;
  /** Number of additional changes on this resource inside the audit window. */
  otherChangesInWindow: number;
}

export interface ChangeEventSummary {
  resourceName: string;
  resourceType: string;
  operation: string;
  changeDateTime: string;
  daysAgo: number;
  changedFields: string[];
  clientType: string;
  campaignName: string | null;
  adGroupName: string | null;
  userEmail: string | null;
}

export interface WastedItem {
  text: string;
  matchType?: string;
  campaignName: string;
  adGroupName?: string;
  spend: number;
  clicks: number;
  qualityScore?: number | null;
  recentChange: RecentChange | null;
}

export interface SearchTermItem {
  term: string;
  campaignName: string;
  adGroupName?: string;
  spend: number;
  clicks: number;
  conversions: number;
  /** Attached when the campaign or ad group that would own this term was
   *  changed inside the window — e.g. a negative was added, the ad group was
   *  paused, bids were moved. Search terms themselves are not editable. */
  recentChange: RecentChange | null;
}

export interface LandingPage {
  url: string;
  spend: number;
  clicks: number;
  conversions: number;
  cpa: number | null;
  conversionRate: number;
}

/** Self-describing envelope for a finding list. `total` is the underlying
 *  population size (before `shown` was sliced out); `totalSpend` is the sum of
 *  the spend-impact metric across the *full* population so callers can act on
 *  totals even when only a preview is returned. For full drill-down, use
 *  `runScript` with `return await ads.gaql('...')` and a focused filter. */
export interface FindingList<T> {
  shown: number;
  total: number;
  totalSpend: number;
  items: T[];
}

export function toFindingList<T>(
  all: T[],
  limit: number,
  getSpend: (item: T) => number,
): FindingList<T> {
  let totalSpend = 0;
  for (const item of all) totalSpend += getSpend(item) || 0;
  const items = limit >= all.length ? all : all.slice(0, limit);
  return { shown: items.length, total: all.length, totalSpend, items };
}
