import { describe, expect, it } from "vitest";
import {
  buildChangeIndex,
  buildNameMaps,
  daysBetween,
  extractChangedFields,
} from "./change-index";

describe("daysBetween", () => {
  it("returns 0 for a change today", () => {
    expect(daysBetween("2026-04-22T10:00:00Z", "2026-04-22")).toBe(0);
  });

  it("counts whole days between change and reference end-of-day", () => {
    expect(daysBetween("2026-04-20T10:00:00Z", "2026-04-22")).toBe(2);
  });

  it("floors fractional days (does not round up)", () => {
    // change 1h before reference end-of-day → same day, 0
    expect(daysBetween("2026-04-22T22:59:59Z", "2026-04-22")).toBe(0);
  });

  it("clamps to 0 on bad input", () => {
    expect(daysBetween("not-a-date", "2026-04-22")).toBe(0);
    expect(daysBetween("2026-04-22T00:00:00Z", "not-a-date")).toBe(0);
  });
});

describe("extractChangedFields", () => {
  it("handles the string form 'a,b,c'", () => {
    expect(extractChangedFields("status, cpc_bid_micros, name")).toEqual([
      "status",
      "cpc_bid_micros",
      "name",
    ]);
  });

  it("handles the FieldMask object form", () => {
    expect(extractChangedFields({ paths: ["status", "name"] })).toEqual(["status", "name"]);
  });

  it("drops empty tokens", () => {
    expect(extractChangedFields("a,,b, ")).toEqual(["a", "b"]);
  });

  it("returns empty for null/undefined/unknown shapes", () => {
    expect(extractChangedFields(null)).toEqual([]);
    expect(extractChangedFields(undefined)).toEqual([]);
    expect(extractChangedFields(42)).toEqual([]);
    expect(extractChangedFields({ unrelated: true })).toEqual([]);
  });
});

describe("buildNameMaps", () => {
  it("indexes campaign and ad-group names from raw rows", () => {
    const campaignRows = [
      { campaign: { id: 1, name: "Search - Brand" } },
      { campaign: { id: 2, name: "Search - Generic" } },
    ];
    const adGroupRows = [{ ad_group: { id: 10, name: "AG1" } }];
    const maps = buildNameMaps(campaignRows, adGroupRows);
    expect(maps.campaignNameById.get("1")).toBe("Search - Brand");
    expect(maps.campaignNameById.get("2")).toBe("Search - Generic");
    expect(maps.adGroupNameById.get("10")).toBe("AG1");
  });

  it("handles missing / null rows gracefully", () => {
    const maps = buildNameMaps(null, undefined);
    expect(maps.campaignNameById.size).toBe(0);
    expect(maps.adGroupNameById.size).toBe(0);
  });
});

describe("buildChangeIndex", () => {
  const customerId = "123";
  const end = "2026-04-22";
  const nameMaps = {
    campaignNameById: new Map([["500", "Search - Brand"]]),
    adGroupNameById: new Map([["700", "AG1"]]),
  };

  it("flattens allChanges in input order and attributes daysAgo from end date", () => {
    const rows = [
      {
        change_event: {
          change_date_time: "2026-04-21T10:00:00Z",
          change_resource_type: 4, // AD_GROUP_CRITERION
          resource_name: "customers/123/adGroupCriteria/700~1",
          client_type: 6, // GOOGLE_ADS_API
          user_email: "u@example.com",
          changed_fields: "status",
          resource_change_operation: 3, // UPDATE
          campaign: "customers/123/campaigns/500",
          ad_group: "customers/123/adGroups/700",
        },
      },
    ];
    const idx = buildChangeIndex(rows, customerId, end, nameMaps);
    expect(idx.allChanges).toHaveLength(1);
    const c = idx.allChanges[0];
    expect(c.resourceType).toBe("AD_GROUP_CRITERION");
    expect(c.operation).toBe("UPDATE");
    expect(c.clientType).toBe("GOOGLE_ADS_API");
    expect(c.campaignName).toBe("Search - Brand");
    expect(c.adGroupName).toBe("AG1");
    expect(c.daysAgo).toBe(1);
  });

  it("resolveRecentChange walks the specificity ladder (resource → ad group → campaign)", () => {
    const rows = [
      {
        change_event: {
          change_date_time: "2026-04-21T10:00:00Z",
          change_resource_type: 4,
          resource_name: "customers/123/adGroupCriteria/700~1",
          client_type: 6,
          changed_fields: "status",
          resource_change_operation: 3,
          campaign: "customers/123/campaigns/500",
          ad_group: "customers/123/adGroups/700",
        },
      },
      {
        change_event: {
          change_date_time: "2026-04-20T10:00:00Z",
          change_resource_type: 5,
          resource_name: "customers/123/campaigns/500",
          client_type: 2,
          changed_fields: "budget",
          resource_change_operation: 3,
          campaign: "customers/123/campaigns/500",
        },
      },
    ];
    const idx = buildChangeIndex(rows, customerId, end, nameMaps);

    // Exact resource match wins over campaign-scope fallback
    const hitByResource = idx.resolveRecentChange({
      resourceName: "customers/123/adGroupCriteria/700~1",
      adGroupId: "700",
      campaignId: "500",
    });
    expect(hitByResource?.changedFields).toEqual(["status"]);

    // Ad-group scope returns the ad-group-attributed change, not the campaign one
    const hitByAdGroup = idx.resolveRecentChange({ adGroupId: "700", campaignId: "500" });
    expect(hitByAdGroup?.resourceType).toBe("AD_GROUP_CRITERION");

    // Campaign scope only
    const hitByCampaign = idx.resolveRecentChange({ campaignId: "500" });
    expect(hitByCampaign).not.toBeNull();

    // Nothing matches
    expect(idx.resolveRecentChange({ campaignId: "999" })).toBeNull();
  });

  it("counts otherChangesInWindow when multiple changes touch the same resource", () => {
    const rows = [
      {
        change_event: {
          change_date_time: "2026-04-22T10:00:00Z",
          change_resource_type: 5,
          resource_name: "customers/123/campaigns/500",
          client_type: 2,
          changed_fields: "status",
          resource_change_operation: 3,
          campaign: "customers/123/campaigns/500",
        },
      },
      {
        change_event: {
          change_date_time: "2026-04-20T10:00:00Z",
          change_resource_type: 5,
          resource_name: "customers/123/campaigns/500",
          client_type: 2,
          changed_fields: "budget",
          resource_change_operation: 3,
          campaign: "customers/123/campaigns/500",
        },
      },
    ];
    const idx = buildChangeIndex(rows, customerId, end, nameMaps);
    const rc = idx.resolveRecentChange({
      resourceName: "customers/123/campaigns/500",
    });
    expect(rc?.daysAgo).toBe(0); // newest change was today
    expect(rc?.otherChangesInWindow).toBe(1);
  });

  it("skips rows without a change_date_time", () => {
    const rows = [
      { change_event: { change_date_time: "", resource_name: "foo" } },
      { change_event: {} },
    ];
    const idx = buildChangeIndex(rows, customerId, end, nameMaps);
    expect(idx.allChanges).toHaveLength(0);
  });

  it("handles null / undefined rows", () => {
    expect(buildChangeIndex(null, customerId, end, nameMaps).allChanges).toEqual([]);
    expect(buildChangeIndex(undefined, customerId, end, nameMaps).allChanges).toEqual([]);
  });

  it("maps unknown resource/operation/client-type codes to UNKNOWN strings", () => {
    const rows = [
      {
        change_event: {
          change_date_time: "2026-04-22T10:00:00Z",
          change_resource_type: 999,
          resource_name: "foo",
          client_type: 999,
          changed_fields: "x",
          resource_change_operation: 999,
        },
      },
    ];
    const idx = buildChangeIndex(rows, customerId, end, nameMaps);
    expect(idx.allChanges[0].resourceType).toBe("999");
    expect(idx.allChanges[0].operation).toBe("999");
    expect(idx.allChanges[0].clientType).toBe("999");
  });
});
