'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { RefreshCw, AlertCircle, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { errorRateColor, SOURCE_LABELS, DEV_RANGE_OPTIONS, RangePicker } from '@/lib/dev-format';
import type {
    DailyCountRow,
    LowSuccessUsers,
    TopTool,
} from '@/lib/dev-types';
import type { UsagePlatform } from '../../_components/dev-types';

const Charts = {
    VolumeErrors: dynamic(() => import('./usage-charts').then((m) => m.VolumeErrorsChart), { ssr: false }),
    Dau: dynamic(() => import('./usage-charts').then((m) => m.DauChart), { ssr: false }),
};

const USAGE_PLATFORM_LABELS: Record<UsagePlatform, string> = {
    all: 'All platforms',
    google_ads: 'Google Ads',
    meta_ads: 'Meta Ads',
};

// ─── Section plumbing ────────────────────────────────────────────────────────

type Section = 'daily' | 'lowSuccess' | 'topTools';

type SectionPayload = {
    daily: DailyCountRow[];
    lowSuccess: LowSuccessUsers;
    topTools: TopTool[];
};

type FilterState = {
    days: number;
    source: string;
    platform: UsagePlatform;
    includeDev: boolean;
};

const DEFAULT_FILTERS: FilterState = {
    days: 60,
    source: 'all',
    platform: 'all',
    includeDev: false,
};

const SECTIONS: readonly Section[] = ['daily', 'lowSuccess', 'topTools'];

function filterKey(f: FilterState): string {
    return `${f.days}|${f.source}|${f.platform}|${f.includeDev ? 'dev' : 'prod'}`;
}

// One cache per section, module-level so it survives unmount/remount (tab
// switching). The point of splitting is that a cached daily response can paint
// immediately while the slower low-success query is still resolving for the
// same filter combination.
const sectionCaches: { [K in Section]: Map<string, SectionPayload[K]> } = {
    daily: new Map(),
    lowSuccess: new Map(),
    topTools: new Map(),
};

// ─── View ────────────────────────────────────────────────────────────────────

export function UsageView() {
    const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);

    const initialKey = filterKey(DEFAULT_FILTERS);
    const [daily, setDaily] = useState<DailyCountRow[] | null>(
        () => sectionCaches.daily.get(initialKey) ?? null,
    );
    const [lowSuccess, setLowSuccess] = useState<LowSuccessUsers | null>(
        () => sectionCaches.lowSuccess.get(initialKey) ?? null,
    );
    const [topTools, setTopTools] = useState<TopTool[] | null>(
        () => sectionCaches.topTools.get(initialKey) ?? null,
    );
    const [loading, setLoading] = useState<Record<Section, boolean>>(() => ({
        daily: !sectionCaches.daily.has(initialKey),
        lowSuccess: !sectionCaches.lowSuccess.has(initialKey),
        topTools: !sectionCaches.topTools.has(initialKey),
    }));
    const [errors, setErrors] = useState<Record<Section, string | null>>({
        daily: null, lowSuccess: null, topTools: null,
    });
    const [accessDenied, setAccessDenied] = useState(false);

    // One AbortController per section. When a new fetch starts (filter change,
    // refresh), we abort the previous in-flight one so a slow late response
    // can't stomp the newer filter's state. We also stamp each fetch with the
    // controller it owns and re-check `isCurrent()` before any setState, in
    // case the response arrived between the previous fetch resolving and
    // applyData running.
    const abortControllersRef = useRef<Record<Section, AbortController | null>>({
        daily: null, lowSuccess: null, topTools: null,
    });

    const applyData = useCallback(<K extends Section>(section: K, value: SectionPayload[K] | null) => {
        switch (section) {
            case 'daily': setDaily(value as DailyCountRow[] | null); break;
            case 'lowSuccess': setLowSuccess(value as LowSuccessUsers | null); break;
            case 'topTools': setTopTools(value as TopTool[] | null); break;
        }
    }, []);

    const fetchSection = useCallback(
        async <K extends Section>(section: K, f: FilterState, fresh: boolean) => {
            // Cancel any prior in-flight fetch for this section so its response
            // can't paint stale data over a newer filter.
            abortControllersRef.current[section]?.abort();
            const controller = new AbortController();
            abortControllersRef.current[section] = controller;
            const isCurrent = () => abortControllersRef.current[section] === controller;

            const cache = sectionCaches[section];
            const key = filterKey(f);
            const cached = cache.get(key);

            if (cached && !fresh) {
                applyData(section, cached);
                setLoading((l) => ({ ...l, [section]: false }));
            } else {
                // Don't blank `data` here — keep whatever's on screen (stale
                // payload on refresh, or null on first mount when there's
                // nothing to preserve anyway). Just signal that a refresh is
                // in flight via loading=true.
                setLoading((l) => ({ ...l, [section]: true }));
            }
            setErrors((e) => ({ ...e, [section]: null }));

            try {
                const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
                const params = new URLSearchParams({ section, tz, days: String(f.days) });
                if (f.source !== 'all') params.set('source', f.source);
                if (f.platform !== 'all') params.set('platform', f.platform);
                if (f.includeDev) params.set('includeDev', '1');
                if (fresh) params.set('fresh', '1');

                const res = await fetch(`/api/dev/usage?${params}`, {
                    credentials: 'include',
                    signal: controller.signal,
                });
                if (res.status === 403) {
                    if (isCurrent()) setAccessDenied(true);
                    return;
                }
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const data = (await res.json()) as SectionPayload[K];
                // Cache the result under its own filter key regardless of
                // whether the user has moved on — a future filter switch back
                // gets an instant paint. But only commit to state if this is
                // still the current request.
                cache.set(key, data);
                if (!isCurrent()) return;
                applyData(section, data);
            } catch (err) {
                if ((err as Error)?.name === 'AbortError') return;
                if (isCurrent()) setErrors((e) => ({ ...e, [section]: 'Failed to load' }));
            } finally {
                if (isCurrent()) setLoading((l) => ({ ...l, [section]: false }));
            }
        },
        [applyData],
    );

    useEffect(() => {
        for (const s of SECTIONS) void fetchSection(s, filters, false);
    }, [fetchSection, filters]);

    function updateFilters(partial: Partial<FilterState>) {
        setFilters((f) => ({ ...f, ...partial }));
    }

    function refreshAll() {
        for (const s of SECTIONS) sectionCaches[s].clear();
        for (const s of SECTIONS) void fetchSection(s, filters, true);
    }

    const anyLoading = SECTIONS.some((s) => loading[s]);
    const firstError = SECTIONS.map((s) => errors[s]).find(Boolean) ?? null;

    if (accessDenied) {
        return (
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 sm:px-6 sm:py-6">
                <div className="bg-[#C45D4A]/10 border border-[#C45D4A]/30 rounded-lg p-3 sm:p-4 flex items-center gap-3 text-[#C45D4A]">
                    <AlertCircle className="w-5 h-5 shrink-0" />
                    <p className="text-sm">Access denied</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 sm:px-6 sm:py-6 space-y-5 sm:space-y-8">
            <div className="flex items-center justify-end">
                <Button
                    onClick={refreshAll}
                    disabled={anyLoading}
                    variant="outline"
                    size="sm"
                    className="h-8 border-[#3D3C36] bg-[#24231F] hover:bg-[#2E2D28] text-[#C4C0B6] hover:text-[#E8E4DD] gap-1.5 sm:h-9"
                >
                    <RefreshCw className={`w-3.5 h-3.5 ${anyLoading ? 'animate-spin' : ''}`} />
                    <span className="hidden sm:inline">Refresh</span>
                </Button>
            </div>

            {firstError && (
                <div className="bg-[#C45D4A]/10 border border-[#C45D4A]/30 rounded-lg p-3 sm:p-4 flex items-center gap-3 text-[#C45D4A]">
                    <AlertCircle className="w-5 h-5 shrink-0" />
                    <p className="text-sm">{firstError}</p>
                </div>
            )}

            <div className="flex flex-wrap items-center gap-1.5">
                {(['all', 'google_ads', 'meta_ads'] as const).map((p) => {
                    const active = filters.platform === p;
                    return (
                        <button
                            key={p}
                            onClick={() => {
                                if (active) return;
                                updateFilters({ platform: p });
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
                    onClick={() => updateFilters({ includeDev: !filters.includeDev })}
                    title={
                        filters.includeDev
                            ? 'Including DEV_EMAILS rows (your own traffic). Click to exclude.'
                            : 'Excluding DEV_EMAILS rows (default). Click to include your own traffic.'
                    }
                    className={`ml-2 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                        filters.includeDev
                            ? 'border-[#D4882A]/40 bg-[#D4882A]/[0.12] text-[#D4882A]'
                            : 'border-[#3D3C36] bg-[#24231F] text-[#C4C0B6] hover:text-[#E8E4DD] hover:border-[#4D4C46]'
                    }`}
                >
                    {filters.includeDev ? 'Including test users' : 'Excluding test users'}
                </button>

                <div className="flex items-center gap-1.5 ml-2">
                    <Filter className="w-3.5 h-3.5 text-[#C4C0B6]" />
                    <select
                        value={filters.source}
                        onChange={(e) => updateFilters({ source: e.target.value })}
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
                    value={filters.days}
                    onChange={(v) => updateFilters({ days: v })}
                />
            </div>

            <Charts.VolumeErrors daily={daily} loading={loading.daily} usageDays={filters.days} />
            <Charts.Dau daily={daily} loading={loading.daily} />

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
                <LowSuccessSection data={lowSuccess} loading={loading.lowSuccess} />
                <TopToolsSection data={topTools} loading={loading.topTools} />
            </div>
        </div>
    );
}

// ─── Low success users ───────────────────────────────────────────────────────

function LowSuccessSection({
    data,
    loading,
}: {
    data: LowSuccessUsers | null;
    loading: boolean;
}) {
    return (
        <div className="border border-[#3D3C36] rounded-xl bg-[#24231F]/40 overflow-hidden">
            <div className="px-4 py-3 border-b border-[#3D3C36]">
                <h2 className="text-sm font-semibold text-[#E8E4DD]">Users with Lowest Success Rate</h2>
                {data ? (
                    <p className="text-[11px] text-[#C4C0B6] mt-0.5">
                        Last {data.windowDays}d · ≥{data.minInteractions} interactions · click to open account
                    </p>
                ) : (
                    <p className="text-[11px] text-[#C4C0B6]/70 mt-0.5">loading…</p>
                )}
            </div>
            {loading || !data ? (
                <div className="divide-y divide-[#3D3C36]/50">
                    {[...Array(5)].map((_, i) => (
                        <div key={i} className="px-4 py-2.5 animate-pulse">
                            <div className="h-3 w-44 bg-[#3D3C36]/70 rounded mb-1.5" />
                            <div className="h-3 w-32 bg-[#3D3C36]/40 rounded" />
                        </div>
                    ))}
                </div>
            ) : data.users.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-[#5DBE82]">
                    No qualifying users in the last {data.windowDays} days.
                </div>
            ) : (
                <div className="divide-y divide-[#3D3C36]/50">
                    {data.users.map((u) => {
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
    );
}

// ─── Top tools ───────────────────────────────────────────────────────────────

function TopToolsSection({
    data,
    loading,
}: {
    data: TopTool[] | null;
    loading: boolean;
}) {
    return (
        <div className="border border-[#3D3C36] rounded-xl bg-[#24231F]/40 overflow-hidden">
            <div className="px-4 py-3 border-b border-[#3D3C36]">
                <h2 className="text-sm font-semibold text-[#E8E4DD]">Top Tools</h2>
            </div>
            {loading || !data ? (
                <div className="px-4 py-3 space-y-2.5 max-h-[480px] overflow-y-auto">
                    {[...Array(8)].map((_, i) => (
                        <div key={i} className="animate-pulse">
                            <div className="flex items-center justify-between mb-1">
                                <div className="h-3 w-40 bg-[#3D3C36]/70 rounded" />
                                <div className="h-3 w-10 bg-[#3D3C36]/50 rounded" />
                            </div>
                            <div className="h-1.5 rounded bg-[#1A1917]" />
                        </div>
                    ))}
                </div>
            ) : data.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-[#C4C0B6]">No tool calls yet.</div>
            ) : (
                (() => {
                    const maxCalls = Math.max(...data.map((t) => t.calls), 1);
                    return (
                        <div className="px-4 py-3 space-y-2.5 max-h-[480px] overflow-y-auto">
                            {data.map((t) => {
                                const rate = t.calls > 0 ? (t.errors / t.calls) * 100 : 0;
                                const hasWarning = rate >= 5;
                                const barColor =
                                    rate >= 15
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
                                                    <span className={errorRateColor(rate)}>{rate.toFixed(1)}%</span>
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
                })()
            )}
        </div>
    );
}
