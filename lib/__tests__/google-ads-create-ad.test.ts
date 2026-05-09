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

import { createAd } from "@/lib/google-ads";

const auth = {
  refreshToken: "refresh-token",
  customerId: "130-126-5570",
};

const validRsa = {
  headlines: [
    "Fast AC Repair",
    "Local HVAC Pros",
    "Same-Day Service",
  ],
  descriptions: [
    "Book licensed technicians for reliable AC repair today.",
    "Transparent pricing and quick scheduling for local service.",
  ],
  finalUrl: "https://example.com/ac-repair",
};

describe("createAd", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCustomerFactory.mockReturnValue({
      mutateResources: mockMutateResources,
    });
  });

  it("rewrites Google Ads policy finding failures with actionable policy guidance", async () => {
    mockMutateResources.mockRejectedValueOnce({
      errors: [
        {
          message: "The resource has been disapproved since the policy summary includes policy topics of type PROHIBITED.",
          error_code: { policy_finding_error: 2 },
        },
      ],
    });

    const result = await createAd(auth, "1234567890", validRsa);

    expect(result.success).toBe(false);
    expect(result.error).toContain("Policy violation: POLICY");
    expect(result.error).toContain("Google Ads rejected this content");
  });
});
