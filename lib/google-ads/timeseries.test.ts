import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bucketRows, getTimeseries, queryTimeseries } from "./timeseries";
import { __resetCacheForTests } from "./query-cache";
import type { AuthContext } from "./types";

const queryMock = vi.fn();

vi.mock("./client", async (orig) => {
  const actual = await orig<typeof import("./client")>();
  const { cachedQuery } = await import("./query-cache");
  return {
    ...actual,
    getCachedCustomer: (a: { userId?: string | null; customerId: string; loginCustomerId?: string | null }) => ({
      query: (q: string) =>
        cachedQuery(a.userId, a.customerId, a.loginCustomerId, q, () => queryMock(q)),
    }),
  };
});

const auth: AuthContext = { refreshToken: "rt", customerId: "100", userId: "u1" };

beforeEach(() => {
  queryMock.mockReset();
  __resetCacheForTests();
});

afterEach(() => {
  queryMock.mockReset();
  __resetCacheForTests();
});

// ─── Query builder ──────────────────────────────────────────────────

describe("queryTimeseries", () => {
  it("emits an account-level query", () => {
    const q = queryTimeseries("2026-01-01", "2026-01-31", "account");
    expect(q).toContain("FROM customer");
    expect(q).toContain("segments.date BETWEEN '2026-01-01' AND '2026-01-31'");
  });

  it("emits a campaign-level query with ORDER BY cost DESC", () => {
    const q = queryTimeseries("2026-01-01", "2026-01-31", "campaign");
    expect(q).toContain("FROM campaign");
    expect(q).toContain("ORDER BY metrics.cost_micros DESC");
  });

  it("includes segments.device when groupBy is device", () => {
    const q = queryTimeseries("2026-01-01", "2026-01-31", "device");
    expect(q).toContain("segments.device");
  });

  it("includes segments.ad_network_type when groupBy is network", () => {
    const q = queryTimeseries("2026-01-01", "2026-01-31", "network");
    expect(q).toContain("segments.ad_network_type");
  });

  it("narrows by campaign.id via IN (...) when campaignIds provided", () => {
    const q = queryTimeseries("2026-01-01", "2026-01-31", "campaign", ["123", "456"]);
    expect(q).toContain("campaign.id IN (123, 456)");
  });

  it("drops non-numeric campaign ids to prevent GAQL injection", () => {
    const q = queryTimeseries("2026-01-01", "2026-01-31", "campaign", [
      "123",
      "456'; DROP TABLE users; --",
      "abc",
    ]);
    expect(q).toContain("campaign.id IN (123)");
    expect(q).not.toContain("DROP");
    expect(q).not.toContain("abc");
  });

  it("falls back to 0 when every id is rejected", () => {
    const q = queryTimeseries("2026-01-01", "2026-01-31", "campaign", ["bad", "also-bad"]);
    expect(q).toContain("campaign.id IN (0)");
  });
});

// ─── Row bucketing / derived metric math ────────────────────────────

describe("bucketRows — day granularity", () => {
  it("aggregates per-day per-segment with derived CPA", () => {
    const rows = [
      {
        segmentKey: "c1",
        dimensions: { campaign_id: "c1", campaign_name: "C1" },
        date: "2026-01-01",
        raw: { spend: 10, clicks: 100, impressions: 1000, conversions: 2, conversion_value: 0 },
      },
      {
        segmentKey: "c1",
        dimensions: { campaign_id: "c1", campaign_name: "C1" },
        date: "2026-01-01",
        raw: { spend: 5, clicks: 50, impressions: 500, conversions: 1, conversion_value: 0 },
      },
      {
        segmentKey: "c1",
        dimensions: { campaign_id: "c1", campaign_name: "C1" },
        date: "2026-01-02",
        raw: { spend: 20, clicks: 100, impressions: 2000, conversions: 0, conversion_value: 0 },
      },
    ];
    const series = bucketRows(rows, "day", ["spend", "cpa"]);
    expect(series).toHaveLength(1);
    const [s] = series;
    expect(s.points).toEqual([
      { date: "2026-01-01", spend: 15, cpa: 5 }, // $15 / 3 conversions
      { date: "2026-01-02", spend: 20, cpa: null }, // 0 conversions
    ]);
  });
});

describe("bucketRows — week granularity (Monday-aligned)", () => {
  it("buckets into ISO week starts", () => {
    // 2026-01-05 is a Monday. 2026-01-04 is a Sunday.
    const rows = [
      {
        segmentKey: "a",
        dimensions: { account_id: "a" },
        date: "2026-01-04",
        raw: { spend: 5, clicks: 10, impressions: 100, conversions: 1, conversion_value: 0 },
      },
      {
        segmentKey: "a",
        dimensions: { account_id: "a" },
        date: "2026-01-05",
        raw: { spend: 10, clicks: 20, impressions: 200, conversions: 2, conversion_value: 0 },
      },
    ];
    const series = bucketRows(rows, "week", ["spend", "clicks"]);
    // Sunday Jan 4 → previous week start Monday Dec 29 2025
    // Monday Jan 5 → Jan 5
    expect(series[0].points.map((p) => p.date)).toEqual(["2025-12-29", "2026-01-05"]);
    expect(series[0].points[0].spend).toBe(5);
    expect(series[0].points[1].spend).toBe(10);
  });
});

describe("bucketRows — month granularity", () => {
  it("buckets into YYYY-MM", () => {
    const rows = [
      {
        segmentKey: "a",
        dimensions: {},
        date: "2026-01-15",
        raw: { spend: 10, clicks: 0, impressions: 0, conversions: 0, conversion_value: 0 },
      },
      {
        segmentKey: "a",
        dimensions: {},
        date: "2026-01-31",
        raw: { spend: 20, clicks: 0, impressions: 0, conversions: 0, conversion_value: 0 },
      },
      {
        segmentKey: "a",
        dimensions: {},
        date: "2026-02-01",
        raw: { spend: 5, clicks: 0, impressions: 0, conversions: 0, conversion_value: 0 },
      },
    ];
    const series = bucketRows(rows, "month", ["spend"]);
    expect(series[0].points).toEqual([
      { date: "2026-01", spend: 30 },
      { date: "2026-02", spend: 5 },
    ]);
  });
});

describe("bucketRows — zero-denominator derived metrics", () => {
  it("returns null (not 0 or NaN) for cpa/ctr/conversion_rate/roas when the denominator is 0", () => {
    const rows = [
      {
        segmentKey: "a",
        dimensions: {},
        date: "2026-01-01",
        raw: { spend: 0, clicks: 0, impressions: 0, conversions: 0, conversion_value: 0 },
      },
    ];
    const series = bucketRows(rows, "day", ["cpa", "ctr", "conversion_rate", "roas"]);
    expect(series[0].points[0]).toMatchObject({
      cpa: null,
      ctr: null,
      conversion_rate: null,
      roas: null,
    });
  });
});

// ─── getTimeseries (integration) ────────────────────────────────────

describe("getTimeseries", () => {
  const accountInfoRows = [{ customer: { currency_code: "USD", time_zone: "America/New_York" } }];

  it("fires 1 upstream data query + 1 account info query for the main window", async () => {
    queryMock.mockResolvedValue([]).mockResolvedValueOnce(accountInfoRows);
    await getTimeseries(auth, {
      startDate: "2026-01-01",
      endDate: "2026-01-31",
    });
    expect(queryMock).toHaveBeenCalledTimes(2);
  });

  it("fires 2 data queries + 1 metadata query when comparePreviousPeriod is set", async () => {
    queryMock.mockResolvedValue([]).mockResolvedValueOnce(accountInfoRows);
    await getTimeseries(auth, {
      startDate: "2026-01-10",
      endDate: "2026-01-19",
      comparePreviousPeriod: true,
    });
    expect(queryMock).toHaveBeenCalledTimes(3);
  });

  it("builds a same-length shifted comparison window ending the day before startDate", async () => {
    queryMock.mockResolvedValueOnce(accountInfoRows).mockResolvedValue([]);
    const r = await getTimeseries(auth, {
      startDate: "2026-01-10",
      endDate: "2026-01-19", // 10 days inclusive
      comparePreviousPeriod: true,
    });
    expect(r.comparison).toBeDefined();
    expect(r.comparison!.startDate).toBe("2025-12-31");
    expect(r.comparison!.endDate).toBe("2026-01-09");
    expect(r.comparison!.periodLabel).toBe("Previous 10 days");
  });

  it("rejects ranges beyond 730 days", async () => {
    await expect(
      getTimeseries(auth, { startDate: "2020-01-01", endDate: "2026-01-01" }),
    ).rejects.toThrow(/730-day cap/);
  });

  it("rejects endDate before startDate", async () => {
    await expect(
      getTimeseries(auth, { startDate: "2026-02-01", endDate: "2026-01-01" }),
    ).rejects.toThrow(/endDate must be on or after startDate/);
  });

  it("groupBy: campaign returns one segment per campaign with dimensions", async () => {
    queryMock
      .mockResolvedValueOnce(accountInfoRows)
      .mockResolvedValueOnce([
        {
          campaign: { id: 1, name: "Brand" },
          segments: { date: "2026-01-01" },
          metrics: { cost_micros: 1_000_000, clicks: 10, conversions: 1 },
        },
        {
          campaign: { id: 2, name: "Generic" },
          segments: { date: "2026-01-01" },
          metrics: { cost_micros: 2_000_000, clicks: 20, conversions: 2 },
        },
      ]);
    const r = await getTimeseries(auth, {
      startDate: "2026-01-01",
      endDate: "2026-01-31",
      groupBy: "campaign",
    });
    expect(r.series).toHaveLength(2);
    expect(r.series[0].dimensions).toMatchObject({ campaign_id: "1", campaign_name: "Brand" });
  });

  it("returns meta.currency and meta.timezone from the account info query", async () => {
    queryMock.mockResolvedValueOnce(accountInfoRows).mockResolvedValue([]);
    const r = await getTimeseries(auth, {
      startDate: "2026-01-01",
      endDate: "2026-01-31",
    });
    expect(r.meta.currency).toBe("USD");
    expect(r.meta.timezone).toBe("America/New_York");
  });

  it("falls back to USD / UTC when the metadata query fails — doesn't block the timeseries", async () => {
    queryMock
      .mockRejectedValueOnce(new Error("metadata down"))
      .mockResolvedValueOnce([]);
    const r = await getTimeseries(auth, {
      startDate: "2026-01-01",
      endDate: "2026-01-31",
    });
    expect(r.meta.currency).toBe("USD");
    expect(r.meta.timezone).toBe("UTC");
    expect(r.errors).toBeDefined();
    expect(r.errors![0]).toContain("account_info");
  });

  it("meta echoes startDate, endDate, granularity, metrics, groupBy", async () => {
    queryMock.mockResolvedValueOnce(accountInfoRows).mockResolvedValue([]);
    const r = await getTimeseries(auth, {
      startDate: "2026-03-01",
      endDate: "2026-03-31",
      granularity: "week",
      metrics: ["spend", "ctr"],
      groupBy: "device",
    });
    expect(r.meta).toMatchObject({
      startDate: "2026-03-01",
      endDate: "2026-03-31",
      granularity: "week",
      metrics: ["spend", "ctr"],
      groupBy: "device",
    });
  });

  it("returns empty series when there are no rows, but meta is always intact", async () => {
    queryMock.mockResolvedValueOnce(accountInfoRows).mockResolvedValueOnce([]);
    const r = await getTimeseries(auth, {
      startDate: "2026-01-01",
      endDate: "2026-01-31",
    });
    expect(r.series).toEqual([]);
    expect(r.meta.startDate).toBe("2026-01-01");
  });
});
