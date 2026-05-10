import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockCustomerFactory, mockMutateResources, mockQuery } = vi.hoisted(() => ({
  mockCustomerFactory: vi.fn(),
  mockMutateResources: vi.fn(),
  mockQuery: vi.fn(),
}));

vi.mock("@/lib/env", () => ({
  getRequiredEnv: vi.fn((name: string) => `${name.toLowerCase()}-value`),
  getEnv: vi.fn((name: string) => `${name.toLowerCase()}-value`),
}));

vi.mock("google-ads-api", () => ({
  GoogleAdsApi: class {
    Customer = mockCustomerFactory;
  },
}));

import {
  FIELD_TYPES,
  findAssetLink,
  getAssetLinks,
  linkAsset,
  unlinkAssetByTarget,
  unlinkAssetLinks,
} from "@/lib/google-ads";

const auth = { refreshToken: "refresh-token", customerId: "130-126-5570" };

describe("asset-links primitive", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCustomerFactory.mockReturnValue({
      mutateResources: mockMutateResources,
      query: mockQuery,
    });
  });

  describe("FIELD_TYPES registry", () => {
    it("encodes correct field_type integers for every supported family", () => {
      expect(FIELD_TYPES.CALLOUT.fieldTypeInt).toBe(11);
      expect(FIELD_TYPES.STRUCTURED_SNIPPET.fieldTypeInt).toBe(12);
      expect(FIELD_TYPES.SITELINK.fieldTypeInt).toBe(13);
      expect(FIELD_TYPES.MARKETING_IMAGE.fieldTypeInt).toBe(5);
      expect(FIELD_TYPES.SQUARE_MARKETING_IMAGE.fieldTypeInt).toBe(19);
    });

    it("scopes asset extensions to the 3 non-PMax levels and image to all 4", () => {
      expect(FIELD_TYPES.CALLOUT.supportedLevels).toEqual(["customer", "campaign", "ad_group"]);
      expect(FIELD_TYPES.SITELINK.supportedLevels).toEqual(["customer", "campaign", "ad_group"]);
      expect(FIELD_TYPES.STRUCTURED_SNIPPET.supportedLevels).toEqual(["customer", "campaign", "ad_group"]);
      expect(FIELD_TYPES.MARKETING_IMAGE.supportedLevels).toEqual(["customer", "campaign", "ad_group", "asset_group"]);
      expect(FIELD_TYPES.SQUARE_MARKETING_IMAGE.supportedLevels).toEqual(["customer", "campaign", "ad_group", "asset_group"]);
    });

    it("uses asset.type IMAGE for image families (not MARKETING_IMAGE)", () => {
      expect(FIELD_TYPES.MARKETING_IMAGE.assetTypeName).toBe("IMAGE");
      expect(FIELD_TYPES.SQUARE_MARKETING_IMAGE.assetTypeName).toBe("IMAGE");
      expect(FIELD_TYPES.CALLOUT.assetTypeName).toBe("CALLOUT");
    });
  });

  describe("linkAsset", () => {
    it("links a callout to a single campaign target", async () => {
      mockQuery.mockResolvedValueOnce([{ asset: { source: "ADVERTISER" } }]);
      mockMutateResources.mockResolvedValueOnce({
        mutate_operation_responses: [
          { campaign_asset_result: { resource_name: "customers/1301265570/campaignAssets/100~999~11" } },
        ],
      });

      const result = await linkAsset(auth, {
        assetId: "999",
        fieldType: "CALLOUT",
        targets: [{ level: "campaign", campaignId: "100" }],
      });

      expect(result).toMatchObject({
        success: true,
        action: "link_asset",
        entityId: "999",
        fieldType: "CALLOUT",
        campaignId: "100",
      });
      expect(result.linksCreated).toEqual([{
        level: "campaign",
        resourceName: "customers/1301265570/campaignAssets/100~999~11",
        assetResourceName: "customers/1301265570/assets/999",
        campaignId: "100",
      }]);
      expect(mockMutateResources.mock.calls[0][0]).toHaveLength(1);
    });

    it("fans out to multiple campaign targets in a single atomic mutate", async () => {
      mockQuery.mockResolvedValueOnce([{ asset: { source: "ADVERTISER" } }]);
      mockMutateResources.mockResolvedValueOnce({
        mutate_operation_responses: [
          { campaign_asset_result: { resource_name: "customers/1301265570/campaignAssets/100~999~11" } },
          { campaign_asset_result: { resource_name: "customers/1301265570/campaignAssets/200~999~11" } },
          { campaign_asset_result: { resource_name: "customers/1301265570/campaignAssets/300~999~11" } },
        ],
      });

      const result = await linkAsset(auth, {
        assetId: "999",
        fieldType: "CALLOUT",
        targets: [
          { level: "campaign", campaignId: "100" },
          { level: "campaign", campaignId: "200" },
          { level: "campaign", campaignId: "300" },
        ],
      });

      expect(result.success).toBe(true);
      expect(result.linksCreated).toHaveLength(3);
      expect(mockMutateResources.mock.calls[0][0]).toHaveLength(3);
    });

    it("rejects an empty targets array with a clear message", async () => {
      const result = await linkAsset(auth, {
        assetId: "999",
        fieldType: "CALLOUT",
        targets: [],
      });
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/at least one target/);
      expect(mockMutateResources).not.toHaveBeenCalled();
    });

    it("rejects unsupported level for the asset family", async () => {
      const result = await linkAsset(auth, {
        assetId: "999",
        fieldType: "CALLOUT",
        targets: [{ level: "asset_group", assetGroupId: "55" }],
      });
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/CALLOUT assets cannot be linked at the asset_group level/);
      expect(mockMutateResources).not.toHaveBeenCalled();
    });

    it("rejects unknown field type", async () => {
      const result = await linkAsset(auth, {
        assetId: "999",
        // @ts-expect-error — testing runtime guard
        fieldType: "BANANA",
        targets: [{ level: "customer" }],
      });
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/Unknown asset fieldType/);
    });
  });

  describe("getAssetLinks", () => {
    it("aggregates links across all 4 levels", async () => {
      mockQuery
        .mockResolvedValueOnce([
          {
            customer_asset: {
              resource_name: "customers/1301265570/customerAssets/999~11",
              field_type: "CALLOUT",
              asset: "customers/1301265570/assets/999",
            },
          },
        ])
        .mockResolvedValueOnce([
          {
            campaign_asset: {
              resource_name: "customers/1301265570/campaignAssets/100~999~11",
              field_type: "CALLOUT",
              asset: "customers/1301265570/assets/999",
              campaign: "customers/1301265570/campaigns/100",
            },
          },
        ])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          {
            asset_group_asset: {
              resource_name: "customers/1301265570/assetGroupAssets/55~999~5",
              field_type: "MARKETING_IMAGE",
              asset: "customers/1301265570/assets/999",
              asset_group: "customers/1301265570/assetGroups/55",
            },
          },
        ]);

      const result = await getAssetLinks(auth, "999");

      expect(result).toHaveLength(3);
      expect(result[0]).toMatchObject({
        level: "customer",
        linkResourceName: "customers/1301265570/customerAssets/999~11",
        fieldType: "CALLOUT",
      });
      expect(result[1]).toMatchObject({
        level: "campaign",
        linkResourceName: "customers/1301265570/campaignAssets/100~999~11",
        campaignId: "100",
      });
      expect(result[2]).toMatchObject({
        level: "asset_group",
        linkResourceName: "customers/1301265570/assetGroupAssets/55~999~5",
        assetGroupId: "55",
      });
    });

    it("returns [] when an asset has no links anywhere", async () => {
      mockQuery.mockResolvedValue([]);
      const result = await getAssetLinks(auth, "999");
      expect(result).toEqual([]);
      expect(mockQuery).toHaveBeenCalledTimes(4);
    });

    it("does not call mutateResources (pure read)", async () => {
      mockQuery.mockResolvedValue([]);
      await getAssetLinks(auth, "999");
      expect(mockMutateResources).not.toHaveBeenCalled();
    });
  });

  describe("unlinkAssetLinks", () => {
    it("removes a single link by canonical resource_name", async () => {
      mockMutateResources.mockResolvedValueOnce({});
      const result = await unlinkAssetLinks(auth, ["customers/1301265570/campaignAssets/100~999~11"]);
      expect(result.success).toBe(true);
      expect(result.action).toBe("unlink_asset");
      expect(result.removed).toBe(1);
      expect(mockMutateResources.mock.calls[0][0][0]).toEqual({
        entity: "campaign_asset",
        operation: "remove",
        resource: "customers/1301265570/campaignAssets/100~999~11",
      });
    });

    it("bulk-removes across all 4 link entities in one atomic mutate", async () => {
      mockMutateResources.mockResolvedValueOnce({});
      const result = await unlinkAssetLinks(auth, [
        "customers/1301265570/customerAssets/999~11",
        "customers/1301265570/campaignAssets/100~999~12",
        "customers/1301265570/adGroupAssets/222~999~13",
        "customers/1301265570/assetGroupAssets/55~999~5",
      ]);
      expect(result.success).toBe(true);
      expect(result.removed).toBe(4);
      const ops = mockMutateResources.mock.calls[0][0];
      expect(ops[0].entity).toBe("customer_asset");
      expect(ops[1].entity).toBe("campaign_asset");
      expect(ops[2].entity).toBe("ad_group_asset");
      expect(ops[3].entity).toBe("asset_group_asset");
    });

    it("rejects unrecognized link resource_names with a helpful error", async () => {
      const result = await unlinkAssetLinks(auth, ["customers/1301265570/unknownAssets/999"]);
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/Unrecognized link resource_name/);
      expect(mockMutateResources).not.toHaveBeenCalled();
    });

    it("rejects empty array", async () => {
      const result = await unlinkAssetLinks(auth, []);
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/at least one link/);
    });
  });

  describe("findAssetLink", () => {
    it("finds a campaign-level link for a callout asset", async () => {
      mockQuery.mockResolvedValueOnce([
        {
          campaign_asset: {
            resource_name: "customers/1301265570/campaignAssets/100~999~11",
          },
        },
      ]);

      const result = await findAssetLink(auth, {
        assetId: "999",
        fieldType: "CALLOUT",
        target: { level: "campaign", campaignId: "100" },
      });

      expect(result.linkResourceName).toBe("customers/1301265570/campaignAssets/100~999~11");
    });

    it("returns null when no link exists", async () => {
      mockQuery.mockResolvedValueOnce([]);
      const result = await findAssetLink(auth, {
        assetId: "999",
        fieldType: "CALLOUT",
        target: { level: "campaign", campaignId: "100" },
      });
      expect(result.linkResourceName).toBeNull();
    });
  });

  describe("unlinkAssetByTarget (composite-key compat helper)", () => {
    it("queries for the link and removes it by resource_name", async () => {
      mockQuery.mockResolvedValueOnce([
        {
          ad_group_asset: {
            resource_name: "customers/1301265570/adGroupAssets/222~999~13",
          },
        },
      ]);
      mockMutateResources.mockResolvedValueOnce({});

      const result = await unlinkAssetByTarget(auth, {
        assetId: "999",
        fieldType: "SITELINK",
        target: { level: "ad_group", adGroupId: "222" },
      });

      expect(result.success).toBe(true);
      expect(result.beforeValue).toBe("customers/1301265570/adGroupAssets/222~999~13");
      expect(mockMutateResources.mock.calls[0][0][0]).toEqual({
        entity: "ad_group_asset",
        operation: "remove",
        resource: "customers/1301265570/adGroupAssets/222~999~13",
      });
    });

    it("returns a clear error when no matching link exists", async () => {
      mockQuery.mockResolvedValueOnce([]);
      const result = await unlinkAssetByTarget(auth, {
        assetId: "999",
        fieldType: "SITELINK",
        target: { level: "ad_group", adGroupId: "222" },
      });
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/No SITELINK ad_group link found/);
      expect(mockMutateResources).not.toHaveBeenCalled();
    });
  });
});
