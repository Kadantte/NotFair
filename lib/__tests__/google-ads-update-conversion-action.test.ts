import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockCustomerFactory, mockMutateResources, mockQuery } = vi.hoisted(() => ({
  mockCustomerFactory: vi.fn(),
  mockMutateResources: vi.fn(),
  mockQuery: vi.fn(),
}));

vi.mock("@/lib/env", () => ({
  getRequiredEnv: vi.fn((name: string) => `${name.toLowerCase()}-value`),
}));

vi.mock("google-ads-api", () => ({
  GoogleAdsApi: class {
    Customer = mockCustomerFactory;
  },
}));

import { updateConversionAction } from "@/lib/google-ads";

const auth = {
  refreshToken: "refresh-token",
  customerId: "130-126-5570",
};

function setRow(row: Record<string, unknown>) {
  mockQuery.mockResolvedValue([{ conversion_action: row }]);
}

describe("updateConversionAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCustomerFactory.mockReturnValue({
      mutateResources: mockMutateResources,
      query: mockQuery,
    });
    mockMutateResources.mockResolvedValue({});
  });

  it("skips the empty mutate when only primaryForGoal is set and only sends the primary_for_goal mutate", async () => {
    setRow({
      name: "Lead form",
      status: 2,
      category: 12,
      counting_type: 2,
      type: 7, // UPLOAD_CLICKS — mutable
      owner_customer: "customers/1301265570",
    });

    const result = await updateConversionAction(auth, {
      conversionActionId: "9999",
      primaryForGoal: false,
    });

    expect(result.success).toBe(true);
    // Only one mutate call — the setPrimaryForGoal one. The empty resource
    // mutate at the top of updateConversionAction must be skipped.
    expect(mockMutateResources).toHaveBeenCalledTimes(1);
    expect(mockMutateResources).toHaveBeenCalledWith([
      {
        entity: "conversion_action",
        operation: "update",
        resource: {
          resource_name: "customers/1301265570/conversionActions/9999",
          primary_for_goal: false,
        },
      },
    ]);
  });

  it("refuses to mutate GA4-imported conversion actions with a clear error", async () => {
    setRow({
      name: "GA4 Purchase",
      status: 2,
      category: 4,
      counting_type: 3,
      type: 41, // GOOGLE_ANALYTICS_4_PURCHASE — read-only
      owner_customer: "customers/1301265570",
    });

    const result = await updateConversionAction(auth, {
      conversionActionId: "8888",
      primaryForGoal: false,
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/GOOGLE_ANALYTICS_4_PURCHASE/);
    expect(result.error).toMatch(/read-only/i);
    // No mutate must be attempted on a read-only conversion action.
    expect(mockMutateResources).not.toHaveBeenCalled();
  });

  it("refuses to mutate Firebase-imported conversion actions", async () => {
    setRow({
      name: "Firebase iOS",
      type: 15, // FIREBASE_IOS_FIRST_OPEN
      owner_customer: "customers/1301265570",
    });

    const result = await updateConversionAction(auth, {
      conversionActionId: "7777",
      name: "Renamed",
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/FIREBASE_IOS_FIRST_OPEN/);
    expect(mockMutateResources).not.toHaveBeenCalled();
  });

  it("refuses to mutate manager-owned (inherited) conversion actions", async () => {
    setRow({
      name: "Inherited",
      type: 8, // WEBPAGE — mutable type, but owner is different
      owner_customer: "customers/9999999999",
    });

    const result = await updateConversionAction(auth, {
      conversionActionId: "6666",
      primaryForGoal: false,
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/manager account/);
    expect(mockMutateResources).not.toHaveBeenCalled();
  });

  it("accepts string-form enum values for type (handles GAQL string mode)", async () => {
    setRow({
      name: "GA4",
      type: "GOOGLE_ANALYTICS_4_CUSTOM",
      owner_customer: "customers/1301265570",
    });

    const result = await updateConversionAction(auth, {
      conversionActionId: "5555",
      primaryForGoal: false,
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/GOOGLE_ANALYTICS_4_CUSTOM/);
  });

  it("issues the conversion_action mutate for real field changes on mutable actions", async () => {
    setRow({
      name: "Old name",
      status: 2,
      category: 4,
      counting_type: 2,
      type: 8, // WEBPAGE — mutable
      owner_customer: "customers/1301265570",
    });

    const result = await updateConversionAction(auth, {
      conversionActionId: "4444",
      name: "New name",
      primaryForGoal: true,
    });

    expect(result.success).toBe(true);
    // Two mutates: the field-change one + the primary_for_goal one.
    expect(mockMutateResources).toHaveBeenCalledTimes(2);
    const firstCall = mockMutateResources.mock.calls[0][0];
    expect(firstCall[0].resource).toEqual(
      expect.objectContaining({
        resource_name: "customers/1301265570/conversionActions/4444",
        name: "New name",
      }),
    );
    expect(firstCall[0].resource).not.toHaveProperty("primary_for_goal");
  });

  it("returns a hard failure when primaryForGoal-only mutate fails (was previously a silent warning)", async () => {
    setRow({
      name: "Mutable action",
      type: 7, // UPLOAD_CLICKS — passes pre-flight
      owner_customer: "customers/1301265570",
    });

    // Simulate the setPrimaryForGoal mutate throwing.
    mockMutateResources.mockRejectedValueOnce(new Error("Mutates are not allowed for the requested resource. (mutate_error=9)"));

    const result = await updateConversionAction(auth, {
      conversionActionId: "3333",
      primaryForGoal: false,
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Setting primary_for_goal failed/);
    expect(result.error).toMatch(/mutate_error=9/);
  });
});
