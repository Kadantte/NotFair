import { mcpRpcAutoRefresh } from "@/server/mcp/rpc";
import type { SuggestionDraft } from "@/server/db/suggestions";

/**
 * Mechanical X Ads account audit → grounded goal suggestions.
 *
 * Same trust model as goal metrics: the platform runs the queries itself
 * (no agent self-reporting), so every number in a suggestion's rationale
 * is real account data. The audit is one `runScript` call against the
 * notfair-xads MCP; the heuristics below turn its snapshot into at most
 * three proposals. The goal agent re-verifies everything at intake, so
 * suggestions only need to be directionally right.
 */

export const XADS_SOURCE_KEY = "notfair-xads";

type ToolCallResult = {
  content?: Array<{ type?: string; text?: string }>;
  isError?: boolean;
};

export type XadsSnapshot = {
  account: { name: string; currency: string };
  counts: {
    campaigns: number;
    activeCampaigns: number;
    lineItems: number;
    activeLineItems: number;
  };
  activeDailyBudget: number;
  /** Trailing-30-day totals across all line items. */
  last30d: {
    spend: number;
    impressions: number;
    engagements: number;
    linkClicks: number;
    conversions: number;
    /** Spend on line items that took budget but produced zero engagement. */
    wastedSpend: number;
  };
  /** Trailing-7-day totals (the most recent stats chunk). */
  last7d: { spend: number; impressions: number };
  topSpenders: Array<{ name: string; spend: number; conversions: number }>;
};

/**
 * The audit script. X Ads sync stats allow at most 7 days + 1 hour per
 * request, so the 30-day window runs as five sequential chunks; line
 * items batch 20 ids per stats call (API limit).
 */
const AUDIT_SCRIPT = `
const r = await ads.getParallel([
  { name: 'account', path: 'accounts/{accountId}' },
  { name: 'campaigns', path: 'accounts/{accountId}/campaigns', paged: true },
  { name: 'lineItems', path: 'accounts/{accountId}/line_items', paged: true },
]);
for (const k of ['account', 'campaigns', 'lineItems']) {
  if (!r[k] || !r[k].ok) throw new Error('X Ads audit: ' + k + ' fetch failed: ' + JSON.stringify(r[k] && r[k].error));
}
// Unpaged gets keep the raw response envelope; the entity is one level down.
const account = (r.account.data && r.account.data.data) || r.account.data || {};
const campaigns = r.campaigns.data || [];
const lineItems = r.lineItems.data || [];
const activeLineItems = lineItems.filter(li => li.entity_status === 'ACTIVE');

const ENGAGEMENT_KEYS = ['follows','app_clicks','retweets','likes','engagements','clicks','card_engagements','replies','link_clicks','billed_engagements','carousel_swipes'];
const CONVERSION_KEYS = ['conversion_purchases','conversion_sign_ups','conversion_site_visits','conversion_downloads','conversion_custom'];
// Metric values vary by group: ENGAGEMENT/BILLING come back as plain
// arrays ([574452]), WEB_CONVERSION as {metric: [...]} objects. Read both.
const sum = (m, k) => {
  const v = m[k];
  const arr = Array.isArray(v) ? v : (v && Array.isArray(v.metric) ? v.metric : []);
  return arr.reduce((a, b) => a + Number(b || 0), 0);
};

// Per-line-item accumulators over 30 days.
const acc = {};
for (const li of lineItems) acc[li.id] = { spendMicros: 0, impressions: 0, engagements: 0, linkClicks: 0, conversions: 0 };

const end = new Date(); end.setUTCMinutes(0, 0, 0);
// 30 days as hour-aligned chunks inside the 7d+1h API limit: the first
// chunk is exactly the trailing 7 days (168h), the rest split the
// remaining 23 days into 138h slices. 168 + 4*138 = 720h = 30 days.
const HOUR = 3600000;
const bounds = [0, 168, 306, 444, 582, 720];
let spend7dMicros = 0, impressions7d = 0;
for (let chunk = 0; chunk < bounds.length - 1; chunk++) {
  const chunkEnd = new Date(end.getTime() - bounds[chunk] * HOUR);
  const chunkStart = new Date(end.getTime() - bounds[chunk + 1] * HOUR);
  const win = { start_time: ads.helpers.formatHourIso(chunkStart), end_time: ads.helpers.formatHourIso(chunkEnd) };
  for (let i = 0; i < lineItems.length; i += 20) {
    const ids = lineItems.slice(i, i + 20).map(li => li.id);
    const stats = await ads.stats({
      entity: 'LINE_ITEM', entity_ids: ids,
      metric_groups: ['BILLING', 'ENGAGEMENT', 'WEB_CONVERSION'],
      granularity: 'TOTAL', ...win,
    });
    for (const row of (stats.data || [])) {
      const m = (row.id_data && row.id_data[0] && row.id_data[0].metrics) || {};
      const a = acc[row.id]; if (!a) continue;
      const spendMicros = sum(m, 'billed_charge_local_micro');
      a.spendMicros += spendMicros;
      a.impressions += sum(m, 'impressions');
      a.engagements += ENGAGEMENT_KEYS.reduce((t, k) => t + sum(m, k), 0);
      a.linkClicks += sum(m, 'link_clicks');
      a.conversions += CONVERSION_KEYS.reduce((t, k) => t + sum(m, k), 0);
      if (chunk === 0) { spend7dMicros += spendMicros; impressions7d += sum(m, 'impressions'); }
    }
  }
}

const usd = micros => Number(ads.helpers.microsToMajor(micros).toFixed(2));
let spendMicros = 0, impressions = 0, engagements = 0, linkClicks = 0, conversions = 0, wastedMicros = 0;
const spenders = [];
for (const li of lineItems) {
  const a = acc[li.id];
  spendMicros += a.spendMicros; impressions += a.impressions;
  engagements += a.engagements; linkClicks += a.linkClicks; conversions += a.conversions;
  if (a.spendMicros > 0 && a.engagements === 0) wastedMicros += a.spendMicros;
  if (a.spendMicros > 0) spenders.push({ name: li.name, spend: usd(a.spendMicros), conversions: a.conversions });
}
spenders.sort((a, b) => b.spend - a.spend);

return {
  account: { name: account.name || 'your X Ads account', currency: 'USD' },
  counts: {
    campaigns: campaigns.length,
    activeCampaigns: campaigns.filter(c => c.entity_status === 'ACTIVE').length,
    lineItems: lineItems.length,
    activeLineItems: activeLineItems.length,
  },
  activeDailyBudget: usd(activeLineItems.reduce((t, li) => t + (li.daily_budget_amount_local_micro || 0), 0)),
  last30d: {
    spend: usd(spendMicros), impressions, engagements, linkClicks, conversions,
    wastedSpend: usd(wastedMicros),
  },
  last7d: { spend: usd(spend7dMicros), impressions: impressions7d },
  topSpenders: spenders.slice(0, 3),
};
`;

export async function auditXadsAccount(project_slug: string): Promise<XadsSnapshot> {
  const rpc = await mcpRpcAutoRefresh<ToolCallResult>(
    project_slug,
    XADS_SOURCE_KEY,
    "tools/call",
    { name: "runScript", arguments: { timeoutMs: 45_000, code: AUDIT_SCRIPT } },
    { timeoutMs: 60_000 },
  );
  if (!rpc.ok) {
    const detail = "message" in rpc && rpc.message ? `: ${rpc.message}` : "";
    throw new Error(`X Ads audit failed (${rpc.kind}${detail})`);
  }
  const text = rpc.result?.content?.find((c) => c.type === "text")?.text ?? "";
  if (rpc.result?.isError) {
    throw new Error(`X Ads audit script errored: ${text.slice(0, 400)}`);
  }
  const envelope = JSON.parse(text) as { ok?: boolean; result?: XadsSnapshot; error?: { message?: string } };
  if (!envelope.ok || !envelope.result) {
    throw new Error(`X Ads audit script failed: ${envelope.error?.message ?? text.slice(0, 400)}`);
  }
  return envelope.result;
}

const money = (n: number) => `$${n % 1 === 0 ? n : n.toFixed(2)}`;

/**
 * Snapshot → at most three proposals, priority-ordered. `liveGoalStatements`
 * lets each heuristic skip territory an existing goal already owns (the
 * user may have stated it by hand — don't pitch them their own goal).
 */
export function xadsSuggestionsFromSnapshot(
  s: XadsSnapshot,
  liveGoalStatements: string[],
): SuggestionDraft[] {
  const overlaps = (re: RegExp) => liveGoalStatements.some((st) => re.test(st));
  const out: SuggestionDraft[] = [];
  const d = s.last30d;

  // Nothing in the account yet → one bootstrap proposal and stop.
  if (s.counts.lineItems === 0) {
    if (!overlaps(/launch|first campaign/i)) {
      out.push({
        kind: "xads-bootstrap",
        title: "Launch your first X Ads campaign",
        statement:
          "Launch our first X Ads campaign and get it delivering — reaching real impressions within a week.",
        mode: "achieve",
        rationale: `The connected X Ads account (${s.account.name}) has no campaigns or ad groups yet.`,
      });
    }
    return out;
  }

  // Spending but some of it buys zero engagement → cut the waste.
  if (d.wastedSpend > 0 && !overlaps(/wast\w* spend|no.engagement/i)) {
    out.push({
      kind: "xads-wasted-spend",
      title: "Cut wasted X Ads spend to $0",
      statement: `Cut X Ads wasted spend to $0 and keep it there — pause line items that spend without producing a single engagement.`,
      mode: "maintain",
      rationale: `${money(d.wastedSpend)} of the last 30 days' ${money(d.spend)} X Ads spend went to line items with zero engagements.`,
    });
  }

  // Active entities but the account isn't actually delivering.
  if (
    s.counts.activeLineItems > 0 &&
    s.last7d.impressions === 0 &&
    !overlaps(/deliver|impression|reviv/i)
  ) {
    out.push({
      kind: "xads-dormant",
      title: "Get X Ads delivering again",
      statement: `Revive the X Ads account: get the active campaigns actually serving, with steady daily impressions.`,
      mode: "achieve",
      rationale: `${s.counts.activeLineItems} of ${s.counts.lineItems} line items are ACTIVE with ${money(s.activeDailyBudget)}/day of budget, but the account served 0 impressions in the last 7 days.`,
    });
  }

  // Converting → push cost per conversion down.
  if (d.conversions > 0 && d.spend > 0 && !overlaps(/cost per|cpa|per conversion/i)) {
    const cpa = d.spend / d.conversions;
    out.push({
      kind: "xads-cpa",
      title: "Lower X Ads cost per conversion",
      statement: `Lower our X Ads cost per conversion below ${money(Math.floor(cpa * 0.8))} (currently ${money(Number(cpa.toFixed(2)))}).`,
      mode: "achieve",
      rationale: `Last 30 days: ${money(d.spend)} spend for ${d.conversions} conversions = ${money(Number(cpa.toFixed(2)))} per conversion.`,
    });
  }

  // Spending and getting clicks but conversions never report → tracking gap.
  if (d.spend > 0 && d.linkClicks > 0 && d.conversions === 0 && !overlaps(/conversion|tracking/i)) {
    out.push({
      kind: "xads-no-conversions",
      title: "Get X Ads conversions reporting",
      statement: `Get X Ads conversion tracking working end to end — the account should report at least one conversion from paid traffic.`,
      mode: "achieve",
      rationale: `${money(d.spend)} spend and ${d.linkClicks} link clicks in 30 days, but 0 conversions recorded — either tracking is broken or the funnel is.`,
    });
  }

  return out.slice(0, 3);
}
