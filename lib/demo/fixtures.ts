import { formatDate } from "@/lib/google-ads";
import { hashSeed, makeRng, rngFloat, rngInt, rngNormal, type Rng } from "./prng";

// ─── Business profile ───────────────────────────────────────────────
//
// Threadline Apparel — a mid-market direct-to-consumer clothing brand.
// 30 days of history (so 30-day lookback, 7-day sparklines, and WoW
// comparisons all have data). Numbers feel realistic for a ~$50k/month
// ad budget.

export const DEMO_BUSINESS = {
  name: "Threadline Apparel",
  domain: "threadline-apparel.com",
  currency: "USD",
  timeZone: "America/Los_Angeles",
} as const;

/** How many days of daily snapshot data to generate. 30 covers 30-day + 7-day dashboards with room for WoW compares. */
export const DEMO_HISTORY_DAYS = 30;

// ─── Campaign definitions ───────────────────────────────────────────

export type DemoCampaign = {
  id: string;
  name: string;
  status: "ENABLED" | "PAUSED";
  channelType: "SEARCH" | "SHOPPING" | "PERFORMANCE_MAX";
  biddingStrategy:
    | "TARGET_CPA"
    | "TARGET_ROAS"
    | "MAXIMIZE_CONVERSIONS"
    | "MAXIMIZE_CONVERSION_VALUE"
    | "MANUAL_CPC";
  dailyBudget: number; // dollars
  trackingTemplate: string | null;
  networkDisplayEnabled: boolean;
  /** Daily average for the metrics generator. Sets the overall cost scale. */
  avgDailyCost: number;
  /** Average CPC — controls clicks derived from cost. */
  avgCpc: number;
  /** Avg clicks→conversion rate. */
  cvr: number;
  /** Average conversion value (order value), used for conversions_value / ROAS. */
  aov: number;
  /** CTR, used to derive impressions from clicks. */
  ctr: number;
  /** Story tag: used to steer the issue/opportunity detectors. */
  storyTags: readonly DemoStoryTag[];
  /** Search impression share for Search campaigns (null for Shopping / PMax). */
  searchImpressionShare: number | null;
  /** Share lost to budget (0-1). */
  budgetLostIS: number | null;
  /** Share lost to rank (0-1). */
  rankLostIS: number | null;
};

export type DemoStoryTag =
  | "brand_healthy" // strong CVR, high IS, low CPA — nothing to fix
  | "wasted_spend" // lots of 0-conversion search terms → populates the "wasted spend" issue
  | "budget_capped" // high budget-lost IS → populates the budget opportunity
  | "new_scaling" // recent ramp, elevated CPA → still finding equilibrium
  | "underperforming"; // paused or trending down

export const DEMO_CAMPAIGNS: readonly DemoCampaign[] = [
  {
    id: "900000000001",
    name: "Threadline — Brand Search",
    status: "ENABLED",
    channelType: "SEARCH",
    biddingStrategy: "TARGET_CPA",
    dailyBudget: 120,
    trackingTemplate: "{lpurl}?utm_source=google&utm_medium=cpc&utm_campaign={campaignid}&utm_content={adgroupid}",
    networkDisplayEnabled: false,
    avgDailyCost: 95,
    avgCpc: 0.85,
    cvr: 0.11,
    aov: 82,
    ctr: 0.14,
    storyTags: ["brand_healthy"],
    searchImpressionShare: 0.92,
    budgetLostIS: 0.02,
    rankLostIS: 0.06,
  },
  {
    id: "900000000002",
    name: "Threadline — Men's Apparel (Non-Brand)",
    status: "ENABLED",
    channelType: "SEARCH",
    biddingStrategy: "TARGET_CPA",
    dailyBudget: 220,
    trackingTemplate: "{lpurl}?utm_source=google&utm_medium=cpc&utm_campaign={campaignid}&utm_content={adgroupid}",
    networkDisplayEnabled: false,
    avgDailyCost: 215,
    avgCpc: 1.65,
    cvr: 0.035,
    aov: 95,
    ctr: 0.052,
    storyTags: ["wasted_spend"],
    searchImpressionShare: 0.38,
    budgetLostIS: 0.22,
    rankLostIS: 0.40,
  },
  {
    id: "900000000003",
    name: "Threadline — Women's Apparel (Non-Brand)",
    status: "ENABLED",
    channelType: "SEARCH",
    biddingStrategy: "TARGET_ROAS",
    dailyBudget: 280,
    trackingTemplate: "{lpurl}?utm_source=google&utm_medium=cpc&utm_campaign={campaignid}&utm_content={adgroupid}",
    networkDisplayEnabled: false,
    avgDailyCost: 278,
    avgCpc: 1.45,
    cvr: 0.055,
    aov: 108,
    ctr: 0.061,
    storyTags: ["budget_capped"],
    searchImpressionShare: 0.48,
    budgetLostIS: 0.34,
    rankLostIS: 0.18,
  },
  {
    id: "900000000004",
    name: "Threadline — Shopping (All Products)",
    status: "ENABLED",
    channelType: "SHOPPING",
    biddingStrategy: "MAXIMIZE_CONVERSION_VALUE",
    dailyBudget: 180,
    trackingTemplate: null,
    networkDisplayEnabled: false,
    avgDailyCost: 175,
    avgCpc: 0.55,
    cvr: 0.028,
    aov: 88,
    ctr: 0.018,
    storyTags: ["brand_healthy"],
    searchImpressionShare: null,
    budgetLostIS: null,
    rankLostIS: null,
  },
  {
    id: "900000000005",
    name: "Threadline — PMax Sitewide",
    status: "ENABLED",
    channelType: "PERFORMANCE_MAX",
    biddingStrategy: "MAXIMIZE_CONVERSION_VALUE",
    dailyBudget: 150,
    trackingTemplate: null,
    networkDisplayEnabled: false,
    avgDailyCost: 152,
    avgCpc: 0.72,
    cvr: 0.042,
    aov: 96,
    ctr: 0.031,
    storyTags: ["new_scaling"],
    searchImpressionShare: null,
    budgetLostIS: null,
    rankLostIS: null,
  },
] as const;

export function findDemoCampaign(id: string): DemoCampaign | null {
  return DEMO_CAMPAIGNS.find((c) => c.id === id) ?? null;
}

// ─── Ad groups ───────────────────────────────────────────────────────
//
// Per-campaign ad group sets. Shopping + PMax have a single asset/product
// group each; Search campaigns have 2-4 themed ad groups. IDs are stable.

type DemoAdGroup = {
  id: string;
  name: string;
  type: "SEARCH_STANDARD" | "SHOPPING_PRODUCT_ADS" | "PERFORMANCE_MAX";
  /** Share of the parent campaign's cost this ad group takes. Sums to 1 per campaign. */
  costShare: number;
  /** Keyword list for this ad group (search campaigns only). */
  keywords: readonly DemoKeywordDef[];
};

type DemoKeywordDef = {
  text: string;
  matchType: "EXACT" | "PHRASE" | "BROAD";
  qualityScore: number;
  /** Share of the parent ad group's cost this keyword takes. */
  costShare: number;
};

const AD_GROUPS_BY_CAMPAIGN: Record<string, readonly DemoAdGroup[]> = {
  "900000000001": [
    {
      id: "910000000101",
      name: "Brand — Core",
      type: "SEARCH_STANDARD",
      costShare: 0.72,
      keywords: [
        { text: "threadline apparel", matchType: "EXACT", qualityScore: 10, costShare: 0.48 },
        { text: "threadline clothing", matchType: "PHRASE", qualityScore: 9, costShare: 0.22 },
        { text: "threadline jeans", matchType: "EXACT", qualityScore: 10, costShare: 0.18 },
        { text: "threadline store", matchType: "PHRASE", qualityScore: 8, costShare: 0.12 },
      ],
    },
    {
      id: "910000000102",
      name: "Brand — Competitor Defense",
      type: "SEARCH_STANDARD",
      costShare: 0.28,
      keywords: [
        { text: "threadline reviews", matchType: "PHRASE", qualityScore: 8, costShare: 0.40 },
        { text: "threadline vs everlane", matchType: "PHRASE", qualityScore: 7, costShare: 0.28 },
        { text: "threadline discount code", matchType: "PHRASE", qualityScore: 8, costShare: 0.32 },
      ],
    },
  ],
  "900000000002": [
    {
      id: "910000000201",
      name: "Men's Jeans",
      type: "SEARCH_STANDARD",
      costShare: 0.38,
      keywords: [
        { text: "mens slim fit jeans", matchType: "PHRASE", qualityScore: 6, costShare: 0.30 },
        { text: "mens dark wash jeans", matchType: "PHRASE", qualityScore: 7, costShare: 0.22 },
        { text: "mens stretch jeans", matchType: "BROAD", qualityScore: 5, costShare: 0.20 },
        { text: "selvedge denim men", matchType: "PHRASE", qualityScore: 8, costShare: 0.16 },
        { text: "mens jeans", matchType: "BROAD", qualityScore: 4, costShare: 0.12 },
      ],
    },
    {
      id: "910000000202",
      name: "Men's Shirts",
      type: "SEARCH_STANDARD",
      costShare: 0.34,
      keywords: [
        { text: "mens oxford shirt", matchType: "PHRASE", qualityScore: 7, costShare: 0.32 },
        { text: "mens chambray shirt", matchType: "PHRASE", qualityScore: 8, costShare: 0.22 },
        { text: "mens flannel shirts", matchType: "BROAD", qualityScore: 5, costShare: 0.24 },
        { text: "mens button down", matchType: "BROAD", qualityScore: 5, costShare: 0.22 },
      ],
    },
    {
      id: "910000000203",
      name: "Men's Outerwear",
      type: "SEARCH_STANDARD",
      costShare: 0.28,
      keywords: [
        { text: "mens waxed canvas jacket", matchType: "PHRASE", qualityScore: 8, costShare: 0.32 },
        { text: "mens field jacket", matchType: "PHRASE", qualityScore: 7, costShare: 0.26 },
        { text: "mens peacoat", matchType: "BROAD", qualityScore: 5, costShare: 0.22 },
        { text: "mens lightweight jacket", matchType: "BROAD", qualityScore: 4, costShare: 0.20 },
      ],
    },
  ],
  "900000000003": [
    {
      id: "910000000301",
      name: "Women's Dresses",
      type: "SEARCH_STANDARD",
      costShare: 0.42,
      keywords: [
        { text: "womens midi dress", matchType: "PHRASE", qualityScore: 8, costShare: 0.32 },
        { text: "womens wrap dress", matchType: "PHRASE", qualityScore: 7, costShare: 0.24 },
        { text: "linen summer dress", matchType: "PHRASE", qualityScore: 9, costShare: 0.22 },
        { text: "sustainable dresses", matchType: "BROAD", qualityScore: 6, costShare: 0.22 },
      ],
    },
    {
      id: "910000000302",
      name: "Women's Knitwear",
      type: "SEARCH_STANDARD",
      costShare: 0.32,
      keywords: [
        { text: "merino wool sweater women", matchType: "PHRASE", qualityScore: 9, costShare: 0.34 },
        { text: "oversized cardigan", matchType: "PHRASE", qualityScore: 7, costShare: 0.28 },
        { text: "cashmere sweater women", matchType: "PHRASE", qualityScore: 8, costShare: 0.26 },
        { text: "womens cardigans", matchType: "BROAD", qualityScore: 5, costShare: 0.12 },
      ],
    },
    {
      id: "910000000303",
      name: "Women's Jeans",
      type: "SEARCH_STANDARD",
      costShare: 0.26,
      keywords: [
        { text: "womens high waist jeans", matchType: "PHRASE", qualityScore: 8, costShare: 0.36 },
        { text: "straight leg jeans women", matchType: "PHRASE", qualityScore: 7, costShare: 0.28 },
        { text: "womens wide leg jeans", matchType: "BROAD", qualityScore: 6, costShare: 0.24 },
        { text: "womens jeans", matchType: "BROAD", qualityScore: 4, costShare: 0.12 },
      ],
    },
  ],
  "900000000004": [
    {
      id: "910000000401",
      name: "All Products — Shopping",
      type: "SHOPPING_PRODUCT_ADS",
      costShare: 1.0,
      keywords: [],
    },
  ],
  "900000000005": [
    {
      id: "910000000501",
      name: "Sitewide — Asset Group",
      type: "PERFORMANCE_MAX",
      costShare: 1.0,
      keywords: [],
    },
  ],
};

export function demoAdGroups(campaignId: string): readonly DemoAdGroup[] {
  return AD_GROUPS_BY_CAMPAIGN[campaignId] ?? [];
}

// ─── Ads ────────────────────────────────────────────────────────────

export type DemoAd = {
  adId: string;
  adGroupId: string;
  adGroupName: string;
  status: "ENABLED" | "PAUSED";
  type: "RESPONSIVE_SEARCH_AD" | "SHOPPING_SMART_AD" | "PERFORMANCE_MAX_AD";
  finalUrls: readonly string[];
  headlines: readonly string[];
  descriptions: readonly string[];
  adStrength: "EXCELLENT" | "GOOD" | "AVERAGE" | "POOR";
  /** Share of the ad group's cost this ad takes (only meaningful for Search RSA variants). */
  costShare: number;
};

/**
 * Two RSA variants per search ad group: one strong, one B-test. Shopping + PMax
 * return single opaque ads since copy isn't meaningful there.
 */
export function demoAds(campaignId: string): DemoAd[] {
  const campaign = findDemoCampaign(campaignId);
  if (!campaign) return [];
  const ads: DemoAd[] = [];
  let counter = 1;

  for (const group of demoAdGroups(campaignId)) {
    if (group.type === "SEARCH_STANDARD") {
      ads.push({
        adId: `920${campaignId.slice(-4)}${String(counter++).padStart(3, "0")}`,
        adGroupId: group.id,
        adGroupName: group.name,
        status: "ENABLED",
        type: "RESPONSIVE_SEARCH_AD",
        finalUrls: [`https://${DEMO_BUSINESS.domain}/shop`],
        headlines: rsaHeadlines(group.name, campaign),
        descriptions: rsaDescriptions(),
        adStrength: "EXCELLENT",
        costShare: 0.62,
      });
      ads.push({
        adId: `920${campaignId.slice(-4)}${String(counter++).padStart(3, "0")}`,
        adGroupId: group.id,
        adGroupName: group.name,
        status: "ENABLED",
        type: "RESPONSIVE_SEARCH_AD",
        finalUrls: [`https://${DEMO_BUSINESS.domain}/shop`],
        headlines: rsaHeadlinesVariantB(group.name),
        descriptions: rsaDescriptionsVariantB(),
        adStrength: "GOOD",
        costShare: 0.38,
      });
    } else {
      ads.push({
        adId: `920${campaignId.slice(-4)}${String(counter++).padStart(3, "0")}`,
        adGroupId: group.id,
        adGroupName: group.name,
        status: "ENABLED",
        type: group.type === "SHOPPING_PRODUCT_ADS" ? "SHOPPING_SMART_AD" : "PERFORMANCE_MAX_AD",
        finalUrls: [`https://${DEMO_BUSINESS.domain}/`],
        headlines: [],
        descriptions: [],
        adStrength: "GOOD",
        costShare: 1.0,
      });
    }
  }
  return ads;
}

function rsaHeadlines(group: string, campaign: DemoCampaign): string[] {
  const base = [
    "Wardrobe Staples Built to Last",
    "Shop Threadline Apparel",
    "Ethical Fabric, Smart Design",
    "Free Shipping Over $100",
    "New Arrivals Every Week",
    clampHeadline(group),
    "Quality Basics, Fair Price",
    "30-Day Free Returns",
    "Made for Everyday Wear",
    "Rated 4.8 of 5 by Shoppers",
    campaign.channelType === "SEARCH" ? "Shop the Collection" : "Explore Threadline",
  ];
  return base.slice(0, 11);
}
function clampHeadline(text: string): string {
  return text.length <= 30 ? text : text.slice(0, 30).trim();
}
function rsaDescriptions(): string[] {
  return [
    "Premium materials, responsibly sourced. Free shipping over $100 and easy returns.",
    "Timeless pieces designed to wear for years, not seasons. Shop now and save on staples.",
    "Join 50,000+ shoppers who rated us 4.8/5. Free returns, always.",
    "Soft, durable, and ethically made. Discover Threadline today.",
  ];
}
function rsaHeadlinesVariantB(group: string): string[] {
  return [
    clampHeadline(`${group} — 20% Off`),
    "Limited Time Offer",
    "Shop the Sale at Threadline",
    "Up to 20% Off Staples",
    "Ethically Made Basics",
    "Free Returns, 30 Days",
    "4.8 of 5 Customer Rating",
    "Wardrobe That Lasts",
    "Soft Organic Cotton",
    "New Fall Arrivals",
  ];
}
function rsaDescriptionsVariantB(): string[] {
  return [
    "Limited-time 20% off site-wide. Ethically made. Free returns within 30 days.",
    "Shop wardrobe staples made to last. Rated 4.8/5. Ends soon.",
  ];
}

// ─── Daily metrics generator ────────────────────────────────────────

export type DemoDailyMetrics = {
  date: string; // YYYY-MM-DD
  impressions: number;
  clicks: number;
  cost: number; // dollars
  conversions: number;
  conversionValue: number;
};

/**
 * Generate one campaign's daily metrics across the last `days` days ending
 * today. Seeded per-campaign so the series is stable across requests.
 *
 * Shape features:
 *   - weekly cycle (Thu/Fri/Sat peak, Sun/Mon trough) via sinusoid on weekday
 *   - gentle noise via normal-ish sampling
 *   - "new_scaling" tag → linear ramp over the window
 *   - "budget_capped" tag → cost stays near budget, clicks ceiling in
 */
export function generateDemoDailyMetrics(
  campaign: DemoCampaign,
  days: number = DEMO_HISTORY_DAYS,
  now: Date = new Date(),
): DemoDailyMetrics[] {
  const rng = makeRng(hashSeed(`daily-${campaign.id}-${days}`));
  const result: DemoDailyMetrics[] = [];

  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(now);
    date.setUTCDate(date.getUTCDate() - i);
    const dateStr = formatDate(date);
    const weekday = date.getUTCDay(); // 0=Sun, 6=Sat
    // Slight weekly cycle: higher Thu (4) / Fri (5) / Sat (6), lower Sun/Mon.
    const weekdayFactor = 0.88 + 0.18 * Math.sin(((weekday + 2) / 7) * Math.PI * 2);

    let scaleFactor = weekdayFactor;

    if (campaign.storyTags.includes("new_scaling")) {
      // Smooth ramp from ~0.45x at day 0 of window to ~1.15x today.
      const progress = 1 - i / Math.max(days - 1, 1);
      scaleFactor *= 0.45 + progress * 0.7;
    }

    // Daily cost: mean ± ~8% noise, clamped to budget.
    const meanCost = campaign.avgDailyCost * scaleFactor;
    let cost = Math.max(0, rngNormal(rng, meanCost, meanCost * 0.08));
    if (campaign.storyTags.includes("budget_capped")) {
      // Hold near budget more tightly.
      cost = Math.min(cost, campaign.dailyBudget * rngFloat(rng, 0.95, 1.0));
    } else {
      cost = Math.min(cost, campaign.dailyBudget * 1.02);
    }

    // Clicks derived from cost and avg CPC with noise.
    const cpc = Math.max(0.05, rngNormal(rng, campaign.avgCpc, campaign.avgCpc * 0.08));
    const clicks = Math.max(0, Math.round(cost / cpc));
    // Impressions from clicks and CTR.
    const ctr = Math.max(0.001, rngNormal(rng, campaign.ctr, campaign.ctr * 0.06));
    const impressions = Math.max(clicks, Math.round(clicks / ctr));
    // Conversions from clicks and CVR.
    let cvr = Math.max(0, rngNormal(rng, campaign.cvr, campaign.cvr * 0.1));
    if (campaign.storyTags.includes("wasted_spend")) {
      // Cut CVR a bit — this is a "wasted spend" campaign in the narrative.
      cvr *= 0.75;
    }
    const conversions = Math.round(clicks * cvr * 10) / 10;
    const conversionValue = Math.round(conversions * campaign.aov * 100) / 100;

    result.push({
      date: dateStr,
      impressions,
      clicks,
      cost: Math.round(cost * 100) / 100,
      conversions,
      conversionValue,
    });
  }

  return result;
}

// ─── Search terms ───────────────────────────────────────────────────

export type DemoSearchTerm = {
  searchTerm: string;
  matchType: "EXACT" | "PHRASE" | "BROAD";
  impressions: number;
  clicks: number;
  cost: number;
  conversions: number;
  /** If true, converts; if false, drives 0-conv wasted spend. */
  converts: boolean;
  adGroupName: string;
};

const SEARCH_TERM_TEMPLATES: Record<string, { converts: string[]; wasted: string[]; adGroup: string }[]> = {
  "900000000001": [
    {
      adGroup: "Brand — Core",
      converts: ["threadline apparel", "threadline clothing review", "threadline jeans website", "buy threadline"],
      wasted: ["threadline reviews reddit", "threadline complaints", "threadline returns process"],
    },
  ],
  "900000000002": [
    {
      adGroup: "Men's Jeans",
      converts: ["mens slim fit dark jeans", "mens selvedge denim 34x32", "best mens stretch jeans"],
      wasted: [
        "how to repair torn jeans",
        "mens jeans size chart",
        "free mens jeans giveaway",
        "mens jeans cheap walmart",
        "mens jeans meme",
      ],
    },
    {
      adGroup: "Men's Shirts",
      converts: ["mens oxford button down", "chambray shirt mens medium"],
      wasted: [
        "how to iron a dress shirt",
        "mens shirts donation",
        "free mens flannel template",
        "mens button down wiki",
      ],
    },
    {
      adGroup: "Men's Outerwear",
      converts: ["waxed canvas field jacket medium", "buy mens peacoat navy"],
      wasted: [
        "how to wax canvas jacket",
        "field jacket history wiki",
        "cheap mens jackets goodwill",
      ],
    },
  ],
  "900000000003": [
    {
      adGroup: "Women's Dresses",
      converts: ["linen midi dress size 6", "wrap dress sustainable", "long sleeve midi dress"],
      wasted: ["diy midi dress pattern", "wrap dress tutorial", "dress rental nyc"],
    },
    {
      adGroup: "Women's Knitwear",
      converts: ["merino crewneck womens medium", "oversized cashmere cardigan"],
      wasted: ["how to wash merino wool", "knit cardigan pattern free"],
    },
    {
      adGroup: "Women's Jeans",
      converts: ["womens high waist straight jeans", "wide leg jeans size 28"],
      wasted: ["how to hem jeans", "womens jeans size chart"],
    },
  ],
  "900000000004": [
    {
      adGroup: "All Products — Shopping",
      converts: ["threadline merino sweater", "organic cotton tee womens", "cashmere cardigan sale"],
      wasted: ["discount clothing sites", "closeout apparel deals"],
    },
  ],
  "900000000005": [
    {
      adGroup: "Sitewide — Asset Group",
      converts: ["sustainable clothing brand", "ethical clothing basics", "organic cotton wardrobe"],
      wasted: [],
    },
  ],
};

/**
 * Generate a list of search terms for a campaign over the last `days` days.
 * Total cost ≈ fraction of the campaign's total cost. Wasted-spend campaigns
 * have more zero-conversion entries.
 */
export function generateDemoSearchTerms(
  campaign: DemoCampaign,
  days: number,
  limit: number,
): DemoSearchTerm[] {
  const rng = makeRng(hashSeed(`terms-${campaign.id}-${days}`));
  const dailies = generateDemoDailyMetrics(campaign, days);
  const totalCost = dailies.reduce((s, d) => s + d.cost, 0);
  const totalClicks = dailies.reduce((s, d) => s + d.clicks, 0);
  const totalImpressions = dailies.reduce((s, d) => s + d.impressions, 0);
  const totalConversions = dailies.reduce((s, d) => s + d.conversions, 0);

  const groups = SEARCH_TERM_TEMPLATES[campaign.id] ?? [];
  if (groups.length === 0) return [];

  const wastedWeight = campaign.storyTags.includes("wasted_spend") ? 0.45 : 0.12;
  const convWeight = 1 - wastedWeight;

  // Build weighted entries: each converting term gets weight ~1; each wasted term gets weight ~0.8.
  type Candidate = { text: string; adGroup: string; weight: number; converts: boolean };
  const candidates: Candidate[] = [];
  let convTotalWeight = 0;
  let wastedTotalWeight = 0;
  for (const g of groups) {
    for (const t of g.converts) {
      const w = 1.0 + rng() * 0.5;
      candidates.push({ text: t, adGroup: g.adGroup, weight: w, converts: true });
      convTotalWeight += w;
    }
    for (const t of g.wasted) {
      const w = 0.7 + rng() * 0.4;
      candidates.push({ text: t, adGroup: g.adGroup, weight: w, converts: false });
      wastedTotalWeight += w;
    }
  }

  const costBudgetConv = totalCost * convWeight;
  const costBudgetWasted = totalCost * wastedWeight;
  const clickBudgetConv = totalClicks * convWeight;
  const clickBudgetWasted = totalClicks * wastedWeight;
  const imprBudgetConv = totalImpressions * convWeight;
  const imprBudgetWasted = totalImpressions * wastedWeight;
  const convBudget = totalConversions; // wasted terms contribute 0

  const terms: DemoSearchTerm[] = candidates.map((c) => {
    const pool = c.converts
      ? { cost: costBudgetConv, clicks: clickBudgetConv, impr: imprBudgetConv, total: convTotalWeight || 1 }
      : { cost: costBudgetWasted, clicks: clickBudgetWasted, impr: imprBudgetWasted, total: wastedTotalWeight || 1 };
    const share = c.weight / pool.total;
    const termCost = Math.round(pool.cost * share * 100) / 100;
    const termClicks = Math.max(1, Math.round(pool.clicks * share));
    const termImpr = Math.max(termClicks, Math.round(pool.impr * share));
    const termConv = c.converts
      ? Math.round((convBudget * (c.weight / (convTotalWeight || 1))) * 10) / 10
      : 0;
    const matchType: "EXACT" | "PHRASE" | "BROAD" = c.converts ? "PHRASE" : rng() < 0.5 ? "BROAD" : "PHRASE";
    return {
      searchTerm: c.text,
      matchType,
      impressions: termImpr,
      clicks: termClicks,
      cost: termCost,
      conversions: termConv,
      converts: c.converts,
      adGroupName: c.adGroup,
    };
  });

  // Sort by cost desc (matches the real API's ORDER BY) and trim.
  return terms.sort((a, b) => b.cost - a.cost).slice(0, limit);
}

// ─── Keywords ───────────────────────────────────────────────────────

export type DemoKeywordRow = {
  criterionId: string;
  adGroupId: string;
  adGroupName: string;
  text: string;
  matchType: "EXACT" | "PHRASE" | "BROAD";
  status: "ENABLED" | "PAUSED";
  qualityScore: number | null;
  impressions: number;
  clicks: number;
  ctr: number;
  cost: number;
  averageCpc: number;
  conversions: number;
  /** first-page / first-position cpc estimates in dollars */
  firstPageCpc: number | null;
  firstPositionCpc: number | null;
};

export function generateDemoKeywords(
  campaign: DemoCampaign,
  days: number,
  limit: number,
): DemoKeywordRow[] {
  const groups = demoAdGroups(campaign.id).filter((g) => g.type === "SEARCH_STANDARD");
  if (groups.length === 0) return [];

  const rng = makeRng(hashSeed(`keywords-${campaign.id}-${days}`));
  const dailies = generateDemoDailyMetrics(campaign, days);
  const totalCost = dailies.reduce((s, d) => s + d.cost, 0);
  const totalClicks = dailies.reduce((s, d) => s + d.clicks, 0);
  const totalImpressions = dailies.reduce((s, d) => s + d.impressions, 0);
  const totalConversions = dailies.reduce((s, d) => s + d.conversions, 0);

  const rows: DemoKeywordRow[] = [];
  let criterionSeq = 1001;
  for (const group of groups) {
    const groupCost = totalCost * group.costShare;
    const groupClicks = totalClicks * group.costShare;
    const groupImpr = totalImpressions * group.costShare;
    const groupConv = totalConversions * group.costShare;
    for (const kw of group.keywords) {
      const cost = Math.round(groupCost * kw.costShare * 100) / 100;
      const clicks = Math.max(0, Math.round(groupClicks * kw.costShare));
      const impr = Math.max(clicks, Math.round(groupImpr * kw.costShare));
      const conv = Math.round(groupConv * kw.costShare * 10) / 10;
      const avgCpc = clicks > 0 ? Math.round((cost / clicks) * 100) / 100 : 0;
      rows.push({
        criterionId: String(criterionSeq++),
        adGroupId: group.id,
        adGroupName: group.name,
        text: kw.text,
        matchType: kw.matchType,
        status: "ENABLED",
        qualityScore: kw.qualityScore,
        impressions: impr,
        clicks,
        ctr: impr > 0 ? clicks / impr : 0,
        cost,
        averageCpc: avgCpc,
        conversions: conv,
        firstPageCpc: Math.round(avgCpc * rngFloat(rng, 0.55, 0.75) * 100) / 100,
        firstPositionCpc: Math.round(avgCpc * rngFloat(rng, 1.3, 1.7) * 100) / 100,
      });
    }
  }
  return rows.sort((a, b) => b.impressions - a.impressions).slice(0, limit);
}

// ─── Negative keywords ──────────────────────────────────────────────

const NEGATIVE_KEYWORDS: Record<string, readonly { text: string; matchType: "EXACT" | "PHRASE" | "BROAD" }[]> = {
  "900000000002": [
    { text: "free", matchType: "BROAD" },
    { text: "cheap", matchType: "BROAD" },
    { text: "walmart", matchType: "BROAD" },
    { text: "meme", matchType: "BROAD" },
  ],
  "900000000003": [
    { text: "rental", matchType: "BROAD" },
    { text: "diy", matchType: "BROAD" },
    { text: "pattern", matchType: "PHRASE" },
  ],
};
export function demoNegativeKeywords(campaignId: string) {
  const list = NEGATIVE_KEYWORDS[campaignId] ?? [];
  return list.map((n, i) => ({
    criterionId: `${campaignId}${String(3000 + i).padStart(4, "0")}`,
    text: n.text,
    matchType: n.matchType,
  }));
}

// ─── Recommendations ────────────────────────────────────────────────

export function demoRecommendations() {
  return [
    { type: "KEYWORD", campaignId: "900000000002" }, // add keyword to Men's
    { type: "TEXT_AD", campaignId: "900000000003" }, // new ad variant
    { type: "CAMPAIGN_BUDGET", campaignId: "900000000003" }, // budget-capped
    { type: "MAXIMIZE_CONVERSIONS_OPT_IN", campaignId: "900000000005" }, // PMax
    { type: "OPTIMIZE_AD_ROTATION", campaignId: "900000000002" },
  ];
}

// ─── Impression share helper ────────────────────────────────────────

export function demoImpressionShare(campaign: DemoCampaign, days: number) {
  const dailies = generateDemoDailyMetrics(campaign, days);
  const totalImpressions = dailies.reduce((s, d) => s + d.impressions, 0);
  const totalClicks = dailies.reduce((s, d) => s + d.clicks, 0);
  const totalCost = dailies.reduce((s, d) => s + d.cost, 0);
  return {
    impressionShare: campaign.searchImpressionShare,
    absoluteTopImpressionShare:
      campaign.searchImpressionShare != null ? Math.max(0, campaign.searchImpressionShare - 0.25) : null,
    topImpressionShare:
      campaign.searchImpressionShare != null ? Math.max(0, campaign.searchImpressionShare - 0.10) : null,
    exactMatchImpressionShare:
      campaign.searchImpressionShare != null ? Math.min(1, campaign.searchImpressionShare + 0.06) : null,
    budgetLostImpressionShare: campaign.budgetLostIS,
    rankLostImpressionShare: campaign.rankLostIS,
    totalImpressions,
    totalClicks,
    totalCost,
  };
}

// ─── Utility: round-trip an rng without affecting callers ──────────

/** Convenience for tests — same seed, fresh rng. */
export function demoRngFor(seed: string): Rng {
  return makeRng(hashSeed(seed));
}

/** Used by rngInt consumers in tests. */
export { rngInt };
