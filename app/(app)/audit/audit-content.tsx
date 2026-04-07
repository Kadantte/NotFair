"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, AlertTriangle, TrendingDown, Target, Zap, Loader2 } from "lucide-react";
import type { AuditOverview, AuditDetails } from "./actions";
import { pauseCampaignAction, addNegativeKeywordAction, pauseKeywordAction } from "./actions";
import type { AuditResult, DimensionScore } from "@/lib/audit/scoring";

// ─── Helpers ─────────────────────────────────────────────────────────

function fmt$(n: number): string {
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  return `$${n.toFixed(2)}`;
}

function fmtN(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function fmtPct(n: number): string {
  return `${(n * 100).toFixed(0)}%`;
}

const STATUS_COLORS: Record<DimensionScore["status"], string> = {
  critical: "#C45D4A",
  poor: "#C45D4A",
  needs_work: "#D4882A",
  acceptable: "#D4882A",
  good: "#4CAF6E",
  excellent: "#4CAF6E",
};

const STATUS_LABELS: Record<DimensionScore["status"], string> = {
  critical: "Critical",
  poor: "Poor",
  needs_work: "Needs Work",
  acceptable: "OK",
  good: "Good",
  excellent: "Excellent",
};

const CATEGORY_COLORS: Record<string, string> = {
  Critical: "#C45D4A",
  "Needs Work": "#D4882A",
  OK: "#D4882A",
  Strong: "#4CAF6E",
  Excellent: "#4CAF6E",
};

// ─── Action Button ───────────────────────────────────────────────────

function ActionButton({
  label,
  onAction,
}: {
  label: string;
  onAction: () => Promise<{ success: boolean; error?: string }>;
}) {
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [errMsg, setErrMsg] = useState("");

  async function handleClick() {
    setState("loading");
    try {
      const r = await onAction();
      if (r.success) {
        setState("done");
      } else {
        setState("error");
        setErrMsg(r.error ?? "Failed");
      }
    } catch (e) {
      setState("error");
      setErrMsg(e instanceof Error ? e.message : "Unknown error");
    }
  }

  if (state === "done") return <span className="text-[11px] font-medium text-[#4CAF6E]">✓ Done</span>;
  if (state === "error") return <span className="text-[11px] text-[#C45D4A]" title={errMsg}>✗ Failed</span>;

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={state === "loading"}
      className="flex items-center gap-1 rounded-sm bg-[#3D3C36] px-2 py-1 text-[11px] font-medium text-[#E8E4DD] transition hover:bg-[#4D4C46] disabled:opacity-50"
    >
      {state === "loading" ? <Loader2 className="h-3 w-3 animate-spin" /> : label}
    </button>
  );
}

// ─── Conversion Tracking Banner ──────────────────────────────────────

function ConversionTrackingBanner({ score, finding }: { score: number; finding: string }) {
  if (score > 1) return null;
  const isCritical = score === 0;
  return (
    <div
      className="flex items-start gap-3 rounded border p-4"
      style={{
        borderColor: isCritical ? "#C45D4A40" : "#D4882A40",
        backgroundColor: isCritical ? "#C45D4A10" : "#D4882A10",
      }}
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" style={{ color: isCritical ? "#C45D4A" : "#D4882A" }} />
      <div>
        <div className="text-[13px] font-semibold" style={{ color: isCritical ? "#C45D4A" : "#D4882A" }}>
          {isCritical ? "Conversion tracking not set up" : "Conversion tracking issue detected"}
        </div>
        <div className="mt-0.5 text-[12px] text-[#9B9689]">{finding} — audit scores below may be inaccurate.</div>
      </div>
    </div>
  );
}

// ─── Score Circle ────────────────────────────────────────────────────

function ScoreCircle({ score, category, loading }: { score: number | null; category: string | null; loading?: boolean }) {
  const circumference = 2 * Math.PI * 45;
  const progress = score !== null ? (score / 100) * circumference : 0;
  const color = category ? CATEGORY_COLORS[category] ?? "#9B9689" : "#9B9689";

  return (
    <div className="flex items-center gap-6">
      <div className="relative h-[120px] w-[120px] shrink-0">
        <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90" role="img" aria-label={score !== null ? `Audit score: ${score}` : "Loading score"}>
          <circle cx="50" cy="50" r="45" fill="none" stroke="#3D3C36" strokeWidth="6" />
          {score !== null && (
            <circle
              cx="50" cy="50" r="45" fill="none"
              stroke={color} strokeWidth="6" strokeLinecap="round"
              strokeDasharray={`${progress} ${circumference}`}
              className="transition-all duration-700 ease-out"
            />
          )}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          {loading ? (
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#4CAF6E] border-t-transparent" />
          ) : (
            <span className="font-mono text-[32px] font-bold" style={{ color }}>
              {score ?? "--"}
            </span>
          )}
        </div>
      </div>
      <div>
        <div className="text-[14px] font-medium text-[#E8E4DD]">Account Audit</div>
        {category && (
          <div className="mt-1 text-[13px] font-medium" style={{ color }}>
            {category}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Metric Card ─────────────────────────────────────────────────────

function MetricCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded border border-[#3D3C36] bg-[#24231F] p-4">
      <div className="text-[11px] uppercase tracking-wider text-[#9B9689]">{label}</div>
      <div className="mt-1 font-mono text-[20px] font-bold" style={{ color: color ?? "#E8E4DD" }}>
        {value}
      </div>
    </div>
  );
}

// ─── Score Dots ──────────────────────────────────────────────────────

function ScoreDots({ score }: { score: number }) {
  return (
    <div className="flex gap-1">
      {[0, 1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className="h-2 w-2 rounded-full"
          style={{
            backgroundColor: i < score
              ? score >= 4 ? "#4CAF6E" : score >= 2 ? "#D4882A" : "#C45D4A"
              : "#3D3C36",
          }}
        />
      ))}
    </div>
  );
}

// ─── Scorecard Table ─────────────────────────────────────────────────

function ScorecardTable({ dimensions, loading }: { dimensions: DimensionScore[] | null; loading: boolean }) {
  return (
    <div className="overflow-x-auto rounded border border-[#3D3C36] bg-[#24231F]">
      <table className="w-full text-left text-[13px]">
        <thead>
          <tr className="border-b border-[#3D3C36] text-[11px] uppercase tracking-wider text-[#9B9689]">
            <th className="px-4 py-3">Dimension</th>
            <th className="px-4 py-3">Score</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3 hidden sm:table-cell">Finding</th>
          </tr>
        </thead>
        <tbody>
          {loading || !dimensions ? (
            Array.from({ length: 7 }).map((_, i) => (
              <tr key={i} className="border-b border-[#3D3C36] last:border-0">
                <td className="px-4 py-3">
                  <div className="h-4 w-32 animate-pulse rounded bg-[#3D3C36]" />
                </td>
                <td className="px-4 py-3"><div className="h-4 w-16 animate-pulse rounded bg-[#3D3C36]" /></td>
                <td className="px-4 py-3"><div className="h-4 w-20 animate-pulse rounded bg-[#3D3C36]" /></td>
                <td className="px-4 py-3 hidden sm:table-cell"><div className="h-4 w-48 animate-pulse rounded bg-[#3D3C36]" /></td>
              </tr>
            ))
          ) : (
            dimensions.map((d) => (
              <tr key={d.key} className="border-b border-[#3D3C36] last:border-0">
                <td className="px-4 py-3 font-medium text-[#E8E4DD]">{d.label}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[#E8E4DD]">{d.score}</span>
                    <ScoreDots score={d.score} />
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span
                    className="inline-block rounded-sm px-2 py-0.5 text-[11px] font-medium"
                    style={{ backgroundColor: `${STATUS_COLORS[d.status]}20`, color: STATUS_COLORS[d.status] }}
                  >
                    {STATUS_LABELS[d.status]}
                  </span>
                </td>
                <td className="px-4 py-3 hidden sm:table-cell text-[#9B9689]">{d.finding}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

// ─── Wasted Spend Section ────────────────────────────────────────────

function WastedSpendSection({ result }: { result: AuditResult }) {
  const { wastedSpend } = result;
  if (wastedSpend.total === 0) return null;

  return (
    <div className="rounded border border-[#3D3C36] bg-[#24231F] p-5">
      <div className="flex items-center gap-2 text-[14px] font-medium text-[#E8E4DD]">
        <AlertTriangle className="h-4 w-4 text-[#C45D4A]" />
        Wasted Spend Analysis
      </div>
      <div className="mt-3 flex flex-wrap gap-6">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-[#9B9689]">30-Day Waste</div>
          <div className="font-mono text-[20px] font-bold text-[#C45D4A]">{fmt$(wastedSpend.total)}</div>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wider text-[#9B9689]">% of Spend</div>
          <div className="font-mono text-[20px] font-bold text-[#C45D4A]">{fmtPct(wastedSpend.pct)}</div>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wider text-[#9B9689]">Annualized</div>
          <div className="font-mono text-[20px] font-bold text-[#D4882A]">~{fmt$(wastedSpend.annualized)}</div>
        </div>
      </div>
      {wastedSpend.categories.length > 0 && (
        <div className="mt-4 space-y-3">
          {wastedSpend.categories.map((cat) => (
            <div key={cat.label}>
              <div className="flex items-center justify-between text-[12px]">
                <span className="text-[#9B9689]">{cat.label}</span>
                <span className="font-mono text-[#E8E4DD]">{fmt$(cat.amount)}</span>
              </div>
              {cat.items.length > 0 && (
                <ul className="mt-1 space-y-0.5">
                  {cat.items.map((item) => (
                    <li key={item} className="text-[11px] text-[#9B9689] pl-3">
                      {item}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Impression Share Section ────────────────────────────────────────

function ImpressionShareSection({ result }: { result: AuditResult }) {
  const { impressionShareDiagnosis } = result;
  if (impressionShareDiagnosis.avgIS === null) return null;

  const isColor = (impressionShareDiagnosis.avgIS ?? 0) >= 0.65
    ? "#4CAF6E"
    : (impressionShareDiagnosis.avgIS ?? 0) >= 0.4
      ? "#D4882A"
      : "#C45D4A";

  return (
    <div className="rounded border border-[#3D3C36] bg-[#24231F] p-5">
      <div className="flex items-center gap-2 text-[14px] font-medium text-[#E8E4DD]">
        <TrendingDown className="h-4 w-4 text-[#D4882A]" />
        Impression Share Analysis
      </div>
      <div className="mt-3 flex flex-wrap gap-6">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-[#9B9689]">Search IS</div>
          <div className="font-mono text-[20px] font-bold" style={{ color: isColor }}>
            {fmtPct(impressionShareDiagnosis.avgIS ?? 0)}
          </div>
        </div>
        {impressionShareDiagnosis.budgetLost !== null && (
          <div>
            <div className="text-[11px] uppercase tracking-wider text-[#9B9689]">Budget-Lost</div>
            <div className="font-mono text-[20px] font-bold text-[#E8E4DD]">
              {fmtPct(impressionShareDiagnosis.budgetLost)}
            </div>
          </div>
        )}
        {impressionShareDiagnosis.rankLost !== null && (
          <div>
            <div className="text-[11px] uppercase tracking-wider text-[#9B9689]">Rank-Lost</div>
            <div className="font-mono text-[20px] font-bold text-[#E8E4DD]">
              {fmtPct(impressionShareDiagnosis.rankLost)}
            </div>
          </div>
        )}
      </div>
      <div className="mt-3 text-[13px] text-[#9B9689]">
        {impressionShareDiagnosis.diagnosis}
      </div>
    </div>
  );
}

// ─── Zero-CV Campaigns Section ───────────────────────────────────────

function ZeroCvCampaignsSection({
  campaigns,
}: {
  campaigns: Array<{ id: string; name: string; cost: number; clicks: number }>;
}) {
  if (campaigns.length === 0) return null;
  return (
    <div className="rounded border border-[#C45D4A40] bg-[#24231F] p-5">
      <div className="flex items-center gap-2 text-[14px] font-medium text-[#E8E4DD]">
        <AlertTriangle className="h-4 w-4 text-[#C45D4A]" />
        Campaigns spending without converting
      </div>
      <p className="mt-1 text-[12px] text-[#9B9689]">
        These enabled campaigns have spent money in the last 30 days with zero conversions.
      </p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-[#3D3C36] text-[11px] uppercase tracking-wider text-[#9B9689]">
              <th className="pb-2 text-left">Campaign</th>
              <th className="pb-2 text-right">Spend</th>
              <th className="pb-2 text-right">Clicks</th>
              <th className="pb-2 text-right" />
            </tr>
          </thead>
          <tbody>
            {campaigns.map((c) => (
              <tr key={c.id} className="border-b border-[#3D3C36] last:border-0">
                <td className="py-2.5 pr-4 font-medium text-[#E8E4DD]">{c.name}</td>
                <td className="py-2.5 pr-4 text-right font-mono text-[#C45D4A]">{fmt$(c.cost)}</td>
                <td className="py-2.5 pr-4 text-right text-[#9B9689]">{fmtN(c.clicks)}</td>
                <td className="py-2.5 text-right">
                  <ActionButton
                    label="Pause"
                    onAction={() => pauseCampaignAction(c.id)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Wasted Search Terms Section ─────────────────────────────────────

function WastedSearchTermsSection({
  terms,
}: {
  terms: Array<{ searchTerm: string; cost: number; clicks: number; campaignName: string; campaignId: string; adGroupName: string }>;
}) {
  if (terms.length === 0) return null;
  return (
    <div className="rounded border border-[#3D3C36] bg-[#24231F] p-5">
      <div className="flex items-center gap-2 text-[14px] font-medium text-[#E8E4DD]">
        <AlertTriangle className="h-4 w-4 text-[#D4882A]" />
        Top non-converting search terms
      </div>
      <p className="mt-1 text-[12px] text-[#9B9689]">
        Queries that triggered your ads, spent budget, but generated zero conversions.
        Add as negatives to stop wasting spend.
      </p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-[#3D3C36] text-[11px] uppercase tracking-wider text-[#9B9689]">
              <th className="pb-2 text-left">Search Term</th>
              <th className="pb-2 text-right">Spend</th>
              <th className="pb-2 text-right">Clicks</th>
              <th className="pb-2 text-left pl-4 hidden sm:table-cell">Campaign</th>
              <th className="pb-2 text-right" />
            </tr>
          </thead>
          <tbody>
            {terms.map((t) => (
              <tr key={t.searchTerm} className="border-b border-[#3D3C36] last:border-0">
                <td className="py-2.5 pr-4 font-mono text-[12px] text-[#E8E4DD]">"{t.searchTerm}"</td>
                <td className="py-2.5 pr-4 text-right font-mono text-[#D4882A]">{fmt$(t.cost)}</td>
                <td className="py-2.5 pr-4 text-right text-[#9B9689]">{fmtN(t.clicks)}</td>
                <td className="py-2.5 pl-4 pr-4 text-[#9B9689] hidden sm:table-cell truncate max-w-[160px]">{t.campaignName}</td>
                <td className="py-2.5 text-right">
                  {t.campaignId ? (
                    <ActionButton
                      label="+ Negative"
                      onAction={() => addNegativeKeywordAction(t.searchTerm, t.campaignId)}
                    />
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Top Actions ─────────────────────────────────────────────────────

function TopActionsSection({ result }: { result: AuditResult }) {
  if (result.topActions.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-[14px] font-medium text-[#E8E4DD]">
        <Zap className="h-4 w-4 text-[#4CAF6E]" />
        Top Actions
      </div>
      {result.topActions.map((action, i) => (
        <div key={i} className="rounded border border-[#3D3C36] bg-[#24231F] p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <span className="mr-2 font-mono text-[14px] font-bold text-[#4CAF6E]">{i + 1}.</span>
              <span className="text-[13px] text-[#E8E4DD]">{action.action}</span>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <span className="font-mono text-[12px] text-[#4CAF6E]">{action.impact}</span>
              {action.actionType === "add_negative" && action.targetId && action.campaignId && (
                <ActionButton
                  label="+ Negative"
                  onAction={() => addNegativeKeywordAction(action.targetId!, action.campaignId!)}
                />
              )}
              {action.actionType === "pause_keyword" && action.targetId && action.campaignId && action.adGroupId && (
                <ActionButton
                  label="Pause"
                  onAction={() => pauseKeywordAction(action.campaignId!, action.adGroupId!, action.targetId!)}
                />
              )}
              {action.actionType === "pause_campaign" && action.targetId && (
                <ActionButton
                  label="Pause"
                  onAction={() => pauseCampaignAction(action.targetId!)}
                />
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Detailed Findings (expandable) ─────────────────────────────────

function DetailedFindings({ dimensions }: { dimensions: DimensionScore[] }) {
  const needsAttention = dimensions.filter((d) => d.score <= 3 && d.details.length > 0);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  if (needsAttention.length === 0) return null;

  function toggle(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-[14px] font-medium text-[#E8E4DD]">
        <Target className="h-4 w-4 text-[#D4882A]" />
        Detailed Findings
      </div>
      {needsAttention.map((d) => (
        <div key={d.key} className="rounded border border-[#3D3C36] bg-[#24231F]">
          <button
            type="button"
            onClick={() => toggle(d.key)}
            className="flex w-full items-center justify-between px-4 py-3 text-left"
          >
            <div className="flex items-center gap-3">
              {expanded.has(d.key)
                ? <ChevronDown className="h-4 w-4 text-[#9B9689]" />
                : <ChevronRight className="h-4 w-4 text-[#9B9689]" />}
              <span className="text-[13px] font-medium text-[#E8E4DD]">{d.label}</span>
              <span
                className="rounded-sm px-2 py-0.5 text-[10px] font-medium"
                style={{ backgroundColor: `${STATUS_COLORS[d.status]}20`, color: STATUS_COLORS[d.status] }}
              >
                {d.score}/5
              </span>
            </div>
          </button>
          {expanded.has(d.key) && (
            <div className="border-t border-[#3D3C36] px-4 py-3 space-y-1.5">
              {d.details.map((detail, i) => (
                <div key={i} className="flex items-start gap-2 text-[12px] text-[#9B9689]">
                  <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-[#9B9689]" />
                  {detail}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────

export function AuditContent({
  overview,
  details,
}: {
  overview: AuditOverview;
  details: AuditDetails | null;
}) {
  const auditResult = details?.auditResult ?? null;
  const detailsLoading = details === null;

  const conversionDim = auditResult?.dimensions.find((d) => d.key === "conversion_tracking");
  const showConversionBanner =
    conversionDim != null
      ? conversionDim.score <= 1
      : overview.conversionActions.filter((a) => a.includeInConversions).length === 0;

  return (
    <div className="min-h-full bg-[#1A1917] px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl space-y-6">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-[20px] font-semibold text-[#E8E4DD]">{overview.accountName}</h1>
            <p className="text-[13px] text-[#9B9689]">Account Audit</p>
          </div>
          <span className="rounded-sm bg-[#3D3C36] px-2 py-1 text-[11px] text-[#9B9689]">
            Last 30 days
          </span>
        </div>

        {showConversionBanner && (
          <ConversionTrackingBanner
            score={conversionDim?.score ?? 0}
            finding={conversionDim?.finding ?? "No conversion actions included in conversions metric"}
          />
        )}

        {/* Overall Score */}
        <div className="rounded border border-[#3D3C36] bg-[#24231F] p-6">
          <ScoreCircle
            score={auditResult?.overallScore ?? null}
            category={auditResult?.category ?? null}
            loading={detailsLoading}
          />
        </div>

        {/* Key Numbers */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <MetricCard label="Spend (30d)" value={fmt$(overview.metrics.totalSpend)} />
          <MetricCard label="Conversions" value={fmtN(overview.metrics.totalConversions)} />
          <MetricCard
            label="CPA"
            value={overview.metrics.cpa !== null ? fmt$(overview.metrics.cpa) : "N/A"}
          />
          <MetricCard
            label="Wasted Spend"
            value={auditResult ? fmt$(auditResult.keyNumbers.wastedSpend) : "..."}
            color={auditResult && auditResult.keyNumbers.wastedSpend > 0 ? "#C45D4A" : undefined}
          />
        </div>

        {/* Zero-conversion campaigns — actionable, shown early */}
        {auditResult && auditResult.zeroCvCampaigns.length > 0 && (
          <ZeroCvCampaignsSection campaigns={auditResult.zeroCvCampaigns} />
        )}

        {/* Scorecard */}
        <ScorecardTable
          dimensions={auditResult?.dimensions ?? null}
          loading={detailsLoading}
        />

        {/* Detail sections — only after Phase 2 */}
        {auditResult && (
          <>
            <WastedSearchTermsSection terms={auditResult.wastedSearchTerms} />
            <WastedSpendSection result={auditResult} />
            <ImpressionShareSection result={auditResult} />
            <TopActionsSection result={auditResult} />
            <DetailedFindings dimensions={auditResult.dimensions} />
          </>
        )}
      </div>
    </div>
  );
}
