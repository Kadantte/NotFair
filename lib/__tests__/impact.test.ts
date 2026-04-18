import { describe, it, expect } from "vitest";

import {
  averageSnapshots,
  classifyDirection,
  computeChangeImpactReview,
  computeSnapshotImpact,
  IMPACT_WINDOW_DAYS,
  MIN_AFTER_DAYS_FOR_DIRECTION,
  NEUTRAL_THRESHOLD,
  type ChangeRow,
  type SnapshotRow,
  type SnapshotImpact,
} from "@/lib/db/impact";

// ─── Fixtures ───────────────────────────────────────────────────────

const NOW = new Date("2026-04-17T12:00:00Z");

function snap(
  campaignId: string,
  date: string,
  cost: number,
  conversions: number,
): SnapshotRow {
  return {
    campaignId,
    snapshotDate: date,
    costMicros: Math.round(cost * 1_000_000),
    conversions,
  };
}

function change(
  overrides: Partial<ChangeRow> & { id: number; timestamp: Date },
): ChangeRow {
  const base: ChangeRow = {
    id: overrides.id,
    action: "pause_keyword",
    entityType: "keyword",
    entityId: "kw1",
    label: "some keyword",
    campaignId: "campA",
    reasoning: null,
    rolledBack: false,
    timestamp: overrides.timestamp,
  };
  return { ...base, ...overrides };
}

/** Generate a series of daily snapshots with constant cost/conversions. */
function series(
  campaignId: string,
  startDate: string,
  days: number,
  cost: number,
  conversions: number,
): SnapshotRow[] {
  const out: SnapshotRow[] = [];
  const d = new Date(startDate + "T00:00:00Z");
  for (let i = 0; i < days; i++) {
    out.push(snap(campaignId, d.toISOString().slice(0, 10), cost, conversions));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

// ─── averageSnapshots ───────────────────────────────────────────────

describe("averageSnapshots", () => {
  it("returns zeros for empty input", () => {
    expect(averageSnapshots([])).toEqual({
      dailyCost: 0,
      dailyConversions: 0,
      cpa: null,
      days: 0,
    });
  });

  it("averages cost and conversions across snapshots", () => {
    const r = averageSnapshots([
      snap("c", "2026-04-10", 100, 2),
      snap("c", "2026-04-11", 150, 3),
    ]);
    expect(r.dailyCost).toBe(125);
    expect(r.dailyConversions).toBe(2.5);
    expect(r.cpa).toBe(250 / 5); // total cost / total conversions
    expect(r.days).toBe(2);
  });

  it("returns null CPA when no conversions happened", () => {
    const r = averageSnapshots([
      snap("c", "2026-04-10", 100, 0),
      snap("c", "2026-04-11", 50, 0),
    ]);
    expect(r.cpa).toBeNull();
  });

  it("treats null costMicros/conversions as 0", () => {
    const r = averageSnapshots([
      { campaignId: "c", snapshotDate: "2026-04-10", costMicros: null, conversions: null },
      snap("c", "2026-04-11", 100, 2),
    ]);
    expect(r.dailyCost).toBe(50); // 0 + 100, /2
    expect(r.dailyConversions).toBe(1);
  });
});

// ─── classifyDirection ──────────────────────────────────────────────

describe("classifyDirection", () => {
  function impact(overrides: Partial<SnapshotImpact>): SnapshotImpact {
    return {
      before: { dailyCost: 100, dailyConversions: 2, cpa: 50, days: 7 },
      after: { dailyCost: 100, dailyConversions: 2, cpa: 50, days: 7 },
      costDelta: 0,
      conversionsDelta: 0,
      cpaDelta: 0,
      ...overrides,
    };
  }

  it("calls CPA drop larger than threshold 'improved'", () => {
    // before CPA 50, after 40 → -20% → improved
    expect(
      classifyDirection(
        impact({
          before: { dailyCost: 100, dailyConversions: 2, cpa: 50, days: 7 },
          after: { dailyCost: 80, dailyConversions: 2, cpa: 40, days: 7 },
          cpaDelta: -10,
          costDelta: -20,
          conversionsDelta: 0,
        }),
      ),
    ).toBe("improved");
  });

  it("calls CPA rise larger than threshold 'worsened'", () => {
    expect(
      classifyDirection(
        impact({
          before: { dailyCost: 100, dailyConversions: 2, cpa: 50, days: 7 },
          after: { dailyCost: 120, dailyConversions: 2, cpa: 60, days: 7 },
          cpaDelta: 10,
        }),
      ),
    ).toBe("worsened");
  });

  it("calls small CPA movement 'neutral'", () => {
    // 1% CPA drop → under 5% threshold → neutral
    expect(
      classifyDirection(
        impact({
          before: { dailyCost: 100, dailyConversions: 2, cpa: 50, days: 7 },
          after: { dailyCost: 99, dailyConversions: 2, cpa: 49.5, days: 7 },
          cpaDelta: -0.5,
        }),
      ),
    ).toBe("neutral");
  });

  it("falls back to cost/conversions when CPA is null both sides", () => {
    // No conversions either window. Cost dropped 50%, conversions unchanged (0).
    // conv is 0 change (neutral on conv), cost dropped significantly.
    // conv > 0 check fails (0 not >0), so falls to "unknown" — conflicting/unclear.
    // But cost down alone with no conv change → shouldn't call improved.
    const d = classifyDirection(
      impact({
        before: { dailyCost: 100, dailyConversions: 0, cpa: null, days: 7 },
        after: { dailyCost: 50, dailyConversions: 0, cpa: null, days: 7 },
        cpaDelta: null,
        costDelta: -50,
        conversionsDelta: 0,
      }),
    );
    // Cost 50% drop but conv 0 → could arguably be improved (spent less, same output),
    // but with no conversions either side, we honestly can't call it a win. Expect unknown.
    expect(d).toBe("unknown");
  });

  it("calls conversions-up-cost-down 'improved' when CPA unavailable", () => {
    expect(
      classifyDirection(
        impact({
          before: { dailyCost: 100, dailyConversions: 0, cpa: null, days: 7 },
          after: { dailyCost: 80, dailyConversions: 2, cpa: 40, days: 7 },
          cpaDelta: null, // before CPA was null so delta can't compute
          costDelta: -20,
          conversionsDelta: 2,
        }),
      ),
    ).toBe("improved");
  });

  it("calls conversions-up-cost-up 'unknown' (conflicting)", () => {
    expect(
      classifyDirection(
        impact({
          before: { dailyCost: 100, dailyConversions: 0, cpa: null, days: 7 },
          after: { dailyCost: 150, dailyConversions: 2, cpa: 75, days: 7 },
          cpaDelta: null,
          costDelta: 50,
          conversionsDelta: 2,
        }),
      ),
    ).toBe("unknown");
  });

  it("calls tiny movements neutral even when CPA is null", () => {
    expect(
      classifyDirection(
        impact({
          before: { dailyCost: 100, dailyConversions: 0, cpa: null, days: 7 },
          after: { dailyCost: 101, dailyConversions: 0, cpa: null, days: 7 },
          cpaDelta: null,
          costDelta: 1, // 1% — under threshold
          conversionsDelta: 0,
        }),
      ),
    ).toBe("neutral");
  });
});

// ─── computeSnapshotImpact ──────────────────────────────────────────

describe("computeSnapshotImpact", () => {
  it("computes deltas and handles null CPA", () => {
    const impact = computeSnapshotImpact(
      series("c", "2026-04-01", 7, 100, 0),
      series("c", "2026-04-08", 7, 80, 2),
    );
    expect(impact.before.cpa).toBeNull();
    expect(impact.after.cpa).toBe(40); // 80/2
    expect(impact.cpaDelta).toBeNull(); // can't compute when before is null
    expect(impact.costDelta).toBe(-20);
    expect(impact.conversionsDelta).toBe(2);
  });
});

// ─── computeChangeImpactReview ──────────────────────────────────────

describe("computeChangeImpactReview", () => {
  it("returns an empty-shaped result when there are no changes", () => {
    const r = computeChangeImpactReview([], new Map(), NOW, 7);
    expect(r.counts.total).toBe(0);
    expect(r.counts.fetched).toBe(0);
    expect(r.counts.truncated).toBe(false);
    expect(r.counts.matured).toBe(0);
    expect(r.items).toEqual([]);
    expect(r.byAction).toEqual([]);
    expect(r.aggregate.netCostDelta).toBe(0);
    expect(r.aggregate.uniqueCampaignsAffected).toBe(0);
    expect(r.notes.length).toBeGreaterThan(0);
  });

  it("flags truncation when totalPopulation exceeds fetched slice", () => {
    const changeDate = new Date(NOW);
    changeDate.setUTCDate(changeDate.getUTCDate() - 7);
    const r = computeChangeImpactReview(
      [change({ id: 1, timestamp: changeDate })],
      new Map(),
      NOW,
      7,
      120, // actual population far exceeds the fetched 1
    );
    expect(r.counts.total).toBe(120);
    expect(r.counts.fetched).toBe(1);
    expect(r.counts.truncated).toBe(true);
    expect(r.counts.truncationReason).toBe("limit_reached");
    expect(r.counts.continuationHint).toMatch(/Fetched 1 of 120/);
  });

  it("reports truncated=false with null reason/hint when totalPopulation matches fetched", () => {
    const r = computeChangeImpactReview([], new Map(), NOW, 7, 0);
    expect(r.counts.truncated).toBe(false);
    expect(r.counts.truncationReason).toBeNull();
    expect(r.counts.continuationHint).toBeNull();
  });

  it("marks changes too new when fewer than MIN_AFTER_DAYS snapshots exist", () => {
    // Change 1 day ago — only one possible after-snapshot would exist at best
    const changeDate = new Date(NOW);
    changeDate.setUTCDate(changeDate.getUTCDate() - 1);

    const snaps = new Map<string, SnapshotRow[]>([
      ["campA", series("campA", "2026-04-09", 7, 100, 2)], // before-side only
    ]);
    expect(MIN_AFTER_DAYS_FOR_DIRECTION).toBeGreaterThanOrEqual(2);

    const r = computeChangeImpactReview(
      [change({ id: 1, timestamp: changeDate })],
      snaps,
      NOW,
      7,
    );
    expect(r.counts.tooNew).toBe(1);
    expect(r.counts.matured).toBe(0);
    expect(r.items[0].impact).toBeNull();
    expect(r.items[0].impactReason).toMatch(/need \d+\+ to attribute/);
  });

  it("matures at exactly MIN_AFTER_DAYS_FOR_DIRECTION after-days (boundary)", () => {
    // Change 4 days ago: after window = [changeDate+1, changeDate+8).
    // Seed 3 after-snapshots at changeDate+1..+3 → exactly MIN=3 → matured.
    const changeDate = new Date(NOW);
    changeDate.setUTCDate(changeDate.getUTCDate() - 4);
    const beforeStart = new Date(changeDate);
    beforeStart.setUTCDate(beforeStart.getUTCDate() - 7);
    const afterStart = new Date(changeDate);
    afterStart.setUTCDate(afterStart.getUTCDate() + 1);
    const snaps = new Map<string, SnapshotRow[]>([
      [
        "campA",
        [
          ...series("campA", beforeStart.toISOString().slice(0, 10), 7, 100, 2),
          ...series("campA", afterStart.toISOString().slice(0, 10), 3, 80, 2),
        ],
      ],
    ]);
    const r = computeChangeImpactReview(
      [change({ id: 1, timestamp: changeDate })],
      snaps,
      NOW,
      14,
    );
    expect(r.counts.matured).toBe(1);
    expect(r.counts.tooNew).toBe(0);
  });

  it("stays tooNew at MIN_AFTER_DAYS_FOR_DIRECTION - 1 after-days (boundary)", () => {
    const changeDate = new Date(NOW);
    changeDate.setUTCDate(changeDate.getUTCDate() - 2);
    const beforeStart = new Date(changeDate);
    beforeStart.setUTCDate(beforeStart.getUTCDate() - 7);
    const snaps = new Map<string, SnapshotRow[]>([
      [
        "campA",
        [
          ...series("campA", beforeStart.toISOString().slice(0, 10), 7, 100, 2),
          ...series("campA", changeDate.toISOString().slice(0, 10), 2, 80, 2),
        ],
      ],
    ]);
    const r = computeChangeImpactReview(
      [change({ id: 1, timestamp: changeDate })],
      snaps,
      NOW,
      14,
    );
    expect(r.counts.tooNew).toBe(1);
    expect(r.counts.matured).toBe(0);
  });

  it("flags newly-tracked campaigns (after-only snapshots) with distinct reason", () => {
    const changeDate = new Date(NOW);
    changeDate.setUTCDate(changeDate.getUTCDate() - 5);
    const snaps = new Map<string, SnapshotRow[]>([
      ["campA", series("campA", changeDate.toISOString().slice(0, 10), 5, 80, 2)],
    ]);
    const r = computeChangeImpactReview(
      [change({ id: 1, timestamp: changeDate })],
      snaps,
      NOW,
      14,
    );
    expect(r.counts.noData).toBe(1);
    expect(r.items[0].impactReason).toMatch(/newly tracked/i);
  });

  it("attributes matured changes with full before/after windows", () => {
    // Change 7 days ago — 7 days of before data, 7 days of after data available.
    const changeDate = new Date(NOW);
    changeDate.setUTCDate(changeDate.getUTCDate() - 7);

    // Before: 7 days of 100/day cost, 0 conv. After: 7 days of 80/day cost, 2 conv.
    const beforeStart = new Date(changeDate);
    beforeStart.setUTCDate(beforeStart.getUTCDate() - 7);

    const snaps = new Map<string, SnapshotRow[]>([
      [
        "campA",
        [
          ...series("campA", beforeStart.toISOString().slice(0, 10), 7, 100, 0),
          ...series("campA", changeDate.toISOString().slice(0, 10), 7, 80, 2),
        ],
      ],
    ]);

    const r = computeChangeImpactReview(
      [change({ id: 1, timestamp: changeDate })],
      snaps,
      NOW,
      14,
    );
    expect(r.counts.matured).toBe(1);
    expect(r.counts.tooNew).toBe(0);
    const impact = r.items[0].impact!;
    expect(impact).not.toBeNull();
    expect(impact.costDelta).toBe(-20);
    expect(impact.conversionsDelta).toBe(2);
    expect(impact.direction).toBe("improved");
  });

  it("excludes rolled-back changes from attribution but counts them", () => {
    const changeDate = new Date(NOW);
    changeDate.setUTCDate(changeDate.getUTCDate() - 7);
    const r = computeChangeImpactReview(
      [change({ id: 1, timestamp: changeDate, rolledBack: true })],
      new Map(),
      NOW,
      14,
    );
    expect(r.counts.rolledBack).toBe(1);
    expect(r.counts.matured).toBe(0);
    expect(r.items[0].impact).toBeNull();
    expect(r.items[0].impactReason).toMatch(/rolled back/i);
  });

  it("marks changes with no campaign correctly", () => {
    const changeDate = new Date(NOW);
    changeDate.setUTCDate(changeDate.getUTCDate() - 7);
    const r = computeChangeImpactReview(
      [change({ id: 1, timestamp: changeDate, campaignId: null })],
      new Map(),
      NOW,
      14,
    );
    expect(r.counts.noCampaign).toBe(1);
    expect(r.items[0].impactReason).toMatch(/no campaign/i);
  });

  it("marks changes with no snapshot data as noData", () => {
    const changeDate = new Date(NOW);
    changeDate.setUTCDate(changeDate.getUTCDate() - 7);
    const r = computeChangeImpactReview(
      [change({ id: 1, timestamp: changeDate, campaignId: "ghost" })],
      new Map(),
      NOW,
      14,
    );
    expect(r.counts.noData).toBe(1);
  });

  it("groups by action with per-change counts and unique-campaign count", () => {
    // 3 pause_keyword, all same campaign, all matured improved.
    // 1 update_bid, different campaign, matured worsened.
    const mkMature = (campaignId: string, direction: "good" | "bad") => {
      const changeDate = new Date(NOW);
      changeDate.setUTCDate(changeDate.getUTCDate() - 7);
      const beforeStart = new Date(changeDate);
      beforeStart.setUTCDate(beforeStart.getUTCDate() - 7);
      const before = series(campaignId, beforeStart.toISOString().slice(0, 10), 7, 100, 2);
      const after = direction === "good"
        ? series(campaignId, changeDate.toISOString().slice(0, 10), 7, 60, 2) // CPA drops
        : series(campaignId, changeDate.toISOString().slice(0, 10), 7, 150, 2); // CPA rises
      return { changeDate, snaps: [...before, ...after] };
    };

    const a = mkMature("campA", "good");
    const b = mkMature("campB", "bad");
    const snaps = new Map<string, SnapshotRow[]>([
      ["campA", a.snaps],
      ["campB", b.snaps],
    ]);

    const r = computeChangeImpactReview(
      [
        change({ id: 1, timestamp: a.changeDate, action: "pause_keyword", campaignId: "campA" }),
        change({ id: 2, timestamp: a.changeDate, action: "pause_keyword", campaignId: "campA" }),
        change({ id: 3, timestamp: a.changeDate, action: "pause_keyword", campaignId: "campA" }),
        change({ id: 4, timestamp: b.changeDate, action: "update_bid", campaignId: "campB" }),
      ],
      snaps,
      NOW,
      14,
    );

    const pause = r.byAction.find((a) => a.action === "pause_keyword")!;
    expect(pause.count).toBe(3);
    expect(pause.matured).toBe(3);
    expect(pause.improved).toBe(3);
    expect(pause.uniqueCampaignsAffected).toBe(1);

    const bid = r.byAction.find((a) => a.action === "update_bid")!;
    expect(bid.count).toBe(1);
    expect(bid.worsened).toBe(1);
    expect(bid.uniqueCampaignsAffected).toBe(1);

    // Sorted by count desc
    expect(r.byAction[0].action).toBe("pause_keyword");
  });

  it("dedupes aggregate sums by campaign — 5 writes to same campaign count once", () => {
    // Same campaign, 5 changes all on same day, campaign saves $20/day.
    // Aggregate should show -$20, not -$100.
    const changeDate = new Date(NOW);
    changeDate.setUTCDate(changeDate.getUTCDate() - 7);
    const beforeStart = new Date(changeDate);
    beforeStart.setUTCDate(beforeStart.getUTCDate() - 7);

    const snaps = new Map<string, SnapshotRow[]>([
      [
        "campA",
        [
          ...series("campA", beforeStart.toISOString().slice(0, 10), 7, 100, 2),
          ...series("campA", changeDate.toISOString().slice(0, 10), 7, 80, 2),
        ],
      ],
    ]);

    const changes = [1, 2, 3, 4, 5].map((id) =>
      change({ id, timestamp: changeDate, campaignId: "campA", entityId: `kw${id}` }),
    );

    const r = computeChangeImpactReview(changes, snaps, NOW, 14);
    expect(r.counts.matured).toBe(5);
    expect(r.aggregate.uniqueCampaignsAffected).toBe(1);
    expect(r.aggregate.netCostDelta).toBe(-20); // once, not 5×-20
  });

  it("picks the most recent change as representative when one campaign has multiple", () => {
    // campA: pause on day -10 (saved $30), update_bid on day -5 (only saved $10 after).
    // Most recent matured change should drive the aggregate.
    const older = new Date(NOW);
    older.setUTCDate(older.getUTCDate() - 10);
    const newer = new Date(NOW);
    newer.setUTCDate(newer.getUTCDate() - 5);

    const olderBeforeStart = new Date(older);
    olderBeforeStart.setUTCDate(olderBeforeStart.getUTCDate() - 7);
    const newerBeforeStart = new Date(newer);
    newerBeforeStart.setUTCDate(newerBeforeStart.getUTCDate() - 7);

    // Build a snapshot history:
    // day -17..-10: before for older = 100/day, 2 conv
    // day -10..-5:  (6 days, counts as before for newer, after for older) = 70/day, 2 conv
    // day -5..now:  after for newer = 60/day, 2 conv
    const snaps: SnapshotRow[] = [];
    const seg = (startDate: Date, days: number, cost: number, conv: number) => {
      return series(
        "campA",
        startDate.toISOString().slice(0, 10),
        days,
        cost,
        conv,
      );
    };
    snaps.push(...seg(olderBeforeStart, 7, 100, 2));
    snaps.push(...seg(older, 5, 70, 2));
    snaps.push(...seg(newer, 5, 60, 2));

    const changes = [
      change({ id: 10, timestamp: older, action: "pause_keyword", campaignId: "campA" }),
      change({ id: 20, timestamp: newer, action: "update_bid", campaignId: "campA" }),
    ];

    const r = computeChangeImpactReview(
      changes,
      new Map([["campA", snaps]]),
      NOW,
      30,
    );
    expect(r.counts.matured).toBe(2);
    expect(r.aggregate.uniqueCampaignsAffected).toBe(1);

    // Representative = newer change. before = day -12..-5 avg, after = day -5..now avg.
    const newerItem = r.items.find((c) => c.id === 20)!;
    expect(newerItem.impact).not.toBeNull();
    expect(r.aggregate.netCostDelta).toBeCloseTo(newerItem.impact!.costDelta, 5);
  });

  it("truncates long reasoning in the response", () => {
    const changeDate = new Date(NOW);
    changeDate.setUTCDate(changeDate.getUTCDate() - 7);
    const reasoning = "x".repeat(500);
    const r = computeChangeImpactReview(
      [change({ id: 1, timestamp: changeDate, reasoning })],
      new Map(),
      NOW,
      14,
    );
    expect(r.items[0].reasoning!.length).toBeLessThan(reasoning.length);
    expect(r.items[0].reasoning!.endsWith("…")).toBe(true);
  });

  it("computes daysAgo from now, not from change timestamp alone", () => {
    const changeDate = new Date(NOW);
    changeDate.setUTCDate(changeDate.getUTCDate() - 3);
    const r = computeChangeImpactReview(
      [change({ id: 1, timestamp: changeDate })],
      new Map(),
      NOW,
      14,
    );
    expect(r.items[0].daysAgo).toBe(3);
  });

  it("emits window fields matching the injected now + days", () => {
    const r = computeChangeImpactReview([], new Map(), NOW, 14);
    expect(r.window.days).toBe(14);
    expect(r.window.endDate).toBe("2026-04-17");
    expect(r.window.startDate).toBe("2026-04-03");
    expect(r.window.generatedAt).toBe(NOW.toISOString());
  });

  it("uses IMPACT_WINDOW_DAYS of 7", () => {
    expect(IMPACT_WINDOW_DAYS).toBe(7);
  });

  it("uses NEUTRAL_THRESHOLD of 5%", () => {
    expect(NEUTRAL_THRESHOLD).toBe(0.05);
  });

  it("counts otherChangesInWindow for BOTH earlier and later writes on the same campaign", () => {
    // 3 changes on same campaign, all within 7 days of each other.
    // The 14-day envelope (7 before + 7 after) means every pair that's
    // within 7 days of each other shows up as a mutual confounder.
    const day = (offset: number) => {
      const d = new Date(NOW);
      d.setUTCDate(d.getUTCDate() - offset);
      return d;
    };
    const r = computeChangeImpactReview(
      [
        change({ id: 1, timestamp: day(10), action: "pause_keyword" }),
        change({ id: 2, timestamp: day(7), action: "update_bid" }),
        change({ id: 3, timestamp: day(4), action: "pause_keyword" }),
      ],
      new Map(),
      NOW,
      20,
    );
    const byId = new Map(r.items.map((i) => [i.id, i]));
    // All 3 are pairwise within 7 days → each sees the other 2 as confounders.
    expect(byId.get(1)!.otherChangesInWindow).toBe(2);
    expect(byId.get(2)!.otherChangesInWindow).toBe(2);
    expect(byId.get(3)!.otherChangesInWindow).toBe(2);
  });

  it("otherChangesInWindow surfaces earlier same-campaign writes (contamination of before window)", () => {
    // Regression: a later change must report prior changes within 7 days
    // as confounders because they contaminate its before-window.
    const day = (offset: number) => {
      const d = new Date(NOW);
      d.setUTCDate(d.getUTCDate() - offset);
      return d;
    };
    const r = computeChangeImpactReview(
      [
        change({ id: 1, timestamp: day(10), action: "pause_keyword" }), // Monday
        change({ id: 2, timestamp: day(8), action: "update_bid" }), // Wednesday — 2d after #1
      ],
      new Map(),
      NOW,
      20,
    );
    const byId = new Map(r.items.map((i) => [i.id, i]));
    // #2's before-window contains #1 → must count as confounder.
    expect(byId.get(2)!.otherChangesInWindow).toBe(1);
    // Symmetric: #1's after-window contains #2.
    expect(byId.get(1)!.otherChangesInWindow).toBe(1);
  });

  it("excludes changes on a different campaign from otherChangesInWindow", () => {
    const day = (offset: number) => {
      const d = new Date(NOW);
      d.setUTCDate(d.getUTCDate() - offset);
      return d;
    };
    const r = computeChangeImpactReview(
      [
        change({ id: 1, timestamp: day(10), campaignId: "campA" }),
        change({ id: 2, timestamp: day(8), campaignId: "campB" }),
      ],
      new Map(),
      NOW,
      20,
    );
    const byId = new Map(r.items.map((i) => [i.id, i]));
    expect(byId.get(1)!.otherChangesInWindow).toBe(0);
    expect(byId.get(2)!.otherChangesInWindow).toBe(0);
  });

  it("clamps daysAgo at 0 for future-dated changes (clock skew defense)", () => {
    const future = new Date(NOW);
    future.setUTCDate(future.getUTCDate() + 3);
    const r = computeChangeImpactReview(
      [change({ id: 1, timestamp: future })],
      new Map(),
      NOW,
      7,
    );
    expect(r.items[0].daysAgo).toBe(0);
  });

  it("uses symmetric 7-day windows that skip the change day (before + after both clean)", () => {
    // Change 8 days ago. Before = [D-7, D) → 7 days strictly pre.
    // After  = [D+1, D+8) → 7 days strictly post. Change day is skipped.
    // Sentinels at D (contaminated) and D+8 (outer boundary) must both
    // be EXCLUDED.
    const changeDate = new Date(NOW);
    changeDate.setUTCDate(changeDate.getUTCDate() - 8);
    const beforeStart = new Date(changeDate);
    beforeStart.setUTCDate(beforeStart.getUTCDate() - 7);
    const afterStart = new Date(changeDate);
    afterStart.setUTCDate(afterStart.getUTCDate() + 1);
    const dayPlus8 = new Date(changeDate);
    dayPlus8.setUTCDate(dayPlus8.getUTCDate() + 8);

    const snaps = new Map<string, SnapshotRow[]>([
      [
        "campA",
        [
          ...series("campA", beforeStart.toISOString().slice(0, 10), 7, 100, 0),
          // Change-day sentinel (must be skipped — mixed hours).
          snap("campA", changeDate.toISOString().slice(0, 10), 5555, 555),
          ...series("campA", afterStart.toISOString().slice(0, 10), 7, 80, 0),
          // Outer-boundary sentinel at D+8 (must be excluded, < afterEnd).
          snap("campA", dayPlus8.toISOString().slice(0, 10), 9999, 999),
        ],
      ],
    ]);

    const r = computeChangeImpactReview(
      [change({ id: 1, timestamp: changeDate })],
      snaps,
      NOW,
      20,
    );
    const item = r.items[0];
    expect(item.impact).not.toBeNull();
    expect(item.impact!.after.days).toBe(7);
    expect(item.impact!.before.days).toBe(7);
    // If change-day or D+8 sentinels had leaked in, cost would explode.
    expect(item.impact!.after.dailyCost).toBe(80);
    expect(item.impact!.before.dailyCost).toBe(100);
  });
});
