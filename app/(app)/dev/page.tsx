'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { RefreshCw, AlertCircle, Code2, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

type DailyUsage = {
    date: string;
    reads: number;
    writes: number;
    total: number;
};

type AccountOps = {
    accountId: string;
    accountName: string | null;
    email: string | null;
    reads: number;
    writes: number;
    total: number;
    lastActive: string;
};

type DevStats = {
    dailyUsage: DailyUsage[];
    accountOps: AccountOps[];
};

let cachedStats: DevStats | null = null;

export default function DevPage() {
    const [stats, setStats] = useState<DevStats | null>(cachedStats);
    const [loading, setLoading] = useState(!cachedStats);
    const [error, setError] = useState<string | null>(null);

    const fetchStats = useCallback(async (background = false) => {
        if (!background) setLoading(true);
        setError(null);
        try {
            const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
            const res = await fetch(`/api/dev?tz=${encodeURIComponent(tz)}`, { credentials: 'include' });
            if (res.status === 403) {
                setError('Access denied');
                return;
            }
            if (!res.ok) throw new Error('Failed to fetch');
            const data: DevStats = await res.json();
            setStats(data);
            cachedStats = data;
        } catch {
            setError('Failed to load dev stats');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchStats(!!cachedStats);
    }, [fetchStats]);

    const maxTotal = Math.max(stats?.dailyUsage.reduce((max, d) => Math.max(max, d.total), 0) ?? 0, 1);

    return (
        <section className="flex min-h-0 h-full flex-col overflow-hidden">
            <header className="shrink-0 border-b border-[#3D3C36] bg-[#24231F]/80 backdrop-blur-xl">
                <div className="flex w-full items-center justify-between gap-3 px-4 py-3 sm:px-6 sm:py-4">
                    <div className="min-w-0">
                        <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-[#E8E4DD]">Dev</h1>
                        <p className="mt-0.5 text-xs sm:text-sm text-[#9B9689] hidden sm:block">API usage and operations tracking</p>
                    </div>
                    <Button
                        onClick={() => { cachedStats = null; fetchStats(false); }}
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

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-6 space-y-6 sm:space-y-8">
                {error && (
                    <div className="bg-[#C45D4A]/10 border border-[#C45D4A]/30 rounded-lg p-3 sm:p-4 flex items-center gap-3 text-[#C45D4A]">
                        <AlertCircle className="w-5 h-5 shrink-0" />
                        <p className="text-sm">{error}</p>
                    </div>
                )}

                {loading && !stats ? (
                    <div className="flex flex-col items-center justify-center py-20 gap-4">
                        <div className="w-8 h-8 border-2 border-[#4CAF6E] border-t-transparent rounded-full animate-spin" />
                        <p className="text-[#9B9689] animate-pulse text-sm">Loading dev stats...</p>
                    </div>
                ) : stats ? (
                    <>
                        {/* Daily API Usage */}
                        <div>
                            <h2 className="text-base sm:text-lg font-semibold text-[#E8E4DD] mb-3 sm:mb-4">API Usage by Day</h2>

                            {/* Mobile: card layout */}
                            <div className="sm:hidden space-y-2">
                                {stats.dailyUsage.length === 0 ? (
                                    <p className="text-sm text-[#9B9689] text-center py-8">No API usage in the last 30 days</p>
                                ) : stats.dailyUsage.map(day => (
                                    <div key={day.date} className="border border-[#3D3C36] rounded-lg bg-[#24231F]/40 p-3">
                                        <div className="flex items-center justify-between mb-2">
                                            <span className="text-sm text-[#E8E4DD] font-mono tabular-nums">{day.date}</span>
                                            <span className="text-sm text-[#E8E4DD] font-mono tabular-nums font-medium">{day.total.toLocaleString()} total</span>
                                        </div>
                                        <div className="flex items-center gap-1 h-3 mb-2">
                                            <div
                                                className="h-full rounded-sm bg-[#4CAF6E]/60"
                                                style={{ width: `${(day.reads / maxTotal) * 100}%` }}
                                            />
                                            <div
                                                className="h-full rounded-sm bg-[#D4882A]/60"
                                                style={{ width: `${(day.writes / maxTotal) * 100}%` }}
                                            />
                                        </div>
                                        <div className="flex items-center gap-4 text-xs">
                                            <span className="text-[#9B9689]">
                                                <span className="inline-block w-2 h-2 rounded-sm bg-[#4CAF6E]/60 mr-1" />
                                                {day.reads.toLocaleString()} reads
                                            </span>
                                            <span className="text-[#D4882A]">
                                                <span className="inline-block w-2 h-2 rounded-sm bg-[#D4882A]/60 mr-1" />
                                                {day.writes.toLocaleString()} writes
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Desktop: table layout */}
                            <div className="hidden sm:block border border-[#3D3C36] rounded-xl bg-[#24231F]/40 overflow-hidden">
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr className="border-b border-[#3D3C36]">
                                            {['Date', 'Reads', 'Writes', 'Total', ''].map((h, i) => (
                                                <th key={i} className="px-4 py-3 text-[10px] font-semibold text-[#9B9689] uppercase tracking-widest">
                                                    {h}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {stats.dailyUsage.length === 0 ? (
                                            <tr>
                                                <td colSpan={5} className="px-4 py-8 text-center text-sm text-[#9B9689]">
                                                    No API usage in the last 30 days
                                                </td>
                                            </tr>
                                        ) : stats.dailyUsage.map(day => (
                                            <tr key={day.date} className="border-b border-[#3D3C36]/50 hover:bg-[#24231F]/60 transition-colors">
                                                <td className="px-4 py-2.5 text-sm text-[#E8E4DD] font-mono tabular-nums">
                                                    {day.date}
                                                </td>
                                                <td className="px-4 py-2.5 text-sm text-[#9B9689] font-mono tabular-nums">
                                                    {day.reads.toLocaleString()}
                                                </td>
                                                <td className="px-4 py-2.5 text-sm text-[#D4882A] font-mono tabular-nums">
                                                    {day.writes.toLocaleString()}
                                                </td>
                                                <td className="px-4 py-2.5 text-sm text-[#E8E4DD] font-mono tabular-nums font-medium">
                                                    {day.total.toLocaleString()}
                                                </td>
                                                <td className="px-4 py-2.5 w-[40%]">
                                                    <div className="flex items-center gap-1 h-4">
                                                        <div
                                                            className="h-3 rounded-sm bg-[#4CAF6E]/60"
                                                            style={{ width: `${(day.reads / maxTotal) * 100}%` }}
                                                        />
                                                        <div
                                                            className="h-3 rounded-sm bg-[#D4882A]/60"
                                                            style={{ width: `${(day.writes / maxTotal) * 100}%` }}
                                                        />
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                {stats.dailyUsage.length > 0 && (
                                    <div className="px-4 py-2 border-t border-[#3D3C36]/50 flex items-center gap-4 text-[10px] text-[#9B9689] uppercase tracking-widest">
                                        <span className="flex items-center gap-1.5">
                                            <span className="w-2.5 h-2.5 rounded-sm bg-[#4CAF6E]/60" /> Reads
                                        </span>
                                        <span className="flex items-center gap-1.5">
                                            <span className="w-2.5 h-2.5 rounded-sm bg-[#D4882A]/60" /> Writes
                                        </span>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Operations by Account */}
                        <div>
                            <h2 className="text-base sm:text-lg font-semibold text-[#E8E4DD] mb-3 sm:mb-4">Operations by Account</h2>

                            {/* Mobile: card layout */}
                            <div className="sm:hidden space-y-2">
                                {stats.accountOps.length === 0 ? (
                                    <p className="text-sm text-[#9B9689] text-center py-8">No operations recorded</p>
                                ) : stats.accountOps.map(acc => (
                                    <Link
                                        key={acc.accountId}
                                        href={`/dev/${acc.accountId}`}
                                        prefetch
                                        className="block border border-[#3D3C36] rounded-lg bg-[#24231F]/40 p-3 hover:bg-[#2E2D28] hover:border-[#4CAF6E]/20 transition-all"
                                    >
                                        <div className="flex items-center justify-between mb-2">
                                            <div className="min-w-0">
                                                {acc.accountName && <div className="text-sm text-[#E8E4DD] truncate">{acc.accountName}</div>}
                                                {acc.email && <div className="text-xs text-[#9B9689] truncate">{acc.email}</div>}
                                                <div className="text-xs text-[#9B9689]/60 font-mono tabular-nums">{acc.accountId}</div>
                                            </div>
                                            <ChevronRight className="w-4 h-4 text-[#9B9689] shrink-0" />
                                        </div>
                                        <div className="grid grid-cols-3 gap-3 text-center">
                                            <div>
                                                <div className="text-[10px] text-[#9B9689] uppercase tracking-widest">Reads</div>
                                                <div className="text-sm text-[#9B9689] font-mono tabular-nums">{acc.reads.toLocaleString()}</div>
                                            </div>
                                            <div>
                                                <div className="text-[10px] text-[#9B9689] uppercase tracking-widest">Writes</div>
                                                <div className="text-sm text-[#D4882A] font-mono tabular-nums">{acc.writes.toLocaleString()}</div>
                                            </div>
                                            <div>
                                                <div className="text-[10px] text-[#9B9689] uppercase tracking-widest">Total</div>
                                                <div className="text-sm text-[#E8E4DD] font-mono tabular-nums font-medium">{acc.total.toLocaleString()}</div>
                                            </div>
                                        </div>
                                        <div className="mt-2 text-[10px] text-[#9B9689] font-mono">
                                            Last active: {new Date(acc.lastActive.endsWith('Z') ? acc.lastActive : acc.lastActive + 'Z').toLocaleString(undefined, {
                                                month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short',
                                            })}
                                        </div>
                                    </Link>
                                ))}
                            </div>

                            {/* Desktop: table layout */}
                            <div className="hidden sm:block border border-[#3D3C36] rounded-xl bg-[#24231F]/40 overflow-hidden">
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr className="border-b border-[#3D3C36]">
                                            {['Account', 'Reads', 'Writes', 'Total', 'Last Active'].map((h, i) => (
                                                <th key={i} className="px-4 py-3 text-[10px] font-semibold text-[#9B9689] uppercase tracking-widest">
                                                    {h}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {stats.accountOps.length === 0 ? (
                                            <tr>
                                                <td colSpan={5} className="px-4 py-8 text-center text-sm text-[#9B9689]">
                                                    No operations recorded
                                                </td>
                                            </tr>
                                        ) : stats.accountOps.map(acc => (
                                            <tr
                                                key={acc.accountId}
                                                className="border-b border-[#3D3C36]/50 hover:bg-[#24231F]/60 transition-colors"
                                            >
                                                <td className="px-4 py-2.5">
                                                    <Link href={`/dev/${acc.accountId}`} prefetch className="block">
                                                        {acc.accountName && (
                                                            <div className="text-sm text-[#E8E4DD]">{acc.accountName}</div>
                                                        )}
                                                        {acc.email && (
                                                            <div className="text-xs text-[#9B9689]">{acc.email}</div>
                                                        )}
                                                        <div className="text-xs text-[#9B9689]/60 font-mono tabular-nums">{acc.accountId}</div>
                                                    </Link>
                                                </td>
                                                <td className="px-4 py-2.5 text-sm text-[#9B9689] font-mono tabular-nums">
                                                    {acc.reads.toLocaleString()}
                                                </td>
                                                <td className="px-4 py-2.5 text-sm text-[#D4882A] font-mono tabular-nums">
                                                    {acc.writes.toLocaleString()}
                                                </td>
                                                <td className="px-4 py-2.5 text-sm text-[#E8E4DD] font-mono tabular-nums font-medium">
                                                    {acc.total.toLocaleString()}
                                                </td>
                                                <td className="px-4 py-2.5 text-xs text-[#9B9689] font-mono">
                                                    {new Date(acc.lastActive.endsWith('Z') ? acc.lastActive : acc.lastActive + 'Z').toLocaleString(undefined, {
                                                        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short',
                                                    })}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </>
                ) : null}
            </div>
        </section>
    );
}
