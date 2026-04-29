import { MIN_AFTER_DAYS_FOR_DIRECTION, type SnapshotRow } from "./impact";

export const INTERVENTION_BASELINE_DAYS = 7;
export const INTERVENTION_AFTER_DAYS = 7;
export const INTERVENTION_NEUTRAL_THRESHOLD = 0.05;
export const HIGH_CONFOUNDER_THRESHOLD = 3;

export type InterventionMetricName =
  | "cpa"
  | "conversions"
  | "cost"
  | "clicks"
  | "impressions"
  | "ctr"
  | "cvr";

export type InterventionResultLabel =
  | "likely_improved"
  | "inconclusive"
  | "likely_worsened"
  | "too_new"
  | "highly_confounded"
  | "rolled_back";

export type InterventionConfidence = "low" | "medium" | "high";

export type InterventionActionRow = {
  action: string;
  createdAt?: Date;
  rolledBack?: boolean;
};

export type InterventionMetricWindow = {
  impressions: number;
  clicks: number;
  cost: number;
  conversions: number;
  ctr: number | null;
  cvr: number | null;
  cpa: number | null;
  days: number;
};

export type InterventionMetricComparison = {
  before: number | null;
  after: number | null;
  delta: number | null;
  deltaPct: number | null;
};

export type InterventionEvaluation = {
  resultLabel: InterventionResultLabel;
  confidence: InterventionConfidence;
  primaryMetricName: InterventionMetricName;
  primaryMetricBefore: number | null;
  primaryMetricAfter: number | null;
  primaryMetricDeltaPct: number | null;
  confounderCountInternal: number;
  daysSinceStart: number;
  baselineWindowDays: number;
  afterWindowDays: number;
  reasonCodes: string[];
  reasonSummary: string;
  supportingMetrics: Record<string, InterventionMetricComparison>;
  before: InterventionMetricWindow;
  after: InterventionMetricWindow;
};

type GoalInference = {
  primaryMetric: InterventionMetricName;
  goalDirection: "increase" | "decrease";
  hypothesis: string;
};

type MetricDeltaMap = Record<string, InterventionMetricComparison>;

const ACTION_SUMMARY_LABELS: Record<string, string> = {
  pause_keyword: "paused keywords",
  enable_keyword: "re-enabled keywords",
  add_keyword: "added keywords",
  remove_keyword: "removed keywords",
  add_negative_keyword: "added negatives",
  remove_negative_keyword: "removed negatives",
  update_bid: "updated bids",
  update_budget: "updated budgets",
  update_campaign_budget: "updated budgets",
  updateCampaignBudget: "updated budgets",
  bulk_pause_keywords: "paused keywords",
  bulkPauseKeywords: "paused keywords",
  bulk_add_keywords: "added keywords",
  bulkAddKeywords: "added keywords",
  bulk_update_bids: "updated bids",
  bulkUpdateBids: "updated bids",
  move_keywords: "moved keywords",
  moveKeywords: "moved keywords",
  update_bidding: "updated bidding",
  updateCampaignBidding: "updated bidding",
  update_campaign_settings: "updated campaign settings",
  updateCampaignSettings: "updated campaign settings",
};

function dateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function daysBetween(later: Date, earlier: Date): number {
  return Math.max(0, Math.floor((later.getTime() - earlier.getTime()) / (1000 * 60 * 60 * 24)));
}

function averageSnapshots(snapshots: Array<SnapshotRow & { impressions?: number | null; clicks?: number | null }>): InterventionMetricWindow {
  const days = snapshots.length;
  if (days === 0) {
    return {
      impressions: 0,
      clicks: 0,
      cost: 0,
      conversions: 0,
      ctr: null,
      cvr: null,
      cpa: null,
      days: 0,
    };
  }

  let totalImpressions = 0;
  let totalClicks = 0;
  let totalCost = 0;
  let totalConversions = 0;
  for (const snapshot of snapshots) {
    totalImpressions += snapshot.impressions ?? 0;
    totalClicks += snapshot.clicks ?? 0;
    totalCost += (snapshot.costMicros ?? 0) / 1_000_000;
    totalConversions += snapshot.conversions ?? 0;
  }

  const avgImpressions = totalImpressions / days;
  const avgClicks = totalClicks / days;
  const avgCost = totalCost / days;
  const avgConversions = totalConversions / days;

  return {
    impressions: avgImpressions,
    clicks: avgClicks,
    cost: avgCost,
    conversions: avgConversions,
    ctr: avgImpressions > 0 ? avgClicks / avgImpressions : null,
    cvr: avgClicks > 0 ? avgConversions / avgClicks : null,
    cpa: avgConversions > 0 ? avgCost / avgConversions : null,
    days,
  };
}

function compareMetric(before: number | null, after: number | null): InterventionMetricComparison {
  if (before === null || after === null) {
    return { before, after, delta: null, deltaPct: null };
  }
  const delta = after - before;
  const deltaPct = before !== 0 ? delta / before : null;
  return { before, after, delta, deltaPct };
}

function getMetricValue(window: InterventionMetricWindow, metric: InterventionMetricName): number | null {
  switch (metric) {
    case "cpa":
      return window.cpa;
    case "conversions":
      return window.conversions;
    case "cost":
      return window.cost;
    case "clicks":
      return window.clicks;
    case "impressions":
      return window.impressions;
    case "ctr":
      return window.ctr;
    case "cvr":
      return window.cvr;
    default:
      return null;
  }
}

function inferGoal(actions: string[]): GoalInference {
  const normalized = actions.map((action) => action.toLowerCase());
  const pruneSignals = normalized.filter((action) =>
    action.includes("negative") || action.includes("pause_keyword") || action.includes("remove_keyword"),
  ).length;
  const expansionSignals = normalized.filter((action) =>
    action.includes("add_keyword") || action.includes("create_ad_group") || action.includes("create_ad"),
  ).length;
  const bidBudgetSignals = normalized.filter((action) =>
    action.includes("update_bid") || action.includes("budget") || action.includes("bidding"),
  ).length;

  if (pruneSignals >= Math.max(expansionSignals, bidBudgetSignals)) {
    return {
      primaryMetric: "cpa",
      goalDirection: "decrease",
      hypothesis: "Reduce wasted spend and lower CPA.",
    };
  }

  if (expansionSignals > pruneSignals) {
    return {
      primaryMetric: "conversions",
      goalDirection: "increase",
      hypothesis: "Capture more demand and increase conversions.",
    };
  }

  if (bidBudgetSignals > 0) {
    return {
      primaryMetric: "conversions",
      goalDirection: "increase",
      hypothesis: "Trade more spend for more qualified conversion volume.",
    };
  }

  return {
    primaryMetric: "cpa",
    goalDirection: "decrease",
    hypothesis: "Improve campaign efficiency.",
  };
}

export function summarizeInterventionActions(actions: string[]): string {
  const counts = new Map<string, number>();
  for (const action of actions) {
    counts.set(action, (counts.get(action) ?? 0) + 1);
  }

  const parts = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([action, count]) => `${count} ${ACTION_SUMMARY_LABELS[action] ?? action.replaceAll("_", " ")}`);

  return parts.length > 0 ? parts.join(", ") : "No linked operations";
}

export function inferInterventionGoal(actions: string[]): GoalInference {
  return inferGoal(actions);
}

function supportingSignalsConflict(
  primaryMetricName: InterventionMetricName,
  goalDirection: string | null | undefined,
  supportingMetrics: MetricDeltaMap,
): boolean {
  const conversionsDelta = supportingMetrics.conversions.deltaPct;
  const clicksDelta = supportingMetrics.clicks.deltaPct;
  const costDelta = supportingMetrics.cost.deltaPct;
  const cpaDelta = supportingMetrics.cpa.deltaPct;

  switch (primaryMetricName) {
    case "cpa":
      if ((cpaDelta ?? 0) < 0) {
        return (conversionsDelta ?? 0) <= -0.2 && (clicksDelta ?? 0) <= -0.25;
      }
      if ((cpaDelta ?? 0) > 0) {
        return (conversionsDelta ?? 0) >= 0.2 && (clicksDelta ?? 0) >= 0.15;
      }
      return false;
    case "conversions":
      return (costDelta ?? 0) >= 0.5 && (cpaDelta ?? 0) >= 0.3;
    case "cost":
      return goalDirection === "decrease"
        ? (conversionsDelta ?? 0) <= -0.3
        : (conversionsDelta ?? 0) >= 0.3 && (costDelta ?? 0) >= 0.5;
    default:
      return false;
  }
}

function decideConfidence(args: {
  resultLabel: InterventionResultLabel;
  primaryMetricDeltaPct: number | null;
  confounderCountInternal: number;
  afterDays: number;
}): InterventionConfidence {
  const { resultLabel, primaryMetricDeltaPct, confounderCountInternal, afterDays } = args;
  if (resultLabel === "rolled_back" || resultLabel === "too_new" || resultLabel === "highly_confounded") {
    return "low";
  }
  const absPct = Math.abs(primaryMetricDeltaPct ?? 0);
  if (confounderCountInternal === 0 && afterDays >= INTERVENTION_AFTER_DAYS && absPct >= 0.15) {
    return "high";
  }
  if (confounderCountInternal <= 1 && afterDays >= MIN_AFTER_DAYS_FOR_DIRECTION && absPct >= INTERVENTION_NEUTRAL_THRESHOLD) {
    return "medium";
  }
  return "low";
}

function summarizeReason(resultLabel: InterventionResultLabel, reasonCodes: string[], primaryMetricName: InterventionMetricName, deltaPct: number | null, confounders: number): string {
  if (resultLabel === "rolled_back") return "Intervention was rolled back, so impact is not attributed.";
  if (resultLabel === "too_new") return `Only partial after-data exists so far — wait for at least ${MIN_AFTER_DAYS_FOR_DIRECTION} full after-days.`;
  if (resultLabel === "highly_confounded") return `${confounders} other same-campaign writes landed in the measurement window, so this readout is too confounded to trust.`;
  if (reasonCodes.includes("no_baseline")) return "No clean before-window snapshots exist for this campaign yet.";
  if (reasonCodes.includes("supporting_metrics_mixed")) return `The primary ${primaryMetricName.toUpperCase()} move conflicts with the rest of the campaign readout, so keep this as observational and inconclusive.`;
  if (deltaPct === null) return `Not enough ${primaryMetricName.toUpperCase()} signal to make a call.`;
  const pct = Math.round(Math.abs(deltaPct) * 100);
  if (resultLabel === "likely_improved") return `${primaryMetricName.toUpperCase()} moved in the expected direction by about ${pct}%${confounders > 0 ? `, but ${confounders} confounder(s) reduce confidence.` : "."}`;
  if (resultLabel === "likely_worsened") return `${primaryMetricName.toUpperCase()} moved in the wrong direction by about ${pct}%${confounders > 0 ? `, with ${confounders} confounder(s) in the same window.` : "."}`;
  return confounders > 0
    ? `${primaryMetricName.toUpperCase()} moved, but ${confounders} confounder(s) make the result inconclusive.`
    : `${primaryMetricName.toUpperCase()} stayed within the noise band.`;
}

export function evaluateIntervention(args: {
  startedAt: Date;
  actions: InterventionActionRow[];
  snapshots: Array<SnapshotRow & { impressions?: number | null; clicks?: number | null }>;
  primaryMetric?: string | null;
  goalDirection?: string | null;
  baselineWindowDays?: number;
  afterWindowDays?: number;
  confounderCountInternal: number;
  now: Date;
}): InterventionEvaluation {
  const baselineWindowDays = args.baselineWindowDays ?? INTERVENTION_BASELINE_DAYS;
  const afterWindowDays = args.afterWindowDays ?? INTERVENTION_AFTER_DAYS;
  const daysSinceStart = daysBetween(args.now, args.startedAt);
  const inferred = inferGoal(args.actions.map((action) => action.action));
  const primaryMetricName = (args.primaryMetric as InterventionMetricName | null) ?? inferred.primaryMetric;
  const goalDirection = args.goalDirection ?? inferred.goalDirection;

  const startDay = dateKey(args.startedAt);
  const beforeStart = new Date(args.startedAt);
  beforeStart.setUTCDate(beforeStart.getUTCDate() - baselineWindowDays);
  const afterStart = new Date(args.startedAt);
  afterStart.setUTCDate(afterStart.getUTCDate() + 1);
  const afterEnd = new Date(args.startedAt);
  afterEnd.setUTCDate(afterEnd.getUTCDate() + afterWindowDays + 1);

  const before = args.snapshots.filter((snapshot) => snapshot.snapshotDate >= dateKey(beforeStart) && snapshot.snapshotDate < startDay);
  const after = args.snapshots.filter((snapshot) => snapshot.snapshotDate >= dateKey(afterStart) && snapshot.snapshotDate < dateKey(afterEnd));

  const beforeMetrics = averageSnapshots(before);
  const afterMetrics = averageSnapshots(after);
  const supportingMetrics: Record<string, InterventionMetricComparison> = {
    cpa: compareMetric(beforeMetrics.cpa, afterMetrics.cpa),
    conversions: compareMetric(beforeMetrics.conversions, afterMetrics.conversions),
    cost: compareMetric(beforeMetrics.cost, afterMetrics.cost),
    clicks: compareMetric(beforeMetrics.clicks, afterMetrics.clicks),
    impressions: compareMetric(beforeMetrics.impressions, afterMetrics.impressions),
    ctr: compareMetric(beforeMetrics.ctr, afterMetrics.ctr),
    cvr: compareMetric(beforeMetrics.cvr, afterMetrics.cvr),
  };

  const primaryMetricBefore = getMetricValue(beforeMetrics, primaryMetricName);
  const primaryMetricAfter = getMetricValue(afterMetrics, primaryMetricName);
  const primaryMetricDeltaPct = compareMetric(primaryMetricBefore, primaryMetricAfter).deltaPct;

  const reasonCodes: string[] = [];
  const rolledBack = args.actions.some((action) => action.rolledBack);
  let resultLabel: InterventionResultLabel;

  if (rolledBack) {
    reasonCodes.push("rolled_back");
    resultLabel = "rolled_back";
  } else if (after.length < MIN_AFTER_DAYS_FOR_DIRECTION) {
    reasonCodes.push("too_new");
    resultLabel = "too_new";
  } else if (before.length === 0) {
    reasonCodes.push("no_baseline");
    resultLabel = "inconclusive";
  } else if (args.confounderCountInternal >= HIGH_CONFOUNDER_THRESHOLD) {
    reasonCodes.push("high_confounders");
    resultLabel = "highly_confounded";
  } else if (primaryMetricDeltaPct === null) {
    reasonCodes.push("missing_primary_metric_signal");
    resultLabel = "inconclusive";
  } else {
    const movedEnough = Math.abs(primaryMetricDeltaPct) >= INTERVENTION_NEUTRAL_THRESHOLD;
    const improved = (() => {
      switch (primaryMetricName) {
        case "cpa":
          return primaryMetricDeltaPct <= -INTERVENTION_NEUTRAL_THRESHOLD;
        case "conversions":
        case "clicks":
        case "impressions":
        case "ctr":
        case "cvr":
          return primaryMetricDeltaPct >= INTERVENTION_NEUTRAL_THRESHOLD;
        case "cost":
          return goalDirection === "decrease"
            ? primaryMetricDeltaPct <= -INTERVENTION_NEUTRAL_THRESHOLD
            : primaryMetricDeltaPct >= INTERVENTION_NEUTRAL_THRESHOLD;
        default:
          return false;
      }
    })();

    if (!movedEnough) {
      reasonCodes.push("within_noise_band");
      resultLabel = "inconclusive";
    } else if (improved) {
      reasonCodes.push("primary_metric_improved");
      resultLabel = "likely_improved";
    } else {
      reasonCodes.push("primary_metric_worsened");
      resultLabel = "likely_worsened";
    }

    if (
      (resultLabel === "likely_improved" || resultLabel === "likely_worsened")
      && supportingSignalsConflict(primaryMetricName, goalDirection, supportingMetrics)
    ) {
      reasonCodes.push("supporting_metrics_mixed");
      resultLabel = "inconclusive";
    }
  }

  if (args.confounderCountInternal > 0) reasonCodes.push("has_confounders");

  const confidence = decideConfidence({
    resultLabel,
    primaryMetricDeltaPct,
    confounderCountInternal: args.confounderCountInternal,
    afterDays: afterMetrics.days,
  });

  return {
    resultLabel,
    confidence,
    primaryMetricName,
    primaryMetricBefore,
    primaryMetricAfter,
    primaryMetricDeltaPct,
    confounderCountInternal: args.confounderCountInternal,
    daysSinceStart,
    baselineWindowDays,
    afterWindowDays,
    reasonCodes,
    reasonSummary: summarizeReason(resultLabel, reasonCodes, primaryMetricName, primaryMetricDeltaPct, args.confounderCountInternal),
    supportingMetrics,
    before: beforeMetrics,
    after: afterMetrics,
  };
}
