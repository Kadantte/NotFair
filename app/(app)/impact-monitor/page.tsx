"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Activity, AlertTriangle, CheckCircle2, Clock3, FlaskConical, RefreshCw, Sparkles } from "lucide-react";
import {
  evaluateImpactMonitorInterventionAction,
  evaluateWatchingImpactMonitorAction,
  getImpactMonitorData,
  type ImpactMonitorDetail,
  type ImpactMonitorListItem,
  type ImpactMonitorPageData,
  type ImpactMonitorSectionKey,
} from "./actions";
import { Button } from "@/components/ui/button";

type SectionConfig = {
  key: ImpactMonitorSectionKey;
  title: string;
  subtitle: string;
  empty: string;
};

const SECTIONS: SectionConfig[] = [
  {
    key: "watching",
    title: "Watching",
    subtitle: "Still collecting after-data",
    empty: "No interventions currently watching.",
  },
  {
    key: "ready_for_review",
    title: "Ready for review",
    subtitle: "Mature readouts worth checking",
    empty: "Nothing ready yet.",
  },
  {
    key: "needs_attention",
    title: "Needs attention",
    subtitle: "Likely worsened or highly confounded",
    empty: "No interventions need attention.",
  },
  {
    key: "archive",
    title: "Archive",
    subtitle: "Closed or rolled-back interventions",
    empty: "Archive is empty.",
  },
];

function formatDateTime(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatPct(value: number | null | undefined) {
  if (typeof value !== "number" || Number.isNaN(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${(value * 100).toFixed(0)}%`;
}

function formatMetricName(value: string | null | undefined) {
  if (!value) return "—";
  return value.toUpperCase();
}

function formatMetricValue(name: string, value: number | null | undefined) {
  if (typeof value !== "number" || Number.isNaN(value)) return "—";
  if (name === "cpa" || name === "cost") return `$${value.toFixed(2)}`;
  if (name === "ctr" || name === "cvr") return `${(value * 100).toFixed(1)}%`;
  return value.toFixed(value >= 10 ? 0 : 2);
}

function resultTone(resultLabel: string | null | undefined) {
  switch (resultLabel) {
    case "likely_improved":
      return "text-[#4CAF6E] border-[#4CAF6E]/30 bg-[#4CAF6E]/10";
    case "likely_worsened":
    case "highly_confounded":
      return "text-[#C45D4A] border-[#C45D4A]/30 bg-[#C45D4A]/10";
    case "too_new":
      return "text-[#D1A65A] border-[#D1A65A]/30 bg-[#D1A65A]/10";
    default:
      return "text-[#C4C0B6] border-[#3D3C36] bg-[#2A2925]";
  }
}

function confidenceTone(confidence: string | null | undefined) {
  switch (confidence) {
    case "high":
      return "text-[#4CAF6E]";
    case "medium":
      return "text-[#D1A65A]";
    default:
      return "text-[#C4C0B6]";
  }
}

function SectionCard({
  title,
  subtitle,
  count,
}: {
  title: string;
  subtitle: string;
  count: number;
}) {
  return (
    <div className="rounded-xl border border-[#3D3C36] bg-[#24231F]/70 p-4">
      <div className="text-sm font-medium text-[#E8E4DD]">{title}</div>
      <div className="mt-1 text-xs text-[#C4C0B6]">{subtitle}</div>
      <div className="mt-3 text-2xl font-semibold text-[#E8E4DD]">{count}</div>
    </div>
  );
}

function InterventionRow({
  item,
  selected,
  onClick,
}: {
  item: ImpactMonitorListItem;
  selected: boolean;
  onClick: () => void;
}) {
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
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-[#E8E4DD]">{item.name}</div>
          <div className="mt-1 text-xs text-[#C4C0B6]">Campaign {item.campaignId}</div>
        </div>
        {item.latestEvaluation ? (
          <span className={`inline-flex shrink-0 rounded-full border px-2 py-1 text-[10px] font-medium ${resultTone(item.latestEvaluation.resultLabel)}`}>
            {item.latestEvaluation.resultLabel.replaceAll("_", " ")}
          </span>
        ) : (
          <span className="inline-flex shrink-0 rounded-full border border-[#3D3C36] px-2 py-1 text-[10px] text-[#C4C0B6]">
            {item.status.replaceAll("_", " ")}
          </span>
        )}
      </div>

      <div className="mt-3 line-clamp-2 text-xs text-[#C4C0B6]">{item.changeSummary}</div>

      <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-[#9D988C]">
        <span>{item.operationCount} ops</span>
        <span>{formatMetricName(item.latestEvaluation?.primaryMetricName ?? item.primaryMetric)}</span>
        <span>{item.latestEvaluation ? formatPct(item.latestEvaluation.primaryMetricDeltaPct) : formatDateTime(item.startedAt)}</span>
      </div>
    </button>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-dashed border-[#3D3C36] bg-[#24231F]/40 p-6 text-sm text-[#9D988C]">
      {message}
    </div>
  );
}

function EvaluationPanel({ detail }: { detail: ImpactMonitorDetail }) {
  const evaluation = detail.latestEvaluation;
  if (!evaluation) {
    return (
      <div className="rounded-xl border border-[#3D3C36] bg-[#24231F]/50 p-4 text-sm text-[#C4C0B6]">
        No evaluation yet.
      </div>
    );
  }

  const supportingMetrics = Object.entries(evaluation.supportingMetrics).slice(0, 6);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-[#3D3C36] bg-[#24231F]/70 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`inline-flex rounded-full border px-2 py-1 text-[11px] font-medium ${resultTone(evaluation.resultLabel)}`}>
            {evaluation.resultLabel.replaceAll("_", " ")}
          </span>
          <span className={`text-[11px] font-medium ${confidenceTone(evaluation.confidence)}`}>
            {evaluation.confidence} confidence
          </span>
          <span className="text-[11px] text-[#9D988C]">{evaluation.confounderCountInternal} confounders</span>
        </div>
        <div className="mt-3 text-sm text-[#E8E4DD]">{evaluation.reasonSummary}</div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-xl border border-[#3D3C36] bg-[#24231F]/60 p-4">
          <div className="text-[11px] uppercase tracking-wide text-[#9D988C]">Primary metric</div>
          <div className="mt-2 text-lg font-semibold text-[#E8E4DD]">{formatMetricName(evaluation.primaryMetricName)}</div>
          <div className="mt-1 text-xs text-[#C4C0B6]">
            {formatMetricValue(evaluation.primaryMetricName, evaluation.primaryMetricBefore)} → {formatMetricValue(evaluation.primaryMetricName, evaluation.primaryMetricAfter)}
          </div>
        </div>
        <div className="rounded-xl border border-[#3D3C36] bg-[#24231F]/60 p-4">
          <div className="text-[11px] uppercase tracking-wide text-[#9D988C]">Delta</div>
          <div className="mt-2 text-lg font-semibold text-[#E8E4DD]">{formatPct(evaluation.primaryMetricDeltaPct)}</div>
          <div className="mt-1 text-xs text-[#C4C0B6]">vs baseline window</div>
        </div>
        <div className="rounded-xl border border-[#3D3C36] bg-[#24231F]/60 p-4">
          <div className="text-[11px] uppercase tracking-wide text-[#9D988C]">Last evaluated</div>
          <div className="mt-2 text-sm font-medium text-[#E8E4DD]">{formatDateTime(evaluation.createdAt)}</div>
        </div>
      </div>

      <div className="rounded-xl border border-[#3D3C36] bg-[#24231F]/70 p-4">
        <div className="text-sm font-medium text-[#E8E4DD]">Supporting metrics</div>
        <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {supportingMetrics.map(([name, metric]) => (
            <div key={name} className="rounded-lg border border-[#3D3C36] bg-[#1E1D1A] p-3">
              <div className="text-[11px] uppercase tracking-wide text-[#9D988C]">{formatMetricName(name)}</div>
              <div className="mt-2 text-sm text-[#E8E4DD]">
                {formatMetricValue(name, metric.before)} → {formatMetricValue(name, metric.after)}
              </div>
              <div className="mt-1 text-xs text-[#C4C0B6]">{formatPct(metric.deltaPct)}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function ImpactMonitorPage() {
  const [data, setData] = useState<ImpactMonitorPageData | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, startRefreshing] = useTransition();
  const [isEvaluating, startEvaluating] = useTransition();
  const [isEvaluatingWatching, startEvaluatingWatching] = useTransition();
  const selectedIdRef = useRef<number | null>(null);

  const refresh = useCallback((nextSelectedId?: number | null) => {
    const targetId = nextSelectedId === undefined ? selectedIdRef.current ?? undefined : nextSelectedId ?? undefined;
    startRefreshing(async () => {
      try {
        const next = await getImpactMonitorData(targetId);
        selectedIdRef.current = next.selectedId;
        setData(next);
        setSelectedId(next.selectedId);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load Impact Monitor");
      } finally {
        setLoading(false);
      }
    });
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  const sectionCounts = useMemo(() => {
    return {
      watching: data?.sections.watching.length ?? 0,
      ready_for_review: data?.sections.ready_for_review.length ?? 0,
      needs_attention: data?.sections.needs_attention.length ?? 0,
      archive: data?.sections.archive.length ?? 0,
    };
  }, [data]);

  const handleSelect = useCallback((id: number) => {
    setSelectedId(id);
    refresh(id);
  }, [refresh]);

  const handleEvaluateSelected = useCallback(() => {
    if (!selectedId) return;
    startEvaluating(async () => {
      try {
        await evaluateImpactMonitorInterventionAction(selectedId);
        await refresh(selectedId);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to evaluate intervention");
      }
    });
  }, [refresh, selectedId]);

  const handleEvaluateWatching = useCallback(() => {
    startEvaluatingWatching(async () => {
      try {
        await evaluateWatchingImpactMonitorAction();
        await refresh(selectedId);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to evaluate watching interventions");
      }
    });
  }, [refresh, selectedId]);

  if (loading && !data) {
    return (
      <div className="flex h-full items-center justify-center bg-[#1A1917]">
        <div className="flex items-center gap-3">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#4CAF6E] border-t-transparent" />
          <span className="text-[13px] text-[#C4C0B6]">Loading Impact Monitor...</span>
        </div>
      </div>
    );
  }

  return (
    <section className="min-h-0 overflow-y-auto bg-[#1A1917] px-4 py-4 sm:px-6 sm:py-6">
      <div className="mx-auto max-w-[1500px] space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-[#4CAF6E]">
              <FlaskConical className="h-4 w-4" />
              <span className="text-xs font-medium uppercase tracking-[0.18em]">Impact Monitor</span>
            </div>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-[#E8E4DD]">Watch campaign interventions honestly</h1>
            <p className="mt-2 max-w-3xl text-sm text-[#C4C0B6]">
              Group writes into campaign episodes, wait for enough after-data, then review confounder-aware readouts instead of fake per-keyword attribution.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => refresh(selectedId)}
              disabled={isRefreshing}
              className="border-[#3D3C36] bg-[#24231F] text-[#C4C0B6] hover:bg-[#2E2D28] hover:text-[#E8E4DD]"
            >
              <RefreshCw className={`mr-1 h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleEvaluateWatching}
              disabled={isEvaluatingWatching || sectionCounts.watching === 0}
              className="border-[#3D3C36] bg-[#24231F] text-[#C4C0B6] hover:bg-[#2E2D28] hover:text-[#E8E4DD]"
            >
              <Sparkles className={`mr-1 h-3.5 w-3.5 ${isEvaluatingWatching ? "animate-pulse" : ""}`} />
              Evaluate watching
            </Button>
            <Button
              size="sm"
              onClick={handleEvaluateSelected}
              disabled={isEvaluating || !selectedId}
              className="bg-[#4CAF6E] text-[#0F1510] hover:bg-[#5BC07F]"
            >
              <Activity className={`mr-1 h-3.5 w-3.5 ${isEvaluating ? "animate-pulse" : ""}`} />
              Evaluate selected
            </Button>
          </div>
        </div>

        {error && (
          <div className="rounded-xl border border-[#C45D4A]/30 bg-[#C45D4A]/10 p-4 text-sm text-[#F0B4AA]">
            {error}
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <SectionCard title="Watching" subtitle="Collecting post-change data" count={sectionCounts.watching} />
          <SectionCard title="Ready for review" subtitle="Enough signal to inspect" count={sectionCounts.ready_for_review} />
          <SectionCard title="Needs attention" subtitle="Likely worsened or confounded" count={sectionCounts.needs_attention} />
          <SectionCard title="Archive" subtitle="Closed interventions" count={sectionCounts.archive} />
        </div>

        <div className="grid gap-6 xl:grid-cols-[520px_minmax(0,1fr)]">
          <div className="space-y-6">
            {SECTIONS.map((section) => {
              const items = data?.sections[section.key] ?? [];
              return (
                <div key={section.key} className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium text-[#E8E4DD]">{section.title}</div>
                      <div className="text-xs text-[#9D988C]">{section.subtitle}</div>
                    </div>
                    <div className="text-xs text-[#9D988C]">{items.length}</div>
                  </div>

                  {items.length === 0 ? (
                    <EmptyState message={section.empty} />
                  ) : (
                    <div className="space-y-3">
                      {items.map((item) => (
                        <InterventionRow
                          key={item.id}
                          item={item}
                          selected={item.id === data?.selectedId}
                          onClick={() => handleSelect(item.id)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="min-w-0 space-y-4">
            {!data?.detail ? (
              <div className="rounded-2xl border border-dashed border-[#3D3C36] bg-[#24231F]/40 p-8 text-center text-[#9D988C]">
                Pick an intervention to inspect.
              </div>
            ) : (
              <>
                <div className="rounded-2xl border border-[#3D3C36] bg-[#24231F]/70 p-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <div className="text-[11px] uppercase tracking-[0.18em] text-[#9D988C]">Campaign {data.detail.campaignId}</div>
                      <h2 className="mt-2 text-xl font-semibold text-[#E8E4DD]">{data.detail.name}</h2>
                      <div className="mt-2 text-sm text-[#C4C0B6]">{data.detail.changeSummary}</div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <span className={`inline-flex rounded-full border px-2 py-1 text-[11px] font-medium ${resultTone(data.detail.latestEvaluation?.resultLabel ?? data.detail.status)}`}>
                        {(data.detail.latestEvaluation?.resultLabel ?? data.detail.status).replaceAll("_", " ")}
                      </span>
                      <span className="inline-flex rounded-full border border-[#3D3C36] px-2 py-1 text-[11px] text-[#C4C0B6]">
                        {data.detail.operationCount} ops
                      </span>
                    </div>
                  </div>

                  <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <div className="rounded-xl border border-[#3D3C36] bg-[#1E1D1A] p-4">
                      <div className="text-[11px] uppercase tracking-wide text-[#9D988C]">Hypothesis</div>
                      <div className="mt-2 text-sm text-[#E8E4DD]">{data.detail.hypothesis ?? "Not captured"}</div>
                    </div>
                    <div className="rounded-xl border border-[#3D3C36] bg-[#1E1D1A] p-4">
                      <div className="text-[11px] uppercase tracking-wide text-[#9D988C]">Primary metric</div>
                      <div className="mt-2 text-sm text-[#E8E4DD]">{formatMetricName(data.detail.primaryMetric)}</div>
                    </div>
                    <div className="rounded-xl border border-[#3D3C36] bg-[#1E1D1A] p-4">
                      <div className="text-[11px] uppercase tracking-wide text-[#9D988C]">Started</div>
                      <div className="mt-2 text-sm text-[#E8E4DD]">{formatDateTime(data.detail.startedAt)}</div>
                    </div>
                    <div className="rounded-xl border border-[#3D3C36] bg-[#1E1D1A] p-4">
                      <div className="text-[11px] uppercase tracking-wide text-[#9D988C]">Request bundles</div>
                      <div className="mt-2 text-sm text-[#E8E4DD]">{data.detail.requestIds.length || 0}</div>
                    </div>
                  </div>
                </div>

                <EvaluationPanel detail={data.detail} />

                <div className="rounded-2xl border border-[#3D3C36] bg-[#24231F]/70 p-5">
                  <div className="flex items-center gap-2">
                    <Clock3 className="h-4 w-4 text-[#C4C0B6]" />
                    <div className="text-sm font-medium text-[#E8E4DD]">Linked operations</div>
                  </div>
                  <div className="mt-4 space-y-3">
                    {data.detail.operations.map((operation) => (
                      <div key={operation.id} className="rounded-xl border border-[#3D3C36] bg-[#1E1D1A] p-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="text-sm font-medium text-[#E8E4DD]">{operation.action.replaceAll("_", " ")}</div>
                          <div className="flex items-center gap-2 text-[11px] text-[#9D988C]">
                            <span>{operation.entityType}</span>
                            {operation.rolledBack ? (
                              <span className="inline-flex items-center gap-1 rounded-full border border-[#C45D4A]/30 bg-[#C45D4A]/10 px-2 py-1 text-[#F0B4AA]">
                                <AlertTriangle className="h-3 w-3" /> rolled back
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-full border border-[#4CAF6E]/30 bg-[#4CAF6E]/10 px-2 py-1 text-[#9BE0AD]">
                                <CheckCircle2 className="h-3 w-3" /> active
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="mt-2 text-xs text-[#C4C0B6]">
                          {operation.label ?? operation.entityRef ?? "No label"}
                        </div>
                        <div className="mt-2 text-[11px] text-[#9D988C]">{formatDateTime(operation.createdAt)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
