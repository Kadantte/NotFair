import { describe, it, expect } from "vitest";

import { toFindingList } from "@/lib/google-ads/audit";

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
    expect(fl.totalSpend).toBe(150);
    expect(fl.items).toEqual(rows.slice(0, 2));
  });

  it("treats Infinity as 'return everything' (depth=full path)", () => {
    const fl = toFindingList(rows, Infinity, (r) => r.spend);
    expect(fl.shown).toBe(5);
    expect(fl.total).toBe(5);
    expect(fl.items).toBe(rows);
  });

  it("handles empty lists", () => {
    const fl = toFindingList<Row>([], 10, (r) => r.spend);
    expect(fl).toEqual({ shown: 0, total: 0, totalSpend: 0, items: [] });
  });

  it("treats missing spend accessor values as 0", () => {
    const mixed = [{ spend: 5 }, { spend: undefined as unknown as number }, { spend: 15 }];
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
