/**
 * Health Score Engine
 *
 * Computes a 0-100 composite health score for a Google Ads account.
 * Weights: CPA efficiency 30%, quality scores 20%, impression share 20%,
 *          waste ratio 20%, change momentum 10%.
 * Thresholds: green 70+, yellow 40-69, red 0-39.
 */

export type HealthInput = {
  /** All campaigns' aggregated metrics */
  campaigns: Array<{
    impressions: number;
    clicks: number;
    cost: number;
    conversions: number;
  }>;
  /** Keywords with quality scores */
  keywords: Array<{
    qualityScore: number | null;
    impressions: number;
  }>;
  /** Search impression share (0-1 fraction, e.g. 0.65 = 65%) */
  searchImpressionShare: number | null;
  /** Total spend on search terms with zero conversions */
  wastedSpend: number;
  /** Total spend across all search terms */
  totalSearchTermSpend: number;
  /** Number of recent changes that improved metrics */
  positiveChanges: number;
  /** Total recent changes */
  totalChanges: number;
};

export type HealthResult = {
  score: number;
  color: "green" | "yellow" | "red";
  components: {
    cpaEfficiency: number;
    qualityScores: number;
    impressionShare: number;
    wasteRatio: number;
    changeMomentum: number;
  };
};

export function computeHealthScore(input: HealthInput): HealthResult {
  const cpaEfficiency = computeCpaScore(input.campaigns);
  const qualityScores = computeQualityScore(input.keywords);
  const impressionShare = computeImpressionShareScore(input.searchImpressionShare);
  const wasteRatio = computeWasteScore(input.wastedSpend, input.totalSearchTermSpend);
  const changeMomentum = computeMomentumScore(input.positiveChanges, input.totalChanges);

  const score = Math.round(
    cpaEfficiency * 0.3 +
    qualityScores * 0.2 +
    impressionShare * 0.2 +
    wasteRatio * 0.2 +
    changeMomentum * 0.1
  );

  const clampedScore = Math.max(0, Math.min(100, score));

  return {
    score: clampedScore,
    color: clampedScore >= 70 ? "green" : clampedScore >= 40 ? "yellow" : "red",
    components: {
      cpaEfficiency,
      qualityScores,
      impressionShare,
      wasteRatio,
      changeMomentum,
    },
  };
}

/** CPA efficiency: lower CPA relative to cost/conversion baseline = better */
function computeCpaScore(
  campaigns: HealthInput["campaigns"],
): number {
  const totalCost = campaigns.reduce((s, c) => s + c.cost, 0);
  const totalConversions = campaigns.reduce((s, c) => s + c.conversions, 0);

  if (totalCost === 0) return 50; // no spend = neutral
  if (totalConversions === 0) return 10; // spending but no conversions = bad

  // Score based on conversion rate (conversions / clicks) as a proxy for CPA efficiency
  const totalClicks = campaigns.reduce((s, c) => s + c.clicks, 0);
  if (totalClicks === 0) return 50;

  const conversionRate = totalConversions / totalClicks;
  // >10% conversion rate = excellent, <1% = poor
  if (conversionRate >= 0.10) return 100;
  if (conversionRate >= 0.05) return 80;
  if (conversionRate >= 0.03) return 60;
  if (conversionRate >= 0.01) return 40;
  return 20;
}

/** Quality score: % of keywords with QS >= 7 (weighted by impressions) */
function computeQualityScore(
  keywords: HealthInput["keywords"],
): number {
  const withScore = keywords.filter((k) => k.qualityScore !== null && k.qualityScore > 0);
  if (withScore.length === 0) return 50; // no data = neutral

  const totalImpressions = withScore.reduce((s, k) => s + k.impressions, 0);
  if (totalImpressions === 0) return 50;

  const goodImpressions = withScore
    .filter((k) => (k.qualityScore ?? 0) >= 7)
    .reduce((s, k) => s + k.impressions, 0);

  const ratio = goodImpressions / totalImpressions;
  return Math.round(ratio * 100);
}

/** Impression share: higher IS = better. 80%+ = good, <40% = poor */
function computeImpressionShareScore(is: number | null): number {
  if (is === null) return 50; // no data = neutral
  return Math.round(Math.min(is * 100, 100));
}

/** Waste ratio: lower waste = better */
function computeWasteScore(wastedSpend: number, totalSpend: number): number {
  if (totalSpend === 0) return 100; // no spend = no waste
  const wasteRatio = wastedSpend / totalSpend;
  // 0% waste = 100, 50%+ waste = 0
  return Math.round(Math.max(0, (1 - wasteRatio * 2) * 100));
}

/** Change momentum: ratio of positive changes */
function computeMomentumScore(positive: number, total: number): number {
  if (total === 0) return 50; // no changes = neutral
  return Math.round((positive / total) * 100);
}
