/**
 * Change-event indexing — builds the three lookup surfaces (`byResource`,
 * `byCampaign`, `byAdGroup`) that let findings attach a `RecentChange`
 * pointer showing how stale the underlying metrics are.
 *
 * Extracted so `runAudit` and narrow view tools (`getAccountChanges`,
 * `getWasteFindings`) share one implementation. Pure functions — no I/O.
 */

import type { RecentChange, ChangeEventSummary } from "../audit";

// Google Ads change_event enum decodings.
export const RESOURCE_CHANGE_OP: Record<number, string> = {
  2: "CREATE",
  3: "UPDATE",
  4: "REMOVE",
};

export const CHANGE_RESOURCE_TYPE: Record<number, string> = {
  2: "AD",
  3: "AD_GROUP",
  4: "AD_GROUP_CRITERION",
  5: "CAMPAIGN",
  6: "CAMPAIGN_BUDGET",
  7: "CAMPAIGN_CRITERION",
  8: "AD_GROUP_BID_MODIFIER",
  9: "AD_GROUP_FEED",
  10: "CAMPAIGN_FEED",
  11: "AD_GROUP_AD",
  13: "ASSET",
  14: "CUSTOMER_ASSET",
  15: "CAMPAIGN_ASSET",
  16: "AD_GROUP_ASSET",
  17: "ASSET_SET",
  18: "ASSET_SET_ASSET",
  19: "CAMPAIGN_ASSET_SET",
};

export const CHANGE_CLIENT_TYPE: Record<number, string> = {
  2: "GOOGLE_ADS_WEB_CLIENT",
  3: "GOOGLE_ADS_AUTOMATED_RULE",
  4: "GOOGLE_ADS_SCRIPTS",
  5: "GOOGLE_ADS_BULK_UPLOAD",
  6: "GOOGLE_ADS_API",
  7: "GOOGLE_ADS_EDITOR",
  8: "GOOGLE_ADS_MOBILE_APP",
  9: "GOOGLE_ADS_RECOMMENDATIONS",
  10: "SEARCH_ADS_360_SYNC",
  11: "SEARCH_ADS_360_POST",
  12: "INTERNAL_TOOL",
  13: "OTHER",
};

/**
 * The google-ads-api library reports `changed_fields` as either a string
 * ("a,b,c") or a FieldMask object (`{ paths: string[] }`). Accept both.
 */
export function extractChangedFields(raw: unknown): string[] {
  if (!raw) return [];
  if (typeof raw === "string") {
    return raw.split(",").map((s) => s.trim()).filter(Boolean);
  }
  if (typeof raw === "object" && "paths" in (raw as object)) {
    const paths = (raw as { paths?: unknown[] }).paths;
    if (Array.isArray(paths)) return paths.map(String).filter(Boolean);
  }
  return [];
}

/**
 * Whole days between two ISO date/datetime strings. Truncates fractional
 * days so a change from 4 hours ago returns 0 ("today"). Reference is
 * end-of-day so the clamp to zero is unambiguous.
 */
export function daysBetween(changeISO: string, referenceISO: string): number {
  const changeMs = new Date(changeISO).getTime();
  const refMs = new Date(`${referenceISO}T23:59:59`).getTime();
  if (!isFinite(changeMs) || !isFinite(refMs)) return 0;
  return Math.max(0, Math.floor((refMs - changeMs) / 86_400_000));
}

interface ChangeEntry {
  latest: ChangeEventSummary;
  count: number;
}

export interface ChangeIndex {
  /** Flat list of every change in the window, newest first. */
  allChanges: ChangeEventSummary[];
  /**
   * Resolve the most relevant `RecentChange` for a finding by walking the
   * specificity ladder (resource → ad group → campaign), returning the
   * first hit. Callers pass whatever identifiers they have.
   */
  resolveRecentChange(opts: {
    resourceName?: string | null;
    adGroupId?: string | null;
    campaignId?: string | null;
  }): RecentChange | null;
}

/** Lookup tables for campaign and ad-group names, built from Q1 / Q9 rows. */
export interface NameMaps {
  campaignNameById: Map<string, string>;
  adGroupNameById: Map<string, string>;
}

/**
 * Build name lookup maps from raw campaign (Q1) and ad-group (Q9) rows.
 * Either source may be missing — callers may only need one.
 */
export function buildNameMaps(
  campaignRows: readonly unknown[] | null | undefined,
  adGroupRows: readonly unknown[] | null | undefined,
): NameMaps {
  const campaignNameById = new Map<string, string>();
  const adGroupNameById = new Map<string, string>();
  for (const row of campaignRows ?? []) {
    const r = row as { campaign?: { id?: unknown; name?: unknown } };
    if (r.campaign?.id != null) {
      campaignNameById.set(String(r.campaign.id), (r.campaign.name as string) ?? "");
    }
  }
  for (const row of adGroupRows ?? []) {
    const r = row as { ad_group?: { id?: unknown; name?: unknown } };
    if (r.ad_group?.id != null) {
      adGroupNameById.set(String(r.ad_group.id), (r.ad_group.name as string) ?? "");
    }
  }
  return { campaignNameById, adGroupNameById };
}

/**
 * Build the change-event index from Q17 rows. `end` is used as the reference
 * date for `daysAgo` calculations. Names are resolved from `nameMaps`.
 */
export function buildChangeIndex(
  changeEventRows: readonly unknown[] | null | undefined,
  customerId: string,
  end: string,
  nameMaps: NameMaps,
): ChangeIndex {
  const campaignResourcePrefix = `customers/${customerId}/campaigns/`;
  const adGroupResourcePrefix = `customers/${customerId}/adGroups/`;
  const changesByResource = new Map<string, ChangeEntry>();
  const changesByCampaign = new Map<string, ChangeEntry>();
  const changesByAdGroup = new Map<string, ChangeEntry>();
  const allChanges: ChangeEventSummary[] = [];

  function bumpEntry(map: Map<string, ChangeEntry>, key: string, summary: ChangeEventSummary) {
    const existing = map.get(key);
    if (!existing) {
      map.set(key, { latest: summary, count: 1 });
    } else {
      // Rows are DESC by change_date_time so the first seen wins.
      existing.count++;
    }
  }

  for (const row of changeEventRows ?? []) {
    const r = row as { change_event?: Record<string, unknown> };
    const ce = r.change_event ?? {};
    const changeDateTime = ce.change_date_time as string | undefined;
    if (!changeDateTime) continue;
    const resourceName = (ce.resource_name as string) ?? "";
    const resourceType =
      CHANGE_RESOURCE_TYPE[ce.change_resource_type as number] ??
      String(ce.change_resource_type ?? "UNKNOWN");
    const operation =
      RESOURCE_CHANGE_OP[ce.resource_change_operation as number] ??
      String(ce.resource_change_operation ?? "UNKNOWN");
    const clientType =
      CHANGE_CLIENT_TYPE[ce.client_type as number] ?? String(ce.client_type ?? "UNKNOWN");
    const changedFields = extractChangedFields(ce.changed_fields);
    const campaignResource = (ce.campaign as string) ?? "";
    const adGroupResource = (ce.ad_group as string) ?? "";
    const campaignId = campaignResource?.startsWith(campaignResourcePrefix)
      ? campaignResource.slice(campaignResourcePrefix.length)
      : null;
    const adGroupId = adGroupResource?.startsWith(adGroupResourcePrefix)
      ? adGroupResource.slice(adGroupResourcePrefix.length)
      : null;

    const summary: ChangeEventSummary = {
      resourceName,
      resourceType,
      operation,
      changeDateTime,
      daysAgo: daysBetween(changeDateTime, end),
      changedFields,
      clientType,
      campaignName: campaignId ? nameMaps.campaignNameById.get(campaignId) ?? null : null,
      adGroupName: adGroupId ? nameMaps.adGroupNameById.get(adGroupId) ?? null : null,
      userEmail: (ce.user_email as string) ?? null,
    };
    allChanges.push(summary);

    if (resourceName) bumpEntry(changesByResource, resourceName, summary);
    if (campaignId) bumpEntry(changesByCampaign, campaignId, summary);
    if (adGroupId) bumpEntry(changesByAdGroup, adGroupId, summary);
  }

  function toRecentChange(entry: ChangeEntry | undefined): RecentChange | null {
    if (!entry) return null;
    const { latest, count } = entry;
    return {
      daysAgo: latest.daysAgo,
      changeDateTime: latest.changeDateTime,
      changedFields: latest.changedFields,
      operation: latest.operation,
      clientType: latest.clientType,
      resourceType: latest.resourceType,
      otherChangesInWindow: Math.max(0, count - 1),
    };
  }

  return {
    allChanges,
    resolveRecentChange(opts) {
      if (opts.resourceName) {
        const hit = toRecentChange(changesByResource.get(opts.resourceName));
        if (hit) return hit;
      }
      if (opts.adGroupId) {
        const hit = toRecentChange(changesByAdGroup.get(opts.adGroupId));
        if (hit) return hit;
      }
      if (opts.campaignId) {
        const hit = toRecentChange(changesByCampaign.get(opts.campaignId));
        if (hit) return hit;
      }
      return null;
    },
  };
}
