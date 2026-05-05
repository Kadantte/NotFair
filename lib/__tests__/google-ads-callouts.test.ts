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
  addCalloutAsset,
  createCalloutAsset,
  linkCalloutAsset,
  linkCalloutToAccount,
  removeCalloutFromAccount,
  listCalloutAssets,
} from "@/lib/google-ads";

const auth = { refreshToken: "refresh-token", customerId: "130-126-5570" };

describe("callouts (RMF C.75)", () => {
  beforeEach(() => {
    mockCustomerFactory.mockReset();
    mockMutateResources.mockReset();
    mockQuery.mockReset();
    mockCustomerFactory.mockReturnValue({
      mutateResources: mockMutateResources,
      query: mockQuery,
    });
  });

  describe("addCalloutAsset", () => {
    it("creates a callout and links it to campaign targets", async () => {
      mockMutateResources.mockResolvedValueOnce({
        mutate_operation_responses: [
          { asset_result: { resource_name: "customers/1301265570/assets/999" } },
          { campaign_asset_result: { resource_name: "customers/1301265570/campaignAssets/123~999~11" } },
        ],
      });

      const result = await addCalloutAsset(auth, {
        text: "Free shipping",
        targets: [{ level: "campaign", campaignId: "123" }],
      });

      expect(result).toMatchObject({
        success: true,
        action: "add_callout_asset",
        entityId: "999",
        assetType: "CALLOUT",
      });
      expect(mockMutateResources).toHaveBeenCalledTimes(1);
      expect(mockMutateResources.mock.calls[0][0]).toEqual([
        {
          entity: "asset",
          operation: "create",
          resource: {
            resource_name: "customers/1301265570/assets/-1",
            callout_asset: { callout_text: "Free shipping" },
          },
        },
        {
          entity: "campaign_asset",
          operation: "create",
          resource: {
            campaign: "customers/1301265570/campaigns/123",
            asset: "customers/1301265570/assets/-1",
            field_type: 11,
          },
        },
      ]);
    });

    it("does not default explicit empty targets to account-level serving", async () => {
      mockMutateResources.mockResolvedValueOnce({
        mutate_operation_responses: [
          { asset_result: { resource_name: "customers/1301265570/assets/999" } },
        ],
      });

      const result = await addCalloutAsset(auth, {
        text: "Free shipping",
        targets: [],
      });

      expect(result.success).toBe(true);
      expect(result.linksCreated).toEqual([]);
      expect(mockMutateResources).toHaveBeenCalledTimes(1);
      expect(mockMutateResources.mock.calls[0][0]).toHaveLength(1);
      expect(mockMutateResources.mock.calls[0][0][0]).toMatchObject({
        entity: "asset",
        operation: "create",
      });
    });
  });

  describe("createCalloutAsset", () => {
    it("creates asset and links to customer when linkToAccount=true", async () => {
      mockMutateResources.mockResolvedValueOnce({
        mutate_operation_responses: [
          { asset_result: { resource_name: "customers/1301265570/assets/999" } },
          { customer_asset_result: { resource_name: "customers/1301265570/customerAssets/999~11" } },
        ],
      });

      const result = await createCalloutAsset(auth, { text: "Free shipping", linkToAccount: true });

      expect(result).toMatchObject({
        success: true,
        action: "create_callout_asset",
        entityId: "999",
        afterValue: "Free shipping",
      });
      expect(mockMutateResources).toHaveBeenCalledTimes(1);
      // Asset mutation sets callout_asset.callout_text
      expect(mockMutateResources.mock.calls[0][0][0].resource).toEqual({
        resource_name: "customers/1301265570/assets/-1",
        callout_asset: { callout_text: "Free shipping" },
      });
      // Customer_asset link references the temporary asset in the same atomic mutate.
      expect(mockMutateResources.mock.calls[0][0][1].resource).toEqual({
        asset: "customers/1301265570/assets/-1",
        field_type: 11,
      });
    });

    it("only creates the asset when linkToAccount=false", async () => {
      mockMutateResources.mockResolvedValueOnce({
        mutate_operation_responses: [
          { asset_result: { resource_name: "customers/1301265570/assets/1001" } },
        ],
      });
      const result = await createCalloutAsset(auth, { text: "24/7 support", linkToAccount: false });
      expect(result.success).toBe(true);
      expect(result.entityId).toBe("1001");
      expect(mockMutateResources).toHaveBeenCalledTimes(1);
    });

    it("rejects empty text", async () => {
      const result = await createCalloutAsset(auth, { text: "  ", linkToAccount: true });
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/cannot be empty/i);
      expect(mockMutateResources).not.toHaveBeenCalled();
    });

    it("rejects text over 25 chars", async () => {
      const result = await createCalloutAsset(auth, { text: "a".repeat(26), linkToAccount: true });
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/25 characters/);
      expect(mockMutateResources).not.toHaveBeenCalled();
    });

    it("surfaces API errors", async () => {
      mockMutateResources.mockRejectedValueOnce(new Error("INVALID_CALLOUT"));
      const result = await createCalloutAsset(auth, { text: "Free shipping", linkToAccount: true });
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/INVALID_CALLOUT/);
    });
  });

  describe("linkCalloutToAccount", () => {
    it("creates a customer_asset link with CALLOUT field_type", async () => {
      mockMutateResources.mockResolvedValueOnce({
        mutate_operation_responses: [
          { customer_asset_result: { resource_name: "customers/1301265570/customerAssets/5~10" } },
        ],
      });
      const result = await linkCalloutToAccount(auth, "5");
      expect(result.success).toBe(true);
      expect(result.action).toBe("link_callout_to_account");
      expect(mockMutateResources.mock.calls[0][0][0].resource).toEqual({
        asset: "customers/1301265570/assets/5",
        field_type: 11,
      });
    });
  });

  describe("linkCalloutAsset", () => {
    it("creates an ad-group callout link", async () => {
      mockMutateResources.mockResolvedValueOnce({
        mutate_operation_responses: [
          { ad_group_asset_result: { resource_name: "customers/1301265570/adGroupAssets/111~5~11" } },
        ],
      });
      const result = await linkCalloutAsset(auth, {
        assetId: "5",
        target: { level: "ad_group", adGroupId: "111" },
      });
      expect(result.success).toBe(true);
      expect(mockMutateResources.mock.calls[0][0][0].resource).toEqual({
        ad_group: "customers/1301265570/adGroups/111",
        asset: "customers/1301265570/assets/5",
        field_type: 11,
      });
    });
  });

  describe("removeCalloutFromAccount", () => {
    it("finds the customer_asset link and removes it", async () => {
      mockQuery.mockResolvedValueOnce([
        {
          customer_asset: {
            resource_name: "customers/1301265570/customerAssets/5~10",
          },
        },
      ]);
      mockMutateResources.mockResolvedValueOnce({});
      const result = await removeCalloutFromAccount(auth, "5");
      expect(result.success).toBe(true);
      expect(result.beforeValue).toBe("customers/1301265570/customerAssets/5~10");
      expect(mockMutateResources.mock.calls[0][0][0]).toEqual({
        entity: "customer_asset",
        operation: "remove",
        resource: "customers/1301265570/customerAssets/5~10",
      });
    });

    it("reports not-found when no link exists", async () => {
      mockQuery.mockResolvedValueOnce([]);
      const result = await removeCalloutFromAccount(auth, "5");
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/No account-level callout link found/);
      expect(mockMutateResources).not.toHaveBeenCalled();
    });
  });

  describe("listCalloutAssets", () => {
    it("returns callout assets annotated with account link status", async () => {
      mockQuery
        // assets
        .mockResolvedValueOnce([
          {
            asset: {
              id: "5",
              resource_name: "customers/1301265570/assets/5",
              callout_asset: { callout_text: "Free shipping" },
            },
          },
          {
            asset: {
              id: "6",
              resource_name: "customers/1301265570/assets/6",
              callout_asset: { callout_text: "24/7 support" },
            },
          },
        ])
        // links
        .mockResolvedValueOnce([
          {
            customer_asset: {
              asset: "customers/1301265570/assets/5",
              resource_name: "customers/1301265570/customerAssets/5~10",
              field_type: "CALLOUT",
            },
          },
        ]);

      const result = await listCalloutAssets(auth);
      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({ assetId: "5", text: "Free shipping", linkedAtAccount: true });
      expect(result[1]).toMatchObject({ assetId: "6", text: "24/7 support", linkedAtAccount: false });
    });
  });
});
