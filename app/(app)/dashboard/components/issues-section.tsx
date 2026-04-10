"use client";

import { useState } from "react";
import { AlertTriangle, Check, ChevronDown, ChevronUp, Loader2, X } from "lucide-react";
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
        <div className="mt-3 text-[13px] text-[#C4C0B6]">
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
          className="w-full rounded-md border border-[#3D3C36] py-2 text-[12px] text-[#C4C0B6] hover:bg-[#E8E4DD]/5 hover:text-[#E8E4DD] transition-colors"
        >
          Show {issues.length - MAX_VISIBLE} more issues
        </button>
      )}
    </div>
  );
}

function IssueCard({ issue }: { issue: Issue }) {
  const [expanded, setExpanded] = useState(false);
  const [selectedTerms, setSelectedTerms] = useState<Set<string>>(
    () => new Set(
      issue.action.type === "add_negatives"
        ? issue.action.termDetails.filter((t) => t.suggestBlock).map((t) => t.searchTerm)
        : [],
    ),
  );
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<"success" | "error" | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const severityColor = {
    high: "#C45D4A",
    medium: "#D4882A",
    low: "#C4C0B6",
  }[issue.severity];

  function toggleTerm(term: string) {
    setSelectedTerms((prev) => {
      const next = new Set(prev);
      if (next.has(term)) next.delete(term);
      else next.add(term);
      return next;
    });
  }

  async function handleAddNegatives() {
    if (issue.action.type !== "add_negatives" || selectedTerms.size === 0) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await addNegativesAction(issue.action.campaignId, Array.from(selectedTerms));
      if (res.succeeded === res.total) {
        setResult("success");
      } else if (res.succeeded > 0) {
        setResult("error");
        setErrorMsg(`Added ${res.succeeded} of ${res.total} negatives. ${res.total - res.succeeded} failed.`);
      } else {
        setResult("error");
        setErrorMsg(`Failed to add negatives: ${res.results[0]?.error ?? "Unknown error"}`);
      }
    } catch (err) {
      setResult("error");
      setErrorMsg(err instanceof Error ? err.message : "Action failed");
    } finally {
      setLoading(false);
    }
  }

  async function handlePauseKeyword() {
    if (issue.action.type !== "pause_keyword") return;
    setLoading(true);
    setErrorMsg(null);
    try {
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
    } catch (err) {
      setResult("error");
      setErrorMsg(err instanceof Error ? err.message : "Action failed");
    } finally {
      setLoading(false);
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

  const isWastedTerms = issue.action.type === "add_negatives";

  return (
    <div className="rounded-md border border-[#3D3C36] bg-[#24231F]">
      {/* Header row — clickable for wasted terms */}
      <div
        className={`flex items-start gap-3 p-4 ${isWastedTerms ? "cursor-pointer hover:bg-[#E8E4DD]/[0.03] transition-colors" : ""}`}
        onClick={isWastedTerms ? () => setExpanded(!expanded) : undefined}
      >
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" style={{ color: severityColor }} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-medium text-[#E8E4DD]">{issue.title}</span>
            {isWastedTerms && (
              expanded
                ? <ChevronUp className="h-3.5 w-3.5 text-[#C4C0B6]" />
                : <ChevronDown className="h-3.5 w-3.5 text-[#C4C0B6]" />
            )}
          </div>
          <div className="mt-0.5 text-[12px] text-[#C4C0B6]">{issue.description}</div>
          <div className="mt-1 font-mono text-[12px] font-medium" style={{ color: severityColor }}>
            -${issue.dailyImpact.toFixed(0)}/day
          </div>
        </div>

        {/* Non-expandable issue types keep inline buttons */}
        {!isWastedTerms && issue.action.type === "pause_keyword" && (
          <Button
            size="sm"
            variant="ghost"
            onClick={(e) => { e.stopPropagation(); handlePauseKeyword(); }}
            disabled={loading}
            className="shrink-0 h-7 border border-[#3D3C36] px-3 text-[11px] font-medium text-[#E8E4DD] hover:bg-[#E8E4DD]/5"
          >
            {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : "Pause keyword"}
          </Button>
        )}
        {!isWastedTerms && issue.action.type === "review_campaign" && (
          <a
            href={`/campaigns/${issue.action.campaignId}`}
            onClick={(e) => e.stopPropagation()}
            className="shrink-0 rounded-md border border-[#3D3C36] px-3 py-1 text-[11px] font-medium text-[#E8E4DD] hover:bg-[#E8E4DD]/5"
          >
            Review
          </a>
        )}
      </div>

      {/* Error message */}
      {result === "error" && errorMsg && (
        <div className="px-4 pb-3 text-[12px] text-[#C45D4A]">{errorMsg}</div>
      )}

      {/* Expanded term details for wasted search terms */}
      {expanded && issue.action.type === "add_negatives" && (
        <WastedTermsDetail
          action={issue.action}
          selectedTerms={selectedTerms}
          toggleTerm={toggleTerm}
          setSelectedTerms={setSelectedTerms}
          onAddNegatives={handleAddNegatives}
          loading={loading}
        />
      )}
    </div>
  );
}

function WastedTermsDetail({
  action,
  selectedTerms,
  toggleTerm,
  setSelectedTerms,
  onAddNegatives,
  loading,
}: {
  action: Extract<Issue["action"], { type: "add_negatives" }>;
  selectedTerms: Set<string>;
  toggleTerm: (term: string) => void;
  setSelectedTerms: (s: Set<string>) => void;
  onAddNegatives: () => void;
  loading: boolean;
}) {
  return (
    <div className="border-t border-[#3D3C36] px-4 pb-4 pt-3">
      <div className="text-[11px] font-medium uppercase tracking-wide text-[#C4C0B6] mb-2">
        Non-converting search terms in {action.campaignName}
      </div>
      <div className="text-[11px] text-[#C4C0B6]/70 mb-3">
        Uncheck terms that are still relevant to your business before blocking.
      </div>

      <div className="space-y-1">
        {action.termDetails.map((t) => {
          const checked = selectedTerms.has(t.searchTerm);
          const ctr = t.impressions > 0 ? ((t.clicks / t.impressions) * 100).toFixed(1) : "0";
          const cpc = t.clicks > 0 ? (t.cost / t.clicks).toFixed(2) : "0";
          return (
            <div
              key={t.searchTerm}
              className="rounded-md border border-[#3D3C36]/50 px-3 py-2.5 hover:bg-[#E8E4DD]/[0.03] transition-colors"
            >
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleTerm(t.searchTerm)}
                  className="mt-0.5 h-3.5 w-3.5 rounded border-[#3D3C36] bg-transparent accent-[#C45D4A]"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[12px] font-medium text-[#E8E4DD] truncate">{t.searchTerm}</span>
                    <span className="shrink-0 font-mono text-[12px] font-medium text-[#C45D4A]">
                      ${t.cost.toFixed(2)}
                    </span>
                  </div>
                  <div className="mt-1 flex gap-3 text-[11px] font-mono text-[#C4C0B6]">
                    <span>{t.clicks} clicks</span>
                    <span>{Number(ctr)}% CTR</span>
                    <span>${cpc}/click</span>
                    <span>{t.impressions.toLocaleString()} impr</span>
                  </div>
                  <div className="mt-1.5 text-[11px] leading-relaxed text-[#C4C0B6]/80">
                    {t.insight}
                  </div>
                </div>
              </label>
            </div>
          );
        })}
      </div>

      {/* Select all / none + action */}
      <div className="mt-3 flex items-center justify-between">
        <div className="flex gap-3 text-[11px]">
          <button
            type="button"
            onClick={() => setSelectedTerms(new Set(action.termDetails.map((t) => t.searchTerm)))}
            className="text-[#C4C0B6] hover:text-[#E8E4DD] transition-colors"
          >
            Select all
          </button>
          <button
            type="button"
            onClick={() => setSelectedTerms(new Set())}
            className="text-[#C4C0B6] hover:text-[#E8E4DD] transition-colors"
          >
            Select none
          </button>
        </div>
        <Button
          size="sm"
          onClick={onAddNegatives}
          disabled={loading || selectedTerms.size === 0}
          className="h-7 bg-[#C45D4A] px-3 text-[12px] text-[#E8E4DD] hover:bg-[#B04D3A] disabled:opacity-40"
        >
          {loading ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            `Block ${selectedTerms.size} term${selectedTerms.size === 1 ? "" : "s"}`
          )}
        </Button>
      </div>
    </div>
  );
}
