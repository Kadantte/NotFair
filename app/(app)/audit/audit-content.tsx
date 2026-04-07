"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, AlertTriangle, TrendingDown, Target, Zap } from "lucide-react";
import type { AuditOverview, AuditDetails } from "./actions";
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
        <div
          key={i}
          className="rounded border border-[#3D3C36] bg-[#24231F] p-4"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <span className="mr-2 font-mono text-[14px] font-bold text-[#4CAF6E]">{i + 1}.</span>
              <span className="text-[13px] text-[#E8E4DD]">{action.action}</span>
            </div>
            <span className="shrink-0 font-mono text-[12px] text-[#4CAF6E]">{action.impact}</span>
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

        {/* Scorecard */}
        <ScorecardTable
          dimensions={auditResult?.dimensions ?? null}
          loading={detailsLoading}
        />

        {/* Detail sections — only after Phase 2 */}
        {auditResult && (
          <>
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
