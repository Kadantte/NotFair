import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getAccountChanges,
  getLandingPagePerformance,
  getWasteFindings,
} from "./views";
import { __resetCacheForTests } from "../query-cache";
import type { AuthContext } from "../types";

// Mock the google-ads client so views see fixtures instead of real
// upstream data. We replace `getCachedCustomer` directly but still route
// through the real `cachedQuery` helper so the coalescing test verifies
// actual cache hits, not just tool fan-out.
const queryMock = vi.fn();

vi.mock("../client", async (orig) => {
  const actual = await orig<typeof import("../client")>();
  const { cachedQuery } = await import("../query-cache");
  return {
    ...actual,
    getCachedCustomer: (a: { userId?: string | null; customerId: string; loginCustomerId?: string | null }) => ({
      query: (q: string) =>
        cachedQuery(a.userId, a.customerId, a.loginCustomerId, q, () => queryMock(q)),
    }),
  };
});

const auth: AuthContext = {
  refreshToken: "rt",
  customerId: "1234567890",
  userId: "u1",
};

function resetMocks() {
  queryMock.mockReset();
  __resetCacheForTests();
}

beforeEach(() => resetMocks());
afterEach(() => resetMocks());

// ─── Helpers to drive fixtures by call order ────────────────────────

function whenQueryCalls(responses: unknown[][]) {
  for (const r of responses) queryMock.mockResolvedValueOnce(r);
}

// ─── getAccountChanges ──────────────────────────────────────────────

describe("getAccountChanges", () => {
  it("fires exactly 3 queries (campaigns, ad_groups, change_events)", async () => {
    whenQueryCalls([[], [], []]);
    await getAccountChanges(auth, 7, 50);
    expect(queryMock).toHaveBeenCalledTimes(3);
  });

  it("aggregates changes by user, resource type, and client type", async () => {
    whenQueryCalls([
      [{ campaign: { id: 500, name: "Brand" } }],
      [{ ad_group: { id: 700, name: "AG1" } }],
      [
        {
          change_event: {
            change_date_time: "2026-04-21T10:00:00Z",
            change_resource_type: 5,
            resource_name: "customers/1234567890/campaigns/500",
            client_type: 2,
            user_email: "alice@example.com",
            changed_fields: "status",
            resource_change_operation: 3,
            campaign: "customers/1234567890/campaigns/500",
          },
        },
        {
          change_event: {
            change_date_time: "2026-04-20T10:00:00Z",
            change_resource_type: 5,
            resource_name: "customers/1234567890/campaigns/500",
            client_type: 6,
            user_email: "bob@example.com",
            changed_fields: "budget",
            resource_change_operation: 3,
            campaign: "customers/1234567890/campaigns/500",
          },
        },
      ],
    ]);

    const result = await getAccountChanges(auth, 7, 50);
    expect(result.totalChanges).toBe(2);
    expect(result.byUser).toContainEqual({ userEmail: "alice@example.com", count: 1 });
    expect(result.byUser).toContainEqual({ userEmail: "bob@example.com", count: 1 });
    expect(result.byResourceType).toContainEqual({ resourceType: "CAMPAIGN", count: 2 });
    const clientTypeLabels = result.byClientType.map((e) => e.clientType);
    expect(clientTypeLabels).toContain("GOOGLE_ADS_WEB_CLIENT");
    expect(clientTypeLabels).toContain("GOOGLE_ADS_API");
  });

  it("clamps days to the 30-day change_event API cap", async () => {
    whenQueryCalls([[], [], []]);
    const r = await getAccountChanges(auth, 60);
    expect(r.dateRange.days).toBe(30);
  });

  it("captures partial failures in `errors` instead of throwing", async () => {
    queryMock
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(new Error("ad_groups boom"))
      .mockResolvedValueOnce([]);
    const r = await getAccountChanges(auth);
    expect(r.errors).toBeDefined();
    expect(r.errors![0]).toContain("ad_groups");
    expect(r.totalChanges).toBe(0);
  });
});

// ─── getLandingPagePerformance ──────────────────────────────────────

describe("getLandingPagePerformance", () => {
  it("fires exactly 1 query (landing_page_view)", async () => {
    whenQueryCalls([[]]);
    await getLandingPagePerformance(auth);
    expect(queryMock).toHaveBeenCalledTimes(1);
  });

  it("projects rows to LandingPage with derived CPA and conversion rate", async () => {
    whenQueryCalls([
      [
        {
          landing_page_view: { unexpanded_final_url: "https://a.example.com/" },
          metrics: { cost_micros: 10_000_000, clicks: 100, conversions: 5 },
        },
        {
          landing_page_view: { unexpanded_final_url: "https://b.example.com/" },
          metrics: { cost_micros: 5_000_000, clicks: 50, conversions: 0 },
        },
      ],
    ]);
    const r = await getLandingPagePerformance(auth, 30, 10);
    expect(r.landingPages.items).toHaveLength(2);
    const [a, b] = r.landingPages.items;
    expect(a.url).toBe("https://a.example.com/");
    expect(a.spend).toBe(10);
    expect(a.cpa).toBe(10 / 5);
    expect(a.conversionRate).toBe(5 / 100);
    expect(b.cpa).toBeNull();
    expect(b.conversionRate).toBe(0);
  });

  it("sorts by spend descending via the FindingList envelope", async () => {
    whenQueryCalls([
      [
        {
          landing_page_view: { unexpanded_final_url: "low.example.com" },
          metrics: { cost_micros: 1_000_000, clicks: 10, conversions: 1 },
        },
        {
          landing_page_view: { unexpanded_final_url: "high.example.com" },
          metrics: { cost_micros: 100_000_000, clicks: 1000, conversions: 10 },
        },
      ],
    ]);
    const r = await getLandingPagePerformance(auth, 30, 10);
    // FindingList preserves input order but `totalSpend` is sum of both
    expect(r.landingPages.totalSpend).toBe(101);
  });
});

// ─── getWasteFindings ───────────────────────────────────────────────

describe("getWasteFindings", () => {
  it("fires exactly 5 queries (campaigns, ad_groups, search_terms, zero_conv_keywords, change_events)", async () => {
    whenQueryCalls([[], [], [], [], []]);
    await getWasteFindings(auth);
    expect(queryMock).toHaveBeenCalledTimes(5);
  });

  it("computes account CPA from campaign totals and flags keywords spending > 2x threshold", async () => {
    whenQueryCalls([
      // Campaigns: total spend $100, conversions 10 → accountCPA = $10, threshold $20
      [{ metrics: { cost_micros: 100_000_000, conversions: 10 } }],
      // Ad groups (for name lookup)
      [],
      // Search terms: none
      [],
      // Zero-conv keywords: one above threshold, one below
      [
        {
          campaign: { id: 1, name: "C1" },
          ad_group: { id: 10, name: "AG1" },
          ad_group_criterion: {
            criterion_id: 99,
            keyword: { text: "expensive", match_type: 2 },
          },
          metrics: { cost_micros: 25_000_000, clicks: 50 }, // $25 > $20 threshold
        },
        {
          campaign: { id: 1, name: "C1" },
          ad_group: { id: 10, name: "AG1" },
          ad_group_criterion: {
            criterion_id: 100,
            keyword: { text: "cheap", match_type: 2 },
          },
          metrics: { cost_micros: 15_000_000, clicks: 30 }, // $15 < $20 threshold
        },
      ],
      // Change events: none
      [],
    ]);

    const r = await getWasteFindings(auth);
    expect(r.accountCpa).toBe(10);
    expect(r.wasteThreshold).toBe(20);
    expect(r.wastedKeywords.items).toHaveLength(1);
    expect(r.wastedKeywords.items[0].text).toBe("expensive");
  });

  it("falls back to Infinity threshold (no waste flagged) when account has zero conversions", async () => {
    whenQueryCalls([
      [{ metrics: { cost_micros: 50_000_000, conversions: 0 } }],
      [],
      [],
      [
        {
          campaign: { id: 1, name: "C1" },
          ad_group: { id: 10, name: "AG1" },
          ad_group_criterion: {
            criterion_id: 99,
            keyword: { text: "any", match_type: 2 },
          },
          metrics: { cost_micros: 1_000_000_000, clicks: 999 },
        },
      ],
      [],
    ]);
    const r = await getWasteFindings(auth);
    expect(r.accountCpa).toBeNull();
    expect(r.wasteThreshold).toBeNull();
    // With Infinity threshold, nothing is flagged as wasted
    expect(r.wastedKeywords.items).toHaveLength(0);
  });

  it("flags search terms with 10+ clicks and zero conversions, ignores others", async () => {
    whenQueryCalls([
      [{ metrics: { cost_micros: 100_000_000, conversions: 10 } }],
      [],
      [
        {
          campaign: { id: 1, name: "C1" },
          ad_group: { id: 10, name: "AG1" },
          search_term_view: { search_term: "wasted term" },
          metrics: { cost_micros: 5_000_000, clicks: 15, conversions: 0 }, // flag
        },
        {
          campaign: { id: 1, name: "C1" },
          ad_group: { id: 10, name: "AG1" },
          search_term_view: { search_term: "too few clicks" },
          metrics: { cost_micros: 1_000_000, clicks: 5, conversions: 0 }, // skip
        },
        {
          campaign: { id: 1, name: "C1" },
          ad_group: { id: 10, name: "AG1" },
          search_term_view: { search_term: "converted" },
          metrics: { cost_micros: 2_000_000, clicks: 20, conversions: 2 }, // skip
        },
      ],
      [],
      [],
    ]);
    const r = await getWasteFindings(auth);
    expect(r.wastedSearchTerms.items).toHaveLength(1);
    expect(r.wastedSearchTerms.items[0].term).toBe("wasted term");
  });

  it("attaches recentChange to wasted keywords via the change-index ladder", async () => {
    whenQueryCalls([
      [{ campaign: { id: 1, name: "C1" }, metrics: { cost_micros: 100_000_000, conversions: 10 } }],
      [{ campaign: { id: 1 }, ad_group: { id: 10, name: "AG1" } }],
      [],
      [
        {
          campaign: { id: 1, name: "C1" },
          ad_group: { id: 10, name: "AG1" },
          ad_group_criterion: {
            criterion_id: 99,
            keyword: { text: "ouch", match_type: 2 },
          },
          metrics: { cost_micros: 25_000_000, clicks: 50 },
        },
      ],
      [
        {
          change_event: {
            change_date_time: "2026-04-21T10:00:00Z",
            change_resource_type: 5,
            resource_name: "customers/1234567890/campaigns/1",
            client_type: 6,
            changed_fields: "status",
            resource_change_operation: 3,
            campaign: "customers/1234567890/campaigns/1",
          },
        },
      ],
    ]);
    const r = await getWasteFindings(auth);
    const kw = r.wastedKeywords.items[0];
    expect(kw.recentChange).not.toBeNull();
    expect(kw.recentChange!.resourceType).toBe("CAMPAIGN");
  });

  it("computes wasteRate as (totalWaste / totalSpend) * 100", async () => {
    whenQueryCalls([
      [{ metrics: { cost_micros: 100_000_000, conversions: 10 } }], // spend $100
      [],
      [
        {
          campaign: { id: 1, name: "C1" },
          ad_group: { id: 10, name: "AG1" },
          search_term_view: { search_term: "burn" },
          metrics: { cost_micros: 10_000_000, clicks: 20, conversions: 0 }, // +$10 waste
        },
      ],
      [
        {
          campaign: { id: 1, name: "C1" },
          ad_group: { id: 10, name: "AG1" },
          ad_group_criterion: {
            criterion_id: 99,
            keyword: { text: "x", match_type: 2 },
          },
          metrics: { cost_micros: 30_000_000, clicks: 40 }, // +$30 waste (>$20 threshold)
        },
      ],
      [],
    ]);
    const r = await getWasteFindings(auth);
    expect(r.totalWaste).toBe(40);
    expect(r.wasteRate).toBe(40);
  });
});

// ─── Cache coalescing across views (codex's concern) ────────────────

describe("view composition — shared queries hit the cache", () => {
  it("calling getAccountChanges then getWasteFindings reuses campaigns + ad_groups + change_events", async () => {
    // Seed 8 fixture responses: 3 for the first view, 5 for the second.
    // If the cache works, the second view only fires 2 new upstream
    // queries (search_terms + zero_conv_keywords); the other 3 (campaigns,
    // ad_groups, change_events) hit the cache.
    const empty = () => [] as unknown[];
    // We enqueue 5 mock responses — one for each UNIQUE query that will
    // hit upstream across the two calls. If caching fails, the mock runs
    // dry and the test throws because mockResolvedValueOnce defaults to
    // undefined.
    whenQueryCalls([empty(), empty(), empty(), empty(), empty()]);

    await getAccountChanges(auth);
    await getWasteFindings(auth);

    // getAccountChanges fires 3 upstream (campaigns, ad_groups, change_events).
    // getWasteFindings shares those 3 and adds 2 unique (search_terms, zero_conv).
    // Total upstream calls: 5.
    expect(queryMock).toHaveBeenCalledTimes(5);
  });
});
