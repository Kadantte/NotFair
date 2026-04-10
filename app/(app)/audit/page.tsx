"use client";

import { useState, useEffect, useCallback } from "react";
import { getAuditOverview, getAuditDetails, clearAuditCache } from "./actions";
import type { AuditOverview, AuditDetails } from "./actions";
import { AuditContent } from "./audit-content";
import {
  AuditChatDrawer,
  type AuditChatContext,
} from "@/components/chat/audit-chat-drawer";
import { AuditHelpPanel } from "@/components/audit/audit-help-panel";

// Module-level cache keyed by account ID
let cachedAccountId: string | null = null;
let cachedOverview: AuditOverview | null = null;
let cachedDetails: AuditDetails | null = null;

function getCacheForAccount(accountId: string) {
  if (cachedAccountId !== accountId) {
    cachedOverview = null;
    cachedDetails = null;
    cachedAccountId = accountId;
  }
  return { overview: cachedOverview, details: cachedDetails };
}

export default function AuditPage() {
  const [overview, setOverview] = useState<AuditOverview | null>(cachedOverview);
  const [details, setDetails] = useState<AuditDetails | null>(cachedDetails);
  const [loading, setLoading] = useState(!cachedOverview);
  const [redoLoading, setRedoLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastAuditTime, setLastAuditTime] = useState<Date | null>(cachedOverview ? new Date() : null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [pendingPrompt, setPendingPrompt] = useState<string | null>(null);

  const fetchData = useCallback(async (background: boolean) => {
    if (!background) setLoading(true);
    try {
      // Phase 1: Fast overview
      const ov = await getAuditOverview();

      const cache = getCacheForAccount(ov.accountId);
      setOverview(ov);
      cachedOverview = ov;
      if (!cache.overview) {
        setDetails(null);
        cachedDetails = null;
      }
      setLoading(false);
      setLastAuditTime(new Date());

      // Phase 2: Detailed analysis
      if (!ov.isEmpty) {
        try {
          const det = await getAuditDetails();
          setDetails(det);
          cachedDetails = det;
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
  }, []);

  const redoAudit = useCallback(async () => {
    setRedoLoading(true);
    try {
      await clearAuditCache();
      cachedOverview = null;
      cachedDetails = null;
      cachedAccountId = null;
      await fetchData(true);
    } finally {
      setRedoLoading(false);
    }
  }, [fetchData]);

  useEffect(() => {
    fetchData(!!cachedOverview);
  }, [fetchData]);

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
            onClick={() => { setError(null); fetchData(false); }}
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
          overallScore: details?.auditResult?.overallScore ?? null,
          category: details?.auditResult?.category ?? null,
          dimensions:
            details?.auditResult?.dimensions.map((d) => ({
              label: d.label,
              score: d.score,
              status: d.finding,
              finding: d.finding,
            })) ?? [],
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
