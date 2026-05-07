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
  addStructuredSnippetAsset,
  createStructuredSnippetAsset,
  linkStructuredSnippetAsset,
  listStructuredSnippetAssets,
  normalizeStructuredSnippetInput,
  unlinkStructuredSnippetAsset,
} from "@/lib/google-ads";

const auth = { refreshToken: "refresh-token", customerId: "130-126-5570" };

describe("structured snippets", () => {
  beforeEach(() => {
    mockCustomerFactory.mockReset();
    mockMutateResources.mockReset();
    mockQuery.mockReset();
    mockCustomerFactory.mockReturnValue({
      mutateResources: mockMutateResources,
      query: mockQuery,
    });
  });

  it("normalizes valid headers and values", () => {
    const result = normalizeStructuredSnippetInput({
      header: "services",
      values: [" Plumbing ", "Electrical", "HVAC", "HVAC"],
    });
    expect(result).toEqual({ header: "Services", values: ["Plumbing", "Electrical", "HVAC"] });
  });

  it("accepts UI/common aliases and returns Google Ads API header values", () => {
    expect(normalizeStructuredSnippetInput({
      header: "Service catalog",
      values: ["Repair", "Install", "Maintenance"],
    })).toEqual({ header: "Services", values: ["Repair", "Install", "Maintenance"] });

    expect(normalizeStructuredSnippetInput({
      header: "Featured hotels",
      values: ["Luxury Inn", "Alpine Lodge", "Lakeside Hotel"],
    })).toEqual({ header: "Featured Hotels", values: ["Luxury Inn", "Alpine Lodge", "Lakeside Hotel"] });
  });

  it("rejects invalid headers with a valid-header hint", () => {
    const result = normalizeStructuredSnippetInput({
      header: "Features",
      values: ["Fast", "Local", "Trusted"],
    });
    expect(result.error).toMatch(/Valid headers/);
    expect(result.error).toMatch(/Services/);
  });

  it("creates a structured snippet asset and links it to campaigns", async () => {
    mockMutateResources.mockResolvedValueOnce({
      mutate_operation_responses: [
        { asset_result: { resource_name: "customers/1301265570/assets/999" } },
        { campaign_asset_result: { resource_name: "customers/1301265570/campaignAssets/123~999~12" } },
        { campaign_asset_result: { resource_name: "customers/1301265570/campaignAssets/456~999~12" } },
      ],
    });

    const result = await addStructuredSnippetAsset(auth, {
      header: "Services",
      values: ["Plumbing", "Electrical", "HVAC"],
      targets: [
        { level: "campaign", campaignId: "123" },
        { level: "campaign", campaignId: "456" },
      ],
    });

    expect(result).toMatchObject({
      success: true,
      action: "add_structured_snippet_asset",
      entityId: "999",
      assetType: "STRUCTURED_SNIPPET",
      created: true,
    });
    expect(result.linksCreated).toHaveLength(2);
    expect(mockMutateResources).toHaveBeenCalledTimes(1);
    expect(mockMutateResources.mock.calls[0][0]).toEqual([
      {
        entity: "asset",
        operation: "create",
        resource: {
          resource_name: "customers/1301265570/assets/-1",
          structured_snippet_asset: {
            header: "Services",
            values: ["Plumbing", "Electrical", "HVAC"],
          },
        },
      },
      {
        entity: "campaign_asset",
        operation: "create",
        resource: {
          campaign: "customers/1301265570/campaigns/123",
          asset: "customers/1301265570/assets/-1",
          field_type: 12,
        },
      },
      {
        entity: "campaign_asset",
        operation: "create",
        resource: {
          campaign: "customers/1301265570/campaigns/456",
          asset: "customers/1301265570/assets/-1",
          field_type: 12,
        },
      },
    ]);
  });

  it("supports low-level account linking for created snippets", async () => {
    mockMutateResources.mockResolvedValueOnce({
      mutate_operation_responses: [
        { asset_result: { resource_name: "customers/1301265570/assets/999" } },
        { customer_asset_result: { resource_name: "customers/1301265570/customerAssets/999~12" } },
      ],
    });

    const result = await createStructuredSnippetAsset(auth, {
      header: "Brands",
      values: ["Nest", "Nexus", "Chromebook"],
      linkToAccount: true,
    });

    expect(result).toMatchObject({
      success: true,
      action: "create_structured_snippet_asset",
      entityId: "999",
    });
    expect(mockMutateResources).toHaveBeenCalledTimes(1);
    expect(mockMutateResources.mock.calls[0][0][1].resource).toEqual({
      asset: "customers/1301265570/assets/-1",
      field_type: 12,
    });
  });

  it("links an existing structured snippet to an ad group", async () => {
    mockQuery.mockResolvedValueOnce([{ asset: { source: "ADVERTISER" } }]);
    mockMutateResources.mockResolvedValueOnce({
      mutate_operation_responses: [
        { ad_group_asset_result: { resource_name: "customers/1301265570/adGroupAssets/222~999~12" } },
      ],
    });

    const result = await linkStructuredSnippetAsset(auth, {
      assetId: "999",
      target: { level: "ad_group", adGroupId: "222" },
    });

    expect(result.success).toBe(true);
    expect(mockMutateResources.mock.calls[0][0][0]).toEqual({
      entity: "ad_group_asset",
      operation: "create",
      resource: {
        ad_group: "customers/1301265570/adGroups/222",
        asset: "customers/1301265570/assets/999",
        field_type: 12,
      },
    });
  });

  it("rejects automatically-created structured snippets before linking", async () => {
    mockQuery.mockResolvedValueOnce([{ asset: { source: "AUTOMATICALLY_CREATED" } }]);

    const result = await linkStructuredSnippetAsset(auth, {
      assetId: "999",
      target: { level: "ad_group", adGroupId: "222" },
    });

    expect(result).toMatchObject({
      success: false,
      action: "link_structured_snippet_asset",
      assetId: "999",
      assetResourceName: "customers/1301265570/assets/999",
    });
    expect(result.error).toMatch(/automatically created by Google/i);
    expect(mockMutateResources).not.toHaveBeenCalled();
  });

  it("returns structured snippet assets annotated with asset source", async () => {
    mockQuery
      .mockResolvedValueOnce([
        {
          asset: {
            id: "999",
            resource_name: "customers/1301265570/assets/999",
            source: "ADVERTISER",
            structured_snippet_asset: {
              header: "Services",
              values: ["Plumbing", "Electrical", "HVAC"],
            },
          },
        },
        {
          asset: {
            id: "1000",
            resource_name: "customers/1301265570/assets/1000",
            source: "AUTOMATICALLY_CREATED",
            structured_snippet_asset: {
              header: "Brands",
              values: ["Nest", "Nexus", "Chromebook"],
            },
          },
        },
      ])
      .mockResolvedValueOnce([
        {
          customer_asset: {
            asset: "customers/1301265570/assets/999",
            resource_name: "customers/1301265570/customerAssets/999~12",
          },
        },
      ]);

    const result = await listStructuredSnippetAssets(auth);

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      assetId: "999",
      header: "Services",
      source: "ADVERTISER",
      autoGenerated: false,
      linkedAtAccount: true,
    });
    expect(result[1]).toMatchObject({
      assetId: "1000",
      header: "Brands",
      source: "AUTOMATICALLY_CREATED",
      autoGenerated: true,
      linkedAtAccount: false,
    });
  });

  it("removes an existing structured snippet campaign link", async () => {
    mockQuery.mockResolvedValueOnce([
      {
        campaign_asset: {
          resource_name: "customers/1301265570/campaignAssets/123~999~12",
        },
      },
    ]);
    mockMutateResources.mockResolvedValueOnce({});

    const result = await unlinkStructuredSnippetAsset(auth, {
      assetId: "999",
      target: { level: "campaign", campaignId: "123" },
    });

    expect(result.success).toBe(true);
    expect(mockMutateResources.mock.calls[0][0][0]).toEqual({
      entity: "campaign_asset",
      operation: "remove",
      resource: "customers/1301265570/campaignAssets/123~999~12",
    });
  });
});
