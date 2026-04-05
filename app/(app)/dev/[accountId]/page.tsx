'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { RefreshCw, AlertCircle, ArrowLeft, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DeltaBadge } from '@/components/delta-badge';
import { formatAction, formatValue, ENTITY_BADGE_COLORS } from '@/lib/operations-format';

type Operation = {
    id: number;
    action: string;
    entityType: string;
    entityId: string;
    campaignId: string | null;
    beforeValue: string;
    afterValue: string;
    reasoning: string | null;
    rolledBack: boolean;
    timestamp: string;
};

type CampaignStat = {
    campaignId: string | null;
    totalOps: number;
    writes: number;
    lastOp: string;
};

type DailyUsage = {
    date: string;
    reads: number;
    writes: number;
    total: number;
};

type AccountDetail = {
    accountId: string;
    email: string | null;
    connectedAccounts: { id: string; name: string }[];
    lastLogin: string | null;
    recentOperations: Operation[];
    dailyUsage: DailyUsage[];
    campaigns: CampaignStat[];
};

let cachedDetail: { accountId: string; data: AccountDetail } | null = null;

export default function DevAccountDetailPage() {
    const { accountId } = useParams<{ accountId: string }>();
    const [data, setData] = useState<AccountDetail | null>(
        cachedDetail?.accountId === accountId ? cachedDetail.data : null,
    );
    const [loading, setLoading] = useState(!data);
    const [error, setError] = useState<string | null>(null);

    const fetchDetail = useCallback(async (background = false) => {
        if (!background) setLoading(true);
        setError(null);
        try {
            const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
            const res = await fetch(`/api/dev/${accountId}?tz=${encodeURIComponent(tz)}`, { credentials: 'include' });
            if (res.status === 403) { setError('Access denied'); return; }
            if (!res.ok) throw new Error('Failed to fetch');
            const result: AccountDetail = await res.json();
            setData(result);
            cachedDetail = { accountId, data: result };
        } catch {
            setError('Failed to load account details');
        } finally {
            setLoading(false);
        }
    }, [accountId]);

    useEffect(() => {
        fetchDetail(!!data);
    }, [fetchDetail]);

    const maxDaily = Math.max(data?.dailyUsage.reduce((max, d) => Math.max(max, d.total), 0) ?? 0, 1);

    return (
        <section className="flex min-h-0 h-full flex-col overflow-hidden">
            <header className="shrink-0 border-b border-[#3D3C36] bg-[#24231F]/80 backdrop-blur-xl">
                <div className="flex w-full items-center gap-3 px-4 py-3 sm:px-6 sm:py-4">
                    <Link
                        href="/dev"
                        className="flex items-center justify-center rounded-lg p-1.5 text-[#9B9689] hover:bg-[#E8E4DD]/6 hover:text-[#E8E4DD] transition-colors"
                    >
                        <ArrowLeft className="w-4 h-4" />
                    </Link>
                    <div className="min-w-0 flex-1">
                        <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-[#E8E4DD] truncate">
                            {data?.email ?? `Account ${accountId}`}
                        </h1>
                        <p className="mt-0.5 text-xs text-[#9B9689] font-mono tabular-nums">{accountId}</p>
                    </div>
                    <Button
                        onClick={() => { cachedDetail = null; fetchDetail(false); }}
                        disabled={loading}
                        variant="outline"
                        size="sm"
                        className="border-[#3D3C36] bg-[#24231F] hover:bg-[#2E2D28] text-[#9B9689] hover:text-[#E8E4DD] gap-1.5 shrink-0"
                    >
                        <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                        <span className="hidden sm:inline">Refresh</span>
                    </Button>
                </div>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-6 space-y-6">
                {error && (
                    <div className="bg-[#C45D4A]/10 border border-[#C45D4A]/30 rounded-lg p-3 flex items-center gap-3 text-[#C45D4A]">
                        <AlertCircle className="w-5 h-5 shrink-0" />
                        <p className="text-sm">{error}</p>
                    </div>
                )}

                {loading && !data ? (
                    <div className="flex flex-col items-center justify-center py-20 gap-4">
                        <div className="w-8 h-8 border-2 border-[#4CAF6E] border-t-transparent rounded-full animate-spin" />
                        <p className="text-[#9B9689] animate-pulse text-sm">Loading account details...</p>
                    </div>
                ) : data ? (
                    <>
                        {/* Summary cards */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            <SummaryCard
                                label="Campaigns"
                                value={String(data.campaigns.length)}
                                sub="with operations"
                            />
                            <SummaryCard
                                label="Total Ops"
                                value={String(data.recentOperations.length)}
                                sub="recent writes"
                            />
                            <SummaryCard
                                label="Connected"
                                value={String(data.connectedAccounts.length)}
                                sub="accounts"
                            />
                            <SummaryCard
                                label="Last Login"
                                value={data.lastLogin
                                    ? new Date(data.lastLogin).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
                                    : '--'}
                                sub={data.lastLogin
                                    ? new Date(data.lastLogin).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
                                    : ''}
                            />
                        </div>

                        {/* Daily usage (14d) */}
                        {data.dailyUsage.length > 0 && (
                            <div>
                                <h2 className="text-base sm:text-lg font-semibold text-[#E8E4DD] mb-3">Usage (14d)</h2>
                                <div className="space-y-1.5">
                                    {data.dailyUsage.map(day => (
                                        <div key={day.date} className="flex items-center gap-3">
                                            <span className="w-[72px] shrink-0 text-xs text-[#9B9689] font-mono tabular-nums">
                                                {day.date.slice(5)}
                                            </span>
                                            <div className="flex-1 flex items-center gap-0.5 h-4">
                                                <div
                                                    className="h-3 rounded-sm bg-[#4CAF6E]/60"
                                                    style={{ width: `${(day.reads / maxDaily) * 100}%` }}
                                                />
                                                <div
                                                    className="h-3 rounded-sm bg-[#D4882A]/60"
                                                    style={{ width: `${(day.writes / maxDaily) * 100}%` }}
                                                />
                                            </div>
                                            <span className="w-[40px] shrink-0 text-right text-xs text-[#E8E4DD] font-mono tabular-nums">
                                                {day.total}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                                <div className="flex items-center gap-4 mt-2 text-[10px] text-[#9B9689] uppercase tracking-widest">
                                    <span className="flex items-center gap-1.5">
                                        <span className="w-2 h-2 rounded-sm bg-[#4CAF6E]/60" /> Reads
                                    </span>
                                    <span className="flex items-center gap-1.5">
                                        <span className="w-2 h-2 rounded-sm bg-[#D4882A]/60" /> Writes
                                    </span>
                                </div>
                            </div>
                        )}

                        {/* Campaigns touched */}
                        {data.campaigns.length > 0 && (
                            <div>
                                <h2 className="text-base sm:text-lg font-semibold text-[#E8E4DD] mb-3">Campaigns</h2>
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                                    {data.campaigns.map(c => (
                                        <div
                                            key={c.campaignId ?? 'null'}
                                            className="border border-[#3D3C36] rounded-lg bg-[#24231F]/40 p-3"
                                        >
                                            <div className="text-xs text-[#9B9689] font-mono tabular-nums truncate">
                                                {c.campaignId ?? 'No campaign ID'}
                                            </div>
                                            <div className="flex items-center gap-4 mt-2">
                                                <div>
                                                    <div className="text-[10px] text-[#9B9689] uppercase tracking-widest">Ops</div>
                                                    <div className="text-sm text-[#E8E4DD] font-mono tabular-nums">{c.totalOps}</div>
                                                </div>
                                                <div>
                                                    <div className="text-[10px] text-[#9B9689] uppercase tracking-widest">Writes</div>
                                                    <div className="text-sm text-[#D4882A] font-mono tabular-nums">{c.writes}</div>
                                                </div>
                                                <div className="ml-auto text-[10px] text-[#9B9689] font-mono">
                                                    {new Date(c.lastOp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Recent operations */}
                        <div>
                            <h2 className="text-base sm:text-lg font-semibold text-[#E8E4DD] mb-3">Recent Operations</h2>
                            {data.recentOperations.length === 0 ? (
                                <div className="text-center py-12 border border-[#3D3C36] rounded-lg bg-[#24231F]/40">
                                    <p className="text-sm text-[#9B9689]">No write operations recorded</p>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {data.recentOperations.map(op => (
                                        <div key={op.id} className="border border-[#3D3C36] rounded-lg bg-[#24231F]/40 p-3">
                                            <div className="flex items-center justify-between gap-2 mb-1.5">
                                                <div className="flex items-center gap-2 min-w-0">
                                                    <span className="text-sm font-medium text-[#E8E4DD]">
                                                        {formatAction(op.action)}
                                                    </span>
                                                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded border text-[10px] font-medium ${ENTITY_BADGE_COLORS[op.entityType] ?? ENTITY_BADGE_COLORS.unknown}`}>
                                                        {op.entityType}
                                                    </span>
                                                    {op.rolledBack && (
                                                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded border text-[10px] font-medium bg-[#9B9689]/10 text-[#9B9689] border-[#9B9689]/20">
                                                            <RotateCcw className="w-2.5 h-2.5" />
                                                            Reverted
                                                        </span>
                                                    )}
                                                </div>
                                                <span className="text-[10px] text-[#9B9689] font-mono tabular-nums whitespace-nowrap shrink-0">
                                                    {new Date(op.timestamp).toLocaleString(undefined, {
                                                        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                                                    })}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-2 text-xs font-mono">
                                                <span className="text-[#9B9689] tabular-nums">{formatValue(op.action, op.beforeValue)}</span>
                                                <DeltaBadge before={op.beforeValue} after={op.afterValue} />
                                                <span className="text-[#E8E4DD] tabular-nums">{formatValue(op.action, op.afterValue)}</span>
                                            </div>
                                            {op.reasoning && (
                                                <p className="text-xs text-[#9B9689] mt-1.5 line-clamp-2">{op.reasoning}</p>
                                            )}
                                            {op.campaignId && (
                                                <p className="text-[10px] text-[#9B9689]/60 font-mono mt-1">Campaign {op.campaignId}</p>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </>
                ) : null}
            </div>
        </section>
    );
}

function SummaryCard({ label, value, sub }: { label: string; value: string; sub: string }) {
    return (
        <div className="bg-[#24231F] border border-[#3D3C36] rounded-lg p-3 sm:p-4">
            <div className="text-[10px] font-semibold text-[#9B9689] uppercase tracking-widest mb-1.5">{label}</div>
            <div className="text-xl sm:text-2xl font-semibold text-[#E8E4DD] tabular-nums font-mono">{value}</div>
            <div className="text-[10px] text-[#9B9689] mt-0.5">{sub}</div>
        </div>
    );
}
