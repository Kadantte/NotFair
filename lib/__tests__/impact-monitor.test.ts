import { describe, expect, it } from "vitest";
import {
  evaluateIntervention,
  inferInterventionGoal,
  summarizeInterventionActions,
  type InterventionActionRow,
} from "@/lib/db/impact-monitor";
import type { SnapshotRow } from "@/lib/db/impact";

const NOW = new Date("2026-04-29T12:00:00.000Z");

function series(
  campaignId: string,
  startDate: string,
  days: number,
  values: { impressions: number; clicks: number; cost: number; conversions: number },
): Array<SnapshotRow & { impressions: number; clicks: number }> {
  const out: Array<SnapshotRow & { impressions: number; clicks: number }> = [];
  const start = new Date(`${startDate}T00:00:00.000Z`);
  for (let i = 0; i < days; i++) {
    const d = new Date(start);
    d.setUTCDate(d.getUTCDate() + i);
    out.push({
      campaignId,
      snapshotDate: d.toISOString().slice(0, 10),
      impressions: values.impressions,
      clicks: values.clicks,
      costMicros: values.cost * 1_000_000,
      conversions: values.conversions,
    });
  }
  return out;
}

function action(action: string, rolledBack = false): InterventionActionRow {
  return { action, rolledBack };
}

describe("impact-monitor helpers", () => {
  it("summarizes the top grouped actions", () => {
    expect(
      summarizeInterventionActions([
        "pause_keyword",
        "pause_keyword",
        "add_negative_keyword",
      ]),
    ).toBe("2 paused keywords, 1 added negatives");
  });

  it("infers pruning interventions as CPA-down hypotheses", () => {
    expect(inferInterventionGoal(["pause_keyword", "add_negative_keyword"]))
      .toMatchObject({ primaryMetric: "cpa", goalDirection: "decrease" });
  });

  it("marks mature same-campaign pruning as likely_improved when CPA falls", () => {
    const startedAt = new Date("2026-04-20T18:00:00.000Z");
    const beforeStart = new Date(startedAt);
    beforeStart.setUTCDate(beforeStart.getUTCDate() - 7);
    const afterStart = new Date(startedAt);
    afterStart.setUTCDate(afterStart.getUTCDate() + 1);

    const evaluation = evaluateIntervention({
      startedAt,
      actions: [action("pause_keyword"), action("add_negative_keyword")],
      snapshots: [
        ...series("camp-1", beforeStart.toISOString().slice(0, 10), 7, {
          impressions: 1000,
          clicks: 100,
          cost: 100,
          conversions: 5,
        }),
        ...series("camp-1", afterStart.toISOString().slice(0, 10), 7, {
          impressions: 900,
          clicks: 90,
          cost: 72,
          conversions: 6,
        }),
      ],
      confounderCountInternal: 0,
      now: NOW,
    });

    expect(evaluation.resultLabel).toBe("likely_improved");
    expect(evaluation.primaryMetricName).toBe("cpa");
    expect(evaluation.primaryMetricDeltaPct).toBeLessThan(-0.05);
  });

  it("returns too_new before enough after-days exist", () => {
    const startedAt = new Date("2026-04-27T18:00:00.000Z");
    const beforeStart = new Date(startedAt);
    beforeStart.setUTCDate(beforeStart.getUTCDate() - 7);
    const afterStart = new Date(startedAt);
    afterStart.setUTCDate(afterStart.getUTCDate() + 1);

    const evaluation = evaluateIntervention({
      startedAt,
      actions: [action("pause_keyword")],
      snapshots: [
        ...series("camp-1", beforeStart.toISOString().slice(0, 10), 7, {
          impressions: 1000,
          clicks: 100,
          cost: 100,
          conversions: 5,
        }),
        ...series("camp-1", afterStart.toISOString().slice(0, 10), 2, {
          impressions: 900,
          clicks: 90,
          cost: 90,
          conversions: 5,
        }),
      ],
      confounderCountInternal: 0,
      now: NOW,
    });

    expect(evaluation.resultLabel).toBe("too_new");
    expect(evaluation.confidence).toBe("low");
  });

  it("returns highly_confounded when too many same-campaign writes overlap", () => {
    const startedAt = new Date("2026-04-20T18:00:00.000Z");
    const beforeStart = new Date(startedAt);
    beforeStart.setUTCDate(beforeStart.getUTCDate() - 7);
    const afterStart = new Date(startedAt);
    afterStart.setUTCDate(afterStart.getUTCDate() + 1);

    const evaluation = evaluateIntervention({
      startedAt,
      actions: [action("pause_keyword")],
      snapshots: [
        ...series("camp-1", beforeStart.toISOString().slice(0, 10), 7, {
          impressions: 1000,
          clicks: 100,
          cost: 100,
          conversions: 5,
        }),
        ...series("camp-1", afterStart.toISOString().slice(0, 10), 7, {
          impressions: 900,
          clicks: 90,
          cost: 80,
          conversions: 6,
        }),
      ],
      confounderCountInternal: 4,
      now: NOW,
    });

    expect(evaluation.resultLabel).toBe("highly_confounded");
    expect(evaluation.reasonCodes).toContain("high_confounders");
  });

  it("downgrades CPA wins when they come from a steep volume collapse", () => {
    const startedAt = new Date("2026-04-20T18:00:00.000Z");
    const beforeStart = new Date(startedAt);
    beforeStart.setUTCDate(beforeStart.getUTCDate() - 7);
    const afterStart = new Date(startedAt);
    afterStart.setUTCDate(afterStart.getUTCDate() + 1);

    const evaluation = evaluateIntervention({
      startedAt,
      actions: [action("pause_keyword"), action("add_negative_keyword")],
      snapshots: [
        ...series("camp-1", beforeStart.toISOString().slice(0, 10), 7, {
          impressions: 1000,
          clicks: 100,
          cost: 100,
          conversions: 5,
        }),
        ...series("camp-1", afterStart.toISOString().slice(0, 10), 7, {
          impressions: 650,
          clicks: 65,
          cost: 48,
          conversions: 3,
        }),
      ],
      confounderCountInternal: 0,
      now: NOW,
    });

    expect(evaluation.resultLabel).toBe("inconclusive");
    expect(evaluation.reasonCodes).toContain("supporting_metrics_mixed");
  });

  it("returns rolled_back if any linked operation was undone", () => {
    const startedAt = new Date("2026-04-20T18:00:00.000Z");
    const beforeStart = new Date(startedAt);
    beforeStart.setUTCDate(beforeStart.getUTCDate() - 7);
    const afterStart = new Date(startedAt);
    afterStart.setUTCDate(afterStart.getUTCDate() + 1);

    const evaluation = evaluateIntervention({
      startedAt,
      actions: [action("pause_keyword", true)],
      snapshots: [
        ...series("camp-1", beforeStart.toISOString().slice(0, 10), 7, {
          impressions: 1000,
          clicks: 100,
          cost: 100,
          conversions: 5,
        }),
        ...series("camp-1", afterStart.toISOString().slice(0, 10), 7, {
          impressions: 1000,
          clicks: 100,
          cost: 100,
          conversions: 5,
        }),
      ],
      confounderCountInternal: 0,
      now: NOW,
    });

    expect(evaluation.resultLabel).toBe("rolled_back");
  });
});
