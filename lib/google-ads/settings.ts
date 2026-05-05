import { getCustomer } from "./client";
import { extractErrorMessage, normalizeCustomerId, safeEntityId } from "./helpers";
import type { AdScheduleSlot, AuthContext, UpdateCampaignSettingsParams, WriteResult } from "./types";

// PositiveGeoTargetType: API v22 numeric values
const POSITIVE_GEO_TARGET_TYPE_MAP: Record<string, number> = {
  PRESENCE_OR_INTEREST: 5,
  PRESENCE: 7,
};
const POSITIVE_GEO_TARGET_TYPE_REVERSE: Record<number, string> = Object.fromEntries(
  Object.entries(POSITIVE_GEO_TARGET_TYPE_MAP).map(([k, v]) => [v, k]),
);

// NegativeGeoTargetType: API v22 numeric values
const NEGATIVE_GEO_TARGET_TYPE_MAP: Record<string, number> = {
  PRESENCE_OR_INTEREST: 4,
  PRESENCE: 5,
};
const NEGATIVE_GEO_TARGET_TYPE_REVERSE: Record<number, string> = Object.fromEntries(
  Object.entries(NEGATIVE_GEO_TARGET_TYPE_MAP).map(([k, v]) => [v, k]),
);

// ProximityRadiusUnits: API v22 numeric values
const PROXIMITY_RADIUS_UNITS_MAP: Record<string, number> = {
  MILES: 2,
  KILOMETERS: 3,
};

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

const BIDDING_STRATEGY_TYPE_NAME: Record<number, string> = {
  0: "UNSPECIFIED",
  1: "UNKNOWN",
  2: "ENHANCED_CPC",
  3: "MANUAL_CPC",
  4: "MANUAL_CPM",
  5: "PAGE_ONE_PROMOTED",
  6: "TARGET_CPA",
  7: "TARGET_OUTRANK_SHARE",
  8: "TARGET_ROAS",
  9: "TARGET_SPEND",
  10: "MAXIMIZE_CONVERSIONS",
  11: "MAXIMIZE_CONVERSION_VALUE",
  12: "PERCENT_CPC",
  13: "MANUAL_CPV",
  14: "TARGET_CPM",
  15: "TARGET_IMPRESSION_SHARE",
  16: "COMMISSION",
  17: "INVALID",
  18: "MANUAL_CPA",
  19: "FIXED_CPM",
  20: "TARGET_CPV",
  21: "TARGET_CPC",
  22: "FIXED_SHARE_OF_VOICE",
};

const SMART_BIDDING_STRATEGIES = new Set([
  "TARGET_CPA",
  "TARGET_ROAS",
  "MAXIMIZE_CONVERSIONS",
  "MAXIMIZE_CONVERSION_VALUE",
]);

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
  warnings?: Array<{ code: string; message: string }>;
  error?: string;
}

type CampaignBiddingStrategyRow = {
  campaign?: {
    bidding_strategy_type?: string | number | null;
  };
};

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
  const warnings: Array<{ code: string; message: string }> = [];

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

  // 2. Update geo target type setting
  if (params.positiveGeoTargetType !== undefined || params.negativeGeoTargetType !== undefined) {
    try {
      // Fetch current for beforeValue
      const current = await customer.query(`
        SELECT
          campaign.geo_target_type_setting.positive_geo_target_type,
          campaign.geo_target_type_setting.negative_geo_target_type
        FROM campaign
        WHERE campaign.id = ${cid}
        LIMIT 1
      `);
      const gts = (current as any[])[0]?.campaign?.geo_target_type_setting ?? {};

      const geoTargetSetting: Record<string, number> = {};
      if (params.positiveGeoTargetType !== undefined) {
        geoTargetSetting.positive_geo_target_type = POSITIVE_GEO_TARGET_TYPE_MAP[params.positiveGeoTargetType];
      }
      if (params.negativeGeoTargetType !== undefined) {
        geoTargetSetting.negative_geo_target_type = NEGATIVE_GEO_TARGET_TYPE_MAP[params.negativeGeoTargetType];
      }

      await customer.mutateResources([
        {
          entity: "campaign" as any,
          operation: "update",
          resource: {
            resource_name: campaignResourceName,
            geo_target_type_setting: geoTargetSetting,
          },
        },
      ]);

      results.push({
        success: true,
        action: "update_geo_target_type",
        entityId: campaignId,
        beforeValue: JSON.stringify({
          positive: gts.positive_geo_target_type != null ? (POSITIVE_GEO_TARGET_TYPE_REVERSE[gts.positive_geo_target_type] ?? gts.positive_geo_target_type) : null,
          negative: gts.negative_geo_target_type != null ? (NEGATIVE_GEO_TARGET_TYPE_REVERSE[gts.negative_geo_target_type] ?? gts.negative_geo_target_type) : null,
        }),
        afterValue: JSON.stringify({
          positive: params.positiveGeoTargetType ?? null,
          negative: params.negativeGeoTargetType ?? null,
        }),
      });
    } catch (error) {
      results.push({
        success: false,
        action: "update_geo_target_type",
        entityId: campaignId,
        beforeValue: "",
        afterValue: "",
        error: extractErrorMessage(error),
      });
    }
  }

  // 3. Add location targeting criteria
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

  // 4. Remove location targeting criteria
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

  // 5. Replace ad schedule
  if (params.adSchedule) {
    try {
      const expanded = expandSlots(params.adSchedule.set);
      for (const s of expanded) {
        const err = validateSlot(s);
        if (err) throw new Error(err);
      }
      const scheduleRestrictsHours = expanded.length > 0 && !isFullWeekAllDay(expanded);
      if (scheduleRestrictsHours) {
        const biddingStrategy = await getCampaignBiddingStrategy(customer, cid);
        if (SMART_BIDDING_STRATEGIES.has(biddingStrategy)) {
          warnings.push({
            code: "SMART_BIDDING_SCHEDULE_RESTRICTION",
            message:
              `Campaign uses ${biddingStrategy}. Ad schedule restrictions are respected, ` +
              "but can reduce smart bidding learning signal. Prefer 24/7 schedules unless " +
              "you have strong data that specific hours are unprofitable even at low bids.",
          });
        }
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

  // 6. Add proximity targeting criteria
  if ((params.proximityTargeting?.add ?? []).length > 0) {
    const adds = params.proximityTargeting!.add!;
    try {
      const operations = adds.map((p) => ({
        entity: "campaign_criterion" as any,
        operation: "create" as const,
        resource: {
          campaign: campaignResourceName,
          proximity: {
            geo_point: {
              latitude_in_micro_degrees: p.latitudeMicroDegrees,
              longitude_in_micro_degrees: p.longitudeMicroDegrees,
            },
            radius: p.radius,
            radius_units: PROXIMITY_RADIUS_UNITS_MAP[p.radiusUnits],
          },
        },
      }));

      await customer.mutateResources(operations as any);

      results.push({
        success: true,
        action: "add_proximity_target",
        entityId: campaignId,
        beforeValue: "",
        afterValue: JSON.stringify(adds.map((p) => ({
          lat: p.latitudeMicroDegrees,
          lng: p.longitudeMicroDegrees,
          radius: p.radius,
          units: p.radiusUnits,
          label: p.label ?? null,
        }))),
      });
    } catch (error) {
      results.push({
        success: false,
        action: "add_proximity_target",
        entityId: campaignId,
        beforeValue: "",
        afterValue: JSON.stringify(adds.map((p) => p.label ?? `${p.latitudeMicroDegrees},${p.longitudeMicroDegrees}`)),
        error: extractErrorMessage(error),
      });
    }
  }

  // 7. Remove proximity targeting criteria
  if ((params.proximityTargeting?.remove ?? []).length > 0) {
    const criterionIds = params.proximityTargeting!.remove!;
    try {
      const criteriaResult = await customer.query(`
        SELECT
          campaign_criterion.resource_name,
          campaign_criterion.criterion_id,
          campaign_criterion.proximity.radius,
          campaign_criterion.proximity.radius_units
        FROM campaign_criterion
        WHERE campaign.id = ${cid}
          AND campaign_criterion.type = 'PROXIMITY'
        LIMIT 200
      `);

      const toRemove = criterionIds
        .map((crit) => {
          const match = (criteriaResult as any[]).find((r) =>
            String(r.campaign_criterion?.criterion_id ?? "") === String(crit),
          );
          return match ? {
            resourceName: match.campaign_criterion.resource_name as string,
            criterionId: crit,
          } : null;
        })
        .filter((x): x is NonNullable<typeof x> => x !== null);

      if (toRemove.length > 0) {
        await customer.mutateResources(
          toRemove.map(({ resourceName }) => ({
            entity: "campaign_criterion" as any,
            operation: "remove" as const,
            resource: resourceName as any,
          })) as any,
        );

        results.push({
          success: true,
          action: "remove_proximity_target",
          entityId: campaignId,
          beforeValue: JSON.stringify(toRemove.map((t) => t.criterionId)),
          afterValue: "",
        });
      }

      const notFound = criterionIds.filter((id) => !toRemove.some((t) => t.criterionId === id));
      if (notFound.length > 0) {
        results.push({
          success: false,
          action: "remove_proximity_target",
          entityId: campaignId,
          beforeValue: "",
          afterValue: "",
          error: `Proximity criteria not found for criterion IDs: ${notFound.join(", ")}`,
        });
      }
    } catch (error) {
      results.push({
        success: false,
        action: "remove_proximity_target",
        entityId: campaignId,
        beforeValue: "",
        afterValue: "",
        error: extractErrorMessage(error),
      });
    }
  }

  if (results.length === 0) {
    return { success: false, results: [], error: "No settings to update — provide at least one of: networks, locationTargeting, negativeLocationTargeting, adSchedule, positiveGeoTargetType, negativeGeoTargetType, proximityTargeting" };
  }

  return {
    success: results.every((r) => r.success),
    results,
    ...(warnings.length > 0 ? { warnings } : {}),
  };
}

async function getCampaignBiddingStrategy(
  customer: ReturnType<typeof getCustomer>,
  campaignId: string | number,
): Promise<string> {
  const rows = await customer.query(`
    SELECT campaign.bidding_strategy_type
    FROM campaign
    WHERE campaign.id = ${campaignId}
    LIMIT 1
  `);
  return normalizeBiddingStrategyName((rows as CampaignBiddingStrategyRow[])[0]?.campaign?.bidding_strategy_type);
}

function normalizeBiddingStrategyName(raw: unknown): string {
  if (raw == null) return "UNKNOWN";
  if (typeof raw === "number") return BIDDING_STRATEGY_TYPE_NAME[raw] ?? `UNKNOWN_${raw}`;
  const asNumber = Number(raw);
  if (Number.isInteger(asNumber) && BIDDING_STRATEGY_TYPE_NAME[asNumber]) {
    return BIDDING_STRATEGY_TYPE_NAME[asNumber];
  }
  return String(raw);
}

function isFullWeekAllDay(slots: AdScheduleSlot[]): boolean {
  const days = new Set<string>();
  for (const slot of slots) {
    const startMinute = slot.startMinute ?? "ZERO";
    const endMinute = slot.endMinute ?? "ZERO";
    if (slot.startHour !== 0 || slot.endHour !== 24 || startMinute !== "ZERO" || endMinute !== "ZERO") {
      return false;
    }
    if (slot.dayOfWeek === "ALL") {
      ALL_DAYS.forEach((day) => days.add(day));
    } else {
      days.add(slot.dayOfWeek);
    }
  }
  return ALL_DAYS.every((day) => days.has(day));
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
