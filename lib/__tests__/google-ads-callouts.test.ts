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
  createCalloutAsset,
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

  describe("createCalloutAsset (no targets — asset only)", () => {
    it("creates a callout without any links when targets is omitted", async () => {
      mockMutateResources.mockResolvedValueOnce({
        mutate_operation_responses: [
          { asset_result: { resource_name: "customers/1301265570/assets/999" } },
        ],
      });
      const result = await createCalloutAsset(auth, { text: "Free shipping" });
      expect(result).toMatchObject({
        success: true,
        action: "create_callout_asset",
        entityId: "999",
        afterValue: "Free shipping",
        fieldType: "CALLOUT",
      });
      expect(result.linksCreated).toEqual([]);
      expect(mockMutateResources).toHaveBeenCalledTimes(1);
      expect(mockMutateResources.mock.calls[0][0]).toHaveLength(1);
    });

    it("rejects empty text", async () => {
      const result = await createCalloutAsset(auth, { text: "  " });
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/cannot be empty/i);
      expect(mockMutateResources).not.toHaveBeenCalled();
    });

    it("rejects text over 25 chars", async () => {
      const result = await createCalloutAsset(auth, { text: "a".repeat(26) });
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/25 characters/);
      expect(mockMutateResources).not.toHaveBeenCalled();
    });

    it("rejects phone numbers before Google policy rejection", async () => {
      const result = await createCalloutAsset(auth, { text: "818-900-7479" });
      expect(result.success).toBe(false);
      expect(result.error).toContain("PHONE_NUMBER_IN_AD_TEXT");
      expect(mockMutateResources).not.toHaveBeenCalled();
    });

    it("surfaces API errors", async () => {
      mockMutateResources.mockRejectedValueOnce(new Error("INVALID_CALLOUT"));
      const result = await createCalloutAsset(auth, {
        text: "Free shipping",
        targets: [{ level: "customer" }],
      });
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/INVALID_CALLOUT/);
    });
  });

  describe("createCalloutAsset (with targets — atomic create+link)", () => {
    it("creates callout and links it to a campaign target in one mutate", async () => {
      mockMutateResources.mockResolvedValueOnce({
        mutate_operation_responses: [
          { asset_result: { resource_name: "customers/1301265570/assets/999" } },
          { campaign_asset_result: { resource_name: "customers/1301265570/campaignAssets/123~999~11" } },
        ],
      });

      const result = await createCalloutAsset(auth, {
        text: "Free shipping",
        targets: [{ level: "campaign", campaignId: "123" }],
      });

      expect(result).toMatchObject({
        success: true,
        action: "create_callout_asset",
        entityId: "999",
        fieldType: "CALLOUT",
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

    it("creates callout and links at customer (account) level", async () => {
      mockMutateResources.mockResolvedValueOnce({
        mutate_operation_responses: [
          { asset_result: { resource_name: "customers/1301265570/assets/999" } },
          { customer_asset_result: { resource_name: "customers/1301265570/customerAssets/999~11" } },
        ],
      });
      const result = await createCalloutAsset(auth, {
        text: "Free shipping",
        targets: [{ level: "customer" }],
      });
      expect(result.success).toBe(true);
      expect(mockMutateResources.mock.calls[0][0][1].resource).toEqual({
        asset: "customers/1301265570/assets/-1",
        field_type: 11,
      });
    });

    it("does not default an explicit empty targets array to anything", async () => {
      mockMutateResources.mockResolvedValueOnce({
        mutate_operation_responses: [
          { asset_result: { resource_name: "customers/1301265570/assets/999" } },
        ],
      });
      const result = await createCalloutAsset(auth, {
        text: "Free shipping",
        targets: [],
      });
      expect(result.success).toBe(true);
      expect(result.linksCreated).toEqual([]);
      expect(mockMutateResources.mock.calls[0][0]).toHaveLength(1);
    });
  });

  describe("listCalloutAssets", () => {
    it("returns callout assets annotated with account link status", async () => {
      mockQuery
        .mockResolvedValueOnce([
          {
            asset: {
              id: "5",
              resource_name: "customers/1301265570/assets/5",
              source: "ADVERTISER",
              callout_asset: { callout_text: "Free shipping" },
            },
          },
          {
            asset: {
              id: "6",
              resource_name: "customers/1301265570/assets/6",
              source: "AUTOMATICALLY_CREATED",
              callout_asset: { callout_text: "24/7 support" },
            },
          },
        ])
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
      expect(result[0]).toMatchObject({ assetId: "5", text: "Free shipping", source: "ADVERTISER", autoGenerated: false, linkedAtAccount: true });
      expect(result[1]).toMatchObject({ assetId: "6", text: "24/7 support", source: "AUTOMATICALLY_CREATED", autoGenerated: true, linkedAtAccount: false });
    });
  });
});
