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

import { pauseAd, enableAd, pauseKeyword, enableKeyword } from "@/lib/google-ads";

const auth = { refreshToken: "rt", customerId: "130-126-5570" };

beforeEach(() => {
  vi.clearAllMocks();
  mockCustomerFactory.mockReturnValue({
    mutateResources: mockMutateResources,
    query: mockQuery,
  });
  mockMutateResources.mockResolvedValue({});
  mockQuery.mockResolvedValue([]);
});

// Helper: build keyword_view rows for pauseKeyword pre-query
function kwRow(criterionId: string, opts: { text?: string; status?: number; negative?: boolean } = {}) {
  return {
    ad_group_criterion: {
      criterion_id: criterionId,
      keyword: { text: opts.text ?? `kw-${criterionId}` },
      status: opts.status ?? 2, // ENABLED
      negative: opts.negative ?? false,
    },
  };
}

describe("pauseAd", () => {
  it("sends update with entity=ad_group_ad and status=PAUSED (3)", async () => {
    await pauseAd(auth, "111", "222");
    const op = mockMutateResources.mock.calls[0][0][0];
    expect(op.entity).toBe("ad_group_ad");
    expect(op.operation).toBe("update");
    expect(op.resource.status).toBe(3);
  });

  it("constructs resource_name as customers/<normalized cid>/adGroupAds/<adGroupId>~<adId>", async () => {
    await pauseAd(auth, "111", "222");
    const op = mockMutateResources.mock.calls[0][0][0];
    expect(op.resource.resource_name).toBe("customers/1301265570/adGroupAds/111~222");
  });

  it("field-mask topology: resource has only resource_name + status — guards against parent-wipe landmine", async () => {
    // RSA sub-fields get wiped if a parent-level field appears in the update mask.
    await pauseAd(auth, "111", "222");
    const op = mockMutateResources.mock.calls[0][0][0];
    expect(Object.keys(op.resource).filter((k) => k !== "resource_name")).toEqual(["status"]);
  });

  it("returns success WriteResult with action=pause_ad, beforeValue=adGroupId, afterValue=PAUSED", async () => {
    const result = await pauseAd(auth, "111", "222");
    expect(result).toMatchObject({
      success: true,
      action: "pause_ad",
      entityId: "222",
      beforeValue: "111",
      afterValue: "PAUSED",
    });
  });

  it("on mutateResources rejection, returns success:false with afterValue=PAUSED (rolled-back semantic) and extracted error message", async () => {
    // Failure-case afterValue is the *current* state (rollback semantic), not the target.
    mockMutateResources.mockRejectedValueOnce({ errors: [{ message: "boom" }] });
    const result = await pauseAd(auth, "111", "222");
    expect(result.success).toBe(false);
    expect(result.action).toBe("pause_ad");
    expect(result.afterValue).toBe("ENABLED");
    expect(result.error).toContain("boom");
  });
});

describe("enableAd", () => {
  it("sends update with status=ENABLED (2)", async () => {
    await enableAd(auth, "111", "222");
    const op = mockMutateResources.mock.calls[0][0][0];
    expect(op.resource.status).toBe(2);
  });

  it("returns action=enable_ad, afterValue=ENABLED on success", async () => {
    const result = await enableAd(auth, "111", "222");
    expect(result).toMatchObject({
      success: true,
      action: "enable_ad",
      afterValue: "ENABLED",
    });
  });
});

describe("pauseKeyword — happy path", () => {
  beforeEach(() => {
    // Two active positives so the only-active guardrail doesn't fire
    mockQuery.mockResolvedValue([kwRow("222", { text: "running shoes" }), kwRow("333")]);
  });

  it("queries keyword_view first, then mutateResources second", async () => {
    await pauseKeyword(auth, "555", "111", "222");
    const queryOrder = mockQuery.mock.invocationCallOrder[0];
    const mutateOrder = mockMutateResources.mock.invocationCallOrder[0];
    expect(queryOrder).toBeLessThan(mutateOrder);
  });

  it("sends update with entity=ad_group_criterion, status=PAUSED, correct resource_name customers/<cid>/adGroupCriteria/<adGroupId>~<criterionId>", async () => {
    await pauseKeyword(auth, "555", "111", "222");
    const op = mockMutateResources.mock.calls[0][0][0];
    expect(op.entity).toBe("ad_group_criterion");
    expect(op.operation).toBe("update");
    expect(op.resource).toEqual({
      resource_name: "customers/1301265570/adGroupCriteria/111~222",
      status: 3,
    });
  });

  it("includes the keyword text as label in the WriteResult", async () => {
    const result = await pauseKeyword(auth, "555", "111", "222");
    expect(result.success).toBe(true);
    expect(result.label).toBe("running shoes");
  });

  it("field-mask topology: only [status]", async () => {
    // Guards against accidentally including a wider mask that would wipe other fields.
    await pauseKeyword(auth, "555", "111", "222");
    const op = mockMutateResources.mock.calls[0][0][0];
    expect(Object.keys(op.resource).filter((k) => k !== "resource_name")).toEqual(["status"]);
  });
});

describe("pauseKeyword — negative-keyword guardrail (precheck)", () => {
  it("short-circuits without mutateResources when target row has negative=true", async () => {
    mockQuery.mockResolvedValueOnce([
      kwRow("222", { text: "free stuff", negative: true }),
      kwRow("333"),
    ]);
    const result = await pauseKeyword(auth, "555", "111", "222");
    expect(mockMutateResources).not.toHaveBeenCalled();
    expect(result.success).toBe(false);
    expect(result.beforeValue).toBe("NEGATIVE");
    expect(result.afterValue).toBe("NEGATIVE");
    expect(result.nextTool).toBeDefined();
    expect(result.nextTool?.name).toBe("removeNegativeKeyword");
  });

  it("falls back to targeted query when first query truncates and target not present", async () => {
    // First query: 5000 rows but none match criterionId 222 (truncation).
    const filler = Array.from({ length: 5000 }, (_, i) => kwRow(String(900000 + i)));
    mockQuery.mockResolvedValueOnce(filler);
    // Targeted lookup: returns the negative.
    mockQuery.mockResolvedValueOnce([kwRow("222", { negative: true })]);
    const result = await pauseKeyword(auth, "555", "111", "222");
    expect(mockQuery).toHaveBeenCalledTimes(2);
    expect(mockMutateResources).not.toHaveBeenCalled();
    expect(result.success).toBe(false);
    expect(result.afterValue).toBe("NEGATIVE");
  });

  it("falls back to targeted query for the happy path when not in first batch", async () => {
    const filler = Array.from({ length: 5000 }, (_, i) => kwRow(String(900000 + i)));
    mockQuery.mockResolvedValueOnce(filler);
    mockQuery.mockResolvedValueOnce([kwRow("222", { text: "running shoes" })]);
    const result = await pauseKeyword(auth, "555", "111", "222");
    expect(mockQuery).toHaveBeenCalledTimes(2);
    expect(mockMutateResources).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(true);
    expect(result.label).toBe("running shoes");
  });
});

describe("pauseKeyword — only-active-keyword guardrail", () => {
  it("blocks mutation when totalActive === 1 with explicit error message", async () => {
    mockQuery.mockResolvedValueOnce([kwRow("222")]);
    const result = await pauseKeyword(auth, "555", "111", "222");
    expect(mockMutateResources).not.toHaveBeenCalled();
    expect(result.success).toBe(false);
    expect(result.error).toContain("Cannot pause the only active keyword");
  });

  it("permits mutation when totalActive === 2", async () => {
    mockQuery.mockResolvedValueOnce([kwRow("222"), kwRow("333")]);
    const result = await pauseKeyword(auth, "555", "111", "222");
    expect(mockMutateResources).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(true);
  });
});

describe("pauseKeyword — API rejection rewrites", () => {
  it("rewrites negative-pause API error and re-attaches nextTool hint (race condition path)", async () => {
    // Precheck sees a positive (data was stale); API still rejects as negative.
    mockQuery.mockResolvedValueOnce([kwRow("222"), kwRow("333")]);
    mockMutateResources.mockRejectedValueOnce({
      errors: [
        {
          message: "Negative ad group criteria are not updateable",
          error_code: { ad_group_criterion_error: 6 },
        },
      ],
    });
    const result = await pauseKeyword(auth, "555", "111", "222");
    expect(result.success).toBe(false);
    expect(result.nextTool).toBeDefined();
    expect(result.nextTool?.name).toBe("removeNegativeKeyword");
    expect(result.error).toContain("Negative keywords cannot be paused");
  });
});

describe("enableKeyword", () => {
  it("sends update with status=ENABLED, entity=ad_group_criterion", async () => {
    await enableKeyword(auth, "111", "222");
    const op = mockMutateResources.mock.calls[0][0][0];
    expect(op.entity).toBe("ad_group_criterion");
    expect(op.operation).toBe("update");
    expect(op.resource).toEqual({
      resource_name: "customers/1301265570/adGroupCriteria/111~222",
      status: 2,
    });
  });

  it("queries for keyword text and includes it in label", async () => {
    mockQuery.mockResolvedValueOnce([
      { ad_group_criterion: { keyword: { text: "running shoes" } } },
    ]);
    const result = await enableKeyword(auth, "111", "222");
    expect(result.success).toBe(true);
    expect(result.label).toBe("running shoes");
  });

  it("on rejection, calls rewriteRemovedResourceError on the message", async () => {
    mockMutateResources.mockRejectedValueOnce({
      errors: [
        {
          message: "operation is not allowed for removed resources",
          error_code: { context_error: 3 },
        },
      ],
    });
    const result = await enableKeyword(auth, "111", "222");
    expect(result.success).toBe(false);
    expect(result.error).toContain("Keyword 222");
    expect(result.error).toContain("already been removed");
  });
});
