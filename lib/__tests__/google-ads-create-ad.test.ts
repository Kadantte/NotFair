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
    expect(result.policy).toMatchObject({
      policyTopics: ["POLICY"],
      retryable: false,
      requiredAction: "rewrite_or_request_exception",
    });
  });

  it("suppresses exact same-session retries after a policy rejection", async () => {
    const sessionAuth = { ...auth, sessionId: 901 };
    mockMutateResources.mockRejectedValueOnce({
      errors: [
        {
          message: "The resource has been disapproved since the policy summary includes policy topics of type PROHIBITED.",
          error_code: { policy_finding_error: 2 },
        },
      ],
    });

    const first = await createAd(sessionAuth, "1234567890", validRsa);
    const second = await createAd(sessionAuth, "1234567890", validRsa);

    expect(first.success).toBe(false);
    expect(second.success).toBe(false);
    expect(second.error).toContain("Skipped retry");
    expect(second.policy?.retryable).toBe(false);
    expect(mockMutateResources).toHaveBeenCalledTimes(1);
  });

  describe("path1/path2 (display URL paths)", () => {
    function successfulMutateResponse() {
      mockMutateResources.mockResolvedValueOnce({
        mutate_operation_responses: [
          { ad_group_ad_result: { resource_name: "customers/1234567890/adGroupAds/111~222" } },
        ],
      });
    }

    it("forwards path1 and path2 to responsive_search_ad when provided", async () => {
      successfulMutateResponse();

      const result = await createAd(auth, "111", { ...validRsa, path1: "ac-repair", path2: "today" });

      expect(result.success).toBe(true);
      const payload = mockMutateResources.mock.calls[0][0][0];
      const rsa = payload.resource.ad.responsive_search_ad;
      expect(rsa.path1).toBe("ac-repair");
      expect(rsa.path2).toBe("today");
    });

    it("omits path1/path2 from the payload when not provided (no empty-string wipe)", async () => {
      successfulMutateResponse();

      const result = await createAd(auth, "111", validRsa);

      expect(result.success).toBe(true);
      const rsa = mockMutateResources.mock.calls[0][0][0].resource.ad.responsive_search_ad;
      expect(rsa).not.toHaveProperty("path1");
      expect(rsa).not.toHaveProperty("path2");
    });

    it("rejects path1 longer than 15 characters", async () => {
      const result = await createAd(auth, "111", { ...validRsa, path1: "a".repeat(16) });

      expect(result.success).toBe(false);
      expect(result.error).toContain("path1 must be 15 characters or fewer");
      expect(mockMutateResources).not.toHaveBeenCalled();
    });

    it("rejects path1 with whitespace", async () => {
      const result = await createAd(auth, "111", { ...validRsa, path1: "ac repair" });

      expect(result.success).toBe(false);
      expect(result.error).toContain("path1 must not contain whitespace");
      expect(mockMutateResources).not.toHaveBeenCalled();
    });

    it("rejects path2 without path1", async () => {
      const result = await createAd(auth, "111", { ...validRsa, path2: "today" });

      expect(result.success).toBe(false);
      expect(result.error).toContain("path2 requires path1");
      expect(mockMutateResources).not.toHaveBeenCalled();
    });

    it("accepts path1 alone (path2 is independent and optional)", async () => {
      successfulMutateResponse();

      const result = await createAd(auth, "111", { ...validRsa, path1: "ac-repair" });

      expect(result.success).toBe(true);
      const rsa = mockMutateResources.mock.calls[0][0][0].resource.ad.responsive_search_ad;
      expect(rsa.path1).toBe("ac-repair");
      expect(rsa).not.toHaveProperty("path2");
    });
  });
});
