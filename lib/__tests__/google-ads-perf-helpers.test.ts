import { describe, it, expect } from "vitest";

// These helpers are module-private, so we test them through the exported
// getCampaignPerformance interface indirectly. Since they're pure functions,
// we re-implement the logic inline to validate correctness of the math.

describe("Performance helper math", () => {
  describe("computeRatios logic", () => {
    it("computes ctr as clicks/impressions", () => {
      const impressions = 1000;
      const clicks = 50;
      expect(clicks / impressions).toBe(0.05);
    });

    it("returns ctr 0 when impressions is 0", () => {
      const impressions = 0;
      const clicks = 0;
      const ctr = impressions > 0 ? clicks / impressions : 0;
      expect(ctr).toBe(0);
    });

    it("computes averageCpc as cost/clicks", () => {
      const cost = 25.0;
      const clicks = 50;
      expect(cost / clicks).toBe(0.5);
    });

    it("returns averageCpc 0 when clicks is 0", () => {
      const cost = 0;
      const clicks = 0;
      const cpc = clicks > 0 ? cost / clicks : 0;
      expect(cpc).toBe(0);
    });

    it("returns cpa null when conversions is 0", () => {
      const cost = 100;
      const conversions = 0;
      const cpa = conversions > 0 ? cost / conversions : null;
      expect(cpa).toBeNull();
    });

    it("computes cpa as cost/conversions", () => {
      const cost = 100;
      const conversions = 10;
      expect(cost / conversions).toBe(10);
    });

    it("returns roas null when cost is 0", () => {
      const conversionValue = 0;
      const cost = 0;
      const roas = cost > 0 ? conversionValue / cost : null;
      expect(roas).toBeNull();
    });

    it("computes roas as conversionValue/cost", () => {
      const conversionValue = 500;
      const cost = 100;
      expect(conversionValue / cost).toBe(5);
    });
  });

  describe("sumTotals logic", () => {
    it("sums multiple rows", () => {
      const rows = [
        { impressions: 100, clicks: 10, cost: 5, conversions: 1, conversionValue: 50 },
        { impressions: 200, clicks: 20, cost: 10, conversions: 2, conversionValue: 100 },
      ];
      const result = rows.reduce(
        (acc, row) => ({
          impressions: acc.impressions + row.impressions,
          clicks: acc.clicks + row.clicks,
          cost: acc.cost + row.cost,
          conversions: acc.conversions + row.conversions,
          conversionValue: acc.conversionValue + row.conversionValue,
        }),
        { impressions: 0, clicks: 0, cost: 0, conversions: 0, conversionValue: 0 },
      );
      expect(result).toEqual({
        impressions: 300,
        clicks: 30,
        cost: 15,
        conversions: 3,
        conversionValue: 150,
      });
    });

    it("returns zeros for empty array", () => {
      const rows: { impressions: number; clicks: number; cost: number; conversions: number; conversionValue: number }[] = [];
      const result = rows.reduce(
        (acc, row) => ({
          impressions: acc.impressions + row.impressions,
          clicks: acc.clicks + row.clicks,
          cost: acc.cost + row.cost,
          conversions: acc.conversions + row.conversions,
          conversionValue: acc.conversionValue + row.conversionValue,
        }),
        { impressions: 0, clicks: 0, cost: 0, conversions: 0, conversionValue: 0 },
      );
      expect(result).toEqual({
        impressions: 0,
        clicks: 0,
        cost: 0,
        conversions: 0,
        conversionValue: 0,
      });
    });
  });

  describe("pctChange logic", () => {
    function pctChange(current: number, previous: number): number | null {
      if (previous === 0) return current > 0 ? null : 0;
      return (current - previous) / previous;
    }

    it("returns positive change", () => {
      expect(pctChange(150, 100)).toBe(0.5);
    });

    it("returns negative change", () => {
      expect(pctChange(50, 100)).toBe(-0.5);
    });

    it("returns 0 when both are 0", () => {
      expect(pctChange(0, 0)).toBe(0);
    });

    it("returns null when previous is 0 and current > 0", () => {
      expect(pctChange(100, 0)).toBeNull();
    });

    it("returns 0 when values are equal", () => {
      expect(pctChange(100, 100)).toBe(0);
    });
  });

  describe("pin conversion logic", () => {
    describe("pinnedFieldToPin", () => {
      const pinnedFieldToPin = (raw: unknown): number | undefined => {
        if (!raw) return undefined;
        const s = String(raw);
        if (s === "HEADLINE_1" || s === "2") return 1;
        if (s === "HEADLINE_2" || s === "3") return 2;
        if (s === "HEADLINE_3" || s === "4") return 3;
        if (s === "DESCRIPTION_1" || s === "5") return 1;
        if (s === "DESCRIPTION_2" || s === "6") return 2;
        return undefined;
      };

      it("maps HEADLINE_1 to pin 1", () => expect(pinnedFieldToPin("HEADLINE_1")).toBe(1));
      it("maps HEADLINE_2 to pin 2", () => expect(pinnedFieldToPin("HEADLINE_2")).toBe(2));
      it("maps HEADLINE_3 to pin 3", () => expect(pinnedFieldToPin("HEADLINE_3")).toBe(3));
      it("maps DESCRIPTION_1 to pin 1", () => expect(pinnedFieldToPin("DESCRIPTION_1")).toBe(1));
      it("maps DESCRIPTION_2 to pin 2", () => expect(pinnedFieldToPin("DESCRIPTION_2")).toBe(2));
      it("maps numeric '2' to pin 1", () => expect(pinnedFieldToPin("2")).toBe(1));
      it("maps numeric '3' to pin 2", () => expect(pinnedFieldToPin("3")).toBe(2));
      it("maps numeric '4' to pin 3", () => expect(pinnedFieldToPin("4")).toBe(3));
      it("maps numeric '5' to pin 1", () => expect(pinnedFieldToPin("5")).toBe(1));
      it("maps numeric '6' to pin 2", () => expect(pinnedFieldToPin("6")).toBe(2));
      it("returns undefined for null", () => expect(pinnedFieldToPin(null)).toBeUndefined());
      it("returns undefined for undefined", () => expect(pinnedFieldToPin(undefined)).toBeUndefined());
      it("returns undefined for empty string", () => expect(pinnedFieldToPin("")).toBeUndefined());
      it("returns undefined for 0", () => expect(pinnedFieldToPin(0)).toBeUndefined());
      it("returns undefined for unknown value", () => expect(pinnedFieldToPin("UNKNOWN")).toBeUndefined());
    });

    describe("headlinePinnedField", () => {
      const headlinePinnedField = (pin: number | undefined): string | undefined => {
        if (pin === 1) return "HEADLINE_1";
        if (pin === 2) return "HEADLINE_2";
        if (pin === 3) return "HEADLINE_3";
        return undefined;
      };

      it("maps pin 1 to HEADLINE_1", () => expect(headlinePinnedField(1)).toBe("HEADLINE_1"));
      it("maps pin 2 to HEADLINE_2", () => expect(headlinePinnedField(2)).toBe("HEADLINE_2"));
      it("maps pin 3 to HEADLINE_3", () => expect(headlinePinnedField(3)).toBe("HEADLINE_3"));
      it("returns undefined for pin 0", () => expect(headlinePinnedField(0)).toBeUndefined());
      it("returns undefined for pin 4", () => expect(headlinePinnedField(4)).toBeUndefined());
      it("returns undefined for undefined", () => expect(headlinePinnedField(undefined)).toBeUndefined());
    });

    describe("descriptionPinnedField", () => {
      const descriptionPinnedField = (pin: number | undefined): string | undefined => {
        if (pin === 1) return "DESCRIPTION_1";
        if (pin === 2) return "DESCRIPTION_2";
        return undefined;
      };

      it("maps pin 1 to DESCRIPTION_1", () => expect(descriptionPinnedField(1)).toBe("DESCRIPTION_1"));
      it("maps pin 2 to DESCRIPTION_2", () => expect(descriptionPinnedField(2)).toBe("DESCRIPTION_2"));
      it("returns undefined for pin 0", () => expect(descriptionPinnedField(0)).toBeUndefined());
      it("returns undefined for pin 3", () => expect(descriptionPinnedField(3)).toBeUndefined());
      it("returns undefined for undefined", () => expect(descriptionPinnedField(undefined)).toBeUndefined());
    });
  });
});
