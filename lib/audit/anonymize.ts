/**
 * Audit anonymizer — converts an AuditResult (which may contain account
 * names, campaign names, and exact spend) into a render-ready
 * SharedAuditPayload safe to persist in the `shared_audits` table.
 *
 * Phase 1 auto-save always anonymizes with the default (paranoid) settings
 * — even for private rows — so that if a row is ever flipped to
 * visibility='public' in Phase 2, zero data-leakage risk comes along for
 * the ride. The `show*` booleans on ShareSettings are wired but unused
 * by Phase 1; they exist so the Phase 2 UI toggle path is additive-only.
 *
 * Pure, deterministic. No imports of server-only modules so this is safe
 * to run anywhere (server action, CLI, tests).
 */

import type {
  AuditResult,
  PassItem,
  PulseMetrics,
} from "./scoring";

// ─── Types ───────────────────────────────────────────────────────────

export type ShareSettings = {
  showCampaignNames: boolean;
  showSpend: boolean;
  showExactSpend: boolean;
};

export const DEFAULT_SHARE_SETTINGS: ShareSettings = {
  showCampaignNames: false,
  showSpend: true,
  showExactSpend: false,
};

/**
 * Anonymized pass item. Structurally identical to PassItem except:
 * - campaignId/adGroupId/targetId stripped (reconnecting account-scoped
 *   IDs across a public share leaks account identity via replay).
 * - estimatedMonthlySavings rounded by magnitude.
 * - campaign name references in `action`/`impact` are rewritten through
 *   the campaign-name map.
 */
export type SharedPassItem = {
  action: string;
  impact: string;
  actionType?: PassItem["actionType"];
  estimatedMonthlySavings?: number; // rounded
};

export type SharedPasses = {
  stopWasting: SharedPassItem[];
  captureMore: SharedPassItem[];
  fixFundamentals: SharedPassItem[];
};

/**
 * Render-ready shape. Intentionally structurally similar to AuditResult's
 * subset we actually render (scorecard + passes + verdict) so the shared
 * Scorecard components can take a small payload union.
 *
 * Omitted from AuditResult: `dimensions` (internal 0-5 detail), `topActions`
 * (duplicated by `passes`), raw `wastedSearchTerms`, `zeroCvCampaigns` with
 * ids, and the full `impressionShareDiagnosis` keyword drilldown. If a
 * Phase 2 screen needs any of this, add it explicitly — don't leak the
 * full `AuditResult`.
 */
export type SharedAuditPayload = {
  /** Payload schema version. Bump when shape changes so readers can migrate. */
  version: 1;
  anonymizedAt: string; // ISO timestamp
  accountLabel: string; // always "Account" — no raw name
  category: AuditResult["category"];
  overallScore: number;
  pulseMetrics: PulseMetrics;
  verdict: string;
  passes: SharedPasses;
  keyNumbers: {
    /** If showSpend=false, omitted. If showExactSpend=true, raw number. Otherwise banded string. */
    totalSpend: { band: string; exact?: number } | null;
    conversions: number;
    cpa: number | null;
    /** Obfuscated per the campaign-name map (e.g. "Campaign A"). */
    topCampaign: string | null;
    wastedSpend: { band: string; exact?: number } | null;
  };
  /** For list-page preview: banded wasted-spend plus rounded annualized. */
  wastedSpend: {
    total: { band: string; exact?: number } | null;
    pct: number;
    annualizedBand: string | null;
  };
  settings: ShareSettings;
};

// ─── Helpers ─────────────────────────────────────────────────────────

/** Alphabet mapping: 0 → A, 1 → B, ..., 25 → Z, 26 → AA, 27 → AB, ... */
function campaignLetter(i: number): string {
  if (i < 26) return String.fromCharCode(65 + i);
  const first = Math.floor(i / 26) - 1;
  const second = i % 26;
  return String.fromCharCode(65 + first) + String.fromCharCode(65 + second);
}

/**
 * Builds a deterministic map `rawName → "Campaign A" | "Campaign B" | ...`
 * preserving first-seen order. If showCampaignNames is true, the map is
 * identity (raw names pass through).
 */
export function buildCampaignNameMap(
  rawNames: string[],
  showCampaignNames: boolean,
): Map<string, string> {
  const map = new Map<string, string>();
  let i = 0;
  for (const raw of rawNames) {
    if (!raw || map.has(raw)) continue;
    if (showCampaignNames) {
      map.set(raw, raw);
    } else {
      map.set(raw, `Campaign ${campaignLetter(i)}`);
      i += 1;
    }
  }
  return map;
}

/** Rewrites any occurrences of raw campaign names in `text` to anonymized labels. */
function rewriteCampaignMentions(
  text: string,
  nameMap: Map<string, string>,
): string {
  if (!text || nameMap.size === 0) return text;
  let out = text;
  // Sort by length desc so "Brand – US Search" is replaced before "US" if
  // a shorter name would otherwise match greedily inside a longer one.
  const entries = [...nameMap.entries()].sort(
    (a, b) => b[0].length - a[0].length,
  );
  for (const [raw, label] of entries) {
    if (raw === label) continue; // identity passthrough
    // Escape regex metachars in raw campaign names.
    const escaped = raw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out = out.replace(new RegExp(escaped, "g"), label);
  }
  return out;
}

/**
 * Bands a monthly spend figure into a coarse label. Brackets are chosen
 * to be informative to a peer SMB owner without pinpointing spend.
 */
export function bandSpend(amount: number): string {
  if (!Number.isFinite(amount) || amount <= 0) return "$0";
  if (amount < 500) return "< $500/mo";
  if (amount < 1000) return "$500–$1k/mo";
  if (amount < 5000) return "$1k–$5k/mo";
  if (amount < 10000) return "$5k–$10k/mo";
  if (amount < 25000) return "$10k–$25k/mo";
  if (amount < 50000) return "$25k–$50k/mo";
  if (amount < 100000) return "$50k–$100k/mo";
  if (amount < 250000) return "$100k–$250k/mo";
  if (amount < 1_000_000) return "$250k–$1M/mo";
  return "$1M+/mo";
}

export function bandAnnualized(amount: number): string {
  if (!Number.isFinite(amount) || amount <= 0) return "$0";
  if (amount < 10_000) return "< $10k/yr";
  if (amount < 50_000) return "$10k–$50k/yr";
  if (amount < 100_000) return "$50k–$100k/yr";
  if (amount < 500_000) return "$100k–$500k/yr";
  if (amount < 1_000_000) return "$500k–$1M/yr";
  return "$1M+/yr";
}

/**
 * Round estimatedMonthlySavings by magnitude:
 *  < $500      → nearest $50
 *  < $5,000    → nearest $500
 *  >= $5,000   → nearest $5,000
 * Mirrors the way a founder would quote a savings estimate out loud.
 */
export function roundSavings(amount: number): number {
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  if (amount < 500) return Math.round(amount / 50) * 50;
  if (amount < 5000) return Math.round(amount / 500) * 500;
  return Math.round(amount / 5000) * 5000;
}

function spendField(
  amount: number,
  settings: ShareSettings,
): { band: string; exact?: number } | null {
  if (!settings.showSpend) return null;
  if (!Number.isFinite(amount)) return { band: "$0" };
  const field: { band: string; exact?: number } = { band: bandSpend(amount) };
  if (settings.showExactSpend) field.exact = Math.round(amount * 100) / 100;
  return field;
}

function anonymizePass(
  items: readonly PassItem[] | undefined,
  nameMap: Map<string, string>,
): SharedPassItem[] {
  if (!items || items.length === 0) return [];
  return items.map((it) => {
    const out: SharedPassItem = {
      action: rewriteCampaignMentions(it.action ?? "", nameMap),
      impact: rewriteCampaignMentions(it.impact ?? "", nameMap),
    };
    if (it.actionType) out.actionType = it.actionType;
    if (typeof it.estimatedMonthlySavings === "number") {
      out.estimatedMonthlySavings = roundSavings(it.estimatedMonthlySavings);
    }
    return out;
  });
}

// ─── Main ────────────────────────────────────────────────────────────

export function anonymizeAuditResult(
  result: AuditResult,
  settings: ShareSettings = DEFAULT_SHARE_SETTINGS,
): SharedAuditPayload {
  // Collect every campaign name we might need to rewrite: key numbers,
  // impression-share breakdown, zeroCvCampaigns, wastedSearchTerms.
  const rawNames: string[] = [];
  const pushName = (n: string | null | undefined) => {
    if (n && typeof n === "string") rawNames.push(n);
  };
  pushName(result.keyNumbers?.topCampaign);
  for (const c of result.impressionShareDiagnosis?.campaignBreakdown ?? []) {
    pushName(c.campaignName);
  }
  for (const c of result.zeroCvCampaigns ?? []) pushName(c.name);
  for (const t of result.wastedSearchTerms ?? []) pushName(t.campaignName);

  const nameMap = buildCampaignNameMap(rawNames, settings.showCampaignNames);

  const totalSpend = result.keyNumbers?.totalSpend ?? 0;
  const wastedTotal = result.wastedSpend?.total ?? 0;
  const wastedAnnualized = result.wastedSpend?.annualized ?? 0;

  return {
    version: 1,
    anonymizedAt: new Date().toISOString(),
    accountLabel: "Account",
    category: result.category,
    overallScore: Math.round(result.overallScore ?? 0),
    pulseMetrics: {
      wasteRate: result.pulseMetrics?.wasteRate ?? 0,
      demandCaptured: result.pulseMetrics?.demandCaptured ?? null,
      cpa: result.pulseMetrics?.cpa ?? null,
    },
    verdict: rewriteCampaignMentions(result.verdict ?? "", nameMap),
    passes: {
      stopWasting: anonymizePass(result.passes?.stopWasting, nameMap),
      captureMore: anonymizePass(result.passes?.captureMore, nameMap),
      fixFundamentals: anonymizePass(result.passes?.fixFundamentals, nameMap),
    },
    keyNumbers: {
      totalSpend: spendField(totalSpend, settings),
      conversions: Math.round(result.keyNumbers?.conversions ?? 0),
      cpa: result.keyNumbers?.cpa ?? null,
      topCampaign: result.keyNumbers?.topCampaign
        ? nameMap.get(result.keyNumbers.topCampaign) ?? null
        : null,
      wastedSpend: spendField(wastedTotal, settings),
    },
    wastedSpend: {
      total: spendField(wastedTotal, settings),
      pct: result.wastedSpend?.pct ?? 0,
      annualizedBand: settings.showSpend && wastedAnnualized > 0
        ? bandAnnualized(wastedAnnualized)
        : null,
    },
    settings: { ...settings },
  };
}
