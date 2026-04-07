/**
 * Multi-signal search term waste analysis.
 *
 * Replaces the naive "zero conversions = wasted" heuristic with a model
 * that combines semantic intent signals, keyword overlap, and statistical
 * context to distinguish genuinely irrelevant queries from relevant ones
 * that just haven't converted yet.
 */

// ─── Types ───────────────────────────────────────────────────────────

export type WasteClassification =
  | "confirmed_waste"  // semantic low-intent pattern, high confidence → add as negative
  | "likely_waste"     // strong statistical signals, no keyword overlap
  | "possible_waste"   // some waste signals but ambiguous or low data
  | "likely_relevant"; // shares keyword words or is a geo variant — don't flag

export interface SearchTermWasteAnalysis {
  searchTerm: string;
  wasteScore: number;       // 0-100, higher = more wasteful
  classification: WasteClassification;
  confidence: "high" | "medium" | "low";
  reason: string;           // short human-readable explanation
  cost: number;
  clicks: number;
  campaignName: string;
  campaignId: string;
  adGroupName: string;
}

interface SearchTermData {
  searchTerm: string;
  impressions: number;
  clicks: number;
  cost: number;
  conversions: number;
  campaignName: string;
  campaignId: string;
  adGroupName: string;
}

// ─── Low-intent pattern dictionary ──────────────────────────────────

const LOW_INTENT_PATTERNS: Record<string, string[]> = {
  "job seeker": [
    "job", "jobs", "career", "careers", "hiring", "salary", "salaries",
    "how to become", "how to be a", "how to get into", "training program",
    "certification", "apprenticeship", "internship", "entry level",
    "part time", "full time", "work from home", "remote",
  ],
  "researcher": [
    "what is", "what are", "define", "definition", "meaning of",
    "history of", "how does", "why does", "wikipedia", "explained",
    "who invented", "when was", "vs ", " vs", "difference between",
    "compared to", "is it worth", "should i",
  ],
  "freebie seeker": [
    "free", "diy", "do it yourself", "template", "sample", "example",
  ],
  "how-to seeker": [
    "how to", "tutorial", "step by step",
  ],
};

// Words that don't carry business-domain meaning
const STOP_WORDS = new Set([
  "a", "an", "the", "for", "in", "near", "me", "my", "i", "best", "top",
  "good", "great", "cheap", "affordable", "local", "and", "or", "to", "of",
  "at", "on", "with", "by", "is", "it", "be", "do", "get", "your",
]);

// Geographic qualifiers that don't change the core query intent
const GEO_PATTERNS = [
  /\bnear\s+me\b/g,
  /\bnearby\b/g,
  /\bnear\s*by\b/g,
  /\bin\s+my\s+area\b/g,
  /\baround\s+me\b/g,
  /\bclosest\s*(to\s+me)?\b/g,
];

// ─── Text helpers ─────────────────────────────────────────────────────

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 1);
}

function getMeaningfulWords(text: string): string[] {
  return tokenize(text).filter((w) => !STOP_WORDS.has(w) && w.length > 2);
}

function detectLowIntentPattern(termLower: string): string | null {
  for (const [category, patterns] of Object.entries(LOW_INTENT_PATTERNS)) {
    for (const pattern of patterns) {
      const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
      const regex = new RegExp(`\\b${escaped}\\b`);
      if (regex.test(termLower)) return category;
    }
  }
  return null;
}

/** Returns true if the search term shares at least one meaningful word with any active keyword. */
function sharesCoreWords(termLower: string, activeKeywords: string[]): boolean {
  const termWords = new Set(getMeaningfulWords(termLower));
  if (termWords.size === 0) return false;
  for (const kw of activeKeywords) {
    const kwWords = getMeaningfulWords(kw);
    if (kwWords.some((w) => termWords.has(w))) return true;
  }
  return false;
}

/**
 * Returns true if the term is a geographic variant of a core keyword.
 * E.g. "dog boarding near me" or "dog boarding san francisco" where
 * "dog boarding" matches an active keyword.
 */
function isGeoVariant(termLower: string, activeKeywords: string[]): boolean {
  let stripped = termLower;
  for (const pattern of GEO_PATTERNS) {
    stripped = stripped.replace(pattern, "").trim();
  }
  // strip trailing 2-3 char state/city abbreviation: "dog boarding ny", "dog boarding sf"
  stripped = stripped.replace(/\s+[a-z]{2,3}$/, "").trim();

  if (stripped === termLower || stripped.length < 3) return false;
  return sharesCoreWords(stripped, activeKeywords);
}

// ─── Main export ─────────────────────────────────────────────────────

/**
 * Analyzes a single search term and returns a structured waste assessment.
 *
 * @param term         The search term and its performance metrics
 * @param activeKeywords  Array of active keyword texts from the account
 * @param accountAvgCtr   Account-level CTR (clicks / impressions)
 * @param accountAvgCpc   Account-level CPC (cost / clicks)
 */
export function analyzeSearchTermWaste(
  term: SearchTermData,
  activeKeywords: string[],
  accountAvgCtr: number,
  accountAvgCpc: number,
): SearchTermWasteAnalysis {
  // Terms with conversions are never waste
  if (term.conversions > 0) {
    return make(term, 0, "likely_relevant", "high", "Has conversions");
  }

  // Insufficient data — don't judge
  if (term.impressions < 30 || term.cost < 5 || term.clicks < 2) {
    return make(term, 10, "possible_waste", "low", "Insufficient data to judge");
  }

  const termLower = term.searchTerm.toLowerCase();

  // Geo variant of a core keyword → always relevant
  if (isGeoVariant(termLower, activeKeywords)) {
    return make(term, 5, "likely_relevant", "high", "Geographic variant of a core keyword");
  }

  const hasKeywordOverlap = sharesCoreWords(termLower, activeKeywords);
  const lowIntentCategory = detectLowIntentPattern(termLower);

  // Semantic low-intent pattern found
  if (lowIntentCategory) {
    // Still dampen if term also shares core keyword words (e.g. "dog grooming jobs"
    // for a grooming salon — low-intent but overlaps)
    const score = hasKeywordOverlap ? 55 : 85;
    const classification: WasteClassification = score >= 70 ? "confirmed_waste" : "likely_waste";
    const confidence = term.impressions >= 100 ? "high" : "medium";
    return make(term, score, classification, confidence, `Low-intent: ${lowIntentCategory}`);
  }

  // Term shares words with active keywords — don't flag as waste regardless of stats
  if (hasKeywordOverlap) {
    return make(term, 15, "likely_relevant", "medium", "Matches active keyword topics");
  }

  // ─── Statistical scoring (for terms with no semantic signal) ──────

  const ctr = term.impressions > 0 ? term.clicks / term.impressions : 0;
  const cpc = term.clicks > 0 ? term.cost / term.clicks : 0;

  const ctrRatio = accountAvgCtr > 0 ? ctr / accountAvgCtr : 1;
  const cpcRatio = accountAvgCpc > 0 ? cpc / accountAvgCpc : 1;

  // CTR component: poor CTR relative to account = lower relevance signal
  const ctrPoints = ctrRatio < 0.3 ? 40 : ctrRatio < 0.6 ? 25 : ctrRatio < 1.0 ? 10 : 0;

  // CPC component: paying above avg with no return = higher waste
  const cpcPoints = cpcRatio > 2.5 ? 30 : cpcRatio > 1.5 ? 15 : 0;

  // Cost volume: more spend = more urgency
  const costPoints = term.cost > 50 ? 20 : term.cost > 20 ? 10 : 5;

  const wasteScore = Math.min(100, ctrPoints + cpcPoints + costPoints);

  let classification: WasteClassification;
  let confidence: "high" | "medium" | "low";

  if (wasteScore >= 70 && term.impressions >= 100) {
    classification = "likely_waste";
    confidence = "medium";
  } else if (wasteScore >= 40) {
    classification = "possible_waste";
    confidence = "low";
  } else {
    classification = "likely_relevant";
    confidence = "low";
  }

  return make(term, wasteScore, classification, confidence, buildReason(ctrRatio, cpcRatio, term.cost));
}

function buildReason(ctrRatio: number, cpcRatio: number, cost: number): string {
  const parts: string[] = [];
  if (ctrRatio < 0.5) parts.push("very low CTR");
  if (cpcRatio > 1.5) parts.push("high CPC vs avg");
  if (cost > 20) parts.push(`$${cost.toFixed(0)} spent with no result`);
  return parts.join(", ") || "no conversions";
}

function make(
  term: SearchTermData,
  wasteScore: number,
  classification: WasteClassification,
  confidence: "high" | "medium" | "low",
  reason: string,
): SearchTermWasteAnalysis {
  return {
    searchTerm: term.searchTerm,
    wasteScore,
    classification,
    confidence,
    reason,
    cost: term.cost,
    clicks: term.clicks,
    campaignName: term.campaignName,
    campaignId: term.campaignId,
    adGroupName: term.adGroupName,
  };
}
