import { describe, expect, it } from "vitest";
import { formatMoney } from "@/lib/currency";

describe("formatMoney", () => {
  describe("valid currency code", () => {
    it("formats USD with 2 decimals by default", () => {
      // en-US locale gives "$1,234.56" but the test runs in whatever locale node
      // picks; we assert structure rather than exact whitespace.
      const out = formatMoney(1234.56, "USD");
      expect(out).toMatch(/[$ ]/);
      expect(out).toContain("1,234.56");
    });

    it("formats EUR with the euro symbol", () => {
      const out = formatMoney(1234.56, "EUR");
      expect(out).toContain("€");
    });

    it("uses the currency's natural digits when fractionDigits not specified", () => {
      // JPY has 0 minor units; default behavior must respect that.
      const jpy = formatMoney(1234, "JPY");
      expect(jpy).toContain("1,234");
      expect(jpy).not.toContain(".");
      // USD defaults to 2.
      const usd = formatMoney(1234, "USD");
      expect(usd).toContain("1,234.00");
    });

    it("respects fractionDigits=0", () => {
      const out = formatMoney(1234.56, "USD", { fractionDigits: 0 });
      expect(out).toContain("1,235");
      expect(out).not.toContain(".");
    });

    it("compact mode emits compact notation with the currency symbol", () => {
      const out = formatMoney(1_234_567, "USD", { compact: true });
      // Intl compact for USD is typically "$1.2M".
      expect(out).toMatch(/\$[\d.]+M/);
    });

    it("uppercases lowercase codes", () => {
      const lower = formatMoney(10, "usd");
      const upper = formatMoney(10, "USD");
      expect(lower).toBe(upper);
    });
  });

  describe("invalid or missing code (fallback)", () => {
    it("falls back to $-prefix when code is null", () => {
      expect(formatMoney(1234.5, null)).toBe("$1,234.50");
    });

    it("falls back when code is undefined", () => {
      expect(formatMoney(1234.5, undefined)).toBe("$1,234.50");
    });

    it("falls back when code is empty string", () => {
      expect(formatMoney(1234.5, "")).toBe("$1,234.50");
    });

    it("falls back when Intl rejects a malformed code (RangeError)", () => {
      // Well-formed-but-unassigned codes (like "FOO") are accepted by Intl,
      // so the fallback only fires for truly malformed input — e.g. wrong length.
      expect(formatMoney(99.9, "AB")).toBe("$99.90");
    });

    it("accepts well-formed-but-unassigned codes via Intl (no fallback)", () => {
      // Documents reality: Intl doesn't validate against the ISO registry, so
      // "FOO" reaches the Intl path and renders with a generic prefix.
      const out = formatMoney(99.9, "FOO");
      expect(out).toContain("99.90");
      expect(out).not.toBe("$99.90");
    });

    it("respects fractionDigits in fallback", () => {
      expect(formatMoney(1234.567, null, { fractionDigits: 0 })).toBe("$1,235");
      expect(formatMoney(1234.567, null, { fractionDigits: 3 })).toBe("$1,234.567");
    });

    it("formats negative amounts as -$N (sign before symbol), not $-N", () => {
      expect(formatMoney(-50, null)).toBe("-$50.00");
      expect(formatMoney(-1234.5, null)).toBe("-$1,234.50");
    });

    it("formats zero as $0.00", () => {
      expect(formatMoney(0, null)).toBe("$0.00");
    });

    describe("compact fallback", () => {
      it("uses M suffix for >= 1M", () => {
        expect(formatMoney(1_500_000, null, { compact: true })).toBe("$1.5M");
      });

      it("uses k suffix for >= 1k", () => {
        expect(formatMoney(1500, null, { compact: true })).toBe("$1.5k");
      });

      it("rounds to whole number for < 1k", () => {
        expect(formatMoney(42.7, null, { compact: true })).toBe("$43");
      });

      it("formats negative compact values with -$ prefix", () => {
        expect(formatMoney(-1500, null, { compact: true })).toBe("-$1.5k");
        expect(formatMoney(-2_500_000, null, { compact: true })).toBe("-$2.5M");
      });
    });
  });
});
