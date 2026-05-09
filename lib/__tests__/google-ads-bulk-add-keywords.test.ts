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

import { bulkAddKeywords } from "@/lib/google-ads";

const auth = {
  refreshToken: "refresh-token",
  customerId: "130-126-5570",
  sessionId: 123,
};

describe("bulkAddKeywords", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCustomerFactory.mockReturnValue({
      mutateResources: mockMutateResources,
    });
  });

  it("uses partial failure only when requested and returns per-keyword policy metadata", async () => {
    mockMutateResources.mockResolvedValueOnce({
      mutate_operation_responses: [
        {},
        { ad_group_criterion_result: { resource_name: "customers/1301265570/adGroupCriteria/111~222" } },
      ],
      partial_failure_error: {
        errors: [
          {
            message: "Policy violation",
            location: { field_path_elements: [{ index: 0 }] },
            error_code: { policy_violation_error: 2 },
            details: {
              policy_violation_details: {
                key: {
                  policy_name: "HEALTH_IN_PERSONALIZED_ADS",
                  violating_text: "hiv aids prevention africa",
                },
              },
            },
          },
        ],
      },
    });

    const results = await bulkAddKeywords(
      auth,
      "111",
      [
        { keyword: "hiv aids prevention africa", matchType: "PHRASE" },
        { keyword: "brand consulting", matchType: "EXACT" },
      ],
      { partialFailure: true },
    );

    expect(mockMutateResources).toHaveBeenCalledWith(expect.any(Array), { partial_failure: true });
    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({
      success: false,
      policy: {
        policyTopics: ["HEALTH_IN_PERSONALIZED_ADS"],
        retryable: false,
        requiredAction: "request_exemption",
      },
    });
    expect(results[1]).toMatchObject({
      success: true,
      entityId: "222",
      afterValue: "brand consulting (EXACT)",
    });
  });

  it("suppresses exact same-session keyword policy retries before calling Google again", async () => {
    mockMutateResources.mockRejectedValueOnce({
      errors: [
        {
          message: "Policy violation",
          error_code: { policy_violation_error: 2 },
          details: {
            policy_violation_details: {
              key: {
                policy_name: "HEALTH_IN_PERSONALIZED_ADS",
                violating_text: "whiplash letselschade",
              },
            },
          },
        },
      ],
    });

    const first = await bulkAddKeywords(auth, "111", [{ keyword: "whiplash letselschade", matchType: "PHRASE" }]);
    const second = await bulkAddKeywords(auth, "111", [{ keyword: " whiplash   letselschade ", matchType: "PHRASE" }]);

    expect(first[0].success).toBe(false);
    expect(second[0].success).toBe(false);
    expect(second[0].error).toContain("Skipped retry");
    expect(mockMutateResources).toHaveBeenCalledTimes(1);
  });

  it("does not cache every keyword from a chunk-level policy failure", async () => {
    mockMutateResources
      .mockRejectedValueOnce({
        errors: [
          {
            message: "Policy violation",
            error_code: { policy_violation_error: 2 },
            details: {
              policy_violation_details: {
                key: {
                  policy_name: "HEALTH_IN_PERSONALIZED_ADS",
                  violating_text: "restricted medical term",
                },
              },
            },
          },
        ],
      })
      .mockResolvedValueOnce({
        mutate_operation_responses: [
          { ad_group_criterion_result: { resource_name: "customers/1301265570/adGroupCriteria/111~333" } },
        ],
      });

    const first = await bulkAddKeywords(auth, "111", [
      { keyword: "restricted medical term", matchType: "PHRASE" },
      { keyword: "safe local service", matchType: "PHRASE" },
    ]);
    const second = await bulkAddKeywords(auth, "111", [
      { keyword: "safe local service", matchType: "PHRASE" },
    ]);
    const third = await bulkAddKeywords(auth, "111", [
      { keyword: "restricted medical term", matchType: "PHRASE" },
    ]);

    expect(first.map((result) => result.success)).toEqual([false, false]);
    expect(second[0]).toMatchObject({ success: true, entityId: "333" });
    expect(third[0].error).toContain("Skipped retry");
    expect(mockMutateResources).toHaveBeenCalledTimes(2);
  });
});
