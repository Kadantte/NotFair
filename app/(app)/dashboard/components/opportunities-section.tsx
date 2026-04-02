"use client";

import { useState } from "react";
import { TrendingUp, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Opportunity } from "@/lib/dashboard/opportunities";
import { adjustBudgetAction } from "../actions";

const MAX_VISIBLE = 5;

export function OpportunitiesSection({ opportunities }: { opportunities: Opportunity[] }) {
  const [showAll, setShowAll] = useState(false);

  if (opportunities.length === 0) {
    return (
      <div className="rounded-md border border-[#3D3C36] bg-[#24231F] p-6">
        <div className="text-[14px] font-medium text-[#E8E4DD]">Opportunities</div>
        <div className="mt-3 text-[13px] text-[#9B9689]">
          No growth opportunities detected right now. Check back later.
        </div>
      </div>
    );
  }

  const visible = showAll ? opportunities : opportunities.slice(0, MAX_VISIBLE);
  const hasMore = opportunities.length > MAX_VISIBLE;

  return (
    <div className="space-y-2">
      <div className="text-[14px] font-medium text-[#E8E4DD]">
        Opportunities
        <span className="ml-2 font-mono text-[12px] text-[#4CAF6E]">{opportunities.length}</span>
      </div>
      {visible.map((opp) => (
        <OpportunityCard key={opp.id} opportunity={opp} />
      ))}
      {hasMore && !showAll && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="w-full rounded-md border border-[#3D3C36] py-2 text-[12px] text-[#9B9689] hover:bg-[#E8E4DD]/5 hover:text-[#E8E4DD] transition-colors"
        >
          Show {opportunities.length - MAX_VISIBLE} more opportunities
        </button>
      )}
    </div>
  );
}

function OpportunityCard({ opportunity }: { opportunity: Opportunity }) {
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<"success" | "error" | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function handleConfirm() {
    if (opportunity.action?.type !== "increase_budget") return;
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await adjustBudgetAction(
        opportunity.action.campaignId,
        opportunity.action.suggestedBudget,
      );
      if (res.success) {
        setResult("success");
      } else {
        setResult("error");
        setErrorMsg(res.error ?? "Failed to adjust budget");
      }
    } catch (err) {
      setResult("error");
      setErrorMsg(err instanceof Error ? err.message : "Action failed");
    } finally {
      setLoading(false);
      setConfirming(false);
    }
  }

  if (result === "success") {
    return (
      <div className="flex items-center gap-3 rounded-md border border-[#4CAF6E]/30 bg-[#4CAF6E]/5 p-4">
        <Check className="h-4 w-4 text-[#4CAF6E]" />
        <span className="text-[13px] text-[#4CAF6E]">Applied: {opportunity.title}</span>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-[#3D3C36] bg-[#24231F] p-4">
      <div className="flex items-start gap-3">
        <TrendingUp className="mt-0.5 h-4 w-4 shrink-0 text-[#4CAF6E]" />
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-medium text-[#E8E4DD]">{opportunity.title}</div>
          <div className="mt-0.5 text-[12px] text-[#9B9689]">{opportunity.description}</div>
          <div className="mt-1 font-mono text-[12px] font-medium text-[#4CAF6E]">
            {opportunity.estimatedImpact}
          </div>

          {result === "error" && errorMsg && (
            <div className="mt-2 text-[12px] text-[#C45D4A]">{errorMsg}</div>
          )}

          {confirming && opportunity.action?.type === "increase_budget" && (
            <div className="mt-3 rounded border border-[#3D3C36] bg-[#2E2D28] p-3">
              <div className="text-[12px] text-[#E8E4DD]">
                Increase daily budget from ${opportunity.action.currentBudget.toFixed(2)} to ${opportunity.action.suggestedBudget.toFixed(2)}?
              </div>
              <div className="mt-2 flex gap-2">
                <Button
                  size="sm"
                  onClick={handleConfirm}
                  disabled={loading}
                  className="h-7 bg-[#4CAF6E] px-3 text-[12px] text-[#1A1917] hover:bg-[#3D9A5C]"
                >
                  {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : "Confirm"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setConfirming(false)}
                  disabled={loading}
                  className="h-7 px-3 text-[12px] text-[#9B9689] hover:text-[#E8E4DD]"
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>

        {!confirming && opportunity.action?.type === "increase_budget" && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setConfirming(true)}
            className="shrink-0 h-7 border border-[#4CAF6E]/30 px-3 text-[11px] font-medium text-[#4CAF6E] hover:bg-[#4CAF6E]/10"
          >
            Increase budget
          </Button>
        )}
      </div>
    </div>
  );
}
