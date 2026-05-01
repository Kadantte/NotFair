"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Minus, RefreshCw, TrendingDown, TrendingUp } from "lucide-react";
import {
  evaluateImpactMonitorInterventionAction,
  getImpactMonitorData,
  type ImpactMonitorListItem,
  type ImpactMonitorPageData,
  type ImpactMonitorSectionKey,
} from "./actions";
import { Button } from "@/components/ui/button";

// --- Utilities ---

function friendlyLabel(label: string | null | undefined): string {
  switch (label) {
    case "likely_improved": return "Improved";
    case "likely_worsened": return "Got worse";
    case "inconclusive": return "Inconclusive";
    case "too_new": return "Too soon";
    case "highly_confounded": return "Unclear";
    case "rolled_back": return "Rolled back";
    case "watching": return "Watching";
    default: return label ? label.replaceAll("_", " ") : "—";
  }
}

function labelTone(label: string | null | undefined): string {
  switch (label) {
    case "likely_improved":
      return "text-[#4CAF6E] border-[#4CAF6E]/30 bg-[#4CAF6E]/10";
    case "likely_worsened":
      return "text-[#C45D4A] border-[#C45D4A]/30 bg-[#C45D4A]/10";
    case "too_new":
    case "highly_confounded":
    case "watching":
      return "text-[#D4882A] border-[#D4882A]/30 bg-[#D4882A]/10";
    default:
      return "text-[#C4C0B6] border-[#3D3C36] bg-[#2A2925]";
  }
}

function formatInterventionDate(dateStr: string): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, { month: "long", day: "numeric" });
}

function formatPct(value: number | null | undefined): string {
  if (typeof value !== "number" || Number.isNaN(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${(value * 100).toFixed(0)}%`;
}

function friendlyMetricName(name: string | null | undefined): string {
  switch (name) {
    case "cpa": return "Cost per conversion";
    case "conversions": return "Conversions";
    case "cost": return "Spend";
    case "clicks": return "Clicks";
    case "impressions": return "Impressions";
    case "ctr": return "CTR";
    case "cvr": return "Conv. rate";
    default: return name ? name.toUpperCase() : "—";
  }
}

// --- Data helpers ---

const ALL_SECTION_ORDER: ImpactMonitorSectionKey[] = ["needs_attention", "ready_for_review", "watching", "archive"];

const MIN_AFTER_DAYS = 3; // mirrors MIN_AFTER_DAYS_FOR_DIRECTION in lib/db/impact.ts

function daysUntilEvaluable(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  const interventionDay = new Date(y, m - 1, d);
  interventionDay.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const elapsed = Math.floor((today.getTime() - interventionDay.getTime()) / 86_400_000);
  return Math.max(0, MIN_AFTER_DAYS - elapsed);
}

function groupByDate(items: ImpactMonitorListItem[]): Array<{ date: string; items: ImpactMonitorListItem[] }> {
  const groups = new Map<string, ImpactMonitorListItem[]>();
  for (const item of items) {
    const bucket = groups.get(item.interventionDate);
    if (bucket) bucket.push(item);
    else groups.set(item.interventionDate, [item]);
  }
  return Array.from(groups.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, dayItems]) => ({ date, items: dayItems }));
}

function dayVerdict(items: ImpactMonitorListItem[]): { label: string; tone: string } {
  let improved = 0, worsened = 0, watching = 0;
  for (const item of items) {
    const label = item.latestEvaluation?.resultLabel ?? item.status;
    if (label === "likely_improved") improved++;
    else if (label === "likely_worsened") worsened++;
    else if (label === "watching" || label === "too_new") watching++;
    // inconclusive and highly_confounded count as "done but unclear"
    else if (label === "inconclusive" || label === "highly_confounded") worsened++;
    // rolled_back items are already resolved — don't show them as red (they're archived, not actionable)
  }
  if (worsened > 0) {
    return { label: `${worsened} need${worsened !== 1 ? "" : "s"} attention`, tone: "text-[#C45D4A] border-[#C45D4A]/30 bg-[#C45D4A]/10" };
  }
  if (improved > 0 && improved === items.length) {
    return { label: "All improved", tone: "text-[#4CAF6E] border-[#4CAF6E]/30 bg-[#4CAF6E]/10" };
  }
  if (improved > 0) {
    return { label: `${improved} improved`, tone: "text-[#4CAF6E] border-[#4CAF6E]/30 bg-[#4CAF6E]/10" };
  }
  if (watching > 0) {
    const allTooNew = items.every(
      (item) => item.latestEvaluation?.resultLabel === "too_new" || !item.latestEvaluation,
    );
    const daysLeft = daysUntilEvaluable(items[0].interventionDate);
    if (allTooNew && daysLeft > 0) {
      return { label: `In ${daysLeft}d`, tone: "text-[#C4C0B6] border-[#3D3C36] bg-[#2A2925]" };
    }
    return { label: "Watching", tone: "text-[#D4882A] border-[#D4882A]/30 bg-[#D4882A]/10" };
  }
  return { label: "Evaluating", tone: "text-[#C4C0B6] border-[#3D3C36] bg-[#2A2925]" };
}

// --- Components ---

function VerdictIcon({ label }: { label: string }) {
  if (label === "likely_improved") return <TrendingUp className="h-4 w-4 shrink-0" />;
  if (label === "likely_worsened") return <TrendingDown className="h-4 w-4 shrink-0" />;
  return <Minus className="h-3.5 w-3.5 shrink-0" />;
}

function DayCard({
  date,
  items,
  selected,
  onClick,
}: {
  date: string;
  items: ImpactMonitorListItem[];
  selected: boolean;
  onClick: () => void;
}) {
  const verdict = dayVerdict(items);
  const totalOps = items.reduce((sum, item) => sum + item.operationCount, 0);

  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-xl border p-4 text-left transition-colors ${
        selected
          ? "border-[#4CAF6E]/50 bg-[#4CAF6E]/10"
          : "border-[#3D3C36] bg-[#24231F]/60 hover:bg-[#2B2A26]"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-semibold text-[#E8E4DD]">{formatInterventionDate(date)}</span>
        <span className={`inline-flex shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${verdict.tone}`}>
          {verdict.label}
        </span>
      </div>
      <div className="mt-1.5 text-xs text-[#9D988C]">
        {items.length} campaign{items.length !== 1 ? "s" : ""} · {totalOps} change{totalOps !== 1 ? "s" : ""}
      </div>
    </button>
  );
}

function CampaignCard({ item }: { item: ImpactMonitorListItem }) {
  const evaluation = item.latestEvaluation;
  const label = evaluation?.resultLabel ?? (item.status === "watching" ? "watching" : null);
  const tone = labelTone(label);
  const deltaColor =
    label === "likely_improved" ? "text-[#4CAF6E]" :
    label === "likely_worsened" ? "text-[#C45D4A]" :
    "text-[#E8E4DD]";

  return (
    <div className="rounded-xl border border-[#3D3C36] bg-[#1E1D1A] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-[#E8E4DD]">{item.changeSummary}</div>
          <div className="mt-0.5 text-xs text-[#9D988C]">{item.operationCount} change{item.operationCount !== 1 ? "s" : ""}</div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <VerdictIcon label={label ?? ""} />
          <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium ${tone}`}>
            {friendlyLabel(label)}
          </span>
        </div>
      </div>

      {evaluation ? (
        <div className="mt-3 space-y-1.5">
          <p className="text-xs leading-relaxed text-[#C4C0B6]">{evaluation.reasonSummary}</p>
          {evaluation.primaryMetricDeltaPct !== null && (
            <div className="text-xs text-[#9D988C]">
              {friendlyMetricName(evaluation.primaryMetricName)}:{" "}
              <span className={`font-medium ${deltaColor}`}>{formatPct(evaluation.primaryMetricDeltaPct)}</span>
            </div>
          )}
        </div>
      ) : (
        <p className="mt-3 text-xs text-[#9D988C]">Still collecting data — check back in a few days.</p>
      )}
    </div>
  );
}

function DayDetail({
  date,
  items,
  onEvaluate,
  isEvaluating,
}: {
  date: string;
  items: ImpactMonitorListItem[];
  onEvaluate: () => Promise<void>;
  isEvaluating: boolean;
}) {
  const totalOps = items.reduce((sum, item) => sum + item.operationCount, 0);
  const daysLeft = daysUntilEvaluable(date);
  const tooSoon = daysLeft > 0;
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-[#3D3C36] bg-[#24231F]/70 p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-base font-semibold text-[#E8E4DD]">{formatInterventionDate(date)}</div>
            <div className="mt-1 text-sm text-[#9D988C]">
              {items.length} campaign{items.length !== 1 ? "s" : ""} · {totalOps} change{totalOps !== 1 ? "s" : ""} total
            </div>
            {tooSoon && (
              <div className="mt-1.5 text-xs text-[#9D988C]">
                Results available in {daysLeft} day{daysLeft !== 1 ? "s" : ""} — needs {MIN_AFTER_DAYS}+ days of data.
              </div>
            )}
          </div>
          <Button
            size="sm"
            onClick={onEvaluate}
            disabled={isEvaluating || tooSoon}
            className="shrink-0 bg-[#4CAF6E] text-[#0F1510] hover:bg-[#5BC07F] disabled:opacity-40"
          >
            {isEvaluating ? "Checking..." : tooSoon ? `In ${daysLeft}d` : "Check results"}
          </Button>
        </div>
      </div>
      <div className="space-y-3">
        {items.map((item) => (
          <CampaignCard key={item.id} item={item} />
        ))}
      </div>
    </div>
  );
}

// --- Main Page ---

export default function ImpactMonitorPage() {
  const [data, setData] = useState<ImpactMonitorPageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isEvaluating, setIsEvaluating] = useState(false);

  const refresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const next = await getImpactMonitorData();
      setData(next);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load Impact Monitor");
    } finally {
      setIsRefreshing(false);
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const allItems = useMemo(
    () => ALL_SECTION_ORDER.flatMap((key) => data?.sections[key] ?? []),
    [data],
  );

  const dayGroups = useMemo(() => groupByDate(allItems), [allItems]);

  useEffect(() => {
    if (!selectedDate && dayGroups.length > 0) {
      setSelectedDate(dayGroups[0].date);
    }
  }, [dayGroups, selectedDate]);

  const selectedDayItems = useMemo(
    () => dayGroups.find((g) => g.date === selectedDate)?.items ?? [],
    [dayGroups, selectedDate],
  );

  const handleEvaluateDay = useCallback(async () => {
    if (isEvaluating || selectedDayItems.length === 0) return;
    setIsEvaluating(true);
    setError(null);
    try {
      const results = await Promise.allSettled(
        selectedDayItems.map((item) => evaluateImpactMonitorInterventionAction(item.id)),
      );
      await refresh();
      // Set error AFTER refresh so refresh's setError(null) doesn't wipe it.
      const firstFailure = results.find((r): r is PromiseRejectedResult => r.status === "rejected");
      if (firstFailure) {
        setError(firstFailure.reason instanceof Error ? firstFailure.reason.message : "Evaluation failed for one or more campaigns");
      }
    } finally {
      setIsEvaluating(false);
    }
  }, [selectedDayItems, refresh, isEvaluating]);

  if (loading && !data) {
    return (
      <div className="flex h-full items-center justify-center bg-[#1A1917]">
        <div className="flex items-center gap-3">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#4CAF6E] border-t-transparent" />
          <span className="text-[13px] text-[#C4C0B6]">Loading...</span>
        </div>
      </div>
    );
  }

  return (
    <section className="min-h-0 overflow-y-auto bg-[#1A1917] px-4 py-4 sm:px-6 sm:py-6">
      <div className="mx-auto max-w-[1400px] space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-[#E8E4DD]">Impact Monitor</h1>
            <p className="mt-1 text-sm text-[#9D988C]">See what happened after each day of changes NotFair made to your campaigns.</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={refresh}
            disabled={isRefreshing}
            className="border-[#3D3C36] bg-[#24231F] text-[#C4C0B6] hover:bg-[#2E2D28] hover:text-[#E8E4DD]"
          >
            <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        {error && (
          <div className="rounded-xl border border-[#C45D4A]/30 bg-[#C45D4A]/10 p-4 text-sm text-[#F0B4AA]">
            {error}
          </div>
        )}

        {dayGroups.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#3D3C36] bg-[#24231F]/40 p-12 text-center">
            <div className="text-sm font-medium text-[#E8E4DD]">No changes tracked yet</div>
            <p className="mt-2 text-sm text-[#9D988C]">
              When NotFair makes changes to your campaigns, they&apos;ll appear here with before/after results.
            </p>
          </div>
        ) : (
          <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
            <div className="space-y-2">
              {dayGroups.map(({ date, items }) => (
                <DayCard
                  key={date}
                  date={date}
                  items={items}
                  selected={date === selectedDate}
                  onClick={() => setSelectedDate(date)}
                />
              ))}
            </div>

            <div className="min-w-0">
              {!selectedDate || selectedDayItems.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-[#3D3C36] bg-[#24231F]/40 p-8 text-center text-sm text-[#9D988C]">
                  Select a day to see results.
                </div>
              ) : (
                <DayDetail
                  date={selectedDate}
                  items={selectedDayItems}
                  onEvaluate={handleEvaluateDay}
                  isEvaluating={isEvaluating}
                />
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
