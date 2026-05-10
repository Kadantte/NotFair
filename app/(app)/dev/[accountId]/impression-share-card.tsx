import type { ImpressionShareDiagnosis, CampaignISBreakdown } from './types';

function pct(value: number | null): string {
    if (value === null || Number.isNaN(value)) return '--';
    return `${(value * 100).toFixed(0)}%`;
}

const DIAGNOSIS_BADGE: Record<CampaignISBreakdown['diagnosis'], { label: string; cls: string }> = {
    healthy: { label: 'Healthy', cls: 'bg-[#4CAF6E]/15 text-[#4CAF6E]' },
    budget: { label: 'Budget-limited', cls: 'bg-[#D4882A]/15 text-[#D4882A]' },
    rank: { label: 'Rank-limited', cls: 'bg-[#C45D4A]/15 text-[#C45D4A]' },
    structural: { label: 'Structural', cls: 'bg-[#C45D4A]/20 text-[#C45D4A]' },
};

export function ImpressionShareCard({ diagnosis }: { diagnosis: ImpressionShareDiagnosis }) {
    const sorted = [...diagnosis.campaignBreakdown].sort(
        (a, b) => b.totalImpressions - a.totalImpressions,
    );
    return (
        <div className="border border-[#3D3C36] rounded-xl bg-[#24231F]/60 overflow-hidden">
            <div className="px-4 py-3 sm:px-5 sm:py-4 border-b border-[#3D3C36]/60">
                <div className="flex items-baseline justify-between gap-3 mb-1">
                    <h2 className="text-base sm:text-lg font-semibold text-[#E8E4DD]">Impression analysis</h2>
                    <div className="flex items-baseline gap-3 text-xs text-[#C4C0B6]">
                        <span><span className="text-[#E8E4DD] font-mono tabular-nums">{pct(diagnosis.avgIS)}</span> captured</span>
                        <span><span className="text-[#D4882A] font-mono tabular-nums">{pct(diagnosis.budgetLost)}</span> lost to budget</span>
                        <span><span className="text-[#C45D4A] font-mono tabular-nums">{pct(diagnosis.rankLost)}</span> lost to rank</span>
                    </div>
                </div>
                {/* Stacked bar */}
                <div className="mt-2 h-2 w-full rounded-full bg-[#1A1917] overflow-hidden flex">
                    <div className="h-full bg-[#4CAF6E]" style={{ width: `${(diagnosis.avgIS ?? 0) * 100}%` }} />
                    <div className="h-full bg-[#D4882A]" style={{ width: `${(diagnosis.budgetLost ?? 0) * 100}%` }} />
                    <div className="h-full bg-[#C45D4A]" style={{ width: `${(diagnosis.rankLost ?? 0) * 100}%` }} />
                </div>
                <p className="text-[12px] text-[#C4C0B6] mt-2 leading-relaxed">{diagnosis.diagnosis}</p>
            </div>
            {sorted.length > 0 && (
                <div className="divide-y divide-[#3D3C36]/40">
                    {sorted.map((c) => {
                        const badge = DIAGNOSIS_BADGE[c.diagnosis];
                        return (
                            <div key={c.campaignName} className="px-4 py-3 sm:px-5">
                                <div className="flex items-center justify-between gap-3 mb-1.5">
                                    <span className="text-[13px] text-[#E8E4DD] font-medium truncate">{c.campaignName}</span>
                                    <span className={`shrink-0 inline-block rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider ${badge.cls}`}>
                                        {badge.label}
                                    </span>
                                </div>
                                <div className="flex items-center gap-3 text-[11px] text-[#C4C0B6] font-mono tabular-nums">
                                    <span>IS {pct(c.impressionShare)}</span>
                                    <span className="text-[#D4882A]">budget {pct(c.budgetLostIS)}</span>
                                    <span className="text-[#C45D4A]">rank {pct(c.rankLostIS)}</span>
                                    <span className="ml-auto text-[#C4C0B6]/70">{c.totalImpressions.toLocaleString()} impr · ${c.totalCost.toFixed(0)}</span>
                                </div>
                                <div className="mt-1.5 h-1.5 w-full rounded-full bg-[#1A1917] overflow-hidden flex">
                                    <div className="h-full bg-[#4CAF6E]" style={{ width: `${(c.impressionShare ?? 0) * 100}%` }} />
                                    <div className="h-full bg-[#D4882A]" style={{ width: `${(c.budgetLostIS ?? 0) * 100}%` }} />
                                    <div className="h-full bg-[#C45D4A]" style={{ width: `${(c.rankLostIS ?? 0) * 100}%` }} />
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
