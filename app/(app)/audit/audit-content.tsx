"use client";

import { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  TrendingDown,
  Target,
  Loader2,
  Wrench,
  MessageCircle,
  RefreshCw,
  OctagonAlert,
  TrendingUp,
  Settings,
} from "lucide-react";
import type { AuditOverview, AuditDetails } from "./actions";
import { pauseCampaignAction, addNegativeKeywordAction, pauseKeywordAction } from "./actions";
import type { AuditResult, PassItem, QsSubLabel } from "@/lib/audit/scoring";

// ─── Time Range ──────────────────────────────────────────────────────

export type TimeRangeOption = { label: string; days: number };

export const TIME_RANGE_OPTIONS: readonly TimeRangeOption[] = [
  { label: "Last 30 days", days: 30 },
  { label: "Last 3 months", days: 90 },
  { label: "Last 6 months", days: 180 },
  { label: "Last 1 year", days: 365 },
  { label: "Last 2 years", days: 730 },
  { label: "All time", days: 3650 },
] as const;

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

  if (state === "done") return <span className="text-[11px] font-medium text-[#4CAF6E]">Done</span>;
  if (state === "error") return <span className="text-[11px] text-[#C45D4A]" title={errMsg}>Failed</span>;

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
      className="flex items-center gap-1.5 rounded-sm px-2 py-1 text-[11px] font-medium text-[#C4C0B6] transition hover:bg-[#2E2D28] hover:text-[#4CAF6E]"
    >
      <MessageCircle className="h-3 w-3" />
      Ask AI
    </button>
  );
}

// ─── Pass Item Action Button ────────────────────────────────────────

function PassItemAction({ item }: { item: PassItem }) {
  if (item.actionType === "add_negative" && item.targetId && item.campaignId) {
    return <ActionButton label="+ Negative" onAction={() => addNegativeKeywordAction(item.targetId!, item.campaignId!)} />;
  }
  if (item.actionType === "pause_keyword" && item.targetId && item.campaignId && item.adGroupId) {
    return <ActionButton label="Pause" onAction={() => pauseKeywordAction(item.campaignId!, item.adGroupId!, item.targetId!)} />;
  }
  if (item.actionType === "pause_campaign" && item.targetId) {
    return <ActionButton label="Pause" onAction={() => pauseCampaignAction(item.targetId!)} />;
  }
  return null;
}

// ─── Conversion Tracking Banner ────────────────────────────────────

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
        <div className="mt-0.5 text-[12px] text-[#C4C0B6]">{finding} — metrics below may be inaccurate.</div>
      </div>
    </div>
  );
}

// ─── Pulse Metric Card ─────────────────────────────────────────────

function pulseColor(metric: "waste" | "demand" | "cpa", value: number): string {
  if (metric === "waste") {
    if (value > 20) return "#C45D4A";
    if (value > 10) return "#D4882A";
    if (value > 5) return "#E8E4DD";
    return "#4CAF6E";
  }
  if (metric === "demand") {
    if (value >= 70) return "#4CAF6E";
    if (value >= 50) return "#E8E4DD";
    if (value >= 30) return "#D4882A";
    return "#C45D4A";
  }
  return "#E8E4DD";
}

function PulseMetricCard({
  label,
  value,
  unit,
  metric,
  loading,
}: {
  label: string;
  value: number | null;
  unit: string;
  metric: "waste" | "demand" | "cpa";
  loading?: boolean;
}) {
  const color = value !== null ? pulseColor(metric, value) : "#6B6760";
  const display = loading || value === null
    ? "—"
    : metric === "cpa"
      ? fmt$(value)
      : `${value.toFixed(0)}%`;

  return (
    <div className="rounded border border-[#3D3C36] bg-[#24231F] p-4">
      <div className="text-[11px] uppercase tracking-wider text-[#C4C0B6]">{label}</div>
      <div className="mt-1 flex items-baseline gap-1.5">
        {loading ? (
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-[#4CAF6E] border-t-transparent" />
        ) : (
          <>
            <span className="font-mono text-[24px] font-bold" style={{ color }}>
              {display}
            </span>
            {value !== null && metric !== "cpa" && (
              <span className="text-[12px] text-[#6B6760]">{unit}</span>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Verdict Card ───────────────────────────────────────────────────

function VerdictCard({ verdict, loading }: { verdict: string | null; loading?: boolean }) {
  if (loading) {
    return (
      <div className="rounded border border-[#3D3C36] bg-[#24231F] p-5">
        <div className="h-4 w-3/4 animate-pulse rounded bg-[#3D3C36]" />
        <div className="mt-2 h-4 w-1/2 animate-pulse rounded bg-[#3D3C36]" />
      </div>
    );
  }
  if (!verdict) return null;
  return (
    <div className="rounded border border-[#3D3C36] bg-[#24231F] p-5">
      <p className="text-[14px] leading-relaxed text-[#C4C0B6]">{verdict}</p>
    </div>
  );
}

// ─── Pass Section ───────────────────────────────────────────────────

const PASS_CONFIG = {
  stopWasting: {
    title: "Stop Wasting",
    icon: <OctagonAlert className="h-4 w-4 text-[#C45D4A]" />,
    empty: "No significant waste detected.",
    accentColor: "#C45D4A",
  },
  captureMore: {
    title: "Capture More",
    icon: <TrendingUp className="h-4 w-4 text-[#4CAF6E]" />,
    empty: "No scaling opportunities found — check back after fixing fundamentals.",
    accentColor: "#4CAF6E",
  },
  fixFundamentals: {
    title: "Fix Fundamentals",
    icon: <Settings className="h-4 w-4 text-[#D4882A]" />,
    empty: "Foundations look solid.",
    accentColor: "#D4882A",
  },
} as const;

function PassSection({
  passKey,
  items,
  loading,
  onAskAI,
}: {
  passKey: keyof typeof PASS_CONFIG;
  items: PassItem[];
  loading?: boolean;
  onAskAI?: (prompt: string) => void;
}) {
  const config = PASS_CONFIG[passKey];

  if (loading) {
    return (
      <div className="rounded border border-[#3D3C36] bg-[#24231F] p-5">
        <div className="flex items-center gap-2 text-[14px] font-medium text-[#E8E4DD]">
          {config.icon}
          {config.title}
        </div>
        <div className="mt-3 space-y-2">
          {[0, 1].map((i) => (
            <div key={i} className="h-12 animate-pulse rounded border border-[#3D3C36] bg-[#1A1917]" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded border border-[#3D3C36] bg-[#24231F] p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-[14px] font-medium text-[#E8E4DD]">
          {config.icon}
          {config.title}
        </div>
        {onAskAI && items.length > 0 && (
          <AskAIButton
            onClick={() =>
              onAskAI(
                `Here are my "${config.title}" action items:\n${items.map((a, i) => `${i + 1}. ${a.action} (${a.impact})`).join("\n")}\n\nWalk me through implementing these. Which should I do first?`,
              )
            }
          />
        )}
      </div>
      {items.length === 0 ? (
        <p className="mt-2 text-[13px] text-[#6B6760] italic">{config.empty}</p>
      ) : (
        <div className="mt-3 space-y-2">
          {items.map((item, i) => (
            <div
              key={i}
              className="flex items-start justify-between gap-3 rounded border border-[#3D3C36] bg-[#1A1917] p-3"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-start gap-2">
                  <span
                    className="mt-0.5 font-mono text-[13px] font-bold shrink-0"
                    style={{ color: config.accentColor }}
                  >
                    {i + 1}.
                  </span>
                  <span className="text-[13px] text-[#E8E4DD]">{item.action}</span>
                </div>
                <div className="mt-1 ml-5 font-mono text-[12px] text-[#4CAF6E]">{item.impact}</div>
              </div>
              <div className="flex shrink-0 items-center gap-2 pt-0.5">
                <PassItemAction item={item} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Campaign Performance Table ────────────────────────────────────

function CampaignPerformanceSection({
  campaigns,
}: {
  campaigns: Array<{ id: string; name: string; status: string | number; cost: number; clicks: number; impressions: number; conversions: number }>;
}) {
  const active = campaigns.filter((c) => c.cost > 0 || c.impressions > 0);
  if (active.length === 0) return null;
  const sorted = [...active].sort((a, b) => b.cost - a.cost);

  return (
    <div className="rounded border border-[#3D3C36] bg-[#24231F] p-5">
      <div className="flex items-center gap-2 text-[14px] font-medium text-[#E8E4DD] mb-3">
        <TrendingDown className="h-4 w-4 text-[#C4C0B6]" />
        Campaign Performance
        <span className="text-[11px] text-[#6B6760] font-normal">Last 30 days</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="border-b border-[#3D3C36] text-[10px] uppercase tracking-wider text-[#6B6760]">
              <th className="pb-2 text-left">Campaign</th>
              <th className="pb-2 text-right">Spend</th>
              <th className="pb-2 text-right hidden sm:table-cell">Clicks</th>
              <th className="pb-2 text-right hidden sm:table-cell">Impr</th>
              <th className="pb-2 text-right hidden md:table-cell">CTR</th>
              <th className="pb-2 text-right hidden md:table-cell">CPC</th>
              <th className="pb-2 text-right">Conv</th>
              <th className="pb-2 text-right hidden sm:table-cell">CPA</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((c) => {
              const ctr = c.impressions > 0 ? c.clicks / c.impressions : null;
              const cpc = c.clicks > 0 ? c.cost / c.clicks : null;
              const cpa = c.conversions > 0 ? c.cost / c.conversions : null;
              const isEnabled = c.status === "ENABLED" || c.status === 2;
              return (
                <tr key={c.id} className="border-b border-[#3D3C36] last:border-0">
                  <td className="py-2.5 pr-3 max-w-[180px]">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-[#E8E4DD] truncate">{c.name}</span>
                      {!isEnabled && (
                        <span className="shrink-0 rounded-sm bg-[#3D3C36] px-1.5 py-0.5 text-[9px] text-[#6B6760]">Paused</span>
                      )}
                    </div>
                  </td>
                  <td className="py-2.5 pr-3 text-right font-mono text-[#E8E4DD]">{fmt$(c.cost)}</td>
                  <td className="py-2.5 pr-3 text-right text-[#C4C0B6] hidden sm:table-cell">{fmtN(c.clicks)}</td>
                  <td className="py-2.5 pr-3 text-right text-[#C4C0B6] hidden sm:table-cell">{fmtN(c.impressions)}</td>
                  <td className="py-2.5 pr-3 text-right text-[#C4C0B6] hidden md:table-cell">{ctr !== null ? fmtPct(ctr) : "—"}</td>
                  <td className="py-2.5 pr-3 text-right text-[#C4C0B6] hidden md:table-cell">{cpc !== null ? fmt$(cpc) : "—"}</td>
                  <td className="py-2.5 pr-3 text-right font-mono" style={{ color: c.conversions > 0 ? "#4CAF6E" : "#C4C0B6" }}>
                    {fmtN(c.conversions)}
                  </td>
                  <td className="py-2.5 text-right text-[#C4C0B6] hidden sm:table-cell">{cpa !== null ? fmt$(cpa) : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Collapsible Detail Section ─────────────────────────────────────

function CollapsibleSection({
  title,
  icon,
  defaultOpen,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen ?? false);

  return (
    <div className="rounded border border-[#3D3C36] bg-[#24231F]">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-5 py-4 text-left"
      >
        <div className="flex items-center gap-2 text-[14px] font-medium text-[#E8E4DD]">
          {icon}
          {title}
        </div>
        {open ? (
          <ChevronDown className="h-4 w-4 text-[#6B6760]" />
        ) : (
          <ChevronRight className="h-4 w-4 text-[#6B6760]" />
        )}
      </button>
      {open && <div className="border-t border-[#3D3C36] px-5 py-4">{children}</div>}
    </div>
  );
}

// ─── Wasted Spend Detail ────────────────────────────────────────────

function WastedSpendDetail({ result, onAskAI }: { result: AuditResult; onAskAI?: (prompt: string) => void }) {
  const { wastedSpend } = result;
  if (wastedSpend.total === 0 && wastedSpend.qualityIssues.total === 0) return null;

  return (
    <CollapsibleSection
      title="Wasted Spend Breakdown"
      icon={<AlertTriangle className="h-4 w-4 text-[#C45D4A]" />}
    >
      {onAskAI && (
        <div className="mb-3 flex justify-end">
          <AskAIButton
            onClick={() =>
              onAskAI(
                `I have ${fmt$(wastedSpend.total)} in wasted spend (${(wastedSpend.pct * 100).toFixed(0)}% of total spend, ~${fmt$(wastedSpend.annualized)} annualized). Categories: ${wastedSpend.categories.map((c) => `${c.label}: ${fmt$(c.amount)}`).join(", ")}. How should I reduce this?`,
              )
            }
          />
        </div>
      )}
      {wastedSpend.total > 0 && (
        <>
          <div className="flex flex-wrap gap-6">
            <div>
              <div className="text-[11px] uppercase tracking-wider text-[#C4C0B6]">30-Day Waste</div>
              <div className="font-mono text-[20px] font-bold text-[#C45D4A]">{fmt$(wastedSpend.total)}</div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wider text-[#C4C0B6]">% of Spend</div>
              <div className="font-mono text-[20px] font-bold text-[#C45D4A]">{(wastedSpend.pct * 100).toFixed(0)}%</div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wider text-[#C4C0B6]">Annualized</div>
              <div className="font-mono text-[20px] font-bold text-[#D4882A]">~{fmt$(wastedSpend.annualized)}</div>
            </div>
          </div>
          {wastedSpend.categories.length > 0 && (
            <div className="mt-4 space-y-3">
              {wastedSpend.categories.map((cat) => (
                <div key={cat.label}>
                  <div className="flex items-center justify-between text-[12px]">
                    <span className="text-[#C4C0B6]">{cat.label}</span>
                    <span className="font-mono text-[#E8E4DD]">{fmt$(cat.amount)}</span>
                  </div>
                  {cat.items.length > 0 && (
                    <ul className="mt-1 space-y-0.5">
                      {cat.items.map((item) => (
                        <li key={item} className="text-[11px] text-[#C4C0B6] pl-3">{item}</li>
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
        <div className={wastedSpend.total > 0 ? "mt-4 border-t border-[#3D3C36] pt-4" : ""}>
          <div className="flex items-center gap-2 text-[13px] font-medium text-[#D4882A]">
            <Wrench className="h-3.5 w-3.5" />
            Quality Issues — Fix the Funnel, Don&apos;t Block
          </div>
          <div className="mt-2 flex flex-wrap gap-6">
            <div>
              <div className="text-[11px] uppercase tracking-wider text-[#C4C0B6]">Fixable Spend</div>
              <div className="font-mono text-[18px] font-bold text-[#D4882A]">{fmt$(wastedSpend.qualityIssues.total)}</div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wider text-[#C4C0B6]">% of Spend</div>
              <div className="font-mono text-[18px] font-bold text-[#D4882A]">{(wastedSpend.qualityIssues.pct * 100).toFixed(0)}%</div>
            </div>
          </div>
          {wastedSpend.qualityIssues.categories.length > 0 && (
            <div className="mt-3 space-y-3">
              {wastedSpend.qualityIssues.categories.map((cat) => (
                <div key={cat.label}>
                  <div className="flex items-center justify-between text-[12px]">
                    <span className="text-[#C4C0B6]">{cat.label}</span>
                    <span className="font-mono text-[#E8E4DD]">{fmt$(cat.amount)}</span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-[#6B6760] italic">{cat.description}</p>
                  {cat.items.length > 0 && (
                    <ul className="mt-1 space-y-0.5">
                      {cat.items.map((item) => (
                        <li key={item} className="text-[11px] text-[#C4C0B6] pl-3">{item}</li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </CollapsibleSection>
  );
}

// ─── Impression Share Detail ────────────────────────────────────────

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

function isColor(val: number): string {
  return val >= 0.65 ? "#4CAF6E" : val >= 0.4 ? "#D4882A" : "#C45D4A";
}

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

function QsBadge({ value }: { value: QsSubLabel }) {
  return (
    <span
      className="inline-block rounded px-1.5 py-0.5 text-[10px] font-medium"
      style={{
        backgroundColor: `${QS_SUB_COLORS[value]}15`,
        color: QS_SUB_COLORS[value],
      }}
    >
      {QS_SUB_LABELS[value]}
    </span>
  );
}

function ImpressionShareDetail({ result, onAskAI }: { result: AuditResult; onAskAI?: (prompt: string) => void }) {
  const { impressionShareDiagnosis } = result;
  const [expandedCampaign, setExpandedCampaign] = useState<string | null>(null);

  if (impressionShareDiagnosis.avgIS === null) return null;

  const avgColor = isColor(impressionShareDiagnosis.avgIS ?? 0);

  return (
    <CollapsibleSection
      title="Impression Share Analysis"
      icon={<TrendingDown className="h-4 w-4 text-[#D4882A]" />}
    >
      <div className="flex flex-wrap gap-6">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-[#C4C0B6]">Search IS</div>
          <div className="font-mono text-[20px] font-bold" style={{ color: avgColor }}>
            {fmtPct(impressionShareDiagnosis.avgIS ?? 0)}
          </div>
        </div>
        {impressionShareDiagnosis.budgetLost !== null && (
          <div>
            <div className="text-[11px] uppercase tracking-wider text-[#C4C0B6]">Budget-Lost</div>
            <div className="font-mono text-[20px] font-bold text-[#E8E4DD]">
              {fmtPct(impressionShareDiagnosis.budgetLost)}
            </div>
          </div>
        )}
        {impressionShareDiagnosis.rankLost !== null && (
          <div>
            <div className="text-[11px] uppercase tracking-wider text-[#C4C0B6]">Rank-Lost</div>
            <div className="font-mono text-[20px] font-bold text-[#E8E4DD]">
              {fmtPct(impressionShareDiagnosis.rankLost)}
            </div>
          </div>
        )}
      </div>
      <div className="mt-3 text-[13px] text-[#C4C0B6]">{impressionShareDiagnosis.diagnosis}</div>

      {onAskAI && (
        <div className="mt-3 flex justify-end">
          <AskAIButton
            onClick={() =>
              onAskAI(
                `My Search IS is ${fmtPct(impressionShareDiagnosis.avgIS ?? 0)}. Budget-lost: ${fmtPct(impressionShareDiagnosis.budgetLost ?? 0)}, Rank-lost: ${fmtPct(impressionShareDiagnosis.rankLost ?? 0)}. Diagnosis: "${impressionShareDiagnosis.diagnosis}". What should I do?`,
              )
            }
          />
        </div>
      )}

      {impressionShareDiagnosis.campaignBreakdown.length > 0 && (
        <div className="mt-4 border-t border-[#3D3C36] pt-4">
          <div className="text-[12px] font-medium uppercase tracking-wider text-[#C4C0B6] mb-3">By Campaign</div>
          <div className="space-y-2">
            {impressionShareDiagnosis.campaignBreakdown.map((camp) => {
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
                        ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[#C4C0B6]" />
                        : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[#C4C0B6]" />}
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
                          <div className="font-mono text-[13px] text-[#C4C0B6]">-{fmtPct(camp.budgetLostIS)}</div>
                        </div>
                      )}
                      {camp.rankLostIS !== null && camp.rankLostIS > 0 && (
                        <div className="text-right hidden sm:block">
                          <div className="text-[10px] uppercase text-[#6B6760]">Rank</div>
                          <div className="font-mono text-[13px] text-[#C4C0B6]">-{fmtPct(camp.rankLostIS)}</div>
                        </div>
                      )}
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="border-t border-[#3D3C36] px-4 py-3">
                      {hasIssue && (
                        <div className="mb-3 rounded bg-[#24231F] px-3 py-2 text-[12px] text-[#C4C0B6]">
                          {camp.diagnosis === "budget" && (
                            <>
                              <span className="font-medium text-[#D4882A]">Recommendation:</span> Your ads are competitive when shown — you&apos;re just running out of budget. Increase daily budget or pause low-performing keywords to redistribute spend.
                            </>
                          )}
                          {camp.diagnosis === "rank" && (
                            <>
                              <span className="font-medium text-[#C45D4A]">Recommendation:</span> You&apos;re losing impressions to ad rank. Focus on improving Quality Score components below — especially any marked &ldquo;Below Avg&rdquo;.
                            </>
                          )}
                          {camp.diagnosis === "structural" && (
                            <>
                              <span className="font-medium text-[#C45D4A]">Recommendation:</span> Both budget and rank are limiting you. Tighten targeting first (pause broad/low-QS keywords), then reallocate budget to your best performers.
                            </>
                          )}
                        </div>
                      )}

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
                                      <span className="font-mono font-bold" style={{ color: qsColor }}>{kw.qualityScore ?? "—"}</span>
                                      <span className="text-[#6B6760]">/10</span>
                                    </td>
                                    <td className="py-2 text-center hidden md:table-cell"><QsBadge value={kw.creativeQuality} /></td>
                                    <td className="py-2 text-center hidden md:table-cell"><QsBadge value={kw.postClickQuality} /></td>
                                    <td className="py-2 text-center hidden md:table-cell"><QsBadge value={kw.searchPredictedCtr} /></td>
                                    <td className="py-2 text-right font-mono text-[#E8E4DD]">{fmt$(kw.cost)}</td>
                                    <td className="py-2 text-right font-mono text-[#C4C0B6] hidden sm:table-cell">{fmtN(kw.impressions)}</td>
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
                                  <div key={i} className="flex items-start gap-2 text-[11px] text-[#C4C0B6]">
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
    </CollapsibleSection>
  );
}

// ─── Search Terms Detail ────────────────────────────────────────────

function SearchTermsDetail({
  terms,
  onAskAI,
}: {
  terms: AuditResult["wastedSearchTerms"];
  onAskAI?: (prompt: string) => void;
}) {
  if (terms.length === 0) return null;

  return (
    <CollapsibleSection
      title={`Irrelevant Search Terms (${terms.length})`}
      icon={<Target className="h-4 w-4 text-[#D4882A]" />}
    >
      {onAskAI && (
        <div className="mb-3 flex justify-end">
          <AskAIButton
            onClick={() =>
              onAskAI(
                `I have ${terms.length} irrelevant search terms: ${terms.slice(0, 5).map((t) => `"${t.searchTerm}" (${fmt$(t.cost)})`).join(", ")}${terms.length > 5 ? ` and ${terms.length - 5} more` : ""}. How should I handle these?`,
              )
            }
          />
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-[#3D3C36] text-[11px] uppercase tracking-wider text-[#C4C0B6]">
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
                <td className="py-2.5 pr-3 text-right text-[#C4C0B6]">{fmtN(t.clicks)}</td>
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
    </CollapsibleSection>
  );
}

// ─── Main Component ─────────────────────────────────────────────────

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
  timeRange,
  onTimeRangeChange,
}: {
  overview: AuditOverview;
  details: AuditDetails | null;
  onAskAI?: (prompt: string) => void;
  onRedoAudit?: () => void;
  redoLoading?: boolean;
  lastAuditTime?: Date | null;
  timeRange?: TimeRangeOption;
  onTimeRangeChange?: (range: TimeRangeOption) => void;
}) {
  const auditResult = details?.auditResult ?? null;
  const detailsLoading = details === null;

  const conversionDim = auditResult?.dimensions.find((d) => d.key === "conversion_tracking");
  const showConversionBanner =
    conversionDim != null
      ? conversionDim.score <= 1
      : overview.conversionActions.filter((a) => a.includeInConversions).length === 0;

  return (
    <div className="min-h-full bg-[#1A1917] px-4 py-3 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl space-y-6">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-[20px] font-semibold text-[#E8E4DD]">{overview.accountName}</h1>
            <p className="text-[13px] text-[#C4C0B6]">
              {fmt$(overview.metrics.totalSpend)} spent · {fmtN(overview.metrics.totalConversions)} conversions
              {overview.metrics.cpa !== null && ` · ${fmt$(overview.metrics.cpa)} CPA`}
              {lastAuditTime && (
                <span className="ml-2 text-[#C4C0B6]/60">· {formatTimeAgo(lastAuditTime)}</span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {timeRange && onTimeRangeChange ? (
              <div className="relative">
                <select
                  value={timeRange.days}
                  onChange={(e) => {
                    const next = TIME_RANGE_OPTIONS.find(
                      (opt) => opt.days === Number(e.target.value),
                    );
                    if (next) onTimeRangeChange(next);
                  }}
                  className="cursor-pointer appearance-none rounded-sm bg-[#3D3C36] py-1 pl-2 pr-6 text-[11px] text-[#C4C0B6] transition hover:bg-[#4D4C46] focus:outline-none focus:ring-1 focus:ring-[#4CAF6E]"
                >
                  {TIME_RANGE_OPTIONS.map((opt) => (
                    <option key={opt.days} value={opt.days}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 h-3 w-3 -translate-y-1/2 text-[#C4C0B6]" />
              </div>
            ) : (
              <span className="rounded-sm bg-[#3D3C36] px-2 py-1 text-[11px] text-[#C4C0B6]">
                Last 30 days
              </span>
            )}
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

        {/* Pulse Metrics */}
        <div className="grid grid-cols-3 gap-3">
          <PulseMetricCard
            label="Waste Rate"
            value={auditResult?.pulseMetrics.wasteRate ?? null}
            unit="of spend"
            metric="waste"
            loading={detailsLoading}
          />
          <PulseMetricCard
            label="Demand Captured"
            value={auditResult?.pulseMetrics.demandCaptured ?? null}
            unit="of market"
            metric="demand"
            loading={detailsLoading}
          />
          <PulseMetricCard
            label="CPA"
            value={auditResult?.pulseMetrics.cpa ?? null}
            unit=""
            metric="cpa"
            loading={detailsLoading}
          />
        </div>

        {/* Verdict */}
        <VerdictCard verdict={auditResult?.verdict ?? null} loading={detailsLoading} />

        {/* 3 Passes */}
        <div className="space-y-4">
          <PassSection
            passKey="stopWasting"
            items={auditResult?.passes.stopWasting ?? []}
            loading={detailsLoading}
            onAskAI={onAskAI}
          />
          <PassSection
            passKey="captureMore"
            items={auditResult?.passes.captureMore ?? []}
            loading={detailsLoading}
            onAskAI={onAskAI}
          />
          <PassSection
            passKey="fixFundamentals"
            items={auditResult?.passes.fixFundamentals ?? []}
            loading={detailsLoading}
            onAskAI={onAskAI}
          />
        </div>

        {/* Campaign Performance */}
        <CampaignPerformanceSection campaigns={overview.campaigns} />

        {/* Detail Sections — collapsible drill-downs */}
        {auditResult && (
          <div className="space-y-3">
            <div className="text-[12px] font-medium uppercase tracking-wider text-[#6B6760]">
              Deep Dive
            </div>
            <WastedSpendDetail result={auditResult} onAskAI={onAskAI} />
            <ImpressionShareDetail result={auditResult} onAskAI={onAskAI} />
            <SearchTermsDetail terms={auditResult.wastedSearchTerms} onAskAI={onAskAI} />
          </div>
        )}

        {/* Bottom spacer for floating help panel */}
        <div aria-hidden="true" style={{ height: '6rem' }} />
      </div>
    </div>
  );
}
