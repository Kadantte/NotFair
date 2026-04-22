/**
 * Shared audit scorecard primitives.
 *
 * These components render from a narrow subset of AuditResult that is also
 * populated by `SharedAuditPayload` (the anonymized, persisted shape from
 * lib/audit/anonymize.ts) — so both the live audit page and the shares
 * detail page reuse the exact same visuals.
 *
 * Scope: scorecard (3 pulse metrics) + verdict + 3-pass action list.
 * Deep-dive sections (wasted spend detail, impression share drilldown)
 * stay with the live audit page — their data shape differs from the
 * anonymized payload and the Phase 1 detail page intentionally doesn't
 * render them.
 */

import {
  OctagonAlert,
  TrendingUp,
  Settings,
} from "lucide-react";
import type { PulseMetrics } from "@/lib/audit/scoring";

// ─── Types ───────────────────────────────────────────────────────────

/** Structurally compatible with both PassItem and SharedPassItem. */
export type ScorecardPassItem = {
  action: string;
  impact: string;
};

export type ScorecardPasses = {
  stopWasting: ScorecardPassItem[];
  captureMore: ScorecardPassItem[];
  fixFundamentals: ScorecardPassItem[];
};

// ─── Helpers ─────────────────────────────────────────────────────────

function fmt$(n: number): string {
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  return `$${n.toFixed(2)}`;
}

// ─── Pulse Metrics ───────────────────────────────────────────────────

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

export function PulseMetricCard({
  label,
  value,
  unit,
  metric,
}: {
  label: string;
  value: number | null;
  unit: string;
  metric: "waste" | "demand" | "cpa";
}) {
  const color = value !== null ? pulseColor(metric, value) : "#6B6760";
  const display =
    value === null
      ? "—"
      : metric === "cpa"
        ? fmt$(value)
        : `${value.toFixed(0)}%`;

  return (
    <div className="rounded border border-[#3D3C36] bg-[#24231F] p-4">
      <div className="text-[11px] uppercase tracking-wider text-[#C4C0B6]">{label}</div>
      <div className="mt-1 flex items-baseline gap-1.5">
        <span className="font-mono text-[24px] font-bold" style={{ color }}>
          {display}
        </span>
        {value !== null && metric !== "cpa" && (
          <span className="text-[12px] text-[#6B6760]">{unit}</span>
        )}
      </div>
    </div>
  );
}

export function PulseMetricsRow({ metrics }: { metrics: PulseMetrics }) {
  return (
    <div className="grid grid-cols-3 gap-3">
      <PulseMetricCard label="Waste Rate" value={metrics.wasteRate} unit="of spend" metric="waste" />
      <PulseMetricCard label="Demand Captured" value={metrics.demandCaptured} unit="of market" metric="demand" />
      <PulseMetricCard label="CPA" value={metrics.cpa} unit="" metric="cpa" />
    </div>
  );
}

// ─── Verdict ─────────────────────────────────────────────────────────

export function VerdictCard({ verdict }: { verdict: string | null }) {
  if (!verdict) return null;
  return (
    <div className="rounded border border-[#3D3C36] bg-[#24231F] p-5">
      <p className="text-[14px] leading-relaxed text-[#C4C0B6]">{verdict}</p>
    </div>
  );
}

// ─── Passes ──────────────────────────────────────────────────────────

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

export type PassKey = keyof typeof PASS_CONFIG;

/**
 * Read-only pass section: no "Ask AI" or inline mutation buttons. The live
 * audit page wraps this with its interactive `PassSection` that adds those;
 * the shares detail page uses this as-is.
 */
export function PassSectionStatic({
  passKey,
  items,
}: {
  passKey: PassKey;
  items: ScorecardPassItem[];
}) {
  const config = PASS_CONFIG[passKey];
  return (
    <div className="rounded border border-[#3D3C36] bg-[#24231F] p-5">
      <div className="flex items-center gap-2 text-[14px] font-medium text-[#E8E4DD]">
        {config.icon}
        {config.title}
      </div>
      {items.length === 0 ? (
        <p className="mt-2 text-[13px] text-[#6B6760] italic">{config.empty}</p>
      ) : (
        <div className="mt-3 space-y-2">
          {items.map((item, i) => (
            <div
              key={i}
              className="flex items-start gap-3 rounded border border-[#3D3C36] bg-[#1A1917] p-3"
            >
              <span
                className="mt-0.5 font-mono text-[13px] font-bold shrink-0"
                style={{ color: config.accentColor }}
              >
                {i + 1}.
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[13px] text-[#E8E4DD]">{item.action}</div>
                <div className="mt-1 font-mono text-[12px] text-[#4CAF6E]">{item.impact}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function PassesBlock({ passes }: { passes: ScorecardPasses }) {
  return (
    <div className="space-y-4">
      <PassSectionStatic passKey="stopWasting" items={passes.stopWasting} />
      <PassSectionStatic passKey="captureMore" items={passes.captureMore} />
      <PassSectionStatic passKey="fixFundamentals" items={passes.fixFundamentals} />
    </div>
  );
}
