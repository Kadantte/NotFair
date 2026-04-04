"use client";

import { HealthScore } from "./components/health-score";
import { MetricCard } from "./components/metric-card";
import { IssuesSection } from "./components/issues-section";
import { OpportunitiesSection } from "./components/opportunities-section";
import { RecentChanges } from "./components/recent-changes";
import { Loader2 } from "lucide-react";
import type { DashboardOverview, DashboardDetails } from "./actions";

export function DashboardContent({
  overview,
  details,
}: {
  overview: DashboardOverview;
  details: DashboardDetails | null;
})
 {
  if (overview.isEmpty) {
    return (
      <div className="flex h-full items-center justify-center bg-[#1A1917]">
        <div className="text-center max-w-sm">
          <div className="text-[16px] font-medium text-[#E8E4DD]">Welcome to AdsAgent</div>
          <div className="mt-2 text-[13px] text-[#9B9689]">
            Connect your Google Ads account to see your dashboard. Data will appear once your campaigns are active.
          </div>
          <a
            href="/connect"
            className="mt-4 inline-block rounded-md bg-[#4CAF6E] px-4 py-2 text-[13px] font-medium text-[#1A1917] hover:bg-[#3D9A5C] transition-colors"
          >
            Connect Account
          </a>
        </div>
      </div>
    );
  }

  const { healthScore, metrics, sparklineData } = overview;

  // Use refined data from details phase when available
  const finalHealthScore = details?.refinedHealthScore ?? healthScore;
  const finalMetrics = metrics
    ? {
        ...metrics,
        avgImpressionShare: details?.refinedMetrics?.avgImpressionShare ?? metrics.avgImpressionShare,
        wastedSpend: details?.refinedMetrics?.wastedSpend ?? metrics.wastedSpend,
      }
    : null;

  const issues = details?.issues ?? [];
  const opportunities = details?.opportunities ?? [];
  const recentChanges = details?.recentChanges ?? { items: [], total: 0 };
  const impressionShareData = details?.impressionShareData ?? [];

  return (
    <div className="h-full overflow-y-auto bg-[#1A1917]">
      <div className="mx-auto max-w-[1200px] px-4 py-4 sm:px-6 sm:py-6 space-y-4 sm:space-y-6">
        {/* Health Score + Key Metrics (renders instantly) */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1fr]">
          <HealthScore data={finalHealthScore} preliminary={!details} />

          {finalMetrics && (
            <div className="grid grid-cols-1 gap-3 min-[380px]:grid-cols-2">
              <MetricCard
                label="Spend (30d)"
                value={finalMetrics.totalCost}
                format="currency"
                sparklineData={sparklineData?.cost}
              />
              <MetricCard
                label="Clicks"
                value={finalMetrics.totalClicks}
                format="number"
                sparklineData={sparklineData?.clicks}
              />
              <MetricCard
                label="CPA"
                value={finalMetrics.cpa}
                format="currency"
                sparklineData={sparklineData?.cpa}
                sparklineColor={finalMetrics.cpa && finalMetrics.cpa > 50 ? "#C45D4A" : "#4CAF6E"}
              />
              <MetricCard
                label="Impression Share"
                value={finalMetrics.avgImpressionShare}
                format="percent"
              />
            </div>
          )}
        </div>

        {/* Waste alert */}
        {finalMetrics && finalMetrics.wastedSpend > 0 && (
          <div className="rounded-md border border-[#C45D4A]/30 bg-[#C45D4A]/5 p-4">
            <div className="flex items-center gap-2">
              <span className="font-mono text-[16px] font-bold text-[#C45D4A]">
                ${(finalMetrics.wastedSpend / 30).toFixed(0)}/day
              </span>
              <span className="text-[13px] text-[#E8E4DD]/70">
                spent on search terms with zero conversions
              </span>
            </div>
            <div className="mt-1 font-mono text-[11px] text-[#9B9689]">
              ${finalMetrics.wastedSpend.toFixed(0)} total over last 30 days
            </div>
          </div>
        )}

        {/* Issues + Opportunities (loaded in phase 2) */}
        {details ? (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <IssuesSection issues={issues} />
            <OpportunitiesSection opportunities={opportunities} />
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <LoadingSection label="Issues" />
            <LoadingSection label="Opportunities" />
          </div>
        )}

        {/* Impression Share detail */}
        {impressionShareData.length > 0 && (
          <div className="space-y-2">
            <div className="text-[14px] font-medium text-[#E8E4DD]">Impression Share by Campaign</div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {impressionShareData.map((is) => (
                <div key={is.campaignId} className="rounded-md border border-[#3D3C36] bg-[#24231F] p-4">
                  <div className="truncate text-[12px] font-medium text-[#E8E4DD]">{is.campaignName}</div>
                  <div className="mt-2 space-y-1.5">
                    <ISBar label="Search IS" value={is.impressionShare} />
                    <ISBar label="Budget Lost" value={is.budgetLostIS} warn />
                    <ISBar label="Rank Lost" value={is.rankLostIS} warn />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recent Changes */}
        {details && <RecentChanges changes={recentChanges.items} />}
      </div>
    </div>
  );
}

function LoadingSection({ label }: { label: string }) {
  return (
    <div className="rounded-md border border-[#3D3C36] bg-[#24231F] p-6">
      <div className="text-[14px] font-medium text-[#E8E4DD]">{label}</div>
      <div className="mt-3 flex items-center gap-2">
        <Loader2 className="h-3.5 w-3.5 animate-spin text-[#9B9689]" />
        <span className="text-[13px] text-[#9B9689]">Analyzing...</span>
      </div>
    </div>
  );
}

function ISBar({ label, value, warn }: { label: string; value: number | null; warn?: boolean }) {
  if (value === null) {
    return (
      <div className="flex items-center gap-2">
        <span className="w-[80px] shrink-0 text-[11px] text-[#9B9689]">{label}</span>
        <span className="font-mono text-[11px] text-[#9B9689]">--</span>
      </div>
    );
  }

  const pct = Math.round(value * 100);
  const isHigh = warn && pct > 20;
  const color = warn
    ? isHigh ? "#C45D4A" : "#9B9689"
    : pct >= 70 ? "#4CAF6E" : pct >= 40 ? "#D4882A" : "#C45D4A";

  return (
    <div className="flex items-center gap-2">
      <span className="w-[80px] shrink-0 text-[11px] text-[#9B9689]">{label}</span>
      <div className="h-[4px] flex-1 rounded-full bg-[#3D3C36]">
        <div
          className="h-full rounded-full"
          style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: color }}
        />
      </div>
      <span className="w-[32px] shrink-0 text-right font-mono text-[11px]" style={{ color }}>
        {pct}%
      </span>
    </div>
  );
}
