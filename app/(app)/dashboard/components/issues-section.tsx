"use client";

import { useState } from "react";
import { AlertTriangle, Check, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Issue } from "@/lib/dashboard/issues";
import { addNegativesAction, pauseKeywordAction } from "../actions";

const MAX_VISIBLE = 5;

export function IssuesSection({ issues }: { issues: Issue[] }) {
  const [showAll, setShowAll] = useState(false);

  if (issues.length === 0) {
    return (
      <div className="rounded-md border border-[#3D3C36] bg-[#24231F] p-6">
        <div className="text-[14px] font-medium text-[#E8E4DD]">Issues</div>
        <div className="mt-3 text-[13px] text-[#9B9689]">
          No issues found. Your ads are looking healthy.
        </div>
      </div>
    );
  }

  const visible = showAll ? issues : issues.slice(0, MAX_VISIBLE);
  const hasMore = issues.length > MAX_VISIBLE;

  return (
    <div className="space-y-2">
      <div className="text-[14px] font-medium text-[#E8E4DD]">
        Issues
        <span className="ml-2 font-mono text-[12px] text-[#C45D4A]">{issues.length}</span>
      </div>
      {visible.map((issue) => (
        <IssueCard key={issue.id} issue={issue} />
      ))}
      {hasMore && !showAll && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="w-full rounded-md border border-[#3D3C36] py-2 text-[12px] text-[#9B9689] hover:bg-[#E8E4DD]/5 hover:text-[#E8E4DD] transition-colors"
        >
          Show {issues.length - MAX_VISIBLE} more issues
        </button>
      )}
    </div>
  );
}

function IssueCard({ issue }: { issue: Issue }) {
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<"success" | "error" | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const severityColor = {
    high: "#C45D4A",
    medium: "#D4882A",
    low: "#9B9689",
  }[issue.severity];

  async function handleConfirm() {
    setLoading(true);
    setErrorMsg(null);
    try {
      if (issue.action.type === "add_negatives") {
        const res = await addNegativesAction(issue.action.campaignId, issue.action.terms);
        if (res.succeeded > 0) {
          setResult("success");
        } else {
          setResult("error");
          setErrorMsg(`Failed to add negatives: ${res.results[0]?.error ?? "Unknown error"}`);
        }
      } else if (issue.action.type === "pause_keyword") {
        const res = await pauseKeywordAction(
          issue.action.campaignId,
          issue.action.adGroupId,
          issue.action.criterionId,
        );
        if (res.success) {
          setResult("success");
        } else {
          setResult("error");
          setErrorMsg(res.error ?? "Failed to pause keyword");
        }
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
        <span className="text-[13px] text-[#4CAF6E]">Fixed: {issue.title}</span>
      </div>
    );
  }

  const actionLabel = issue.action.type === "add_negatives"
    ? `Add ${issue.action.terms.length} negatives`
    : issue.action.type === "pause_keyword"
      ? "Pause keyword"
      : "Review";

  const confirmLabel = issue.action.type === "add_negatives"
    ? `Add ${issue.action.terms.length} search terms as negative keywords?`
    : issue.action.type === "pause_keyword"
      ? `Pause keyword "${issue.action.keywordText}"?`
      : "";

  return (
    <div className="rounded-md border border-[#3D3C36] bg-[#24231F] p-4">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" style={{ color: severityColor }} />
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-medium text-[#E8E4DD]">{issue.title}</div>
          <div className="mt-0.5 text-[12px] text-[#9B9689]">{issue.description}</div>
          <div className="mt-1 font-mono text-[12px] font-medium" style={{ color: severityColor }}>
            -${issue.dailyImpact.toFixed(0)}/day
          </div>

          {/* Error message */}
          {result === "error" && errorMsg && (
            <div className="mt-2 text-[12px] text-[#C45D4A]">{errorMsg}</div>
          )}

          {/* Confirmation inline */}
          {confirming && (
            <div className="mt-3 rounded border border-[#3D3C36] bg-[#2E2D28] p-3">
              <div className="text-[12px] text-[#E8E4DD]">{confirmLabel}</div>
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

        {/* Action button */}
        {!confirming && issue.action.type !== "review_campaign" && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setConfirming(true)}
            className="shrink-0 h-7 border border-[#3D3C36] px-3 text-[11px] font-medium text-[#E8E4DD] hover:bg-[#E8E4DD]/5"
          >
            {actionLabel}
          </Button>
        )}
        {!confirming && issue.action.type === "review_campaign" && (
          <a
            href={`/campaigns/${issue.action.campaignId}`}
            className="shrink-0 rounded-md border border-[#3D3C36] px-3 py-1 text-[11px] font-medium text-[#E8E4DD] hover:bg-[#E8E4DD]/5"
          >
            Review
          </a>
        )}
      </div>
    </div>
  );
}
