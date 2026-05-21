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

import { removeConversionAction, updateConversionAction } from "@/lib/google-ads";

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

  it("rewrites mutate_error=9 from Google into a read-only friendly message even for types not in the preflight list", async () => {
    // Type 29 WEBPAGE_ONCLICK isn't in our READ_ONLY list, so preflight passes,
    // but Google still rejects (e.g. auto-generated Lead Form conversion action).
    // The catch-side rewriter must turn the cryptic mutate_error=9 into a
    // useful, agent-actionable message.
    setRow({
      name: "Lead form - Submit",
      type: 29,
      owner_customer: "customers/1301265570",
    });
    mockMutateResources.mockRejectedValueOnce(new Error("Mutates are not allowed for the requested resource. (mutate_error=9)"));

    const result = await updateConversionAction(auth, {
      conversionActionId: "2222",
      primaryForGoal: false,
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Conversion action 2222 is read-only via the Google Ads API/);
    expect(result.error).toMatch(/Lead Form|GA4|Floodlight/);
    // The original error code is preserved for log analysis.
    expect(result.error).toMatch(/mutate_error=9/);
  });
});

describe("removeConversionAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCustomerFactory.mockReturnValue({
      mutateResources: mockMutateResources,
      query: mockQuery,
      conversionActions: { remove: vi.fn().mockResolvedValue({}) },
    });
  });

  it("calls the remove operation on the conversion_action service for mutable actions", async () => {
    setRow({
      name: "Mutable action",
      status: 2,
      type: 7, // UPLOAD_CLICKS — mutable
      owner_customer: "customers/1301265570",
    });
    const removeMock = vi.fn().mockResolvedValue({});
    mockCustomerFactory.mockReturnValue({
      mutateResources: mockMutateResources,
      query: mockQuery,
      conversionActions: { remove: removeMock },
    });

    const result = await removeConversionAction(auth, "1111");

    expect(result.success).toBe(true);
    expect(result.action).toBe("remove_conversion_action");
    expect(removeMock).toHaveBeenCalledWith([
      "customers/1301265570/conversionActions/1111",
    ]);
  });

  it("refuses to remove read-only conversion actions (e.g. GA4 imports) without calling Google", async () => {
    setRow({
      name: "GA4 Purchase",
      status: 2,
      type: 41, // GOOGLE_ANALYTICS_4_PURCHASE — read-only
      owner_customer: "customers/1301265570",
    });
    const removeMock = vi.fn();
    mockCustomerFactory.mockReturnValue({
      mutateResources: mockMutateResources,
      query: mockQuery,
      conversionActions: { remove: removeMock },
    });

    const result = await removeConversionAction(auth, "9999");

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/GOOGLE_ANALYTICS_4_PURCHASE/);
    expect(result.error).toMatch(/read-only/i);
    expect(removeMock).not.toHaveBeenCalled();
  });

  it("rewrites mutate_error=9 from the remove call into a friendly message", async () => {
    setRow({
      name: "Lead form - Submit",
      status: 2,
      type: 29, // WEBPAGE_ONCLICK — passes preflight, Google rejects anyway
      owner_customer: "customers/1301265570",
    });
    const removeMock = vi.fn().mockRejectedValue(
      new Error("Mutates are not allowed for the requested resource. (mutate_error=9)"),
    );
    mockCustomerFactory.mockReturnValue({
      mutateResources: mockMutateResources,
      query: mockQuery,
      conversionActions: { remove: removeMock },
    });

    const result = await removeConversionAction(auth, "8888");

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Conversion action 8888 is read-only/);
    expect(result.error).toMatch(/mutate_error=9/);
  });

  // ─── currencyCode ──────────────────────────────────────────────────

  describe("currencyCode", () => {
    function setMutableRowWithValueSettings(opts: {
      defaultValue?: number;
      alwaysUseDefaultValue?: boolean;
      defaultCurrencyCode?: string | null;
    } = {}) {
      const value_settings: Record<string, unknown> = {};
      if (opts.defaultValue !== undefined) value_settings.default_value = opts.defaultValue;
      if (opts.alwaysUseDefaultValue !== undefined) value_settings.always_use_default_value = opts.alwaysUseDefaultValue;
      if (opts.defaultCurrencyCode !== undefined && opts.defaultCurrencyCode !== null) {
        value_settings.default_currency_code = opts.defaultCurrencyCode;
      }
      setRow({
        name: "Web purchase",
        status: 2,
        category: 0,
        counting_type: 3,
        type: 7, // UPLOAD_CLICKS — mutable
        owner_customer: "customers/1301265570",
        value_settings,
      });
    }

    it("sends value_settings.default_currency_code (not currency_code)", async () => {
      setMutableRowWithValueSettings({ defaultValue: 1, alwaysUseDefaultValue: true, defaultCurrencyCode: "XXX" });
      const result = await updateConversionAction(auth, {
        conversionActionId: "9999",
        currencyCode: "EUR",
      });
      expect(result.success).toBe(true);
      expect(mockMutateResources).toHaveBeenCalledTimes(1);
      const op = mockMutateResources.mock.calls[0][0][0];
      expect(op.resource.value_settings).toBeDefined();
      expect(op.resource.value_settings.default_currency_code).toBe("EUR");
      // Critical: the proto field is `default_currency_code`, NOT `currency_code`.
      expect(op.resource.value_settings.currency_code).toBeUndefined();
    });

    it("round-trips defaultValue and alwaysUseDefaultValue from existing state when patching currency only", async () => {
      setMutableRowWithValueSettings({ defaultValue: 25, alwaysUseDefaultValue: true, defaultCurrencyCode: "XXX" });
      await updateConversionAction(auth, {
        conversionActionId: "9999",
        currencyCode: "EUR",
      });
      const op = mockMutateResources.mock.calls[0][0][0];
      expect(op.resource.value_settings.default_value).toBe(25);
      expect(op.resource.value_settings.always_use_default_value).toBe(true);
      expect(op.resource.value_settings.default_currency_code).toBe("EUR");
    });

    it("caller-provided value wins over existing when both present", async () => {
      setMutableRowWithValueSettings({ defaultValue: 25, defaultCurrencyCode: "USD" });
      await updateConversionAction(auth, {
        conversionActionId: "9999",
        defaultValue: 50,
        currencyCode: "EUR",
      });
      const op = mockMutateResources.mock.calls[0][0][0];
      expect(op.resource.value_settings.default_value).toBe(50);
      expect(op.resource.value_settings.default_currency_code).toBe("EUR");
    });

    it("rejects XXX explicitly", async () => {
      setMutableRowWithValueSettings({});
      const result = await updateConversionAction(auth, {
        conversionActionId: "9999",
        currencyCode: "XXX",
      });
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/XXX.*legacy/i);
      expect(mockMutateResources).not.toHaveBeenCalled();
    });

    it("rejects non-3-letter codes", async () => {
      setMutableRowWithValueSettings({});
      const result = await updateConversionAction(auth, {
        conversionActionId: "9999",
        currencyCode: "EURO",
      });
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/ISO 4217/);
      expect(mockMutateResources).not.toHaveBeenCalled();
    });

    it("normalizes lowercase to uppercase", async () => {
      setMutableRowWithValueSettings({});
      const result = await updateConversionAction(auth, {
        conversionActionId: "9999",
        currencyCode: "eur",
      });
      expect(result.success).toBe(true);
      const op = mockMutateResources.mock.calls[0][0][0];
      expect(op.resource.value_settings.default_currency_code).toBe("EUR");
    });

    it("includes currencyCode in beforeValue / afterValue JSON", async () => {
      setMutableRowWithValueSettings({ defaultCurrencyCode: "XXX" });
      const result = await updateConversionAction(auth, {
        conversionActionId: "9999",
        currencyCode: "EUR",
      });
      expect(result.success).toBe(true);
      const before = JSON.parse(result.beforeValue);
      const after = JSON.parse(result.afterValue);
      expect(before.currencyCode).toBe("XXX");
      expect(after.currencyCode).toBe("EUR");
    });

    it("does not include resource_name in value_settings field-mask wipe risk", async () => {
      // Regression: confirm we don't accidentally send a stripped sub-message.
      // The library emits nested field-mask paths for value_settings scalars
      // (verified empirically in the planning probe); we still round-trip
      // for safety.
      setMutableRowWithValueSettings({ defaultValue: 10, alwaysUseDefaultValue: false, defaultCurrencyCode: "USD" });
      await updateConversionAction(auth, {
        conversionActionId: "9999",
        currencyCode: "EUR",
      });
      const op = mockMutateResources.mock.calls[0][0][0];
      expect(Object.keys(op.resource.value_settings).sort()).toEqual(
        ["always_use_default_value", "default_currency_code", "default_value"].sort(),
      );
    });
  });
});
