"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ClipboardCheck, ChevronRight } from "lucide-react";
import { listAuditHistory, type AuditHistoryRow } from "./actions";

// Module-level cache — survives client-side navigations so returning to this
// page after viewing a detail feels instant. See CLAUDE.md "Data fetching:
// Stale-while-revalidate".
let cachedHistory: AuditHistoryRow[] | null = null;

function categoryColor(cat: AuditHistoryRow["category"]): string {
  switch (cat) {
    case "Excellent":
    case "Strong":
      return "#4CAF6E";
    case "OK":
      return "#E8E4DD";
    case "Needs Work":
      return "#D4882A";
    case "Critical":
      return "#C45D4A";
    default:
      return "#C4C0B6";
  }
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: d.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined,
  });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function AuditHistoryPage() {
  const [rows, setRows] = useState<AuditHistoryRow[]>(cachedHistory ?? []);
  const [loading, setLoading] = useState(cachedHistory === null);
  const [error, setError] = useState<string | null>(null);

  const fetchHistory = useCallback(async (background: boolean) => {
    if (!background) setLoading(true);
    try {
      const fresh = await listAuditHistory();
      setRows(fresh);
      cachedHistory = fresh;
      setError(null);
    } catch (err) {
      if (!background) {
        setError(err instanceof Error ? err.message : "Failed to load history");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHistory(cachedHistory !== null);
  }, [fetchHistory]);

  return (
    <div className="min-h-full bg-[#1A1917] px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between gap-3">
          <div>
            <h1 className="text-[20px] font-semibold text-[#E8E4DD]">Audit History</h1>
            <p className="mt-1 text-[13px] text-[#C4C0B6]">
              Every audit you run is saved here automatically.
            </p>
          </div>
          <Link
            href="/audit"
            prefetch
            className="flex items-center gap-1.5 rounded-sm bg-[#3D3C36] px-2.5 py-1 text-[11px] font-medium text-[#E8E4DD] transition hover:bg-[#4D4C46]"
          >
            <ArrowLeft className="h-3 w-3" />
            Back to audit
          </Link>
        </div>

        {/* Body */}
        {loading && rows.length === 0 ? (
          <div className="flex items-center justify-center py-16">
            <div className="flex items-center gap-3">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#4CAF6E] border-t-transparent" />
              <span className="text-[13px] text-[#C4C0B6]">Loading history...</span>
            </div>
          </div>
        ) : error ? (
          <div className="rounded border border-[#C45D4A]/40 bg-[#C45D4A]/10 p-4 text-[13px] text-[#C45D4A]">
            {error}
            <button
              type="button"
              onClick={() => fetchHistory(false)}
              className="ml-3 text-[#4CAF6E] hover:underline"
            >
              Retry
            </button>
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded border border-[#3D3C36] bg-[#24231F] p-8 text-center">
            <ClipboardCheck className="mx-auto h-6 w-6 text-[#6B6760]" />
            <div className="mt-3 text-[14px] font-medium text-[#E8E4DD]">
              No audits yet
            </div>
            <p className="mx-auto mt-1 max-w-sm text-[13px] text-[#C4C0B6]">
              Run an audit on your Google Ads account and it will be saved here for you to revisit.
            </p>
            <Link
              href="/audit"
              prefetch
              className="mt-4 inline-flex items-center gap-1.5 rounded-sm bg-[#4CAF6E] px-3 py-1.5 text-[12px] font-semibold text-[#1A1917] transition hover:bg-[#3D9A5C]"
            >
              Run an audit
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-[#3D3C36] rounded border border-[#3D3C36] bg-[#24231F]">
            {rows.map((r) => (
              <Link
                key={r.slug}
                href={`/audit/shares/${r.slug}`}
                prefetch
                className="group flex items-center gap-4 px-4 py-3 transition hover:bg-[#2E2D28]"
              >
                <div className="flex w-14 shrink-0 flex-col items-center">
                  <div
                    className="font-mono text-[20px] font-bold"
                    style={{ color: categoryColor(r.category) }}
                  >
                    {r.overallScore}
                  </div>
                  <div className="text-[10px] uppercase tracking-wider text-[#6B6760]">
                    / 100
                  </div>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-[13px] font-medium text-[#E8E4DD]">
                    <span>{formatDate(r.createdAt)}</span>
                    <span className="text-[11px] text-[#6B6760]">{formatTime(r.createdAt)}</span>
                    <span
                      className="rounded-sm px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
                      style={{
                        backgroundColor: `${categoryColor(r.category)}20`,
                        color: categoryColor(r.category),
                      }}
                    >
                      {r.category}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-3 text-[12px] text-[#C4C0B6]">
                    <span className="font-mono">
                      Waste: <span className="text-[#E8E4DD]">{r.wasteRate.toFixed(0)}%</span>
                    </span>
                    {r.wastedSpendBand && (
                      <span className="font-mono">
                        Wasted: <span className="text-[#C45D4A]">{r.wastedSpendBand}</span>
                      </span>
                    )}
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-[#6B6760] transition group-hover:text-[#E8E4DD]" />
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
