import { describe, it, expect } from "vitest";
import { deriveMetrics, STATUS_CONFIG, BOUNCE_RATE_WARN } from "@/lib/outreach-metrics";

describe("deriveMetrics", () => {
  it("returns zeros for empty contacts", () => {
    const m = deriveMetrics([]);
    expect(m.total).toBe(0);
    expect(m.sent).toBe(0);
    expect(m.bounceRate).toBe(0);
    expect(m.replyRate).toBe(0);
    expect(m.domainBreakdown).toEqual([]);
  });

  it("counts statuses correctly", () => {
    const contacts = [
      { email: "a@x.com", status: "new" },
      { email: "b@x.com", status: "new" },
      { email: "c@x.com", status: "contacted" },
      { email: "d@x.com", status: "replied" },
      { email: "e@y.com", status: "bounced" },
    ];
    const m = deriveMetrics(contacts);
    expect(m.total).toBe(5);
    expect(m.byStatus["new"]).toBe(2);
    expect(m.byStatus["contacted"]).toBe(1);
    expect(m.byStatus["replied"]).toBe(1);
    expect(m.byStatus["bounced"]).toBe(1);
  });

  it("computes bounce and reply rates from sent emails only", () => {
    const contacts = [
      { email: "a@x.com", status: "new" },
      { email: "b@x.com", status: "drafted" },
      { email: "c@x.com", status: "contacted" },
      { email: "d@x.com", status: "contacted" },
      { email: "e@x.com", status: "replied" },
      { email: "f@x.com", status: "bounced" },
    ];
    const m = deriveMetrics(contacts);
    // sent = 2 contacted + 1 replied + 1 bounced = 4
    expect(m.sent).toBe(4);
    expect(m.bounceRate).toBeCloseTo(1 / 4);
    expect(m.replyRate).toBeCloseTo(1 / 4);
  });

  it("handles zero sent emails without division by zero", () => {
    const contacts = [
      { email: "a@x.com", status: "new" },
      { email: "b@x.com", status: "drafted" },
    ];
    const m = deriveMetrics(contacts);
    expect(m.sent).toBe(0);
    expect(m.bounceRate).toBe(0);
    expect(m.replyRate).toBe(0);
  });

  it("builds domain breakdown sorted by total desc", () => {
    const contacts = [
      { email: "a@big.com", status: "contacted" },
      { email: "b@big.com", status: "contacted" },
      { email: "c@big.com", status: "bounced" },
      { email: "d@small.com", status: "contacted" },
      { email: "e@new.com", status: "new" }, // excluded — not sent
    ];
    const m = deriveMetrics(contacts);
    expect(m.domainBreakdown).toHaveLength(2);
    expect(m.domainBreakdown[0].domain).toBe("big.com");
    expect(m.domainBreakdown[0].total).toBe(3);
    expect(m.domainBreakdown[0].bounced).toBe(1);
    expect(m.domainBreakdown[0].bounceRate).toBeCloseTo(1 / 3);
    expect(m.domainBreakdown[1].domain).toBe("small.com");
    expect(m.domainBreakdown[1].bounced).toBe(0);
    expect(m.domainBreakdown[1].bounceRate).toBe(0);
  });

  it("caps domain breakdown at 20 entries", () => {
    const contacts = Array.from({ length: 25 }, (_, i) => ({
      email: `user@domain${i}.com`,
      status: "contacted",
    }));
    const m = deriveMetrics(contacts);
    expect(m.domainBreakdown.length).toBe(20);
  });

  it("handles malformed email without @", () => {
    const contacts = [{ email: "no-at-sign", status: "contacted" }];
    const m = deriveMetrics(contacts);
    expect(m.domainBreakdown).toHaveLength(1);
    expect(m.domainBreakdown[0].domain).toBe("");
  });
});

describe("STATUS_CONFIG", () => {
  it("has entries for all contact statuses", () => {
    const keys = STATUS_CONFIG.map((s) => s.key);
    expect(keys).toContain("new");
    expect(keys).toContain("drafted");
    expect(keys).toContain("scheduled");
    expect(keys).toContain("contacted");
    expect(keys).toContain("replied");
    expect(keys).toContain("bounced");
  });
});

describe("BOUNCE_RATE_WARN", () => {
  it("is 5%", () => {
    expect(BOUNCE_RATE_WARN).toBe(0.05);
  });
});
