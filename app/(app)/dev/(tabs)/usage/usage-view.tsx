'use client';

import { useCallback, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { RefreshCw, AlertCircle, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { errorRateColor, SOURCE_LABELS, DEV_RANGE_OPTIONS, RangePicker } from '@/lib/dev-format';
import type { UsageStats } from '@/lib/dev-types';
import type { UsagePlatform } from '../../_components/dev-types';

const UsageCharts = dynamic(() => import('./usage-charts'), { ssr: false });

const USAGE_PLATFORM_LABELS: Record<UsagePlatform, string> = {
    all: 'All platforms',
    google_ads: 'Google Ads',
    meta_ads: 'Meta Ads',
};

// Module-level stale-while-revalidate cache (CLAUDE.md pattern).
// Only populated by client-side fetches (which carry the viewer's tz). We do
// NOT seed this from `initialData`, because the server prefetch uses a fixed
// best-guess tz — a cache hit would short-circuit the tz-correct refetch in
// fetchStats and leave non-PST viewers stuck on PST dates (or PST viewers on
// UTC dates, before this was fixed).
const usageStatsCache = new Map<string, UsageStats>();

const DEFAULT_CACHE_KEY = '60|all|all|prod';

type Props = { initialData?: UsageStats; initialTz?: string };

export function UsageView({ initialData, initialTz }: Props) {
    const [usageDays, setUsageDays] = useState(60);
    const [includeDev, setIncludeDev] = useState(false);
    const [usageSource, setUsageSource] = useState<string>('all');
    const [usagePlatform, setUsagePlatform] = useState<UsagePlatform>('all');
    const [stats, setStats] = useState<UsageStats | null>(
        usageStatsCache.get(DEFAULT_CACHE_KEY) ?? initialData ?? null,
    );
    const [loading, setLoading] = useState(
        !usageStatsCache.has(DEFAULT_CACHE_KEY) && !initialData,
    );
    const [error, setError] = useState<string | null>(null);

    const fetchStats = useCallback(async ({ days, source = 'all', platform = 'all', dev = false, background = false, fresh = false }: { days: number; source?: string; platform?: UsagePlatform; dev?: boolean; background?: boolean; fresh?: boolean }) => {
        const cacheKey = `${days}|${source}|${platform}|${dev ? 'dev' : 'prod'}`;
        const cached = usageStatsCache.get(cacheKey);
        if (cached && !fresh) {
            setStats(cached);
            if (background) return;
        }
        if (!background || !cached) setLoading(true);
        setError(null);
        try {
            const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
            const params = new URLSearchParams({ tz, days: String(days) });
            if (source !== 'all') params.set('source', source);
            if (platform !== 'all') params.set('platform', platform);
            if (dev) params.set('includeDev', '1');
            if (fresh) params.set('fresh', '1');
            const res = await fetch(`/api/dev/usage?${params}`, { credentials: 'include' });
            if (res.status === 403) {
                setError('Access denied');
                return;
            }
            if (!res.ok) throw new Error('Failed to fetch');
            const data: UsageStats = await res.json();
            setStats(data);
            usageStatsCache.set(cacheKey, data);
        } catch {
            setError('Failed to load usage stats');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        const cacheKey = `${usageDays}|${usageSource}|${usagePlatform}|${includeDev ? 'dev' : 'prod'}`;
        // Skip the refetch if the server already rendered with the viewer's tz
        // and the filters are at their defaults — initialData is then exactly
        // what the API would return. Seed the cache so subsequent mounts hit it.
        if (
            cacheKey === DEFAULT_CACHE_KEY
            && initialData
            && initialTz
            && !usageStatsCache.has(cacheKey)
        ) {
            const viewerTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
            if (viewerTz === initialTz) {
                usageStatsCache.set(cacheKey, initialData);
                return;
            }
        }
        fetchStats({ days: usageDays, source: usageSource, platform: usagePlatform, dev: includeDev, background: !!usageStatsCache.get(cacheKey) });
    }, [fetchStats, usageDays, usageSource, usagePlatform, includeDev, initialData, initialTz]);

    return (
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 sm:px-6 sm:py-6 space-y-5 sm:space-y-8">
            <div className="flex items-center justify-end">
                <Button
                    onClick={() => {
                        usageStatsCache.clear();
                        fetchStats({ days: usageDays, source: usageSource, platform: usagePlatform, dev: includeDev, fresh: true });
                    }}
                    disabled={loading}
                    variant="outline"
                    size="sm"
                    className="h-8 border-[#3D3C36] bg-[#24231F] hover:bg-[#2E2D28] text-[#C4C0B6] hover:text-[#E8E4DD] gap-1.5 sm:h-9"
                >
                    <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                    <span className="hidden sm:inline">Refresh</span>
                </Button>
            </div>

            {error && (
                <div className="bg-[#C45D4A]/10 border border-[#C45D4A]/30 rounded-lg p-3 sm:p-4 flex items-center gap-3 text-[#C45D4A]">
                    <AlertCircle className="w-5 h-5 shrink-0" />
                    <p className="text-sm">{error}</p>
                </div>
            )}

            {loading && !stats ? (
                <div className="flex flex-col items-center justify-center py-20 gap-4">
                    <div className="w-8 h-8 border-2 border-[#4CAF6E] border-t-transparent rounded-full animate-spin" />
                    <p className="text-[#C4C0B6] animate-pulse text-sm">Loading usage stats...</p>
                </div>
            ) : stats ? (
                <>
                    {/* ── Platform filter + dev toggle ── */}
                    <div className="flex flex-wrap items-center gap-1.5">
                        {(['all', 'google_ads', 'meta_ads'] as const).map((p) => {
                            const active = usagePlatform === p;
                            return (
                                <button
                                    key={p}
                                    onClick={() => {
                                        if (active) return;
                                        setUsagePlatform(p);
                                        fetchStats({ days: usageDays, source: usageSource, platform: p, dev: includeDev, background: !!usageStatsCache.get(`${usageDays}|${usageSource}|${p}|${includeDev ? 'dev' : 'prod'}`) });
                                    }}
                                    className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                                        active
                                            ? 'border-[#4CAF6E]/40 bg-[#4CAF6E]/[0.12] text-[#4CAF6E]'
                                            : 'border-[#3D3C36] bg-[#24231F] text-[#C4C0B6] hover:text-[#E8E4DD] hover:border-[#4D4C46]'
                                    }`}
                                >
                                    {USAGE_PLATFORM_LABELS[p]}
                                </button>
                            );
                        })}

                        <button
                            type="button"
                            onClick={() => {
                                const next = !includeDev;
                                setIncludeDev(next);
                                fetchStats({
                                    days: usageDays,
                                    source: usageSource,
                                    platform: usagePlatform,
                                    dev: next,
                                    background: !!usageStatsCache.get(`${usageDays}|${usageSource}|${usagePlatform}|${next ? 'dev' : 'prod'}`),
                                });
                            }}
                            title={
                                includeDev
                                    ? 'Including DEV_EMAILS rows (your own traffic). Click to exclude.'
                                    : 'Excluding DEV_EMAILS rows (default). Click to include your own traffic.'
                            }
                            className={`ml-2 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                                includeDev
                                    ? 'border-[#D4882A]/40 bg-[#D4882A]/[0.12] text-[#D4882A]'
                                    : 'border-[#3D3C36] bg-[#24231F] text-[#C4C0B6] hover:text-[#E8E4DD] hover:border-[#4D4C46]'
                            }`}
                        >
                            {includeDev ? 'Including test users' : 'Excluding test users'}
                        </button>

                        {/* Source filter + range picker */}
                        <div className="flex items-center gap-1.5 ml-2">
                            <Filter className="w-3.5 h-3.5 text-[#C4C0B6]" />
                            <select
                                value={usageSource}
                                onChange={(e) => {
                                    setUsageSource(e.target.value);
                                    usageStatsCache.clear();
                                    fetchStats({ days: usageDays, source: e.target.value, platform: usagePlatform, dev: includeDev });
                                }}
                                className="text-xs bg-[#24231F] border border-[#3D3C36] rounded px-2 py-1 text-[#E8E4DD] focus:outline-none focus:ring-1 focus:ring-[#4CAF6E]"
                            >
                                <option value="all">All sources</option>
                                {Object.entries(SOURCE_LABELS).map(([key, label]) => (
                                    <option key={key} value={key}>{label}</option>
                                ))}
                            </select>
                        </div>
                        <RangePicker
                            options={DEV_RANGE_OPTIONS}
                            value={usageDays}
                            onChange={(v) => {
                                setUsageDays(v);
                                const key = `${v}|${usageSource}|${usagePlatform}|${includeDev ? 'dev' : 'prod'}`;
                                fetchStats({ days: v, source: usageSource, platform: usagePlatform, dev: includeDev, background: !!usageStatsCache.get(key) });
                            }}
                        />
                    </div>

                    {/* ── Stat tiles ── */}
                    {(() => {
                        const currCallsRate = stats.totals.calls > 0
                            ? (stats.totals.errors / stats.totals.calls) * 100 : 0;
                        const prevCallsRate = stats.prevTotals.calls != null
                            && stats.prevTotals.errors != null
                            && stats.prevTotals.calls > 0
                            ? (stats.prevTotals.errors / stats.prevTotals.calls) * 100 : null;

                        type Tile = {
                            label: string;
                            display: string;
                            curr: number;
                            prev: number | null;
                            isErrorRate?: boolean;
                            noTrend?: boolean;
                            sub?: string;
                            absoluteDelta?: boolean;
                        };

                        const tiles: Tile[] = [
                            { label: 'Total Calls', display: stats.totals.calls.toLocaleString(), curr: stats.totals.calls, prev: stats.prevTotals.calls },
                            { label: 'Error Rate', display: `${currCallsRate.toFixed(1)}%`, curr: currCallsRate, prev: prevCallsRate, isErrorRate: true },
                            { label: 'Active Users', display: stats.totals.activeUsers.toLocaleString(), curr: stats.totals.activeUsers, prev: stats.prevTotals.activeUsers, absoluteDelta: true },
                            { label: 'New Users', display: stats.totals.newUsers.toLocaleString(), curr: stats.totals.newUsers, prev: null, noTrend: true, sub: 'this period' },
                        ];

                        return (
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
                            {tiles.map((tile) => {
                                let trendChip: React.ReactNode = null;
                                if (!tile.noTrend) {
                                    if (tile.isErrorRate) {
                                        if (prevCallsRate != null) {
                                            const delta = currCallsRate - prevCallsRate;
                                            const absDelta = Math.abs(delta).toFixed(1);
                                            trendChip = delta > 0.05 ? (
                                                <span className="text-[11px] font-medium text-[#C45D4A]">▲ {absDelta}pp vs prev {usageDays}d</span>
                                            ) : delta < -0.05 ? (
                                                <span className="text-[11px] font-medium text-[#4CAF6E]">▼ {absDelta}pp vs prev {usageDays}d</span>
                                            ) : (
                                                <span className="text-[11px] text-[#C4C0B6]">≈ flat vs prev {usageDays}d</span>
                                            );
                                        } else {
                                            trendChip = <span className="text-[11px] text-[#C4C0B6]/60">new</span>;
                                        }
                                    } else if (tile.absoluteDelta) {
                                        if (tile.prev === null) {
                                            trendChip = <span className="text-[11px] text-[#C4C0B6]/60">new</span>;
                                        } else {
                                            const absDelta = tile.curr - tile.prev;
                                            trendChip = absDelta > 0 ? (
                                                <span className="text-[11px] font-medium text-[#4CAF6E]">▲ {absDelta} vs prev {usageDays}d</span>
                                            ) : absDelta < 0 ? (
                                                <span className="text-[11px] text-[#C4C0B6]">▼ {Math.abs(absDelta)} vs prev {usageDays}d</span>
                                            ) : (
                                                <span className="text-[11px] text-[#C4C0B6]">≈ flat vs prev {usageDays}d</span>
                                            );
                                        }
                                    } else {
                                        if (tile.prev === null) {
                                            trendChip = <span className="text-[11px] text-[#C4C0B6]/60">new</span>;
                                        } else if (tile.prev > 0) {
                                            const pct = ((tile.curr - tile.prev) / tile.prev) * 100;
                                            const absPct = Math.abs(pct).toFixed(0);
                                            trendChip = pct >= 1 ? (
                                                <span className="text-[11px] font-medium text-[#4CAF6E]">▲ {absPct}% vs prev {usageDays}d</span>
                                            ) : pct <= -1 ? (
                                                <span className="text-[11px] text-[#C4C0B6]">▼ {absPct}% vs prev {usageDays}d</span>
                                            ) : (
                                                <span className="text-[11px] text-[#C4C0B6]">≈ flat vs prev {usageDays}d</span>
                                            );
                                        } else {
                                            trendChip = <span className="text-[11px] text-[#C4C0B6]/60">new</span>;
                                        }
                                    }
                                } else if (tile.sub) {
                                    trendChip = <span className="text-[11px] text-[#C4C0B6]">{tile.sub}</span>;
                                }
                                return (
                                    <div key={tile.label} className="border border-[#3D3C36] rounded-lg bg-[#24231F] px-4 py-3">
                                        <div className="text-[10px] font-semibold text-[#C4C0B6] uppercase tracking-widest mb-1">{tile.label}</div>
                                        <div className="text-[22px] sm:text-[26px] font-semibold font-mono tabular-nums text-[#E8E4DD] leading-none">{tile.display}</div>
                                        <div className="mt-1">{trendChip}</div>
                                    </div>
                                );
                            })}
                        </div>
                        );
                    })()}

                    {/* ── Charts (dynamically imported) ── */}
                    <UsageCharts stats={stats} usageDays={usageDays} />

                    {/* ── Two-column: lowest success rate + top tools ── */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
                        {/* Users with the lowest interaction success rate */}
                        <div className="border border-[#3D3C36] rounded-xl bg-[#24231F]/40 overflow-hidden">
                            <div className="px-4 py-3 border-b border-[#3D3C36]">
                                <h2 className="text-sm font-semibold text-[#E8E4DD]">Users with Lowest Success Rate</h2>
                                <p className="text-[11px] text-[#C4C0B6] mt-0.5">
                                    Last {stats.lowSuccessUsers.windowDays}d · ≥{stats.lowSuccessUsers.minInteractions} interactions · click to open account
                                </p>
                            </div>
                            {stats.lowSuccessUsers.users.length === 0 ? (
                                <div className="px-4 py-8 text-center text-sm text-[#5DBE82]">
                                    No qualifying users in the last {stats.lowSuccessUsers.windowDays} days.
                                </div>
                            ) : (
                                <div className="divide-y divide-[#3D3C36]/50">
                                    {stats.lowSuccessUsers.users.map((u) => {
                                        // Reuse error palette: lower success rate is "more red"; treat
                                        // failure rate as the input so existing thresholds carry over.
                                        const failureRate = 100 - u.successRate;
                                        const rateColor = errorRateColor(failureRate);
                                        const failed = u.interactions - u.successfulInteractions;
                                        const target = u.primaryAccountId ? `/dev/${u.primaryAccountId}` : null;
                                        const row = (
                                            <div className="flex items-start gap-3 px-4 py-2.5">
                                                <div className="min-w-0 flex-1">
                                                    <div className="text-[13px] font-mono text-[#E8E4DD] truncate">
                                                        {u.googleEmail ?? u.userId}
                                                    </div>
                                                    <div className="text-[11px] text-[#C4C0B6] font-mono mt-0.5">
                                                        {failed.toLocaleString()} failed / {u.interactions.toLocaleString()} interactions
                                                    </div>
                                                    {u.topErrorClasses.length > 0 && (
                                                        <div className="flex flex-wrap gap-1 mt-1">
                                                            {u.topErrorClasses.map((cls) => (
                                                                <span key={cls} className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#C45D4A]/10 text-[#C45D4A] border border-[#C45D4A]/20">
                                                                    {cls}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                                <div className={`shrink-0 font-mono text-sm tabular-nums font-semibold ${rateColor}`}>
                                                    {u.successRate.toFixed(1)}%
                                                </div>
                                            </div>
                                        );
                                        return target ? (
                                            <Link
                                                key={u.userId}
                                                href={target}
                                                prefetch
                                                className="block hover:bg-[#2E2D28] transition-colors cursor-pointer"
                                            >
                                                {row}
                                            </Link>
                                        ) : (
                                            <div key={u.userId}>{row}</div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        {/* Top tools */}
                        <div className="border border-[#3D3C36] rounded-xl bg-[#24231F]/40 overflow-hidden">
                            <div className="px-4 py-3 border-b border-[#3D3C36]">
                                <h2 className="text-sm font-semibold text-[#E8E4DD]">Top Tools</h2>
                            </div>
                            {stats.topTools.length === 0 ? (
                                <div className="px-4 py-8 text-center text-sm text-[#C4C0B6]">
                                    No tool calls yet.
                                </div>
                            ) : (() => {
                                const maxCalls = Math.max(...stats.topTools.map(t => t.calls), 1);
                                return (
                                    <div className="px-4 py-3 space-y-2.5 max-h-[480px] overflow-y-auto">
                                        {stats.topTools.map((t) => {
                                            const rate = t.calls > 0 ? (t.errors / t.calls) * 100 : 0;
                                            const hasWarning = rate >= 5;
                                            const barColor = rate >= 15
                                                ? 'bg-[#C45D4A]/50'
                                                : rate >= 5
                                                    ? 'bg-[#D4882A]/40'
                                                    : 'bg-[#4CAF6E]/30';
                                            return (
                                                <div key={t.toolName ?? 'unknown'}>
                                                    <div className="flex items-center justify-between gap-2 mb-1 text-[12px]">
                                                        <span className="font-mono text-[#E8E4DD] truncate min-w-0">
                                                            {t.toolName ?? '—'}
                                                            {hasWarning && <span className="ml-1 text-[#D4882A]">⚠</span>}
                                                        </span>
                                                        <div className="flex shrink-0 items-center gap-3 font-mono text-[11px]">
                                                            {rate > 0 && (
                                                                <span className={errorRateColor(rate)}>
                                                                    {rate.toFixed(1)}%
                                                                </span>
                                                            )}
                                                            <span className="text-[#C4C0B6]">{t.calls.toLocaleString()}</span>
                                                        </div>
                                                    </div>
                                                    <div className="h-1.5 overflow-hidden rounded bg-[#1A1917]">
                                                        <div
                                                            className={`h-full rounded transition-all ${barColor}`}
                                                            style={{ width: `${(t.calls / maxCalls) * 100}%` }}
                                                        />
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                );
                            })()}
                        </div>
                    </div>
                </>
            ) : null}
        </div>
    );
}
