import { describe, expect, it } from "vitest";
import {
  FREE_MONTHLY_OP_LIMIT,
  FREE_PERIOD_DAYS,
  currentFreePeriodStart,
  nextFreePeriodStart,
} from "@/lib/free-quota";

const DAY = 86_400_000;
const ANCHOR = new Date("2026-05-08T14:30:00.000Z");

describe("free-quota constants", () => {
  it("cap is 300", () => {
    expect(FREE_MONTHLY_OP_LIMIT).toBe(300);
  });
  it("period is 30 days", () => {
    expect(FREE_PERIOD_DAYS).toBe(30);
  });
});

describe("currentFreePeriodStart", () => {
  it("now == anchor → returns anchor (period 0 begins exactly at trial end)", () => {
    expect(currentFreePeriodStart(ANCHOR, ANCHOR).getTime()).toBe(ANCHOR.getTime());
  });

  it("now < anchor → returns anchor (counter does NOT start before trial ends)", () => {
    const before = new Date(ANCHOR.getTime() - 3 * DAY);
    expect(currentFreePeriodStart(ANCHOR, before).getTime()).toBe(ANCHOR.getTime());
  });

  it("1d after anchor → still period 0 (= anchor)", () => {
    const now = new Date(ANCHOR.getTime() + 1 * DAY);
    expect(currentFreePeriodStart(ANCHOR, now).getTime()).toBe(ANCHOR.getTime());
  });

  it("29d 23h after anchor → still period 0", () => {
    const now = new Date(ANCHOR.getTime() + 30 * DAY - 1);
    expect(currentFreePeriodStart(ANCHOR, now).getTime()).toBe(ANCHOR.getTime());
  });

  it("exactly 30d after anchor → period 1 starts (= anchor + 30d)", () => {
    const now = new Date(ANCHOR.getTime() + 30 * DAY);
    expect(currentFreePeriodStart(ANCHOR, now).getTime()).toBe(ANCHOR.getTime() + 30 * DAY);
  });

  it("31d after anchor → period 1 (rollover happens at 30d, not at month end)", () => {
    const now = new Date(ANCHOR.getTime() + 31 * DAY);
    expect(currentFreePeriodStart(ANCHOR, now).getTime()).toBe(ANCHOR.getTime() + 30 * DAY);
  });

  it("90d after anchor → period 3 starts (= anchor + 90d), not period 2", () => {
    // Floor((90d - 0) / 30d) = 3.
    const now = new Date(ANCHOR.getTime() + 90 * DAY);
    expect(currentFreePeriodStart(ANCHOR, now).getTime()).toBe(ANCHOR.getTime() + 90 * DAY);
  });

  it("91d after anchor → still in period 3", () => {
    const now = new Date(ANCHOR.getTime() + 91 * DAY);
    expect(currentFreePeriodStart(ANCHOR, now).getTime()).toBe(ANCHOR.getTime() + 90 * DAY);
  });

  it("preserves the anchor's hour-of-day across rollovers (no DST drift)", () => {
    // anchor is at 14:30 UTC. period 5 should also start at 14:30 UTC.
    const now = new Date(ANCHOR.getTime() + 150 * DAY + 12 * 3_600_000);
    const start = currentFreePeriodStart(ANCHOR, now);
    expect(start.getUTCHours()).toBe(14);
    expect(start.getUTCMinutes()).toBe(30);
  });
});

describe("nextFreePeriodStart", () => {
  it("returns currentFreePeriodStart + 30d", () => {
    const now = new Date(ANCHOR.getTime() + 1 * DAY);
    const next = nextFreePeriodStart(ANCHOR, now);
    expect(next.getTime()).toBe(ANCHOR.getTime() + 30 * DAY);
  });

  it("at the exact rollover instant, next is +30d again (window is half-open)", () => {
    const now = new Date(ANCHOR.getTime() + 30 * DAY);
    expect(nextFreePeriodStart(ANCHOR, now).getTime()).toBe(ANCHOR.getTime() + 60 * DAY);
  });

  it("works across many periods", () => {
    const now = new Date(ANCHOR.getTime() + 100 * DAY);
    expect(nextFreePeriodStart(ANCHOR, now).getTime()).toBe(ANCHOR.getTime() + 120 * DAY);
  });
});
