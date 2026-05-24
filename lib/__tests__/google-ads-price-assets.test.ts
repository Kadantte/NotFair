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

import { createPriceAsset } from "@/lib/google-ads";

const auth = { refreshToken: "refresh-token", customerId: "130-126-5570" };

const validOfferings = [
  { header: "Basic Plan", description: "Great for starters", amountMicros: 9990000, currencyCode: "USD", finalUrl: "https://example.com/basic" },
  { header: "Pro Plan", description: "For growing teams", amountMicros: 29990000, currencyCode: "USD", finalUrl: "https://example.com/pro" },
  { header: "Enterprise", description: "Custom solutions", amountMicros: 99990000, currencyCode: "USD", finalUrl: "https://example.com/enterprise" },
];

describe("createPriceAsset", () => {
  beforeEach(() => {
    mockCustomerFactory.mockReset();
    mockMutateResources.mockReset();
    mockQuery.mockReset();
    mockCustomerFactory.mockReturnValue({
      mutateResources: mockMutateResources,
      query: mockQuery,
    });
  });

  describe("validation", () => {
    it("rejects fewer than 3 offerings", async () => {
      const result = await createPriceAsset(auth, {
        type: "SERVICES",
        languageCode: "en",
        priceOfferings: validOfferings.slice(0, 2),
      });
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/3.+8/);
      expect(mockMutateResources).not.toHaveBeenCalled();
    });

    it("rejects more than 8 offerings", async () => {
      const nine = Array.from({ length: 9 }, (_, i) => ({
        ...validOfferings[0],
        header: `Plan ${i + 1}`,
      }));
      const result = await createPriceAsset(auth, {
        type: "SERVICES",
        languageCode: "en",
        priceOfferings: nine,
      });
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/3.+8/);
      expect(mockMutateResources).not.toHaveBeenCalled();
    });

    it("rejects offering header over 25 chars", async () => {
      const result = await createPriceAsset(auth, {
        type: "SERVICES",
        languageCode: "en",
        priceOfferings: [
          { ...validOfferings[0], header: "a".repeat(26) },
          ...validOfferings.slice(1),
        ],
      });
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/header.*exceeds 25/i);
      expect(mockMutateResources).not.toHaveBeenCalled();
    });

    it("rejects offering description over 25 chars", async () => {
      const result = await createPriceAsset(auth, {
        type: "SERVICES",
        languageCode: "en",
        priceOfferings: [
          { ...validOfferings[0], description: "b".repeat(26) },
          ...validOfferings.slice(1),
        ],
      });
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/description.*exceeds 25/i);
      expect(mockMutateResources).not.toHaveBeenCalled();
    });

    it("rejects negative amountMicros", async () => {
      const result = await createPriceAsset(auth, {
        type: "SERVICES",
        languageCode: "en",
        priceOfferings: [
          { ...validOfferings[0], amountMicros: -1 },
          ...validOfferings.slice(1),
        ],
      });
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/amountMicros.*non-negative integer/i);
      expect(mockMutateResources).not.toHaveBeenCalled();
    });

    it("rejects invalid currency code", async () => {
      const result = await createPriceAsset(auth, {
        type: "SERVICES",
        languageCode: "en",
        priceOfferings: [
          { ...validOfferings[0], currencyCode: "US" },
          ...validOfferings.slice(1),
        ],
      });
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/currencyCode.*ISO 4217/i);
      expect(mockMutateResources).not.toHaveBeenCalled();
    });

    it("rejects empty languageCode", async () => {
      const result = await createPriceAsset(auth, {
        type: "SERVICES",
        languageCode: "  ",
        priceOfferings: validOfferings,
      });
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/languageCode/i);
      expect(mockMutateResources).not.toHaveBeenCalled();
    });
  });

  describe("createPriceAsset (no targets — asset only)", () => {
    it("creates a price asset without any links when targets is omitted", async () => {
      mockMutateResources.mockResolvedValueOnce({
        mutate_operation_responses: [
          { asset_result: { resource_name: "customers/1301265570/assets/888" } },
        ],
      });

      const result = await createPriceAsset(auth, {
        type: "SERVICES",
        languageCode: "en",
        priceOfferings: validOfferings,
      });

      expect(result).toMatchObject({
        success: true,
        action: "create_price_asset",
        entityId: "888",
        fieldType: "PRICE",
      });
      expect(result.linksCreated).toEqual([]);
      expect(mockMutateResources).toHaveBeenCalledTimes(1);
      // 1 operation: asset create only
      expect(mockMutateResources.mock.calls[0][0]).toHaveLength(1);
    });

    it("sends correct wire format to the API", async () => {
      mockMutateResources.mockResolvedValueOnce({
        mutate_operation_responses: [
          { asset_result: { resource_name: "customers/1301265570/assets/888" } },
        ],
      });

      await createPriceAsset(auth, {
        type: "SERVICES",
        languageCode: "en",
        priceOfferings: [
          { header: "Basic Plan", description: "Great for starters", amountMicros: 9990000, currencyCode: "USD", finalUrl: "https://example.com/basic", unit: "PER_MONTH" },
          ...validOfferings.slice(1),
        ],
        priceQualifier: "FROM",
      });

      const ops = mockMutateResources.mock.calls[0][0];
      const assetOp = ops[0];
      expect(assetOp.entity).toBe("asset");
      expect(assetOp.operation).toBe("create");
      const priceAsset = assetOp.resource.price_asset;
      expect(priceAsset.type).toBe("SERVICES");
      expect(priceAsset.language_code).toBe("en");
      expect(priceAsset.price_qualifier).toBe("FROM");
      expect(priceAsset.price_offerings).toHaveLength(3);
      expect(priceAsset.price_offerings[0]).toMatchObject({
        header: "Basic Plan",
        description: "Great for starters",
        price: { amount_micros: 9990000, currency_code: "USD" },
        final_urls: ["https://example.com/basic"],
        unit: "PER_MONTH",
      });
    });

    it("omits unit field when not provided", async () => {
      mockMutateResources.mockResolvedValueOnce({
        mutate_operation_responses: [
          { asset_result: { resource_name: "customers/1301265570/assets/888" } },
        ],
      });

      await createPriceAsset(auth, {
        type: "PRODUCT_CATEGORIES",
        languageCode: "en",
        priceOfferings: validOfferings,
      });

      const offering = mockMutateResources.mock.calls[0][0][0].resource.price_asset.price_offerings[0];
      expect(offering).not.toHaveProperty("unit");
    });

    it("omits priceQualifier when not provided", async () => {
      mockMutateResources.mockResolvedValueOnce({
        mutate_operation_responses: [
          { asset_result: { resource_name: "customers/1301265570/assets/888" } },
        ],
      });

      await createPriceAsset(auth, {
        type: "SERVICES",
        languageCode: "en",
        priceOfferings: validOfferings,
      });

      const priceAsset = mockMutateResources.mock.calls[0][0][0].resource.price_asset;
      expect(priceAsset).not.toHaveProperty("price_qualifier");
    });
  });

  describe("createPriceAsset (with targets — atomic create+link)", () => {
    it("creates price asset and links it to a campaign target in one mutate", async () => {
      mockMutateResources.mockResolvedValueOnce({
        mutate_operation_responses: [
          { asset_result: { resource_name: "customers/1301265570/assets/888" } },
          { campaign_asset_result: { resource_name: "customers/1301265570/campaignAssets/123~888~24" } },
        ],
      });

      const result = await createPriceAsset(auth, {
        type: "SERVICES",
        languageCode: "en",
        priceOfferings: validOfferings,
        targets: [{ level: "campaign", campaignId: "123" }],
      });

      expect(result).toMatchObject({
        success: true,
        action: "create_price_asset",
        entityId: "888",
        fieldType: "PRICE",
      });
      expect(mockMutateResources).toHaveBeenCalledTimes(1);
      // 2 operations: asset create + campaign link
      const ops = mockMutateResources.mock.calls[0][0];
      expect(ops).toHaveLength(2);
      expect(ops[1]).toMatchObject({
        entity: "campaign_asset",
        operation: "create",
        resource: {
          campaign: "customers/1301265570/campaigns/123",
          asset: "customers/1301265570/assets/-1",
          field_type: 24,
        },
      });
    });

    it("creates price asset and links at customer level", async () => {
      mockMutateResources.mockResolvedValueOnce({
        mutate_operation_responses: [
          { asset_result: { resource_name: "customers/1301265570/assets/888" } },
          { customer_asset_result: { resource_name: "customers/1301265570/customerAssets/888~24" } },
        ],
      });

      const result = await createPriceAsset(auth, {
        type: "SERVICES",
        languageCode: "en",
        priceOfferings: validOfferings,
        targets: [{ level: "customer" }],
      });

      expect(result.success).toBe(true);
      const linkOp = mockMutateResources.mock.calls[0][0][1];
      expect(linkOp.resource).toEqual({
        asset: "customers/1301265570/assets/-1",
        field_type: 24,
      });
    });
  });

  describe("error handling", () => {
    it("surfaces API errors", async () => {
      mockMutateResources.mockRejectedValueOnce(new Error("INVALID_PRICE_ASSET"));
      const result = await createPriceAsset(auth, {
        type: "SERVICES",
        languageCode: "en",
        priceOfferings: validOfferings,
      });
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/INVALID_PRICE_ASSET/);
    });
  });
});
