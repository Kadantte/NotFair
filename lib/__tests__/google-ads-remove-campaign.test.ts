import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockCustomerFactory, mockMutateResources } = vi.hoisted(() => ({
  mockCustomerFactory: vi.fn(),
  mockMutateResources: vi.fn(),
}));

vi.mock("@/lib/env", () => ({
  getRequiredEnv: vi.fn((name: string) => `${name.toLowerCase()}-value`),
}));

vi.mock("google-ads-api", () => ({
  GoogleAdsApi: class {
    Customer = mockCustomerFactory;
  },
}));

import { removeCampaign } from "@/lib/google-ads";

describe("removeCampaign", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCustomerFactory.mockReturnValue({
      mutateResources: mockMutateResources,
    });
    mockMutateResources.mockResolvedValue({});
  });

  it("sends a string resource name for remove mutations", async () => {
    const result = await removeCampaign(
      {
        refreshToken: "refresh-token",
        customerId: "130-126-5570",
      },
      "23698428948",
    );

    expect(mockMutateResources).toHaveBeenCalledWith([
      {
        entity: "campaign",
        operation: "remove",
        resource: "customers/1301265570/campaigns/23698428948",
      },
    ]);
    expect(result).toEqual(
      expect.objectContaining({
        success: true,
        action: "remove_campaign",
        entityId: "23698428948",
        afterValue: "REMOVED",
      }),
    );
  });
});
