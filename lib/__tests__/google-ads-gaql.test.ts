import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockCustomerFactory, mockQuery } = vi.hoisted(() => ({
  mockCustomerFactory: vi.fn(),
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
  runSafeGaqlReport,
  extractGaqlLimit,
  rewriteGaqlLimit,
  extractSelectFields,
  buildGaqlSummary,
  buildContinuationHint,
  rewriteInvalidDateLiterals,
  enrichGaqlError,
  validateChangeEventFilter,
  validateMetricsOnConversionAction,
  validateEnumLiteralsInWhere,
  clampChangeEventDateWindow,
  DEFAULT_GAQL_LIMIT,
  MAX_GAQL_LIMIT,
} from "@/lib/google-ads/reads";
import { clearCache } from "@/lib/google-ads/client";

const auth = { refreshToken: "refresh-token", customerId: "130-126-5570" };

beforeEach(() => {
  vi.clearAllMocks();
  clearCache();
  mockCustomerFactory.mockReturnValue({ query: mockQuery });
});

// ─── Pure helpers ─────────────────────────────────────────────────────

describe("extractGaqlLimit", () => {
  it("returns null when no LIMIT clause", () => {
    expect(extractGaqlLimit("SELECT campaign.id FROM campaign")).toBeNull();
  });

  it("extracts numeric LIMIT at end of query", () => {
    expect(extractGaqlLimit("SELECT campaign.id FROM campaign LIMIT 75")).toBe(75);
  });

  it("extracts LIMIT with surrounding whitespace", () => {
    expect(extractGaqlLimit("SELECT campaign.id FROM campaign   LIMIT   10   ")).toBe(10);
  });

  it("extracts LIMIT before PARAMETERS clause", () => {
    expect(
      extractGaqlLimit(
        "SELECT campaign.id FROM campaign LIMIT 50 PARAMETERS omit_unselected_resource_names=true",
      ),
    ).toBe(50);
  });

  it("does not match LIMIT inside a string literal in WHERE", () => {
    // GAQL doesn't allow LIMIT mid-clause; regex only matches trailing.
    expect(
      extractGaqlLimit(
        "SELECT campaign.name FROM campaign WHERE campaign.name = 'LIMIT 99 test'",
      ),
    ).toBeNull();
  });
});

describe("rewriteGaqlLimit", () => {
  it("appends LIMIT when absent", () => {
    expect(rewriteGaqlLimit("SELECT campaign.id FROM campaign", 300)).toBe(
      "SELECT campaign.id FROM campaign LIMIT 300",
    );
  });

  it("replaces existing LIMIT value", () => {
    expect(
      rewriteGaqlLimit("SELECT campaign.id FROM campaign LIMIT 50", 2001),
    ).toBe("SELECT campaign.id FROM campaign LIMIT 2001");
  });

  it("inserts LIMIT before PARAMETERS clause", () => {
    expect(
      rewriteGaqlLimit(
        "SELECT campaign.id FROM campaign PARAMETERS omit_unselected_resource_names=true",
        500,
      ),
    ).toBe(
      "SELECT campaign.id FROM campaign LIMIT 500 PARAMETERS omit_unselected_resource_names=true",
    );
  });

  it("replaces LIMIT when PARAMETERS clause follows", () => {
    expect(
      rewriteGaqlLimit(
        "SELECT campaign.id FROM campaign LIMIT 10 PARAMETERS omit_unselected_resource_names=true",
        200,
      ),
    ).toBe(
      "SELECT campaign.id FROM campaign LIMIT 200 PARAMETERS omit_unselected_resource_names=true",
    );
  });
});

describe("extractSelectFields", () => {
  it("splits single-line SELECT into trimmed fields", () => {
    expect(
      extractSelectFields("SELECT campaign.id, campaign.name, metrics.clicks FROM campaign"),
    ).toEqual(["campaign.id", "campaign.name", "metrics.clicks"]);
  });

  it("handles multi-line SELECT clauses", () => {
    expect(
      extractSelectFields(
        `SELECT
           campaign.id,
           metrics.clicks,
           metrics.cost_micros
         FROM campaign`,
      ),
    ).toEqual(["campaign.id", "metrics.clicks", "metrics.cost_micros"]);
  });

  it("returns empty array when pattern does not match", () => {
    expect(extractSelectFields("not a query")).toEqual([]);
  });
});

describe("buildGaqlSummary", () => {
  const rowsWithMetrics = [
    { campaign: { id: "1" }, metrics: { clicks: 10, cost_micros: 3_000_000 } },
    { campaign: { id: "2" }, metrics: { clicks: 20, cost_micros: 1_000_000 } },
    { campaign: { id: "3" }, metrics: { clicks: 5, cost_micros: 5_000_000 } },
  ];

  it("returns null when no metric columns are selected", () => {
    expect(buildGaqlSummary(rowsWithMetrics, ["campaign.id"])).toBeNull();
  });

  it("returns null when there are zero rows", () => {
    expect(buildGaqlSummary([], ["metrics.clicks"])).toBeNull();
  });

  it("sums each metric column across all rows", () => {
    const summary = buildGaqlSummary(rowsWithMetrics, ["metrics.clicks", "metrics.cost_micros"]);
    expect(summary?.sums).toEqual({
      "metrics.clicks": 35,
      "metrics.cost_micros": 9_000_000,
    });
    expect(summary?.computedOverRowCount).toBe(3);
  });

  it("includes top/bottom by cost when cost_micros is selected and no cost ordering", () => {
    const summary = buildGaqlSummary(rowsWithMetrics, ["metrics.cost_micros"], "SELECT metrics.cost_micros FROM keyword_view");
    expect(summary?.topByCost?.[0]).toEqual(rowsWithMetrics[2]); // 5M
    expect(summary?.bottomByCost?.[0]).toEqual(rowsWithMetrics[1]); // 1M
  });

  it("skips top/bottom when cost_micros is not selected", () => {
    const summary = buildGaqlSummary(rowsWithMetrics, ["metrics.clicks"]);
    expect(summary?.topByCost).toBeUndefined();
    expect(summary?.bottomByCost).toBeUndefined();
  });

  it("skips top/bottom when query already orders by cost (avoids misleading bottom)", () => {
    const summary = buildGaqlSummary(
      rowsWithMetrics,
      ["metrics.cost_micros"],
      "SELECT metrics.cost_micros FROM keyword_view ORDER BY metrics.cost_micros DESC",
    );
    expect(summary?.sums).toEqual({ "metrics.cost_micros": 9_000_000 });
    expect(summary?.topByCost).toBeUndefined();
    expect(summary?.bottomByCost).toBeUndefined();
  });

  it("ignores non-finite values when summing", () => {
    const rows = [
      { metrics: { clicks: 10 } },
      { metrics: { clicks: null } },
      { metrics: { clicks: "not a number" } },
      { metrics: { clicks: 5 } },
    ];
    const summary = buildGaqlSummary(rows, ["metrics.clicks"]);
    expect(summary?.sums).toEqual({ "metrics.clicks": 15 });
  });
});

describe("buildContinuationHint", () => {
  it("suggests date + campaign filter + raising limit for row_limit truncation", () => {
    const hint = buildContinuationHint(
      "SELECT campaign.id FROM campaign",
      200,
      200,
      { rowTruncated: true, byteTruncated: false },
    );
    expect(hint).toContain("segments.date");
    expect(hint).toContain("campaign.id IN");
    expect(hint).toContain("2000");
    expect(hint).toContain("hit row limit");
  });

  it("omits 'raise limit' suggestion when already at max", () => {
    const hint = buildContinuationHint(
      "SELECT campaign.id FROM campaign",
      2000,
      MAX_GAQL_LIMIT,
      { rowTruncated: true, byteTruncated: false },
    );
    expect(hint).not.toContain("raise");
  });

  it("recommends fewer columns for byte_budget truncation", () => {
    const hint = buildContinuationHint(
      "SELECT campaign.id FROM campaign WHERE segments.date DURING LAST_7_DAYS",
      50,
      200,
      { rowTruncated: false, byteTruncated: true },
    );
    expect(hint).toContain("fewer columns");
    expect(hint).toContain("byte budget");
  });

  it("skips date suggestion when query already has a date filter", () => {
    const hint = buildContinuationHint(
      "SELECT campaign.id FROM campaign WHERE segments.date DURING LAST_7_DAYS",
      200,
      200,
      { rowTruncated: true, byteTruncated: false },
    );
    expect(hint).not.toContain("segments.date");
  });

  it("skips campaign filter suggestion when query uses `campaign.id IN(` without space", () => {
    const hint = buildContinuationHint(
      "SELECT campaign.id FROM campaign WHERE campaign.id IN(123,456)",
      200,
      200,
      { rowTruncated: true, byteTruncated: false },
    );
    expect(hint).not.toContain("campaign.id IN");
  });

  it("skips campaign filter suggestion when query uses `campaign.id=`", () => {
    const hint = buildContinuationHint(
      "SELECT campaign.id FROM campaign WHERE campaign.id=123",
      200,
      200,
      { rowTruncated: true, byteTruncated: false },
    );
    expect(hint).not.toContain("filter to specific campaigns");
  });

  it("reports both causes when row_limit and byte_budget both trigger", () => {
    const hint = buildContinuationHint(
      "SELECT campaign.id FROM campaign",
      500,
      2000,
      { rowTruncated: true, byteTruncated: true },
    );
    expect(hint).toContain("hit row limit");
    expect(hint).toContain("byte budget");
    expect(hint).toContain("fewer columns");
  });
});

// ─── End-to-end runSafeGaqlReport ─────────────────────────────────────

describe("runSafeGaqlReport validation", () => {
  it("rejects non-SELECT queries", async () => {
    await expect(runSafeGaqlReport(auth, "UPDATE campaign SET x = 1")).rejects.toThrow(
      /read-only SELECT/,
    );
  });

  it("accepts multi-line SELECT queries (newline immediately after SELECT keyword)", async () => {
    mockQuery.mockResolvedValueOnce([]);
    // Real-world template-literal formatting from agent telemetry — used to throw
    // because startsWith("SELECT ") required a literal space after SELECT.
    await runSafeGaqlReport(
      auth,
      `
      SELECT
        customer.id, customer.descriptive_name, customer.currency_code
      FROM customer
    `,
    );
    expect(mockQuery).toHaveBeenCalled();
  });

  it("accepts SELECT followed by tab", async () => {
    mockQuery.mockResolvedValueOnce([]);
    await runSafeGaqlReport(auth, "SELECT\tcampaign.id FROM campaign");
    expect(mockQuery).toHaveBeenCalled();
  });

  it("rejects queries with semicolons", async () => {
    await expect(
      runSafeGaqlReport(auth, "SELECT campaign.id FROM campaign;"),
    ).rejects.toThrow(/Semicolons/);
  });

  it("rejects queries with forbidden keywords", async () => {
    await expect(
      runSafeGaqlReport(auth, "SELECT campaign.id FROM campaign DROP TABLE x"),
    ).rejects.toThrow(/forbidden/);
  });

  it("rejects non-date segment filters that are missing from SELECT", async () => {
    await expect(
      runSafeGaqlReport(
        auth,
        "SELECT metrics.conversions FROM customer WHERE segments.conversion_action = 'customers/123/conversionActions/456'",
      ),
    ).rejects.toThrow(/segments\.conversion_action/);
  });

  it("allows date filters without selecting segments.date", async () => {
    mockQuery.mockResolvedValueOnce([]);
    await runSafeGaqlReport(
      auth,
      "SELECT campaign.id FROM campaign WHERE segments.date DURING LAST_30_DAYS",
    );
    expect(mockQuery).toHaveBeenCalled();
  });
});

describe("runSafeGaqlReport limit + truncation", () => {
  it("filters removed campaign and ad group parents on child resources by default", async () => {
    mockQuery.mockResolvedValueOnce([]);
    await runSafeGaqlReport(
      auth,
      "SELECT search_term_view.search_term, campaign.name, ad_group.name FROM search_term_view WHERE segments.date DURING LAST_30_DAYS ORDER BY metrics.cost_micros DESC",
      100,
    );
    const query = mockQuery.mock.calls[0][0] as string;
    expect(query).toContain("campaign.status != 'REMOVED'");
    expect(query).toContain("ad_group.status != 'REMOVED'");
    expect(query.indexOf("campaign.status")).toBeLessThan(query.indexOf("ORDER BY"));
  });

  it("auto-adds campaign.status and ad_group.status to SELECT when injecting the WHERE filter", async () => {
    // Google Ads rejects (query_error=16) when fields used in WHERE aren't in SELECT.
    // The user's SELECT here doesn't include campaign.status / ad_group.status, so we
    // must add them ourselves alongside the auto-injected WHERE filter.
    mockQuery.mockResolvedValueOnce([]);
    await runSafeGaqlReport(
      auth,
      "SELECT campaign.name, ad_group.name, ad_group_criterion.keyword.text, metrics.cost_micros FROM keyword_view WHERE segments.date DURING LAST_30_DAYS",
      100,
    );
    const query = mockQuery.mock.calls[0][0] as string;
    const selectClause = query.match(/^\s*SELECT\s+([\s\S]+?)\s+FROM\s+/i)?.[1] ?? "";
    expect(selectClause).toMatch(/\bcampaign\.status\b/);
    expect(selectClause).toMatch(/\bad_group\.status\b/);
    expect(query).toContain("campaign.status != 'REMOVED'");
    expect(query).toContain("ad_group.status != 'REMOVED'");
  });

  it("does not duplicate campaign.status in SELECT when user already included it", async () => {
    mockQuery.mockResolvedValueOnce([]);
    await runSafeGaqlReport(
      auth,
      "SELECT campaign.name, campaign.status FROM campaign",
      100,
    );
    const query = mockQuery.mock.calls[0][0] as string;
    const selectClause = query.match(/^\s*SELECT\s+([\s\S]+?)\s+FROM\s+/i)?.[1] ?? "";
    const occurrences = selectClause.match(/\bcampaign\.status\b/gi)?.length ?? 0;
    expect(occurrences).toBe(1);
    expect(query).toContain("campaign.status != 'REMOVED'");
  });

  it("auto-adds status fields to a multi-line SELECT without breaking formatting", async () => {
    mockQuery.mockResolvedValueOnce([]);
    await runSafeGaqlReport(
      auth,
      `
      SELECT
        ad_group_ad.ad.id,
        ad_group_ad.ad.final_urls,
        metrics.cost_micros
      FROM ad_group_ad
      WHERE segments.date DURING LAST_30_DAYS
    `,
      100,
    );
    const query = mockQuery.mock.calls[0][0] as string;
    expect(query).toContain("campaign.status");
    expect(query).toContain("ad_group.status");
    expect(query).toContain("campaign.status != 'REMOVED'");
    // FROM ad_group_ad must still be intact (not corrupted by SELECT rewrite)
    expect(query).toMatch(/FROM\s+ad_group_ad\b/);
  });

  it("can opt out of removed-parent filtering for historical GAQL", async () => {
    mockQuery.mockResolvedValueOnce([]);
    await runSafeGaqlReport(
      auth,
      "SELECT campaign.id FROM campaign",
      100,
      { excludeRemovedParents: false },
    );
    expect(mockQuery.mock.calls[0][0]).not.toContain("campaign.status");
  });

  it("uses default limit when none provided", async () => {
    mockQuery.mockResolvedValueOnce([]);
    await runSafeGaqlReport(auth, "SELECT campaign.id FROM campaign");
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining(`LIMIT ${DEFAULT_GAQL_LIMIT + 1}`),
    );
  });

  it("respects explicit LIMIT in query when larger than param", async () => {
    mockQuery.mockResolvedValueOnce([]);
    await runSafeGaqlReport(auth, "SELECT campaign.id FROM campaign LIMIT 500", 200);
    // GAQL LIMIT wins over param; probes LIMIT+1 = 501
    expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining("LIMIT 501"));
  });

  it("caps explicit LIMIT at MAX_GAQL_LIMIT", async () => {
    mockQuery.mockResolvedValueOnce([]);
    await runSafeGaqlReport(auth, "SELECT campaign.id FROM campaign LIMIT 10000");
    // 10000 capped to 2000; probe = 2001
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining(`LIMIT ${MAX_GAQL_LIMIT + 1}`),
    );
  });

  it("clamps param limit to [1, MAX_GAQL_LIMIT]", async () => {
    mockQuery.mockResolvedValueOnce([]);
    await runSafeGaqlReport(auth, "SELECT campaign.id FROM campaign", 99999);
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining(`LIMIT ${MAX_GAQL_LIMIT + 1}`),
    );
  });

  it("reports non-truncated when fetched <= limit", async () => {
    mockQuery.mockResolvedValueOnce([
      { campaign: { id: "1" } },
      { campaign: { id: "2" } },
    ]);
    const result = await runSafeGaqlReport(
      auth,
      "SELECT campaign.id FROM campaign",
      10,
    );
    expect(result.rowCount).toBe(2);
    expect(result.truncated).toBe(false);
    expect(result.truncationReason).toBeNull();
    expect(result.summary).toBeUndefined();
    expect(result.continuationHint).toBeUndefined();
  });

  it("returns a self-describing metadata envelope", async () => {
    mockQuery.mockResolvedValueOnce([
      {
        customer: { currency_code: "USD", time_zone: "America/Los_Angeles" },
        campaign: { id: "1" },
        metrics: { clicks: 5 },
      },
    ]);

    const result = await runSafeGaqlReport(
      auth,
      "SELECT customer.currency_code, customer.time_zone, campaign.id, metrics.clicks FROM campaign WHERE segments.date BETWEEN '2026-04-01' AND '2026-04-30'",
      10,
    );

    expect(result.meta).toMatchObject({
      customerId: "130-126-5570",
      loginCustomerId: null,
      resource: "campaign",
      currencyCode: "USD",
      timeZone: "America/Los_Angeles",
      dateRange: { start: "2026-04-01", end: "2026-04-30", source: "between", days: 30 },
      returnedRowCount: 1,
      fetchedRowCount: 1,
      truncated: false,
      excludeRemovedParents: true,
      filters: {
        campaignStatuses: { included: [], excluded: ["REMOVED"] },
        adGroupStatuses: { included: [], excluded: [] },
        campaignTypes: { included: [], excluded: [] },
      },
      dataCompleteness: { rows: "complete", removedParents: "excluded", reportingLag: "lagged" },
    });
    expect(result.meta.reportingLagDays).toEqual(expect.any(Number));
    expect(result.meta.asOf).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(result.meta.selectedFieldCount).toBeGreaterThanOrEqual(4);
  });

  it("marks truncated and slices rows when fetched > limit", async () => {
    const rows = Array.from({ length: 11 }, (_, i) => ({
      campaign: { id: String(i) },
      metrics: { cost_micros: (11 - i) * 1_000_000, clicks: i + 1 },
    }));
    mockQuery.mockResolvedValueOnce(rows);

    const result = await runSafeGaqlReport(
      auth,
      "SELECT campaign.id, metrics.clicks, metrics.cost_micros FROM campaign",
      10,
    );

    expect(result.rowCount).toBe(10);
    expect(result.fetchedRowCount).toBe(11);
    expect(result.truncated).toBe(true);
    expect(result.truncationReason).toBe("row_limit");
    expect(result.summary?.computedOverRowCount).toBe(11);
    expect(result.summary?.sums["metrics.clicks"]).toBe(
      rows.reduce((s, r) => s + r.metrics.clicks, 0),
    );
    expect(result.continuationHint).toMatch(/row limit/i);
  });

  it("does not mark truncated when fetched exactly equals limit", async () => {
    // Probe is limit+1; if Google returns exactly `limit` rows, there's no more.
    const rows = Array.from({ length: 10 }, (_, i) => ({ campaign: { id: String(i) } }));
    mockQuery.mockResolvedValueOnce(rows);

    const result = await runSafeGaqlReport(
      auth,
      "SELECT campaign.id FROM campaign",
      10,
    );

    expect(result.truncated).toBe(false);
    expect(result.rowCount).toBe(10);
  });

  it("truncates by byte budget when rows are too large", async () => {
    // 300 rows × fat payload each → exceeds 40KB response budget
    const bigText = "x".repeat(500);
    const rows = Array.from({ length: 300 }, (_, i) => ({
      campaign: { id: String(i), name: bigText },
      metrics: { cost_micros: i * 1000, clicks: i },
    }));
    mockQuery.mockResolvedValueOnce(rows);

    const result = await runSafeGaqlReport(
      auth,
      "SELECT campaign.id, campaign.name, metrics.clicks, metrics.cost_micros FROM campaign",
      2000,
    );

    expect(result.truncated).toBe(true);
    expect(result.truncationReason).toBe("byte_budget");
    expect(result.rowCount).toBeLessThan(300);
    expect(result.summary).toBeDefined();
    expect(result.summary?.computedOverRowCount).toBe(300);
    expect(result.continuationHint).toMatch(/byte budget/i);
  });

  it("surfaces GAQL errors with context", async () => {
    mockQuery.mockRejectedValueOnce(new Error("invalid field"));
    await expect(
      runSafeGaqlReport(auth, "SELECT bogus FROM campaign"),
    ).rejects.toThrow(/GAQL query failed.*invalid field/);
  });
});

describe("rewriteInvalidDateLiterals", () => {
  // Pin the clock so BETWEEN windows are deterministic in tests.
  const NOW = new Date("2026-04-25T12:00:00Z");

  it("rewrites LAST_90_DAYS to a 90-day BETWEEN window ending today", () => {
    const out = rewriteInvalidDateLiterals(
      "SELECT campaign.id FROM campaign WHERE segments.date DURING LAST_90_DAYS",
      NOW,
    );
    expect(out).toContain("BETWEEN '2026-01-26' AND '2026-04-25'");
    expect(out).not.toContain("LAST_90_DAYS");
  });

  it("rewrites LAST_60_DAYS", () => {
    const out = rewriteInvalidDateLiterals(
      "SELECT campaign.id FROM campaign WHERE segments.date DURING LAST_60_DAYS",
      NOW,
    );
    expect(out).toContain("BETWEEN '2026-02-25' AND '2026-04-25'");
  });

  it("rewrites LAST_180_DAYS and arbitrary LAST_N_DAYS", () => {
    const out180 = rewriteInvalidDateLiterals("WHERE segments.date DURING LAST_180_DAYS", NOW);
    expect(out180).toMatch(/BETWEEN '\d{4}-\d{2}-\d{2}' AND '2026-04-25'/);
    const out45 = rewriteInvalidDateLiterals("WHERE segments.date DURING LAST_45_DAYS", NOW);
    expect(out45).toMatch(/BETWEEN '\d{4}-\d{2}-\d{2}' AND '2026-04-25'/);
  });

  it("does NOT rewrite supported literals", () => {
    const supported = ["LAST_7_DAYS", "LAST_14_DAYS", "LAST_30_DAYS"];
    for (const lit of supported) {
      const out = rewriteInvalidDateLiterals(`WHERE segments.date DURING ${lit}`, NOW);
      expect(out).toContain(`DURING ${lit}`);
      expect(out).not.toContain("BETWEEN");
    }
  });

  it("does not touch other DURING literals like THIS_MONTH or LAST_BUSINESS_WEEK", () => {
    const out1 = rewriteInvalidDateLiterals("WHERE segments.date DURING THIS_MONTH", NOW);
    expect(out1).toContain("DURING THIS_MONTH");
    const out2 = rewriteInvalidDateLiterals("WHERE segments.date DURING LAST_BUSINESS_WEEK", NOW);
    expect(out2).toContain("DURING LAST_BUSINESS_WEEK");
  });

  it("rewrites THIS_YEAR to Jan 1 → today", () => {
    const out = rewriteInvalidDateLiterals("WHERE segments.date DURING THIS_YEAR", NOW);
    expect(out).toContain("BETWEEN '2026-01-01' AND '2026-04-25'");
  });

  it("rewrites LAST_YEAR to prev Jan 1 → prev Dec 31", () => {
    const out = rewriteInvalidDateLiterals("WHERE segments.date DURING LAST_YEAR", NOW);
    expect(out).toContain("BETWEEN '2025-01-01' AND '2025-12-31'");
  });

  it("is case-insensitive (matches lowercase `during`)", () => {
    const out = rewriteInvalidDateLiterals("where segments.date during last_90_days", NOW);
    expect(out).toContain("BETWEEN '2026-01-26' AND '2026-04-25'");
  });

  it("runs through runSafeGaqlReport so agents using LAST_90_DAYS get a working query", async () => {
    mockQuery.mockResolvedValueOnce([{ campaign: { id: "1" } }]);
    await runSafeGaqlReport(
      auth,
      "SELECT campaign.id FROM campaign WHERE segments.date DURING LAST_90_DAYS",
    );
    const sentQuery = mockQuery.mock.calls[0][0] as string;
    expect(sentQuery).toContain("BETWEEN");
    expect(sentQuery).not.toContain("LAST_90_DAYS");
  });
});

describe("enrichGaqlError", () => {
  it("appends a getResourceMetadata hint on unrecognized field errors", () => {
    const out = enrichGaqlError("Unrecognized field in the query: 'metrics.roas'. (query_error=32)");
    expect(out).toContain("getResourceMetadata");
  });

  it("does NOT classify metrics.conversion_value as virtual (real Google Ads field)", () => {
    const out = enrichGaqlError(
      "Unrecognized field in the query: 'metrics.conversion_value'. (query_error=32)",
    );
    expect(out).not.toContain("virtual field");
    expect(out).toContain("getResourceMetadata");
  });

  it("does NOT classify customer.descriptive_name as virtual (real Google Ads field)", () => {
    const out = enrichGaqlError(
      "Unrecognized field in the query: 'customer.descriptive_name'. (query_error=32)",
    );
    expect(out).not.toContain("virtual field");
    expect(out).toContain("getResourceMetadata");
  });

  it("identifies _value field as a virtual micros-to-currency sibling and names the raw field", () => {
    const out = enrichGaqlError(
      "Unrecognized field in the query: 'metrics.cost_value'. (query_error=32)",
    );
    expect(out).toContain("virtual field");
    expect(out).toContain("cost_micros");
    expect(out).not.toContain("getResourceMetadata");
  });

  it("identifies _name field as a virtual enum-to-string sibling and names the raw field", () => {
    const out = enrichGaqlError(
      "Unrecognized field in the query: 'campaign.bidding_strategy_type_name'. (query_error=32)",
    );
    expect(out).toContain("virtual field");
    expect(out).toContain("campaign.bidding_strategy_type");
    expect(out).not.toContain("getResourceMetadata");
  });

  it("hints to switch FROM resource on metric/resource incompatibility", () => {
    const msg = "Cannot select or filter on the following metrics: 'conversions'(could not support requested resources: 'CONVERSION_ACTION'), since metric is incompatible with the resource in the FROM clause or other selected segmenting resources. (query_error=49)";
    const out = enrichGaqlError(msg);
    expect(out).toMatch(/Tip:.*FROM/);
  });

  it("lists supported date literals on Invalid date literal errors", () => {
    const out = enrichGaqlError("Invalid date literal supplied for DURING operator: LAST_THIRTY_DAYS. (query_error=22)");
    expect(out).toContain("LAST_30_DAYS");
    expect(out).toContain("BETWEEN");
  });

  it("returns the original message unchanged for unknown errors", () => {
    expect(enrichGaqlError("Random unrelated error")).toBe("Random unrelated error");
  });

  it("hints to add the missing field to SELECT on query_error=16", () => {
    const out = enrichGaqlError(
      "The following field must be present in SELECT clause: 'campaign.id'. (query_error=16)",
    );
    expect(out).toContain("`campaign.id`");
    expect(out).toMatch(/SELECT clause/);
  });

  it("hints to use string enum names on query_error=18", () => {
    const out = enrichGaqlError(
      "Invalid enum value cannot be included in WHERE clause: '3'. (query_error=18)",
    );
    expect(out).toContain("'PAUSED'");
    expect(out).toMatch(/STRING names/);
  });

  it("hints to drop incompatible segment/metric on query_error=53", () => {
    const out = enrichGaqlError(
      "Cannot select the following segments because at least one unsupported metric is found in SELECT or WHERE clause: 'segments.conversion_action_name'(unsupported metrics: 'cost_micros'). (query_error=53)",
    );
    expect(out).toMatch(/Tip:.*segment/);
    expect(out).toMatch(/cost_micros/);
  });

  it("names the 30-day cap on change_event_error=2", () => {
    const out = enrichGaqlError(
      "The requested start date is too old. It cannot be older than 30 days. (change_event_error=2)",
    );
    expect(out).toMatch(/30 days/);
    expect(out).toContain("ads.queries.changeEvents");
  });

  it("names change_date_time as the required filter on change_event_error=3", () => {
    const out = enrichGaqlError(
      "The change_event request is missing filters on change_event.change_date_time or is filtering on change_event.change_date_time with an infinite range. (change_event_error=3)",
    );
    expect(out).toContain("change_event.change_date_time");
    expect(out).toMatch(/segments\.date.*not/i);
  });
});

// ─── Pre-flight validators ────────────────────────────────────────────

describe("validateChangeEventFilter", () => {
  it("rejects FROM change_event without change_date_time filter", () => {
    expect(() =>
      validateChangeEventFilter(
        "SELECT change_event.change_date_time FROM change_event WHERE segments.date DURING LAST_30_DAYS",
      ),
    ).toThrow(/change_event\.change_date_time/);
  });

  it("allows FROM change_event when change_date_time is filtered", () => {
    expect(() =>
      validateChangeEventFilter(
        "SELECT change_event.change_date_time FROM change_event WHERE change_event.change_date_time >= '2026-04-01 00:00:00'",
      ),
    ).not.toThrow();
  });

  it("ignores other resources", () => {
    expect(() =>
      validateChangeEventFilter("SELECT campaign.id FROM campaign"),
    ).not.toThrow();
  });
});

describe("validateMetricsOnConversionAction", () => {
  it("rejects metrics.* selected from FROM conversion_action", () => {
    expect(() =>
      validateMetricsOnConversionAction(
        "SELECT conversion_action.name, metrics.conversions FROM conversion_action",
      ),
    ).toThrow(/conversion_action/);
  });

  it("allows non-metric fields from FROM conversion_action", () => {
    expect(() =>
      validateMetricsOnConversionAction(
        "SELECT conversion_action.name, conversion_action.status FROM conversion_action",
      ),
    ).not.toThrow();
  });

  it("allows metrics from other resources", () => {
    expect(() =>
      validateMetricsOnConversionAction(
        "SELECT campaign.id, metrics.conversions FROM campaign",
      ),
    ).not.toThrow();
  });
});

describe("validateEnumLiteralsInWhere", () => {
  it("rejects numeric literals on campaign.status", () => {
    expect(() =>
      validateEnumLiteralsInWhere(
        "SELECT campaign.id, campaign.status FROM campaign WHERE campaign.status = '3'",
      ),
    ).toThrow(/STRING names/);
  });

  it("rejects unquoted numeric literals", () => {
    expect(() =>
      validateEnumLiteralsInWhere(
        "SELECT ad_group.id, ad_group.status FROM ad_group WHERE ad_group.status = 2",
      ),
    ).toThrow(/STRING names/);
  });

  it("rejects numeric IN lists", () => {
    expect(() =>
      validateEnumLiteralsInWhere(
        "SELECT campaign.id, campaign.status FROM campaign WHERE campaign.status IN ('2', '3')",
      ),
    ).toThrow(/STRING names/);
  });

  it("allows valid string enum names", () => {
    expect(() =>
      validateEnumLiteralsInWhere(
        "SELECT campaign.id, campaign.status FROM campaign WHERE campaign.status = 'PAUSED'",
      ),
    ).not.toThrow();
  });

  it("allows IN clauses with string names", () => {
    expect(() =>
      validateEnumLiteralsInWhere(
        "SELECT campaign.id, campaign.status FROM campaign WHERE campaign.status IN ('ENABLED', 'PAUSED')",
      ),
    ).not.toThrow();
  });

  it("ignores numeric comparisons on non-enum fields", () => {
    expect(() =>
      validateEnumLiteralsInWhere(
        "SELECT campaign.id FROM campaign WHERE metrics.clicks > 100 AND campaign.id = 12345",
      ),
    ).not.toThrow();
  });
});

describe("clampChangeEventDateWindow", () => {
  const NOW = new Date("2026-04-26T12:00:00Z");

  it("clamps a 30-days-ago lower bound to today − 29 days", () => {
    // 2026-03-27 is exactly 30 days back from 2026-04-26 — Google rejects it
    // because >= '2026-03-27 00:00:00' is older than now-minus-30-days.
    const out = clampChangeEventDateWindow(
      "SELECT change_event.change_date_time FROM change_event WHERE change_event.change_date_time >= '2026-03-27 00:00:00' AND change_event.change_date_time <= '2026-04-26 23:59:59'",
      NOW,
    );
    expect(out).toContain("'2026-03-28 00:00:00'");
    expect(out).not.toContain("'2026-03-27 00:00:00'");
  });

  it("preserves a date that is already inside the window", () => {
    const out = clampChangeEventDateWindow(
      "SELECT change_event.change_date_time FROM change_event WHERE change_event.change_date_time >= '2026-04-15 00:00:00'",
      NOW,
    );
    expect(out).toContain("'2026-04-15 00:00:00'");
  });

  it("handles a bare YYYY-MM-DD literal (no time suffix)", () => {
    const out = clampChangeEventDateWindow(
      "SELECT change_event.change_date_time FROM change_event WHERE change_event.change_date_time >= '2026-01-01'",
      NOW,
    );
    expect(out).toMatch(/'2026-03-28( 00:00:00)?'/);
  });

  it("ignores non-change_event resources", () => {
    const original = "SELECT campaign.id FROM campaign WHERE segments.date >= '2026-01-01'";
    expect(clampChangeEventDateWindow(original, NOW)).toBe(original);
  });
});

describe("runSafeGaqlReport pre-flight integration", () => {
  it("rejects FROM change_event without change_date_time filter end-to-end", async () => {
    await expect(
      runSafeGaqlReport(
        auth,
        "SELECT change_event.change_date_time FROM change_event WHERE segments.date DURING LAST_30_DAYS",
      ),
    ).rejects.toThrow(/change_event\.change_date_time/);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("rejects metrics.conversions FROM conversion_action end-to-end", async () => {
    await expect(
      runSafeGaqlReport(
        auth,
        "SELECT conversion_action.name, metrics.conversions FROM conversion_action",
      ),
    ).rejects.toThrow(/metrics.*not selectable/i);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("rejects numeric enum in WHERE end-to-end", async () => {
    await expect(
      runSafeGaqlReport(
        auth,
        "SELECT campaign.id, campaign.status FROM campaign WHERE campaign.status = 3",
      ),
    ).rejects.toThrow(/STRING names/);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("auto-clamps an out-of-window change_event lower bound before sending", async () => {
    mockQuery.mockResolvedValueOnce([]);
    // Date well outside the 30-day cap. Without the clamp, Google would reject;
    // with it, the query reaches the API with a clamped lower bound.
    await runSafeGaqlReport(
      auth,
      "SELECT change_event.change_date_time FROM change_event WHERE change_event.change_date_time >= '2025-01-01 00:00:00' AND change_event.change_date_time <= '2026-04-26 23:59:59'",
    );
    const sent = mockQuery.mock.calls[0][0] as string;
    expect(sent).not.toContain("'2025-01-01 00:00:00'");
    expect(sent).toMatch(/change_event\.change_date_time\s*>=\s*'\d{4}-\d{2}-\d{2}/);
  });
});
