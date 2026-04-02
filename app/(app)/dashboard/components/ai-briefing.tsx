"use client";

import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { generateBriefingAction } from "../actions";

export function AIBriefing({
  metrics,
  issueCount,
  opportunityCount,
  topIssue,
  topOpportunity,
  recentChangeCount,
}: {
  metrics: {
    totalCost: number;
    totalClicks: number;
    totalImpressions: number;
    totalConversions: number;
  };
  issueCount: number;
  opportunityCount: number;
  topIssue: string | null;
  topOpportunity: string | null;
  recentChangeCount: number;
}) {
  const [briefing, setBriefing] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    generateBriefingAction({
      totalCost: metrics.totalCost,
      totalClicks: metrics.totalClicks,
      totalImpressions: metrics.totalImpressions,
      totalConversions: metrics.totalConversions,
      issueCount,
      opportunityCount,
      topIssue,
      topOpportunity,
      recentChangeCount,
    }).then((text) => {
      if (!cancelled) {
        setBriefing(text);
        setLoading(false);
      }
    }).catch(() => {
      if (!cancelled) setLoading(false);
    });

    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!loading && !briefing) return null;

  return (
    <div className="rounded-md border-l-2 border-l-[#4CAF6E] border border-[#3D3C36] bg-[#24231F] p-4">
      <div className="flex items-center gap-2 mb-2">
        <span className="rounded-sm bg-[#4CAF6E]/10 px-1.5 py-0.5 text-[10px] font-medium text-[#4CAF6E] uppercase tracking-wider">
          Agent
        </span>
      </div>
      {loading ? (
        <div className="flex items-center gap-2 text-[13px] text-[#9B9689]">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Analyzing your account...
        </div>
      ) : (
        <p className="text-[13px] leading-relaxed text-[#E8E4DD]/90">{briefing}</p>
      )}
    </div>
  );
}
