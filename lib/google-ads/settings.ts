import { getCustomer } from "./client";
import { extractErrorMessage, normalizeCustomerId, safeEntityId } from "./helpers";
import type { AuthContext, UpdateCampaignSettingsParams, WriteResult } from "./types";

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

  if (results.length === 0) {
    return { success: false, results: [], error: "No settings to update — provide at least one of: networks, locationTargeting, negativeLocationTargeting" };
  }

  return {
    success: results.every((r) => r.success),
    results,
  };
}
