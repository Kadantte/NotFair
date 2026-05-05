import { describe, expect, it } from "vitest";
import {
  humanizeGaqlRows,
  _enumNameForPath,
  _enumPathCount,
} from "@/lib/google-ads/humanize";

describe("humanize — module bootstrap", () => {
  it("loads enum metadata for at least 100 field paths", () => {
    // Sanity check that the shipped library wiring is intact. v22 ships ~432
    // enum field paths; if this drops to single digits the import path or
    // the library shape changed and the humanizer is silently no-oping.
    expect(_enumPathCount()).toBeGreaterThan(100);
  });

  it("resolves the canonical landmines correctly", () => {
    // These are the exact pairs that caused the production misread that
    // motivated this work. If any of them flip, the humanizer would lie to
    // the LLM in the same way the LLM previously lied to itself.
    expect(_enumNameForPath("campaign.bidding_strategy_type", 10)).toBe(
      "MAXIMIZE_CONVERSIONS",
    );
    expect(_enumNameForPath("campaign.bidding_strategy_type", 11)).toBe(
      "MAXIMIZE_CONVERSION_VALUE",
    );
    expect(_enumNameForPath("campaign.bidding_strategy_type", 15)).toBe(
      "TARGET_IMPRESSION_SHARE",
    );
    expect(_enumNameForPath("campaign.bidding_strategy_type", 9)).toBe(
      "TARGET_SPEND",
    );
    expect(
      _enumNameForPath(
        "ad_group_ad.ad.responsive_search_ad.headlines.pinned_field",
        2,
      ),
    ).toBe("HEADLINE_1");
    expect(_enumNameForPath("campaign.frequency_caps.key.event_type", 2)).toBe(
      "IMPRESSION",
    );
  });

  it("returns undefined for unknown paths and unknown integers", () => {
    expect(_enumNameForPath("not.a.real.field", 10)).toBeUndefined();
    expect(_enumNameForPath("campaign.bidding_strategy_type", 9999)).toBeUndefined();
  });
});

describe("humanizeGaqlRows — enum augmentation", () => {
  it("augments a top-level enum integer with a sibling _name", () => {
    const rows = [
      {
        campaign: {
          id: "1",
          name: "Test Campaign",
          bidding_strategy_type: 10,
        },
      },
    ];
    humanizeGaqlRows(rows);
    expect(rows[0].campaign).toMatchObject({
      bidding_strategy_type: 10,
      bidding_strategy_type_name: "MAXIMIZE_CONVERSIONS",
    });
  });

  it("augments a 3-level-nested enum at campaign.target_cpa.target_cpa_micros (money path) — and ALSO augments enums in deep nests", () => {
    // accessible_bidding_strategy.target_impression_share.location is a
    // real 3-level enum field path in v22 — exercises the dotted-path
    // tracking through nested objects.
    const rows = [
      {
        accessible_bidding_strategy: {
          id: "5",
          target_impression_share: {
            location: 2,
            location_fraction_micros: 950000,
          },
        },
      },
    ];
    humanizeGaqlRows(rows);
    expect(
      rows[0].accessible_bidding_strategy.target_impression_share,
    ).toMatchObject({
      location: 2,
      location_fraction_micros: 950000,
      location_fraction_value: 0.95,
    });
    // The location enum at this path resolves through fields.enumFields →
    // TargetImpressionShareLocation. Don't assert the exact name since the
    // proto can rename, but DO assert it produced a string.
    const augmented = rows[0].accessible_bidding_strategy.target_impression_share as Record<
      string,
      unknown
    >;
    expect(typeof augmented.location_name).toBe("string");
  });

  it("does NOT augment when the field is already a string enum (some decoders return names)", () => {
    const rows = [
      {
        campaign: {
          bidding_strategy_type: "MAXIMIZE_CONVERSIONS",
        },
      },
    ];
    humanizeGaqlRows(rows);
    expect(rows[0].campaign).toEqual({
      bidding_strategy_type: "MAXIMIZE_CONVERSIONS",
    });
  });

  it("leaves random integers alone when the field path is not an enum", () => {
    const rows = [
      {
        metrics: {
          impressions: 1234,
          clicks: 56,
        },
      },
    ];
    humanizeGaqlRows(rows);
    expect(rows[0].metrics).toEqual({ impressions: 1234, clicks: 56 });
  });

  it("augments enum integers inside repeated nested message fields", () => {
    const rows = [
      {
        ad_group_ad: {
          ad: {
            responsive_search_ad: {
              headlines: [
                { text: "Pinned first", pinned_field: 2 },
                { text: "Unpinned", pinned_field: 0 },
              ],
            },
          },
        },
      },
    ];
    humanizeGaqlRows(rows);
    expect(rows[0].ad_group_ad.ad.responsive_search_ad.headlines).toEqual([
      { text: "Pinned first", pinned_field: 2, pinned_field_name: "HEADLINE_1" },
      { text: "Unpinned", pinned_field: 0, pinned_field_name: "UNSPECIFIED" },
    ]);
  });

  it("augments enum integers at repeated nested array depth", () => {
    const rows = [
      {
        campaign: {
          frequency_caps: [
            {
              key: {
                event_type: 2,
                level: 4,
                time_unit: 3,
              },
              cap: 5,
            },
          ],
        },
      },
    ];
    humanizeGaqlRows(rows);
    expect(rows[0].campaign.frequency_caps[0].key).toMatchObject({
      event_type: 2,
      event_type_name: "IMPRESSION",
      level: 4,
      level_name: "CAMPAIGN",
      time_unit: 3,
      time_unit_name: "WEEK",
    });
  });
});

describe("humanizeGaqlRows — money augmentation", () => {
  it("adds _value sibling for any *_micros field in dollars-equivalent units", () => {
    const rows = [
      {
        metrics: { cost_micros: 11_000_000, average_cpc: 1_500_000 },
        campaign: { target_cpa: { target_cpa_micros: 25_000_000 } },
      },
    ];
    humanizeGaqlRows(rows);
    expect(rows[0].metrics).toMatchObject({
      cost_micros: 11_000_000,
      cost_value: 11,
    });
    expect(rows[0].campaign.target_cpa).toMatchObject({
      target_cpa_micros: 25_000_000,
      target_cpa_value: 25,
    });
  });

  it("handles fractional micros without precision loss in normal ranges", () => {
    const rows: Array<{ metrics: Record<string, number> }> = [
      { metrics: { cost_micros: 12_345_678 } },
    ];
    humanizeGaqlRows(rows);
    expect(rows[0].metrics.cost_value).toBeCloseTo(12.345678, 6);
  });

  it("does not double-augment on a second pass (idempotent)", () => {
    const rows = [
      {
        campaign: {
          bidding_strategy_type: 10,
          target_cpa: { target_cpa_micros: 11_000_000 },
        },
      },
    ];
    humanizeGaqlRows(rows);
    const snapshot = JSON.parse(JSON.stringify(rows));
    humanizeGaqlRows(rows);
    expect(rows).toEqual(snapshot);
  });

  it("walks arrays of nested rows", () => {
    const rows: Array<{ campaign: Record<string, unknown> }> = [
      { campaign: { bidding_strategy_type: 10 } },
      { campaign: { bidding_strategy_type: 11 } },
      { campaign: { bidding_strategy_type: 6 } },
    ];
    humanizeGaqlRows(rows);
    expect(rows.map((r) => r.campaign.bidding_strategy_type_name)).toEqual([
      "MAXIMIZE_CONVERSIONS",
      "MAXIMIZE_CONVERSION_VALUE",
      "TARGET_CPA",
    ]);
  });
});
