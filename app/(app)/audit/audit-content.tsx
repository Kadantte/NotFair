"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, AlertTriangle, TrendingDown, Target, Zap, Loader2, Wrench, MessageCircle, RefreshCw } from "lucide-react";
import type { AuditOverview, AuditDetails } from "./actions";
import { pauseCampaignAction, addNegativeKeywordAction, pauseKeywordAction } from "./actions";
import type { AuditResult, DimensionScore } from "@/lib/audit/scoring";

// ─── Helpers ─────────────────────────────────────────────────────────

function fmt$(n: number): string {
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  return `$${n.toFixed(2)}`;
}

function fmtN(n: number): string {
  const rounded = Math.round(n);
  if (rounded >= 1000) return `${(rounded / 1000).toFixed(1)}k`;
  return String(rounded);
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

// ─── Ask AI Button ──────────────────────────────────────────────────

function AskAIButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1.5 rounded-sm px-2 py-1 text-[11px] font-medium text-[#9B9689] transition hover:bg-[#2E2D28] hover:text-[#4CAF6E]"
    >
      <MessageCircle className="h-3 w-3" />
      Ask AI
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

function WastedSpendSection({ result, onAskAI }: { result: AuditResult; onAskAI?: (prompt: string) => void }) {
  const { wastedSpend } = result;
  if (wastedSpend.total === 0 && wastedSpend.qualityIssues.total === 0) return null;

  return (
    <div className="rounded border border-[#3D3C36] bg-[#24231F] p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-[14px] font-medium text-[#E8E4DD]">
          <AlertTriangle className="h-4 w-4 text-[#C45D4A]" />
          Wasted Spend Analysis
        </div>
        {onAskAI && (
          <AskAIButton
            onClick={() =>
              onAskAI(
                `I have ${fmt$(wastedSpend.total)} in wasted spend (${fmtPct(wastedSpend.pct)} of total spend, ~${fmt$(wastedSpend.annualized)} annualized). Categories: ${wastedSpend.categories.map((c) => `${c.label}: ${fmt$(c.amount)}`).join(", ")}. How should I reduce this wasted spend? What are the highest-impact actions?`,
              )
            }
          />
        )}
      </div>
      {wastedSpend.total > 0 && (
        <>
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
        </>
      )}
      {wastedSpend.qualityIssues.total > 0 && (
        <div className={wastedSpend.total > 0 ? "mt-4 border-t border-[#3D3C36] pt-4" : "mt-3"}>
          <div className="flex items-center gap-2 text-[13px] font-medium text-[#D4882A]">
            <Wrench className="h-3.5 w-3.5" />
            Quality Issues — Fix the Funnel, Don&apos;t Block
          </div>
          <div className="mt-2 flex flex-wrap gap-6">
            <div>
              <div className="text-[11px] uppercase tracking-wider text-[#9B9689]">Fixable Spend</div>
              <div className="font-mono text-[18px] font-bold text-[#D4882A]">{fmt$(wastedSpend.qualityIssues.total)}</div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wider text-[#9B9689]">% of Spend</div>
              <div className="font-mono text-[18px] font-bold text-[#D4882A]">{fmtPct(wastedSpend.qualityIssues.pct)}</div>
            </div>
          </div>
          {wastedSpend.qualityIssues.categories.length > 0 && (
            <div className="mt-3 space-y-3">
              {wastedSpend.qualityIssues.categories.map((cat) => (
                <div key={cat.label}>
                  <div className="flex items-center justify-between text-[12px]">
                    <span className="text-[#9B9689]">{cat.label}</span>
                    <span className="font-mono text-[#E8E4DD]">{fmt$(cat.amount)}</span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-[#6B6760] italic">{cat.description}</p>
                  {cat.items.length > 0 && (
                    <ul className="mt-1 space-y-0.5">
                      {cat.items.map((item) => (
                        <li key={item} className="text-[11px] text-[#9B9689] pl-3">{item}</li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Impression Share Section ────────────────────────────────────────

const DIAGNOSIS_COLORS: Record<string, string> = {
  healthy: "#4CAF6E",
  budget: "#D4882A",
  rank: "#C45D4A",
  structural: "#C45D4A",
};

const DIAGNOSIS_LABELS: Record<string, string> = {
  healthy: "Healthy",
  budget: "Budget-limited",
  rank: "Rank-limited",
  structural: "Structural issue",
};

const QS_SUB_COLORS: Record<string, string> = {
  ABOVE_AVERAGE: "#4CAF6E",
  AVERAGE: "#D4882A",
  BELOW_AVERAGE: "#C45D4A",
  UNKNOWN: "#6B6760",
  UNSPECIFIED: "#6B6760",
};

const QS_SUB_LABELS: Record<string, string> = {
  ABOVE_AVERAGE: "Above Avg",
  AVERAGE: "Average",
  BELOW_AVERAGE: "Below Avg",
  UNKNOWN: "—",
  UNSPECIFIED: "—",
};

function isColor(val: number): string {
  return val >= 0.65 ? "#4CAF6E" : val >= 0.4 ? "#D4882A" : "#C45D4A";
}

function ImpressionShareSection({ result, onAskAI }: { result: AuditResult; onAskAI?: (prompt: string) => void }) {
  const { impressionShareDiagnosis } = result;
  const [expandedCampaign, setExpandedCampaign] = useState<string | null>(null);

  if (impressionShareDiagnosis.avgIS === null) return null;

  const avgColor = isColor(impressionShareDiagnosis.avgIS ?? 0);
  const { campaignBreakdown } = impressionShareDiagnosis;

  return (
    <div className="rounded border border-[#3D3C36] bg-[#24231F] p-5">
      <div className="flex items-center gap-2 text-[14px] font-medium text-[#E8E4DD]">
        <TrendingDown className="h-4 w-4 text-[#D4882A]" />
        Impression Share Analysis
      </div>

      {/* Account-level summary */}
      <div className="mt-3 flex flex-wrap gap-6">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-[#9B9689]">Search IS</div>
          <div className="font-mono text-[20px] font-bold" style={{ color: avgColor }}>
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

      {/* Ask AI */}
      {onAskAI && (
        <div className="mt-3 flex justify-end">
          <AskAIButton
            onClick={() =>
              onAskAI(
                `My Search Impression Share is ${fmtPct(impressionShareDiagnosis.avgIS ?? 0)}. Budget-lost: ${fmtPct(impressionShareDiagnosis.budgetLost ?? 0)}, Rank-lost: ${fmtPct(impressionShareDiagnosis.rankLost ?? 0)}. Diagnosis: "${impressionShareDiagnosis.diagnosis}". How can I improve my impression share? Give me specific steps.`,
              )
            }
          />
        </div>
      )}

      {/* Per-campaign breakdown */}
      {campaignBreakdown.length > 0 && (
        <div className="mt-5 border-t border-[#3D3C36] pt-4">
          <div className="text-[12px] font-medium uppercase tracking-wider text-[#9B9689] mb-3">
            By Campaign
          </div>
          <div className="space-y-2">
            {campaignBreakdown.map((camp) => {
              const campColor = isColor(camp.impressionShare ?? 0);
              const isExpanded = expandedCampaign === camp.campaignName;
              const hasKeywords = camp.topKeywords.length > 0;
              const hasIssue = camp.diagnosis !== "healthy";

              return (
                <div key={camp.campaignName} className="rounded border border-[#3D3C36] bg-[#1A1917]">
                  <button
                    type="button"
                    onClick={() => setExpandedCampaign(isExpanded ? null : camp.campaignName)}
                    className="flex w-full items-center justify-between px-4 py-3 text-left"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {isExpanded
                        ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[#9B9689]" />
                        : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[#9B9689]" />}
                      <span className="text-[13px] font-medium text-[#E8E4DD] truncate">{camp.campaignName}</span>
                      <span
                        className="shrink-0 rounded-sm px-1.5 py-0.5 text-[10px] font-medium"
                        style={{ backgroundColor: `${DIAGNOSIS_COLORS[camp.diagnosis]}20`, color: DIAGNOSIS_COLORS[camp.diagnosis] }}
                      >
                        {DIAGNOSIS_LABELS[camp.diagnosis]}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 shrink-0 ml-3">
                      <div className="text-right">
                        <div className="text-[10px] uppercase text-[#6B6760]">IS</div>
                        <div className="font-mono text-[13px] font-bold" style={{ color: campColor }}>
                          {fmtPct(camp.impressionShare ?? 0)}
                        </div>
                      </div>
                      {camp.budgetLostIS !== null && camp.budgetLostIS > 0 && (
                        <div className="text-right hidden sm:block">
                          <div className="text-[10px] uppercase text-[#6B6760]">Budget</div>
                          <div className="font-mono text-[13px] text-[#9B9689]">
                            -{fmtPct(camp.budgetLostIS)}
                          </div>
                        </div>
                      )}
                      {camp.rankLostIS !== null && camp.rankLostIS > 0 && (
                        <div className="text-right hidden sm:block">
                          <div className="text-[10px] uppercase text-[#6B6760]">Rank</div>
                          <div className="font-mono text-[13px] text-[#9B9689]">
                            -{fmtPct(camp.rankLostIS)}
                          </div>
                        </div>
                      )}
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="border-t border-[#3D3C36] px-4 py-3">
                      {/* Campaign-level recommendation */}
                      {hasIssue && (
                        <div className="mb-3 rounded bg-[#24231F] px-3 py-2 text-[12px] text-[#9B9689]">
                          {camp.diagnosis === "budget" && (
                            <>
                              <span className="font-medium text-[#D4882A]">Recommendation:</span> Your ads are competitive when shown — you&apos;re just running out of budget.
                              Increase daily budget or pause low-performing keywords to redistribute spend.
                            </>
                          )}
                          {camp.diagnosis === "rank" && (
                            <>
                              <span className="font-medium text-[#C45D4A]">Recommendation:</span> You&apos;re losing impressions to ad rank.
                              Focus on improving Quality Score components below — especially any marked &ldquo;Below Avg&rdquo;.
                              Better QS = lower CPC + higher position.
                            </>
                          )}
                          {camp.diagnosis === "structural" && (
                            <>
                              <span className="font-medium text-[#C45D4A]">Recommendation:</span> Both budget and rank are limiting you.
                              Tighten targeting first (pause broad/low-QS keywords), then reallocate budget to your best performers.
                            </>
                          )}
                        </div>
                      )}

                      {/* Top keywords table */}
                      {hasKeywords ? (
                        <div className="overflow-x-auto">
                          <div className="text-[11px] font-medium uppercase tracking-wider text-[#6B6760] mb-2">
                            Top Keywords by Spend
                          </div>
                          <table className="w-full text-[12px]">
                            <thead>
                              <tr className="border-b border-[#3D3C36] text-[10px] uppercase tracking-wider text-[#6B6760]">
                                <th className="pb-2 text-left">Keyword</th>
                                <th className="pb-2 text-center">QS</th>
                                <th className="pb-2 text-center hidden md:table-cell">Ad Relevance</th>
                                <th className="pb-2 text-center hidden md:table-cell">Landing Page</th>
                                <th className="pb-2 text-center hidden md:table-cell">Expected CTR</th>
                                <th className="pb-2 text-right">Spend</th>
                                <th className="pb-2 text-right hidden sm:table-cell">Impr</th>
                              </tr>
                            </thead>
                            <tbody>
                              {camp.topKeywords.map((kw) => {
                                const qsColor = kw.qualityScore === null ? "#6B6760"
                                  : kw.qualityScore >= 7 ? "#4CAF6E"
                                  : kw.qualityScore >= 4 ? "#D4882A"
                                  : "#C45D4A";
                                return (
                                  <tr key={kw.text} className="border-b border-[#3D3C36] last:border-0">
                                    <td className="py-2 pr-3 text-[#E8E4DD] max-w-[180px]">
                                      <span className="font-mono text-[11px]">{kw.text}</span>
                                      <span className="ml-1.5 text-[10px] text-[#6B6760]">[{kw.matchType === "EXACT" ? "Exact" : kw.matchType === "PHRASE" ? "Phrase" : "Broad"}]</span>
                                    </td>
                                    <td className="py-2 text-center">
                                      <span className="font-mono font-bold" style={{ color: qsColor }}>
                                        {kw.qualityScore ?? "—"}
                                      </span>
                                      <span className="text-[#6B6760]">/10</span>
                                    </td>
                                    <td className="py-2 text-center hidden md:table-cell">
                                      <span
                                        className="inline-block rounded px-1.5 py-0.5 text-[10px] font-medium"
                                        style={{
                                          backgroundColor: `${QS_SUB_COLORS[kw.creativeQuality]}15`,
                                          color: QS_SUB_COLORS[kw.creativeQuality],
                                        }}
                                      >
                                        {QS_SUB_LABELS[kw.creativeQuality]}
                                      </span>
                                    </td>
                                    <td className="py-2 text-center hidden md:table-cell">
                                      <span
                                        className="inline-block rounded px-1.5 py-0.5 text-[10px] font-medium"
                                        style={{
                                          backgroundColor: `${QS_SUB_COLORS[kw.postClickQuality]}15`,
                                          color: QS_SUB_COLORS[kw.postClickQuality],
                                        }}
                                      >
                                        {QS_SUB_LABELS[kw.postClickQuality]}
                                      </span>
                                    </td>
                                    <td className="py-2 text-center hidden md:table-cell">
                                      <span
                                        className="inline-block rounded px-1.5 py-0.5 text-[10px] font-medium"
                                        style={{
                                          backgroundColor: `${QS_SUB_COLORS[kw.searchPredictedCtr]}15`,
                                          color: QS_SUB_COLORS[kw.searchPredictedCtr],
                                        }}
                                      >
                                        {QS_SUB_LABELS[kw.searchPredictedCtr]}
                                      </span>
                                    </td>
                                    <td className="py-2 text-right font-mono text-[#E8E4DD]">{fmt$(kw.cost)}</td>
                                    <td className="py-2 text-right font-mono text-[#9B9689] hidden sm:table-cell">{fmtN(kw.impressions)}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>

                          {/* QS improvement hints for rank-limited campaigns */}
                          {(camp.diagnosis === "rank" || camp.diagnosis === "structural") && (() => {
                            const belowAvgAd = camp.topKeywords.filter(k => k.creativeQuality === "BELOW_AVERAGE").length;
                            const belowAvgLp = camp.topKeywords.filter(k => k.postClickQuality === "BELOW_AVERAGE").length;
                            const belowAvgCtr = camp.topKeywords.filter(k => k.searchPredictedCtr === "BELOW_AVERAGE").length;
                            const hints: string[] = [];
                            if (belowAvgAd > 0) hints.push(`${belowAvgAd} keyword${belowAvgAd > 1 ? "s" : ""} have below-average ad relevance — rewrite ad copy to better match these keywords`);
                            if (belowAvgLp > 0) hints.push(`${belowAvgLp} keyword${belowAvgLp > 1 ? "s" : ""} have below-average landing page experience — improve page speed, relevance, and mobile UX`);
                            if (belowAvgCtr > 0) hints.push(`${belowAvgCtr} keyword${belowAvgCtr > 1 ? "s" : ""} have below-average expected CTR — test new headlines and make ads more compelling`);
                            if (hints.length === 0) return null;
                            return (
                              <div className="mt-3 space-y-1.5">
                                <div className="text-[11px] font-medium uppercase tracking-wider text-[#6B6760]">
                                  Fix These to Improve Rank
                                </div>
                                {hints.map((hint, i) => (
                                  <div key={i} className="flex items-start gap-2 text-[11px] text-[#9B9689]">
                                    <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-[#C45D4A]" />
                                    {hint}
                                  </div>
                                ))}
                              </div>
                            );
                          })()}
                        </div>
                      ) : (
                        <div className="text-[12px] text-[#6B6760] italic">No keyword data available for this campaign.</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
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
  onAskAI,
}: {
  terms: AuditResult["wastedSearchTerms"];
  onAskAI?: (prompt: string) => void;
}) {
  if (terms.length === 0) return null;
  return (
    <div className="rounded border border-[#3D3C36] bg-[#24231F] p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-[14px] font-medium text-[#E8E4DD]">
          <AlertTriangle className="h-4 w-4 text-[#D4882A]" />
          Irrelevant search terms
        </div>
        {onAskAI && (
          <AskAIButton
            onClick={() =>
              onAskAI(
                `I have ${terms.length} irrelevant search terms triggering my ads: ${terms.slice(0, 5).map((t) => `"${t.searchTerm}" (${fmt$(t.cost)})`).join(", ")}${terms.length > 5 ? ` and ${terms.length - 5} more` : ""}. How should I handle these? Should I add all as negatives, or are there better strategies?`,
              )
            }
          />
        )}
      </div>
      <p className="mt-1 text-[12px] text-[#9B9689]">
        Queries that triggered your ads but are unlikely to convert — job seekers,
        researchers, and off-topic searches. Add as negatives to reclaim wasted budget.
      </p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-[#3D3C36] text-[11px] uppercase tracking-wider text-[#9B9689]">
              <th className="pb-2 text-left">Search Term</th>
              <th className="pb-2 text-left pl-3 hidden md:table-cell">Why flagged</th>
              <th className="pb-2 text-right">Spend</th>
              <th className="pb-2 text-right">Clicks</th>
              <th className="pb-2 text-right" />
            </tr>
          </thead>
          <tbody>
            {terms.map((t) => (
              <tr key={t.searchTerm} className="border-b border-[#3D3C36] last:border-0">
                <td className="py-2.5 pr-3 font-mono text-[12px] text-[#E8E4DD] max-w-[200px] truncate">
                  &ldquo;{t.searchTerm}&rdquo;
                </td>
                <td className="py-2.5 pl-3 pr-3 hidden md:table-cell">
                  <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-medium ${
                    t.classification === "confirmed_waste"
                      ? "bg-[#C45D4A]/15 text-[#C45D4A]"
                      : "bg-[#D4882A]/15 text-[#D4882A]"
                  }`}>
                    {t.reason}
                  </span>
                </td>
                <td className="py-2.5 pr-3 text-right font-mono text-[#D4882A]">{fmt$(t.cost)}</td>
                <td className="py-2.5 pr-3 text-right text-[#9B9689]">{fmtN(t.clicks)}</td>
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

function TopActionsSection({ result, onAskAI }: { result: AuditResult; onAskAI?: (prompt: string) => void }) {
  if (result.topActions.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-[14px] font-medium text-[#E8E4DD]">
          <Zap className="h-4 w-4 text-[#4CAF6E]" />
          Top Actions
        </div>
        {onAskAI && (
          <AskAIButton
            onClick={() =>
              onAskAI(
                `Here are my top recommended actions:\n${result.topActions.map((a, i) => `${i + 1}. ${a.action} (${a.impact})`).join("\n")}\n\nWhich of these should I prioritize first and why? Walk me through implementing them.`,
              )
            }
          />
        )}
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

function DetailedFindings({ dimensions, onAskAI }: { dimensions: DimensionScore[]; onAskAI?: (prompt: string) => void }) {
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
              {onAskAI && (
                <div className="pt-2 flex justify-end">
                  <AskAIButton
                    onClick={() =>
                      onAskAI(
                        `My "${d.label}" score is ${d.score}/5 (${STATUS_LABELS[d.status]}). Finding: "${d.finding}". Details: ${d.details.join("; ")}. What should I do to fix this? Give me specific, actionable steps.`,
                      )
                    }
                  />
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────

function formatTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function AuditContent({
  overview,
  details,
  onAskAI,
  onRedoAudit,
  redoLoading,
  lastAuditTime,
}: {
  overview: AuditOverview;
  details: AuditDetails | null;
  onAskAI?: (prompt: string) => void;
  onRedoAudit?: () => void;
  redoLoading?: boolean;
  lastAuditTime?: Date | null;
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
            <p className="text-[13px] text-[#9B9689]">
              Account Audit
              {lastAuditTime && (
                <span className="ml-2 text-[#9B9689]/60">· {formatTimeAgo(lastAuditTime)}</span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-sm bg-[#3D3C36] px-2 py-1 text-[11px] text-[#9B9689]">
              Last 30 days
            </span>
            {onRedoAudit && (
              <button
                type="button"
                onClick={onRedoAudit}
                disabled={redoLoading}
                className="flex items-center gap-1.5 rounded-sm bg-[#3D3C36] px-2.5 py-1 text-[11px] font-medium text-[#E8E4DD] transition hover:bg-[#4D4C46] disabled:opacity-50"
              >
                <RefreshCw className={`h-3 w-3 ${redoLoading ? "animate-spin" : ""}`} />
                Redo Audit
              </button>
            )}
          </div>
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
            <WastedSearchTermsSection terms={auditResult.wastedSearchTerms} onAskAI={onAskAI} />
            <WastedSpendSection result={auditResult} onAskAI={onAskAI} />
            <ImpressionShareSection result={auditResult} onAskAI={onAskAI} />
            <TopActionsSection result={auditResult} onAskAI={onAskAI} />
            <DetailedFindings dimensions={auditResult.dimensions} onAskAI={onAskAI} />
          </>
        )}
      </div>
    </div>
  );
}
