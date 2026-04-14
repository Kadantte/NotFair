"use client";

import { useState, useEffect, useCallback } from "react";
import { getAuditOverview, getAuditDetails, clearAuditCache } from "./actions";
import type { AuditOverview, AuditDetails } from "./actions";
import { AuditContent, type TimeRangeOption, TIME_RANGE_OPTIONS } from "./audit-content";
import {
  AuditChatDrawer,
  type AuditChatContext,
} from "@/components/chat/audit-chat-drawer";
import { AuditHelpPanel } from "@/components/audit/audit-help-panel";

// Module-level cache keyed by accountId + days
type CacheKey = string;
const overviewCache = new Map<CacheKey, AuditOverview>();
const detailsCache = new Map<CacheKey, AuditDetails>();

function makeKey(accountId: string, days: number): CacheKey {
  return `${accountId}:${days}`;
}

const DEFAULT_RANGE: TimeRangeOption = TIME_RANGE_OPTIONS[0];

export default function AuditPage() {
  const [timeRange, setTimeRange] = useState<TimeRangeOption>(DEFAULT_RANGE);
  const [overview, setOverview] = useState<AuditOverview | null>(null);
  const [details, setDetails] = useState<AuditDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [redoLoading, setRedoLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastAuditTime, setLastAuditTime] = useState<Date | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [pendingPrompt, setPendingPrompt] = useState<string | null>(null);

  const fetchData = useCallback(
    async (days: number, background: boolean) => {
      if (!background) setLoading(true);
      try {
        const ov = await getAuditOverview(days);
        const key = makeKey(ov.accountId, days);
        overviewCache.set(key, ov);
        setOverview(ov);
        const cachedDet = detailsCache.get(key);
        if (cachedDet) setDetails(cachedDet);
        else setDetails(null);
        setLoading(false);
        setLastAuditTime(new Date());

        if (!ov.isEmpty) {
          try {
            const det = await getAuditDetails(days);
            detailsCache.set(key, det);
            setDetails(det);
          } catch {
            // Phase 2 failure — overview still shows
          }
        }
      } catch (err) {
        if (!background) {
          setError(err instanceof Error ? err.message : "Failed to load audit");
          setLoading(false);
        }
      }
    },
    [],
  );

  const redoAudit = useCallback(async () => {
    setRedoLoading(true);
    try {
      await clearAuditCache();
      overviewCache.clear();
      detailsCache.clear();
      await fetchData(timeRange.days, true);
    } finally {
      setRedoLoading(false);
    }
  }, [fetchData, timeRange]);

  const handleTimeRangeChange = useCallback(
    (next: TimeRangeOption) => {
      setTimeRange(next);
      if (!overview) return;
      const key = makeKey(overview.accountId, next.days);
      const cachedOv = overviewCache.get(key);
      const cachedDet = detailsCache.get(key);
      if (cachedOv) {
        setOverview(cachedOv);
        setDetails(cachedDet ?? null);
        fetchData(next.days, true);
      } else {
        setOverview(null);
        setDetails(null);
        fetchData(next.days, false);
      }
    },
    [fetchData, overview],
  );

  useEffect(() => {
    fetchData(DEFAULT_RANGE.days, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center bg-[#1A1917]">
        <div className="flex items-center gap-3">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#4CAF6E] border-t-transparent" />
          <span className="text-[13px] text-[#C4C0B6]">Running audit...</span>
        </div>
      </div>
    );
  }

  if (error || !overview) {
    return (
      <div className="flex h-full items-center justify-center bg-[#1A1917]">
        <div className="text-center">
          <div className="text-[14px] text-[#C45D4A]">{error ?? "Unable to load audit"}</div>
          <button
            type="button"
            onClick={() => { setError(null); fetchData(timeRange.days, false); }}
            className="mt-3 text-[13px] text-[#4CAF6E] hover:underline"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const chatContext: AuditChatContext | null =
    overview
      ? {
          accountName: overview.accountName,
          pulseMetrics: details?.auditResult?.pulseMetrics ?? null,
        }
      : null;

  function handleAskAI(prompt: string) {
    setPendingPrompt(prompt);
    setDrawerOpen(true);
  }

  return (
    <>
      <AuditContent
        overview={overview}
        details={details}
        onAskAI={handleAskAI}
        onRedoAudit={redoAudit}
        redoLoading={redoLoading}
        lastAuditTime={lastAuditTime}
        timeRange={timeRange}
        onTimeRangeChange={handleTimeRangeChange}
      />
      {!drawerOpen && <AuditHelpPanel onChatClick={() => setDrawerOpen(true)} />}
      <AuditChatDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        pendingPrompt={pendingPrompt}
        onPromptConsumed={() => setPendingPrompt(null)}
        context={chatContext}
      />
    </>
  );
}
