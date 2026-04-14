import { getCustomer } from "./client";
import { extractErrorMessage, normalizeCustomerId, safeEntityId } from "./helpers";
import type { AdScheduleSlot, AuthContext, UpdateCampaignSettingsParams, WriteResult } from "./types";

// Numeric protobuf enum values from google-ads-api enums.
const DAY_OF_WEEK_MAP: Record<string, number> = {
  MONDAY: 2, TUESDAY: 3, WEDNESDAY: 4, THURSDAY: 5, FRIDAY: 6, SATURDAY: 7, SUNDAY: 8,
};
const DAY_OF_WEEK_REVERSE: Record<number, string> = Object.fromEntries(
  Object.entries(DAY_OF_WEEK_MAP).map(([k, v]) => [v, k]),
);
const MINUTE_OF_HOUR_MAP: Record<string, number> = {
  ZERO: 2, FIFTEEN: 3, THIRTY: 4, FORTY_FIVE: 5,
};
const MINUTE_OF_HOUR_REVERSE: Record<number, string> = Object.fromEntries(
  Object.entries(MINUTE_OF_HOUR_MAP).map(([k, v]) => [v, k]),
);
const ALL_DAYS: AdScheduleSlot["dayOfWeek"][] = [
  "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY",
];

function expandSlots(slots: AdScheduleSlot[]): AdScheduleSlot[] {
  return slots.flatMap((s) =>
    s.dayOfWeek === "ALL" ? ALL_DAYS.map((d) => ({ ...s, dayOfWeek: d })) : [s],
  );
}

function validateSlot(s: AdScheduleSlot): string | null {
  if (s.dayOfWeek !== "ALL" && !(s.dayOfWeek in DAY_OF_WEEK_MAP)) return `invalid dayOfWeek: ${s.dayOfWeek}`;
  if (!Number.isInteger(s.startHour) || s.startHour < 0 || s.startHour > 23) return `startHour must be 0-23`;
  if (!Number.isInteger(s.endHour) || s.endHour < 1 || s.endHour > 24) return `endHour must be 1-24`;
  if (s.endHour <= s.startHour) return `endHour (${s.endHour}) must be greater than startHour (${s.startHour})`;
  if (s.startMinute && !(s.startMinute in MINUTE_OF_HOUR_MAP)) return `invalid startMinute`;
  if (s.endMinute && !(s.endMinute in MINUTE_OF_HOUR_MAP)) return `invalid endMinute`;
  return null;
}

// ─── Update Campaign Settings ───────────────────────────────────────

interface CampaignSettingsResult {
  success: boolean;
  results: WriteResult[];
  error?: string;
}

/** Normalize a geo target input to a full resource name. Accepts "2840", "geoTargetConstants/2840", etc. */
function toGeoTargetConstant(input: string): string {
  const trimmed = input.trim();
  if (trimmed.startsWith("geoTargetConstants/")) return trimmed;
  return `geoTargetConstants/${trimmed}`;
}

export async function updateCampaignSettings(
  auth: AuthContext,
  campaignId: string,
  params: UpdateCampaignSettingsParams,
): Promise<CampaignSettingsResult> {
  const customer = getCustomer(auth);
  const cid = safeEntityId(campaignId);
  const customerId = normalizeCustomerId(auth.customerId);
  const campaignResourceName = `customers/${customerId}/campaigns/${cid}`;
  const results: WriteResult[] = [];

  // 1. Update network settings
  if (params.networks) {
    try {
      // Fetch current settings to record beforeValue
      const current = await customer.query(`
        SELECT
          campaign.network_settings.target_google_search,
          campaign.network_settings.target_search_network,
          campaign.network_settings.target_content_network
        FROM campaign
        WHERE campaign.id = ${cid}
        LIMIT 1
      `);
      const ns = (current as any[])[0]?.campaign?.network_settings ?? {};
      const before = {
        googleSearch: ns.target_google_search ?? false,
        searchPartners: ns.target_search_network ?? false,
        displayNetwork: ns.target_content_network ?? false,
      };

      const after = {
        googleSearch: params.networks.googleSearch ?? before.googleSearch,
        searchPartners: params.networks.searchPartners ?? before.searchPartners,
        displayNetwork: params.networks.displayNetwork ?? before.displayNetwork,
      };

      await customer.mutateResources([
        {
          entity: "campaign" as any,
          operation: "update",
          resource: {
            resource_name: campaignResourceName,
            network_settings: {
              target_google_search: after.googleSearch,
              target_search_network: after.searchPartners,
              target_content_network: after.displayNetwork,
            },
          },
        },
      ]);

      results.push({
        success: true,
        action: "update_campaign_networks",
        entityId: campaignId,
        beforeValue: JSON.stringify(before),
        afterValue: JSON.stringify(after),
      });
    } catch (error) {
      results.push({
        success: false,
        action: "update_campaign_networks",
        entityId: campaignId,
        beforeValue: "",
        afterValue: "",
        error: extractErrorMessage(error),
      });
    }
  }

  // 2. Add location targeting criteria
  const locAdds = [
    ...(params.locationTargeting?.add ?? []).map((g) => ({ geo: g, negative: false })),
    ...(params.negativeLocationTargeting?.add ?? []).map((g) => ({ geo: g, negative: true })),
  ];

  if (locAdds.length > 0) {
    try {
      const operations = locAdds.map(({ geo, negative }) => ({
        entity: "campaign_criterion" as any,
        operation: "create" as const,
        resource: {
          campaign: campaignResourceName,
          negative,
          location: {
            geo_target_constant: toGeoTargetConstant(geo),
          },
        },
      }));

      await customer.mutateResources(operations as any);

      results.push({
        success: true,
        action: "add_campaign_location",
        entityId: campaignId,
        beforeValue: "",
        afterValue: JSON.stringify(locAdds.map((l) => ({
          geo: toGeoTargetConstant(l.geo),
          negative: l.negative,
        }))),
      });
    } catch (error) {
      results.push({
        success: false,
        action: "add_campaign_location",
        entityId: campaignId,
        beforeValue: "",
        afterValue: JSON.stringify(locAdds.map((l) => l.geo)),
        error: extractErrorMessage(error),
      });
    }
  }

  // 3. Remove location targeting criteria
  // Separate positive and negative removals to avoid conflating them
  const positiveRemoves = (params.locationTargeting?.remove ?? []).map((g) => ({ geo: g, negative: false }));
  const negativeRemoves = (params.negativeLocationTargeting?.remove ?? []).map((g) => ({ geo: g, negative: true }));
  const locRemoves = [...positiveRemoves, ...negativeRemoves];

  if (locRemoves.length > 0) {
    try {
      // Look up criterion resource names for the given geo target constants
      const criteriaResult = await customer.query(`
        SELECT
          campaign_criterion.resource_name,
          campaign_criterion.location.geo_target_constant,
          campaign_criterion.negative
        FROM campaign_criterion
        WHERE campaign.id = ${cid}
          AND campaign_criterion.type = 'LOCATION'
        LIMIT 200
      `);

      // Match by BOTH geo target constant AND negative flag to avoid removing the wrong criterion
      const toRemove = locRemoves
        .map(({ geo, negative }) => {
          const full = toGeoTargetConstant(geo);
          const match = (criteriaResult as any[]).find((r) => {
            const cc = r.campaign_criterion ?? {};
            return cc.location?.geo_target_constant === full && cc.negative === negative;
          });
          return match ? {
            resourceName: match.campaign_criterion.resource_name as string,
            geo: full,
            negative,
          } : null;
        })
        .filter((x): x is NonNullable<typeof x> => x !== null);

      if (toRemove.length > 0) {
        const operations = toRemove.map(({ resourceName }) => ({
          entity: "campaign_criterion" as any,
          operation: "remove" as const,
          resource: resourceName as any,
        }));

        await customer.mutateResources(operations as any);

        results.push({
          success: true,
          action: "remove_campaign_location",
          entityId: campaignId,
          beforeValue: JSON.stringify(toRemove.map((t) => ({
            geo: t.geo,
            negative: t.negative,
          }))),
          afterValue: "",
        });
      }

      // Report any not-found criteria
      const notFound = locRemoves.filter(({ geo, negative }) => {
        const full = toGeoTargetConstant(geo);
        return !toRemove.some((t) => t.geo === full && t.negative === negative);
      });
      if (notFound.length > 0) {
        results.push({
          success: false,
          action: "remove_campaign_location",
          entityId: campaignId,
          beforeValue: "",
          afterValue: "",
          error: `Location criteria not found for: ${notFound.map((n) => `${n.geo}${n.negative ? " (negative)" : ""}`).join(", ")}`,
        });
      }
    } catch (error) {
      results.push({
        success: false,
        action: "remove_campaign_location",
        entityId: campaignId,
        beforeValue: "",
        afterValue: "",
        error: extractErrorMessage(error),
      });
    }
  }

  // 4. Replace ad schedule
  if (params.adSchedule) {
    try {
      const expanded = expandSlots(params.adSchedule.set);
      for (const s of expanded) {
        const err = validateSlot(s);
        if (err) throw new Error(err);
      }

      // Fetch existing ad schedule criteria for beforeValue + removal.
      const existing = await customer.query(`
        SELECT
          campaign_criterion.resource_name,
          campaign_criterion.ad_schedule.day_of_week,
          campaign_criterion.ad_schedule.start_hour,
          campaign_criterion.ad_schedule.start_minute,
          campaign_criterion.ad_schedule.end_hour,
          campaign_criterion.ad_schedule.end_minute
        FROM campaign_criterion
        WHERE campaign.id = ${cid}
          AND campaign_criterion.type = 'AD_SCHEDULE'
        LIMIT 200
      `);

      const existingRows = existing as any[];
      const before = existingRows.map((r) => {
        const sched = r.campaign_criterion?.ad_schedule ?? {};
        return {
          dayOfWeek: DAY_OF_WEEK_REVERSE[sched.day_of_week] ?? sched.day_of_week,
          startHour: sched.start_hour ?? 0,
          startMinute: MINUTE_OF_HOUR_REVERSE[sched.start_minute] ?? "ZERO",
          endHour: sched.end_hour ?? 0,
          endMinute: MINUTE_OF_HOUR_REVERSE[sched.end_minute] ?? "ZERO",
        };
      });

      // Remove all existing ad-schedule criteria.
      if (existingRows.length > 0) {
        await customer.mutateResources(
          existingRows.map((r) => ({
            entity: "campaign_criterion" as any,
            operation: "remove" as const,
            resource: r.campaign_criterion.resource_name as any,
          })) as any,
        );
      }

      // Create new ones.
      if (expanded.length > 0) {
        await customer.mutateResources(
          expanded.map((s) => ({
            entity: "campaign_criterion" as any,
            operation: "create" as const,
            resource: {
              campaign: campaignResourceName,
              ad_schedule: {
                day_of_week: DAY_OF_WEEK_MAP[s.dayOfWeek as string],
                start_hour: s.startHour,
                start_minute: MINUTE_OF_HOUR_MAP[s.startMinute ?? "ZERO"],
                end_hour: s.endHour,
                end_minute: MINUTE_OF_HOUR_MAP[s.endMinute ?? "ZERO"],
              },
            },
          })) as any,
        );
      }

      const after = expanded.map((s) => ({
        dayOfWeek: s.dayOfWeek,
        startHour: s.startHour,
        startMinute: s.startMinute ?? "ZERO",
        endHour: s.endHour,
        endMinute: s.endMinute ?? "ZERO",
      }));

      results.push({
        success: true,
        action: "set_campaign_ad_schedule",
        entityId: campaignId,
        beforeValue: JSON.stringify(before),
        afterValue: JSON.stringify(after),
      });
    } catch (error) {
      results.push({
        success: false,
        action: "set_campaign_ad_schedule",
        entityId: campaignId,
        beforeValue: "",
        afterValue: "",
        error: extractErrorMessage(error),
      });
    }
  }

  if (results.length === 0) {
    return { success: false, results: [], error: "No settings to update — provide at least one of: networks, locationTargeting, negativeLocationTargeting, adSchedule" };
  }

  return {
    success: results.every((r) => r.success),
    results,
  };
}

// ─── Language Targeting (C.30 / M.10) ───────────────────────────────

/** Normalize a language input to a full resource name. Accepts "1000", "languageConstants/1000", etc. */
function toLanguageConstant(input: string): string {
  const trimmed = input.trim();
  if (trimmed.startsWith("languageConstants/")) return trimmed;
  return `languageConstants/${trimmed}`;
}

/** Add and/or remove language targeting criteria on a campaign. */
export async function updateCampaignLanguages(
  auth: AuthContext,
  campaignId: string,
  params: { add?: string[]; remove?: string[] },
): Promise<CampaignSettingsResult> {
  const customer = getCustomer(auth);
  const cid = safeEntityId(campaignId);
  const customerId = normalizeCustomerId(auth.customerId);
  const campaignResourceName = `customers/${customerId}/campaigns/${cid}`;
  const results: WriteResult[] = [];

  const addIds = params.add ?? [];
  const removeIds = params.remove ?? [];

  if (addIds.length > 0) {
    try {
      const operations = addIds.map((lang) => ({
        entity: "campaign_criterion" as any,
        operation: "create" as const,
        resource: {
          campaign: campaignResourceName,
          language: {
            language_constant: toLanguageConstant(lang),
          },
        },
      }));

      await customer.mutateResources(operations as any);

      results.push({
        success: true,
        action: "add_campaign_language",
        entityId: campaignId,
        beforeValue: "",
        afterValue: JSON.stringify(addIds.map(toLanguageConstant)),
      });
    } catch (error) {
      results.push({
        success: false,
        action: "add_campaign_language",
        entityId: campaignId,
        beforeValue: "",
        afterValue: JSON.stringify(addIds),
        error: extractErrorMessage(error),
      });
    }
  }

  if (removeIds.length > 0) {
    try {
      const criteriaResult = await customer.query(`
        SELECT
          campaign_criterion.resource_name,
          campaign_criterion.language.language_constant
        FROM campaign_criterion
        WHERE campaign.id = ${cid}
          AND campaign_criterion.type = 'LANGUAGE'
        LIMIT 200
      `);

      const toRemove = removeIds
        .map((lang) => {
          const full = toLanguageConstant(lang);
          const match = (criteriaResult as any[]).find((r) => {
            return r.campaign_criterion?.language?.language_constant === full;
          });
          return match ? { resourceName: match.campaign_criterion.resource_name as string, lang: full } : null;
        })
        .filter((x): x is NonNullable<typeof x> => x !== null);

      if (toRemove.length > 0) {
        const operations = toRemove.map(({ resourceName }) => ({
          entity: "campaign_criterion" as any,
          operation: "remove" as const,
          resource: resourceName as any,
        }));

        await customer.mutateResources(operations as any);

        results.push({
          success: true,
          action: "remove_campaign_language",
          entityId: campaignId,
          beforeValue: JSON.stringify(toRemove.map((t) => t.lang)),
          afterValue: "",
        });
      }

      const notFound = removeIds.filter((lang) => {
        const full = toLanguageConstant(lang);
        return !toRemove.some((t) => t.lang === full);
      });
      if (notFound.length > 0) {
        results.push({
          success: false,
          action: "remove_campaign_language",
          entityId: campaignId,
          beforeValue: "",
          afterValue: "",
          error: `Language criteria not found for: ${notFound.join(", ")}`,
        });
      }
    } catch (error) {
      results.push({
        success: false,
        action: "remove_campaign_language",
        entityId: campaignId,
        beforeValue: "",
        afterValue: "",
        error: extractErrorMessage(error),
      });
    }
  }

  if (results.length === 0) {
    return { success: false, results: [], error: "No languages to add or remove" };
  }

  return {
    success: results.every((r) => r.success),
    results,
  };
}
