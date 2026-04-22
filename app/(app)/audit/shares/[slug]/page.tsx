import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getAuditHistoryEntry } from "../actions";
import {
  PulseMetricsRow,
  VerdictCard,
  PassesBlock,
} from "@/components/audit/scorecard";

function categoryColor(cat: string): string {
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

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default async function AuditHistoryDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const entry = await getAuditHistoryEntry(slug);
  if (!entry) notFound();

  const { payload, createdAt } = entry;
  const { keyNumbers, wastedSpend } = payload;

  return (
    <div className="min-h-full bg-[#1A1917] px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl space-y-6">
        {/* Back link */}
        <div className="flex items-center justify-between">
          <Link
            href="/audit/shares"
            prefetch
            className="inline-flex items-center gap-1.5 text-[12px] text-[#C4C0B6] transition hover:text-[#E8E4DD]"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            All audits
          </Link>
          <span className="text-[11px] uppercase tracking-wider text-[#6B6760]">
            Saved · Private
          </span>
        </div>

        {/* Header */}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-[#6B6760]">
              {payload.accountLabel}
            </div>
            <div className="mt-1 flex items-baseline gap-3">
              <span
                className="font-mono text-[32px] font-bold leading-none"
                style={{ color: categoryColor(payload.category) }}
              >
                {payload.overallScore}
              </span>
              <span className="text-[12px] text-[#6B6760]">/ 100</span>
              <span
                className="rounded-sm px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider"
                style={{
                  backgroundColor: `${categoryColor(payload.category)}20`,
                  color: categoryColor(payload.category),
                }}
              >
                {payload.category}
              </span>
            </div>
            <div className="mt-2 text-[12px] text-[#C4C0B6]">
              Audited {formatDateTime(createdAt)}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-x-5 gap-y-1 text-right text-[12px]">
            {keyNumbers.totalSpend && (
              <>
                <span className="text-[#6B6760]">Spend</span>
                <span className="font-mono text-[#E8E4DD]">
                  {keyNumbers.totalSpend.band}
                </span>
              </>
            )}
            <span className="text-[#6B6760]">Conversions</span>
            <span className="font-mono text-[#E8E4DD]">{keyNumbers.conversions}</span>
            {keyNumbers.cpa !== null && (
              <>
                <span className="text-[#6B6760]">CPA</span>
                <span className="font-mono text-[#E8E4DD]">
                  ${keyNumbers.cpa.toFixed(2)}
                </span>
              </>
            )}
            {wastedSpend.total && (
              <>
                <span className="text-[#6B6760]">Wasted</span>
                <span className="font-mono text-[#C45D4A]">{wastedSpend.total.band}</span>
              </>
            )}
          </div>
        </div>

        <PulseMetricsRow metrics={payload.pulseMetrics} />

        <VerdictCard verdict={payload.verdict} />

        <PassesBlock passes={payload.passes} />

        <div className="pb-6 pt-2 text-center text-[11px] text-[#6B6760]">
          Private snapshot · only visible to you
        </div>
      </div>
    </div>
  );
}
