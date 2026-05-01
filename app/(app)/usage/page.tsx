'use client';

import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Gauge, Clock, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getUsageAction } from '@/app/actions';

type DailyEntry = { date: string; day: number; count: number; isCurrent: boolean };

type UsageData = {
    used: number;
    limit: number | null;
    remaining: number | null;
    unlimited?: boolean;
    resetsAt: string;
    periodStart: string;
    daily: DailyEntry[];
};

let cachedUsage: UsageData | null = null;

function formatTimeUntilReset(resetsAt: string): string {
    const ms = new Date(resetsAt).getTime() - Date.now();
    if (ms <= 0) return 'Resetting now...';
    const days = Math.floor(ms / 86_400_000);
    const hours = Math.floor((ms % 86_400_000) / 3_600_000);
    if (days > 0) return `${days}d ${hours}h`;
    const minutes = Math.floor((ms % 3_600_000) / 60_000);
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
}

function usagePct(used: number, limit: number): number {
    return Math.min(100, Math.round((used / limit) * 100));
}

function statusColor(pct: number): string {
    if (pct >= 90) return '#C45D4A';
    if (pct >= 70) return '#D4882A';
    return '#4CAF6E';
}

export default function UsagePage() {
    const [data, setData] = useState<UsageData | null>(cachedUsage);
    const [loading, setLoading] = useState(!cachedUsage);
    const [refreshing, setRefreshing] = useState(false);
    const [countdown, setCountdown] = useState('');

    const fetchUsage = useCallback(async (background = false) => {
        if (!background) setLoading(true);
        else setRefreshing(true);
        try {
            const result = await getUsageAction();
            setData(result);
            cachedUsage = result;
        } catch {
            // silent
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => {
        fetchUsage(!!cachedUsage);
    }, [fetchUsage]);

    // Live countdown timer
    useEffect(() => {
        if (!data) return;
        const tick = () => setCountdown(formatTimeUntilReset(data.resetsAt));
        tick();
        const id = setInterval(tick, 30_000);
        return () => clearInterval(id);
    }, [data]);

    const isUnlimited = !!data?.unlimited;
    const pct = data && data.limit != null ? usagePct(data.used, data.limit) : 0;
    const color = isUnlimited ? '#4CAF6E' : statusColor(pct);
    const maxDaily = data ? Math.max(...data.daily.map((d) => d.count), 1) : 1;

    return (
        <section className="flex min-h-0 h-full flex-col overflow-hidden">
            {/* Header */}
            <header className="shrink-0 border-b border-[#3D3C36] bg-[#24231F]/80 backdrop-blur-xl">
                <div className="flex w-full items-center justify-between gap-3 px-4 py-3 sm:px-6 sm:py-4">
                    <div className="min-w-0">
                        <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-[#E8E4DD]">Usage</h1>
                        <p className="mt-0.5 text-xs sm:text-sm text-[#C4C0B6] hidden sm:block">Monthly operation usage and rate limits</p>
                    </div>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => fetchUsage(true)}
                        disabled={refreshing}
                        className="border-[#3D3C36] bg-[#24231F] hover:bg-[#2E2D28] text-[#C4C0B6] hover:text-[#E8E4DD] shrink-0"
                    >
                        <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${refreshing ? 'animate-spin' : ''}`} />
                        <span className="hidden sm:inline">Refresh</span>
                    </Button>
                </div>
            </header>

            {/* Content */}
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-6">
                {loading && !data ? (
                    <div className="flex flex-col items-center justify-center gap-3 py-20">
                        <div className="w-8 h-8 border-2 border-[#4CAF6E] border-t-transparent rounded-full animate-spin" />
                        <p className="text-[#C4C0B6] animate-pulse text-sm">Loading usage data...</p>
                    </div>
                ) : data ? (
                    <div className="max-w-2xl space-y-8">
                        {/* Limit exceeded banner — hidden on unlimited plans */}
                        {!isUnlimited && data.remaining === 0 && (
                            <div className="bg-[#C45D4A]/10 border border-[#C45D4A]/30 rounded-xl p-5 flex items-start gap-4">
                                <AlertCircle className="w-5 h-5 text-[#C45D4A] shrink-0 mt-0.5" />
                                <div>
                                    <p className="text-[#E8E4DD] font-medium">Monthly limit reached</p>
                                    <p className="text-sm text-[#C4C0B6] mt-1">
                                        You&apos;ve used all {data.limit} operations in this period. The cap resets in <span className="text-[#E8E4DD] font-medium tabular-nums">{countdown}</span> — or upgrade to Growth for unlimited operations.
                                    </p>
                                </div>
                            </div>
                        )}

                        {/* Usage summary cards */}
                        <div className={`grid grid-cols-1 gap-3 sm:gap-4 ${isUnlimited ? 'min-[400px]:grid-cols-2' : 'min-[400px]:grid-cols-3'}`}>
                            <div className="bg-[#24231F] border border-[#3D3C36] rounded-xl p-4 sm:p-5">
                                <div className="flex items-center gap-2 mb-2 sm:mb-3">
                                    <Gauge className="w-4 h-4 text-[#C4C0B6]" />
                                    <span className="text-[10px] font-semibold text-[#C4C0B6] uppercase tracking-widest">Used this month</span>
                                </div>
                                <p className="text-2xl sm:text-3xl font-semibold tabular-nums" style={{ color }}>
                                    {data.used}
                                </p>
                                <p className="text-xs text-[#C4C0B6] mt-1">
                                    {isUnlimited ? 'operations' : `of ${data.limit} operations`}
                                </p>
                            </div>
                            <div className="bg-[#24231F] border border-[#3D3C36] rounded-xl p-4 sm:p-5">
                                <div className="flex items-center gap-2 mb-2 sm:mb-3">
                                    <Gauge className="w-4 h-4 text-[#C4C0B6]" />
                                    <span className="text-[10px] font-semibold text-[#C4C0B6] uppercase tracking-widest">Remaining</span>
                                </div>
                                {isUnlimited ? (
                                    <p className="text-2xl sm:text-3xl font-semibold text-[#4CAF6E] tracking-tight">
                                        Unlimited
                                    </p>
                                ) : (
                                    <p className="text-2xl sm:text-3xl font-semibold text-[#E8E4DD] tabular-nums">
                                        {data.remaining}
                                    </p>
                                )}
                                <p className="text-xs text-[#C4C0B6] mt-1">
                                    {isUnlimited ? 'on Growth plan' : 'operations left'}
                                </p>
                            </div>
                            {!isUnlimited && (
                            <div className="bg-[#24231F] border border-[#3D3C36] rounded-xl p-4 sm:p-5">
                                <div className="flex items-center gap-2 mb-2 sm:mb-3">
                                    <Clock className="w-4 h-4 text-[#C4C0B6]" />
                                    <span className="text-[10px] font-semibold text-[#C4C0B6] uppercase tracking-widest">Resets in</span>
                                </div>
                                <p className="text-2xl sm:text-3xl font-semibold text-[#E8E4DD] tabular-nums">
                                    {countdown}
                                </p>
                                <p className="text-xs text-[#C4C0B6] mt-1">Resets every 30 days</p>
                            </div>
                            )}
                        </div>

                        {/* Progress bar — only meaningful when there's a limit to track against */}
                        {!isUnlimited && (
                            <div className="bg-[#24231F] border border-[#3D3C36] rounded-xl p-5">
                                <div className="flex items-center justify-between mb-3">
                                    <span className="text-[10px] font-semibold text-[#C4C0B6] uppercase tracking-widest">Monthly limit</span>
                                    <span className="text-sm tabular-nums" style={{ color }}>
                                        {pct}%
                                    </span>
                                </div>
                                <div className="h-2 bg-[#2E2D28] rounded-full overflow-hidden">
                                    <div
                                        className="h-full rounded-full transition-all duration-500"
                                        style={{ width: `${pct}%`, backgroundColor: color }}
                                    />
                                </div>
                                <div className="flex justify-between mt-2 text-[10px] text-[#C4C0B6] tabular-nums">
                                    <span>0</span>
                                    <span>{data.limit}</span>
                                </div>
                            </div>
                        )}

                        {/* Daily breakdown chart */}
                        <div className="bg-[#24231F] border border-[#3D3C36] rounded-xl p-5">
                            <div className="flex items-center justify-between mb-4">
                                <span className="text-[10px] font-semibold text-[#C4C0B6] uppercase tracking-widest">Operations by day (UTC)</span>
                            </div>
                            <div className="flex items-end gap-[3px] h-32">
                                {data.daily.map((d) => {
                                    const barH = d.count > 0 ? Math.max(4, (d.count / maxDaily) * 100) : 0;
                                    return (
                                        <div
                                            key={d.date}
                                            className="flex-1 flex flex-col items-center justify-end h-full group relative"
                                        >
                                            <div className="absolute -top-7 opacity-0 group-hover:opacity-100 transition-opacity text-[10px] text-[#E8E4DD] bg-[#2E2D28] border border-[#3D3C36] rounded px-1.5 py-0.5 pointer-events-none whitespace-nowrap tabular-nums">
                                                {d.count} ops · {d.date}
                                            </div>
                                            <div
                                                className="w-full rounded-sm transition-all duration-150"
                                                style={{
                                                    height: `${barH}%`,
                                                    backgroundColor: d.isCurrent ? '#4CAF6E' : '#4CAF6E50',
                                                    minHeight: d.count > 0 ? 4 : 0,
                                                }}
                                            />
                                        </div>
                                    );
                                })}
                            </div>
                            <div className="flex gap-[3px] mt-1.5">
                                {data.daily.map((d, i) => {
                                    const showLabel = i === 0 || i === data.daily.length - 1 || d.day % 5 === 0;
                                    return (
                                        <div
                                            key={d.date}
                                            className={`flex-1 text-center text-[8px] tabular-nums ${
                                                showLabel ? 'text-[#C4C0B6]' : 'text-transparent'
                                            }`}
                                        >
                                            {d.day}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Info */}
                        <p className="text-xs text-[#C4C0B6] leading-relaxed">
                            {isUnlimited
                                ? 'You currently have unlimited operations. The counter above shows recent activity for context.'
                                : 'Every tool call (reads and writes) from both the chat interface and MCP clients counts toward your free monthly limit. The cap renews 30 days after your trial ended, then every 30 days. Undo operations are not counted.'}
                        </p>
                    </div>
                ) : null}
            </div>
        </section>
    );
}
