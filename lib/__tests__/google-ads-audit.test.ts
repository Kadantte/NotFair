import { describe, it, expect } from "vitest";

import { toFindingList, __testing } from "@/lib/google-ads/audit";

const { daysBetween, extractChangedFields } = __testing;

describe("daysBetween", () => {
  it("returns 0 for a change on the reference date", () => {
    expect(daysBetween("2026-04-19T10:00:00Z", "2026-04-19")).toBe(0);
  });
  it("returns 7 for a change one week before", () => {
    expect(daysBetween("2026-04-12T12:00:00Z", "2026-04-19")).toBe(7);
  });
  it("clamps negative deltas to 0 (change in the future)", () => {
    expect(daysBetween("2026-05-01T00:00:00Z", "2026-04-19")).toBe(0);
  });
  it("handles invalid input without throwing", () => {
    expect(daysBetween("not-a-date", "2026-04-19")).toBe(0);
  });
});

describe("extractChangedFields", () => {
  it("parses a comma-separated FieldMask string", () => {
    expect(extractChangedFields("status,cpc_bid_micros"))
      .toEqual(["status", "cpc_bid_micros"]);
  });
  it("parses a FieldMask object with `paths`", () => {
    expect(extractChangedFields({ paths: ["status", "cpc_bid_micros"] }))
      .toEqual(["status", "cpc_bid_micros"]);
  });
  it("trims whitespace and drops empty entries", () => {
    expect(extractChangedFields("status, , cpc_bid_micros "))
      .toEqual(["status", "cpc_bid_micros"]);
  });
  it("returns [] for null/undefined/empty", () => {
    expect(extractChangedFields(null)).toEqual([]);
    expect(extractChangedFields(undefined)).toEqual([]);
    expect(extractChangedFields("")).toEqual([]);
  });
  it("returns [] for unexpected shapes", () => {
    expect(extractChangedFields(42 as unknown)).toEqual([]);
    expect(extractChangedFields({ foo: "bar" })).toEqual([]);
  });
});

describe("toFindingList", () => {
  type Row = { name: string; spend: number };
  const rows: Row[] = [
    { name: "a", spend: 10 },
    { name: "b", spend: 20 },
    { name: "c", spend: 30 },
    { name: "d", spend: 40 },
    { name: "e", spend: 50 },
  ];

  it("returns shown/total/totalSpend/items for a full list", () => {
    const fl = toFindingList(rows, 10, (r) => r.spend);
    expect(fl.shown).toBe(5);
    expect(fl.total).toBe(5);
    expect(fl.totalSpend).toBe(150);
    expect(fl.items).toEqual(rows);
  });

  it("slices items but preserves total + totalSpend across the whole population", () => {
    const fl = toFindingList(rows, 2, (r) => r.spend);
    expect(fl.shown).toBe(2);
    expect(fl.total).toBe(5);
    expect(fl.totalSpend).toBe(150); // sum over ALL rows, not just the 2 shown
    expect(fl.items).toEqual(rows.slice(0, 2));
  });

  it("treats Infinity as 'return everything' (depth=full path)", () => {
    const fl = toFindingList(rows, Infinity, (r) => r.spend);
    expect(fl.shown).toBe(5);
    expect(fl.total).toBe(5);
    expect(fl.items).toBe(rows); // no slice allocation when limit >= length
  });

  it("handles empty lists", () => {
    const fl = toFindingList<Row>([], 10, (r) => r.spend);
    expect(fl).toEqual({ shown: 0, total: 0, totalSpend: 0, items: [] });
  });

  it("treats missing spend accessor values as 0", () => {
    const mixed = [{ spend: 5 }, { spend: undefined as any }, { spend: 15 }];
    const fl = toFindingList(mixed, 10, (r) => r.spend);
    expect(fl.totalSpend).toBe(20);
  });

  it("handles limit larger than population cleanly", () => {
    const fl = toFindingList(rows, 999, (r) => r.spend);
    expect(fl.shown).toBe(5);
    expect(fl.total).toBe(5);
    expect(fl.items).toBe(rows);
  });
});
