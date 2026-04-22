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
import { PanelRightOpen } from "lucide-react";

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
    <div className="relative flex h-full min-h-0">
      <div
        className={`h-full min-w-0 overflow-y-auto transition-[width] duration-300 ease-in-out ${
          drawerOpen ? "w-1/2" : "w-full"
        }`}
      >
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
      </div>
      <div
        className={`h-full shrink-0 overflow-hidden border-l border-[#3D3C36] transition-[width] duration-300 ease-in-out ${
          drawerOpen ? "w-1/2" : "w-0 border-l-0"
        }`}
      >
        {drawerOpen && (
          <AuditChatDrawer
            open={drawerOpen}
            onClose={() => setDrawerOpen(false)}
            pendingPrompt={pendingPrompt}
            onPromptConsumed={() => setPendingPrompt(null)}
            context={chatContext}
          />
        )}
      </div>
      {!drawerOpen && (
        <>
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="group absolute right-4 top-4 z-30 flex items-center justify-end gap-2 overflow-hidden rounded-md p-0 text-[13px] font-medium text-[#C4C0B6] transition-all duration-200 ease-out hover:text-[#4CAF6E] md:right-6 lg:right-8"
          >
            <span className="max-w-0 whitespace-nowrap opacity-0 transition-all duration-200 ease-out group-hover:max-w-[140px] group-hover:opacity-100">
              Show AI panel
            </span>
            <PanelRightOpen className="h-5 w-5 shrink-0" />
          </button>
          <AuditHelpPanel onChatClick={() => setDrawerOpen(true)} />
        </>
      )}
    </div>
  );
}
