"use server";

import { redirect } from "next/navigation";
import {
  evaluateChangeIntervention,
  evaluateWatchingChangeInterventions,
  getChangeIntervention,
  listChangeInterventions,
} from "@/lib/db/interventions";
import { getSessionAuth } from "@/lib/session";

type RawListItem = Awaited<ReturnType<typeof listChangeInterventions>>["items"][number];
type RawDetail = NonNullable<Awaited<ReturnType<typeof getChangeIntervention>>>;
type RawEvaluation = NonNullable<RawDetail["latestEvaluation"]>;

export type ImpactMonitorSectionKey = "watching" | "ready_for_review" | "needs_attention" | "archive";

export type ImpactMonitorMetricComparison = {
  before: number | null;
  after: number | null;
  delta: number | null;
  deltaPct: number | null;
};

export type ImpactMonitorEvaluation = {
  resultLabel: string;
  confidence: string;
  primaryMetricName: string;
  primaryMetricBefore: number | null;
  primaryMetricAfter: number | null;
  primaryMetricDeltaPct: number | null;
  confounderCountInternal: number;
  reasonSummary: string;
  reasonCodes: string[];
  supportingMetrics: Record<string, ImpactMonitorMetricComparison>;
  createdAt: string;
};

export type ImpactMonitorListItem = {
  id: number;
  campaignId: string;
  interventionDate: string;
  name: string;
  changeSummary: string;
  hypothesis: string | null;
  primaryMetric: string | null;
  goalDirection: string | null;
  status: string;
  requestIds: string[];
  startedAt: string;
  endedAt: string | null;
  operationCount: number;
  latestEvaluation: {
    resultLabel: string;
    confidence: string;
    primaryMetricName: string;
    primaryMetricDeltaPct: number | null;
    reasonSummary: string;
    createdAt: string;
  } | null;
};

export type ImpactMonitorDetail = Omit<ImpactMonitorListItem, "latestEvaluation"> & {
  operations: Array<{
    id: number;
    operationId: number;
    operationOrder: number;
    requestId: string | null;
    action: string;
    entityType: string;
    entityRef: string | null;
    label: string | null;
    createdAt: string;
    rolledBack: boolean;
  }>;
  latestEvaluation: ImpactMonitorEvaluation | null;
};

export type ImpactMonitorPageData = {
  accountId: string;
  total: number;
  selectedId: number | null;
  sections: Record<ImpactMonitorSectionKey, ImpactMonitorListItem[]>;
  detail: ImpactMonitorDetail | null;
};

function requireAuth<T>(fn: () => Promise<T>): Promise<T> {
  return fn().catch((err) => {
    if (err instanceof Error && err.message === "Not authenticated") {
      redirect("/connect");
    }
    throw err;
  });
}

function toIso(value: Date | string | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function normalizeMetricName(value: unknown, fallback: string | null = null) {
  if (typeof value === "string" && value.trim()) return value;
  return fallback ?? "unknown";
}

function normalizeNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeSupportingMetrics(value: RawEvaluation["supportingMetrics"]): Record<string, ImpactMonitorMetricComparison> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  const out: Record<string, ImpactMonitorMetricComparison> = {};
  for (const [key, metric] of Object.entries(value)) {
    if (!metric || typeof metric !== "object" || Array.isArray(metric)) continue;
    const candidate = metric as Record<string, unknown>;
    out[key] = {
      before: typeof candidate.before === "number" ? candidate.before : null,
      after: typeof candidate.after === "number" ? candidate.after : null,
      delta: typeof candidate.delta === "number" ? candidate.delta : null,
      deltaPct: typeof candidate.deltaPct === "number" ? candidate.deltaPct : null,
    };
  }
  return out;
}

function normalizeEvaluation(evaluation: RawEvaluation | null): ImpactMonitorEvaluation | null {
  if (!evaluation) return null;
  return {
    resultLabel: evaluation.resultLabel,
    confidence: evaluation.confidence,
    primaryMetricName: normalizeMetricName(evaluation.primaryMetricName),
    primaryMetricBefore: normalizeNumber(evaluation.primaryMetricBefore),
    primaryMetricAfter: normalizeNumber(evaluation.primaryMetricAfter),
    primaryMetricDeltaPct: normalizeNumber(evaluation.primaryMetricDeltaPct),
    confounderCountInternal: evaluation.confounderCountInternal,
    reasonSummary: evaluation.reasonSummary,
    reasonCodes: Array.isArray(evaluation.reasonCodes) ? evaluation.reasonCodes.filter((item): item is string => typeof item === "string") : [],
    supportingMetrics: normalizeSupportingMetrics(evaluation.supportingMetrics),
    createdAt: toIso(evaluation.createdAt)!,
  };
}

function normalizeListItem(item: RawListItem): ImpactMonitorListItem {
  return {
    id: item.id,
    campaignId: item.campaignId,
    interventionDate: item.interventionDate,
    name: item.name,
    changeSummary: item.changeSummary,
    hypothesis: item.hypothesis,
    primaryMetric: item.primaryMetric,
    goalDirection: item.goalDirection,
    status: item.status,
    requestIds: item.requestIds,
    startedAt: toIso(item.startedAt)!,
    endedAt: toIso(item.endedAt),
    operationCount: item.operationCount,
    latestEvaluation: item.latestEvaluation
      ? {
          resultLabel: item.latestEvaluation.resultLabel,
          confidence: item.latestEvaluation.confidence,
          primaryMetricName: normalizeMetricName(item.latestEvaluation.primaryMetricName, item.primaryMetric),
          primaryMetricDeltaPct: normalizeNumber(item.latestEvaluation.primaryMetricDeltaPct),
          reasonSummary: item.latestEvaluation.reasonSummary,
          createdAt: toIso(item.latestEvaluation.createdAt)!,
        }
      : null,
  };
}

function normalizeDetail(detail: RawDetail): ImpactMonitorDetail {
  return {
    id: detail.id,
    campaignId: detail.campaignId,
    interventionDate: detail.interventionDate,
    name: detail.name,
    changeSummary: detail.changeSummary,
    hypothesis: detail.hypothesis,
    primaryMetric: detail.primaryMetric,
    goalDirection: detail.goalDirection,
    status: detail.status,
    requestIds: detail.requestIds,
    startedAt: toIso(detail.startedAt)!,
    endedAt: toIso(detail.endedAt),
    operationCount: detail.operations.length,
    operations: detail.operations.map((operation) => ({
      ...operation,
      requestId: operation.requestId ?? null,
      entityRef: operation.entityRef ?? null,
      label: operation.label ?? null,
      createdAt: toIso(operation.createdAt)!,
    })),
    latestEvaluation: normalizeEvaluation(detail.latestEvaluation),
  };
}

function toSectionKey(status: string): ImpactMonitorSectionKey {
  switch (status) {
    case "watching":
      return "watching";
    case "needs_attention":
      return "needs_attention";
    case "archived":
    case "rolled_back":
      return "archive";
    default:
      return "ready_for_review";
  }
}

export async function getImpactMonitorData(selectedId?: number): Promise<ImpactMonitorPageData> {
  return requireAuth(async () => {
    const { customerId } = await getSessionAuth();
    const { items, total } = await listChangeInterventions(customerId, { limit: 100 });
    const normalizedItems = items.map(normalizeListItem);
    const sections: Record<ImpactMonitorSectionKey, ImpactMonitorListItem[]> = {
      watching: [],
      ready_for_review: [],
      needs_attention: [],
      archive: [],
    };

    for (const item of normalizedItems) {
      sections[toSectionKey(item.status)].push(item);
    }

    const fallbackId = normalizedItems[0]?.id ?? null;
    const resolvedId = selectedId && normalizedItems.some((item) => item.id === selectedId)
      ? selectedId
      : fallbackId;
    const rawDetail = resolvedId ? await getChangeIntervention(customerId, resolvedId) : null;

    return {
      accountId: customerId,
      total,
      selectedId: resolvedId,
      sections,
      detail: rawDetail ? normalizeDetail(rawDetail) : null,
    };
  });
}

export async function evaluateImpactMonitorInterventionAction(changeInterventionId: number) {
  return requireAuth(async () => {
    const { customerId } = await getSessionAuth();
    const detail = await evaluateChangeIntervention(customerId, changeInterventionId);
    return normalizeDetail(detail);
  });
}

export async function evaluateWatchingImpactMonitorAction() {
  return requireAuth(async () => {
    const { customerId } = await getSessionAuth();
    return await evaluateWatchingChangeInterventions({ accountId: customerId });
  });
}
