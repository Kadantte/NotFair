"use server";

import { redirect } from "next/navigation";
import {
  evaluateChangeIntervention,
  listChangeInterventions,
} from "@/lib/db/interventions";
import { getSessionAuth } from "@/lib/session";

type RawListItem = Awaited<ReturnType<typeof listChangeInterventions>>["items"][number];

export type ImpactMonitorSectionKey = "watching" | "ready_for_review" | "needs_attention" | "archive";

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

export type ImpactMonitorPageData = {
  accountId: string;
  total: number;
  sections: Record<ImpactMonitorSectionKey, ImpactMonitorListItem[]>;
};

function requireAuth<T>(fn: () => Promise<T>): Promise<T> {
  return fn().catch((err) => {
    if (err instanceof Error && err.message === "Not authenticated") {
      redirect("/welcome");
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

export async function getImpactMonitorData(): Promise<ImpactMonitorPageData> {
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

    return {
      accountId: customerId,
      total,
      sections,
    };
  });
}

export async function evaluateImpactMonitorInterventionAction(changeInterventionId: number) {
  return requireAuth(async () => {
    const { customerId } = await getSessionAuth();
    return await evaluateChangeIntervention(customerId, changeInterventionId);
  });
}
