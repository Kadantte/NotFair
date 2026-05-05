import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockCustomerFactory, mockMutateResources } = vi.hoisted(() => ({
  mockCustomerFactory: vi.fn(),
  mockMutateResources: vi.fn(),
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

import { createImageAsset, fetchImageAssetFromUrl, linkImageAsset } from "@/lib/google-ads";

const auth = { refreshToken: "refresh-token", customerId: "130-126-5570" };

function fakePng(width: number, height: number): Buffer {
  const bytes = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(bytes, 0);
  bytes.writeUInt32BE(13, 8);
  bytes.write("IHDR", 12, "ascii");
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  return bytes;
}

describe("image assets", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCustomerFactory.mockReturnValue({
      mutateResources: mockMutateResources,
      query: vi.fn(),
    });
  });

  describe("fetchImageAssetFromUrl", () => {
    it("rejects non-HTTPS image URLs before fetching", async () => {
      await expect(fetchImageAssetFromUrl("http://example.com/image.png")).rejects.toThrow(/HTTPS URL/);
    });
  });

  describe("createImageAsset", () => {
    it("uploads a landscape PNG image asset", async () => {
      mockMutateResources.mockResolvedValueOnce({
        mutate_operation_responses: [
          { asset_result: { resource_name: "customers/1301265570/assets/999" } },
        ],
      });

      const imageBytes = fakePng(1200, 628);
      const result = await createImageAsset(auth, {
        imageBytes,
        mimeType: "IMAGE_PNG",
        fieldType: "MARKETING_IMAGE",
        name: "Spring promo landscape",
      });

      expect(result).toMatchObject({
        success: true,
        action: "create_image_asset",
        entityId: "999",
        afterValue: "Spring promo landscape (MARKETING_IMAGE, 1200x628)",
      });
      expect(mockMutateResources).toHaveBeenCalledTimes(1);
      expect(mockMutateResources.mock.calls[0][0][0].resource).toEqual({
        name: "Spring promo landscape",
        image_asset: {
          data: imageBytes,
          mime_type: 4,
        },
      });
    });

    it("rejects a landscape image with the wrong aspect ratio before mutating", async () => {
      const result = await createImageAsset(auth, {
        imageBytes: fakePng(1200, 630),
        mimeType: "IMAGE_PNG",
        fieldType: "MARKETING_IMAGE",
        name: "Bad landscape",
      });

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/exactly 1\.91:1/);
      expect(mockMutateResources).not.toHaveBeenCalled();
    });

    it("rejects a non-square square marketing image before mutating", async () => {
      const result = await createImageAsset(auth, {
        imageBytes: fakePng(400, 300),
        mimeType: "IMAGE_PNG",
        fieldType: "SQUARE_MARKETING_IMAGE",
        name: "Bad square",
      });

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/exactly 1:1/);
      expect(mockMutateResources).not.toHaveBeenCalled();
    });
  });

  describe("linkImageAsset", () => {
    it("links an image asset to a campaign", async () => {
      mockMutateResources.mockResolvedValueOnce({
        mutate_operation_responses: [
          { campaign_asset_result: { resource_name: "customers/1301265570/campaignAssets/123~999~5" } },
        ],
      });

      const result = await linkImageAsset(auth, {
        assetId: "999",
        fieldType: "MARKETING_IMAGE",
        level: "campaign",
        campaignId: "123",
      });

      expect(result).toMatchObject({
        success: true,
        action: "link_image_asset",
        entityId: "999",
        afterValue: "customers/1301265570/campaignAssets/123~999~5",
      });
      expect(mockMutateResources.mock.calls[0][0][0]).toEqual({
        entity: "campaign_asset",
        operation: "create",
        resource: {
          campaign: "customers/1301265570/campaigns/123",
          asset: "customers/1301265570/assets/999",
          field_type: 5,
        },
      });
    });

    it("links an image asset to a Performance Max asset group", async () => {
      mockMutateResources.mockResolvedValueOnce({
        mutate_operation_responses: [
          { asset_group_asset_result: { resource_name: "customers/1301265570/assetGroupAssets/55~999~19" } },
        ],
      });

      const result = await linkImageAsset(auth, {
        assetId: "999",
        fieldType: "SQUARE_MARKETING_IMAGE",
        level: "asset_group",
        assetGroupId: "55",
      });

      expect(result.success).toBe(true);
      expect(mockMutateResources.mock.calls[0][0][0].resource).toEqual({
        asset_group: "customers/1301265570/assetGroups/55",
        asset: "customers/1301265570/assets/999",
        field_type: 19,
      });
    });

    it("requires the target ID for the selected link level", async () => {
      const result = await linkImageAsset(auth, {
        assetId: "999",
        fieldType: "MARKETING_IMAGE",
        level: "ad_group",
      });

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/adGroupId is required/);
      expect(mockMutateResources).not.toHaveBeenCalled();
    });
  });
});
