'use client';

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, ArrowLeft, ArrowUpDown, Loader2, RefreshCw, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
const OP_TYPE = { READ: 0, WRITE: 1 } as const;

type TopTool = {
    toolName: string;
    calls: number;
    p50: number;
    p95: number;
    avgBytes: number;
    errors: number;
};

type PrevTool = {
    toolName: string;
    calls: number;
};

type TopArgShape = {
    toolName: string;
    argsSha256: string;
    calls: number;
    sampleArgs: unknown;
};

type RecentCall = {
    id: number;
    toolName: string | null;
    userId: string | null;
    sessionId: number | null;
    clientSource: string | null;
    latencyMs: number | null;
    bytesOut: number | null;
    errorClass: string | null;
    errorMessage: string | null;
    opType: number;
    args: unknown;
    createdAt: string;
};

type DailyCount = { day: string; reads: number; writes: number; errors: number };
type ErrorRow = { errorClass: string; calls: number };

type TelemetryPayload = {
    days: number;
    topTools: TopTool[];
    prevTopTools: PrevTool[];
    topArgShapes: TopArgShape[];
    recentCalls: RecentCall[];
    dailyCounts: DailyCount[];
    errorBreakdown: ErrorRow[];
};

type Tab = 'overview' | 'by-tool' | 'recent';

const RANGE_OPTIONS = [
    { label: '24h', value: 1 },
    { label: '7d', value: 7 },
    { label: '30d', value: 30 },
    { label: '90d', value: 90 },
];

function formatBytes(n: number | null) {
    if (n == null) return '—';
    if (n < 1024) return `${n}B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`;
    return `${(n / 1024 / 1024).toFixed(1)}MB`;
}

function formatTime(iso: string) {
    const d = new Date(iso);
    const now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    return sameDay
        ? d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })
        : d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function errorRate(calls: number, errors: number) {
    if (calls === 0) return 0;
    return (errors / calls) * 100;
}

const cache = new Map<number, TelemetryPayload>();

export default function TelemetryPage() {
    const [days, setDays] = useState(7);
    const [data, setData] = useState<TelemetryPayload | null>(cache.get(days) ?? null);
    const [loading, setLoading] = useState(!data);
    const [error, setError] = useState<string | null>(null);
    const [tab, setTab] = useState<Tab>('overview');

    const load = useCallback(async (background = false) => {
        if (!background) setLoading(true);
        setError(null);
        try {
            const res = await fetch(`/api/dev/telemetry?days=${days}`, { credentials: 'include' });
            if (!res.ok) {
                if (res.status === 403) {
                    setError('Forbidden — this page is dev-only.');
                    return;
                }
                throw new Error(`HTTP ${res.status}`);
            }
            const payload: TelemetryPayload = await res.json();
            setData(payload);
            cache.set(days, payload);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to load telemetry');
        } finally {
            setLoading(false);
        }
    }, [days]);

    useEffect(() => {
        const cached = cache.get(days);
        if (cached) setData(cached);
        load(!!cached);
    }, [load, days]);

    const totalCalls = data?.topTools.reduce((a, t) => a + t.calls, 0) ?? 0;
    const totalErrors = data?.topTools.reduce((a, t) => a + t.errors, 0) ?? 0;
    const successRate = totalCalls > 0 ? ((totalCalls - totalErrors) / totalCalls) * 100 : 100;
    const successTone = successRate >= 95 ? 'success' : successRate >= 80 ? 'warning' : 'danger';

    return (
        <div className="min-h-full px-4 py-6 md:px-8">
            <div className="mx-auto max-w-[1400px]">
                {/* Header */}
                <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <div className="mb-1">
                            <Link
                                href="/dev"
                                className="inline-flex items-center gap-1 text-[12px] text-[#C4C0B6] hover:text-[#E8E4DD]"
                            >
                                <ArrowLeft className="h-3 w-3" /> Dev
                            </Link>
                        </div>
                        <h1 className="font-[var(--font-general-sans)] text-[28px] font-semibold tracking-tight text-[#E8E4DD]">
                            Telemetry
                        </h1>
                        <p className="text-[13px] text-[#C4C0B6]">
                            Per-tool-call data from the MCP + chat chokepoints.
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="inline-flex rounded-lg border border-[#3D3C36] bg-[#24231F] p-0.5">
                            {RANGE_OPTIONS.map((opt) => (
                                <button
                                    key={opt.value}
                                    type="button"
                                    onClick={() => setDays(opt.value)}
                                    className={`rounded-md px-3 py-1 text-[12px] font-medium transition ${
                                        days === opt.value
                                            ? 'bg-[#4CAF6E]/15 text-[#4CAF6E]'
                                            : 'text-[#C4C0B6] hover:text-[#E8E4DD]'
                                    }`}
                                >
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => load(false)}
                            disabled={loading}
                            className="rounded-lg text-[#C4C0B6] hover:bg-[#E8E4DD]/8 hover:text-[#E8E4DD]"
                        >
                            {loading ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                                <RefreshCw className="h-4 w-4" />
                            )}
                        </Button>
                    </div>
                </div>

                {/* Tab bar */}
                <div className="mb-5 flex gap-1 border-b border-[#3D3C36]">
                    {(['overview', 'by-tool', 'recent'] as Tab[]).map((t) => (
                        <button
                            key={t}
                            type="button"
                            onClick={() => setTab(t)}
                            className={`-mb-px px-4 py-2 text-[13px] font-medium transition border-b-2 ${
                                tab === t
                                    ? 'border-[#4CAF6E] text-[#E8E4DD]'
                                    : 'border-transparent text-[#C4C0B6] hover:text-[#E8E4DD]'
                            }`}
                        >
                            {t === 'overview' ? 'Overview' : t === 'by-tool' ? 'By Tool' : 'Recent Calls'}
                        </button>
                    ))}
                </div>

                {error && (
                    <div className="mb-4 flex items-start gap-2 rounded-lg border border-[#C45D4A]/30 bg-[#C45D4A]/10 px-3 py-2 text-[13px] text-[#C45D4A]">
                        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                        <span>{error}</span>
                    </div>
                )}

                {!data && loading && (
                    <div className="flex items-center justify-center py-24 text-[#C4C0B6]">
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading telemetry…
                    </div>
                )}

                {data && tab === 'overview' && (
                    <OverviewTab
                        data={data}
                        totalCalls={totalCalls}
                        totalErrors={totalErrors}
                        successRate={successRate}
                        successTone={successTone}
                    />
                )}
                {data && tab === 'by-tool' && (
                    <ByToolTab data={data} days={days} />
                )}
                {data && tab === 'recent' && (
                    <RecentCallsTab calls={data.recentCalls} />
                )}
            </div>
        </div>
    );
}

/* ─── Overview tab ─────────────────────────────────────────────────────────── */

function OverviewTab({
    data,
    totalCalls,
    totalErrors,
    successRate,
    successTone,
}: {
    data: TelemetryPayload;
    totalCalls: number;
    totalErrors: number;
    successRate: number;
    successTone: 'success' | 'warning' | 'danger';
}) {
    return (
        <div className="grid gap-4 lg:grid-cols-2">
            {/* Stats row */}
            <div className="lg:col-span-2 grid grid-cols-2 gap-2 md:grid-cols-4">
                <Stat label="Total calls" value={totalCalls.toLocaleString()} />
                <Stat
                    label="Success rate"
                    value={`${successRate.toFixed(1)}%`}
                    tone={successTone}
                />
                <Stat label="Unique tools" value={data.topTools.length.toLocaleString()} />
                <Stat
                    label="Error calls"
                    value={totalErrors.toLocaleString()}
                    tone={totalErrors > 0 ? 'danger' : 'neutral'}
                />
            </div>

            {/* Error rate over time */}
            <Card title="Error rate" className="lg:col-span-2">
                <ErrorRateChart counts={data.dailyCounts} />
            </Card>

            {/* Error breakdown */}
            <Card title="Errors by class">
                {data.errorBreakdown.length === 0 ? (
                    <div className="py-4 text-center text-[13px] text-[#5DBE82]">
                        No errors in this range.
                    </div>
                ) : (
                    <ul className="space-y-1.5 font-mono text-[13px]">
                        {data.errorBreakdown.map((e) => (
                            <li
                                key={e.errorClass}
                                className="flex items-center justify-between rounded border border-[#3D3C36] bg-[#2E2D28] px-3 py-1.5"
                            >
                                <span className="text-[#C45D4A]">{e.errorClass}</span>
                                <span className="text-[#E8E4DD]">{e.calls.toLocaleString()}</span>
                            </li>
                        ))}
                    </ul>
                )}
            </Card>

            {/* Top arg shapes */}
            <Card title="Top arg shapes">
                {data.topArgShapes.length === 0 ? (
                    <div className="py-4 text-center text-[13px] text-[#C4C0B6]">
                        No grouped args yet.
                    </div>
                ) : (
                    <ul className="max-h-[480px] space-y-2 overflow-y-auto pr-1">
                        {data.topArgShapes.map((s) => (
                            <li
                                key={`${s.toolName}-${s.argsSha256}`}
                                className="rounded border border-[#3D3C36] bg-[#24231F] p-2"
                            >
                                <div className="flex items-center justify-between text-[12px]">
                                    <span className="font-mono text-[#E8E4DD]">{s.toolName}</span>
                                    <span className="text-[#C4C0B6]">
                                        {s.calls.toLocaleString()} calls
                                    </span>
                                </div>
                                <pre className="mt-1 overflow-x-auto rounded bg-[#1A1917] p-2 font-mono text-[11px] text-[#C4C0B6]">
                                    {JSON.stringify(s.sampleArgs ?? {}, null, 2)}
                                </pre>
                            </li>
                        ))}
                    </ul>
                )}
            </Card>
        </div>
    );
}

function ErrorRateChart({ counts }: { counts: DailyCount[] }) {
    const [hovered, setHovered] = useState<number | null>(null);

    if (counts.length === 0) {
        return <div className="py-8 text-center text-[13px] text-[#C4C0B6]">No data.</div>;
    }

    const W = 800;
    const H = 140;
    const PAD = { top: 16, right: 16, bottom: 32, left: 40 };
    const plotW = W - PAD.left - PAD.right;
    const plotH = H - PAD.top - PAD.bottom;

    const pts = counts.map((d) => {
        const total = d.reads + d.writes;
        return total > 0 ? (d.errors / total) * 100 : 0;
    });

    const maxY = Math.max(...pts, 15, 1);
    const yScale = (v: number) => plotH - (v / maxY) * plotH;
    const xScale = (i: number) =>
        counts.length === 1 ? plotW / 2 : (i / (counts.length - 1)) * plotW;

    const polyline = pts
        .map((v, i) => `${xScale(i).toFixed(1)},${yScale(v).toFixed(1)}`)
        .join(' ');

    const area = [
        `M ${xScale(0).toFixed(1)},${plotH}`,
        ...pts.map((v, i) => `L ${xScale(i).toFixed(1)},${yScale(v).toFixed(1)}`),
        `L ${xScale(pts.length - 1).toFixed(1)},${plotH}`,
        'Z',
    ].join(' ');

    // threshold lines at 5% and 15%
    const thresholds = [
        { pct: 5, color: '#D4882A', label: '5%' },
        { pct: 15, color: '#C45D4A', label: '15%' },
    ].filter((t) => t.pct <= maxY * 1.1);

    const labelEvery = counts.length <= 10 ? 1 : counts.length <= 30 ? 3 : 7;

    return (
        <div className="relative">
            <svg
                viewBox={`0 0 ${W} ${H}`}
                className="w-full"
                style={{ height: 160 }}
                onMouseLeave={() => setHovered(null)}
            >
                <g transform={`translate(${PAD.left},${PAD.top})`}>
                    {/* threshold bands */}
                    {thresholds.map((t) => (
                        <g key={t.pct}>
                            <line
                                x1={0} y1={yScale(t.pct)}
                                x2={plotW} y2={yScale(t.pct)}
                                stroke={t.color}
                                strokeWidth={1}
                                strokeDasharray="4 3"
                                opacity={0.4}
                            />
                            <text
                                x={plotW + 4} y={yScale(t.pct) + 4}
                                fill={t.color}
                                fontSize={9}
                                opacity={0.7}
                            >{t.label}</text>
                        </g>
                    ))}

                    {/* area fill */}
                    <path d={area} fill="#C45D4A" opacity={0.08} />

                    {/* line */}
                    <polyline
                        points={polyline}
                        fill="none"
                        stroke="#C45D4A"
                        strokeWidth={1.5}
                        strokeLinejoin="round"
                        strokeLinecap="round"
                    />

                    {/* dots + hover targets */}
                    {pts.map((v, i) => (
                        <g key={i}>
                            <circle
                                cx={xScale(i)} cy={yScale(v)}
                                r={3}
                                fill={v >= 15 ? '#C45D4A' : v >= 5 ? '#D4882A' : '#5DBE82'}
                                stroke="#1A1917"
                                strokeWidth={1.5}
                            />
                            {/* invisible wider hit target */}
                            <rect
                                x={xScale(i) - 12} y={0}
                                width={24} height={plotH}
                                fill="transparent"
                                onMouseEnter={() => setHovered(i)}
                            />
                        </g>
                    ))}

                    {/* x-axis labels */}
                    {counts.map((d, i) => {
                        if (i % labelEvery !== 0 && i !== counts.length - 1) return null;
                        const label = d.day.slice(5); // MM-DD
                        return (
                            <text
                                key={d.day}
                                x={xScale(i)} y={plotH + 18}
                                textAnchor="middle"
                                fill="#C4C0B6"
                                fontSize={10}
                            >{label}</text>
                        );
                    })}

                    {/* y-axis: 0% label */}
                    <text x={-4} y={plotH} textAnchor="end" fill="#C4C0B6" fontSize={10}>0%</text>
                    <text x={-4} y={4} textAnchor="end" fill="#C4C0B6" fontSize={10}>
                        {maxY.toFixed(0)}%
                    </text>

                    {/* tooltip */}
                    {hovered !== null && (() => {
                        const d = counts[hovered];
                        const v = pts[hovered];
                        const total = d.reads + d.writes;
                        const cx = xScale(hovered);
                        const cy = yScale(v);
                        const tipX = hovered > counts.length * 0.7 ? cx - 108 : cx + 8;
                        const tipY = Math.max(cy - 28, 2);
                        return (
                            <g>
                                <line x1={cx} y1={0} x2={cx} y2={plotH} stroke="#3D3C36" strokeWidth={1} />
                                <rect x={tipX} y={tipY} width={100} height={52} rx={4}
                                    fill="#24231F" stroke="#3D3C36" strokeWidth={1} />
                                <text x={tipX + 8} y={tipY + 16} fill="#E8E4DD" fontSize={11}>
                                    {d.day}
                                </text>
                                <text x={tipX + 8} y={tipY + 32} fill={v >= 15 ? '#C45D4A' : v >= 5 ? '#D4882A' : '#5DBE82'} fontSize={12} fontWeight="600">
                                    {v.toFixed(1)}% err
                                </text>
                                <text x={tipX + 8} y={tipY + 46} fill="#C4C0B6" fontSize={10}>
                                    {d.errors} / {total} calls
                                </text>
                            </g>
                        );
                    })()}
                </g>
            </svg>
        </div>
    );
}

/* ─── By Tool tab ───────────────────────────────────────────────────────────── */

function ByToolTab({ data, days }: { data: TelemetryPayload; days: number }) {
    const [sortBy, setSortBy] = useState<'calls' | 'errors'>('calls');

    const prevMap = useMemo(
        () => new Map((data.prevTopTools ?? []).map((t) => [t.toolName, t])),
        [data.prevTopTools],
    );

    const sorted = useMemo(
        () =>
            [...data.topTools].sort((a, b) =>
                sortBy === 'calls'
                    ? b.calls - a.calls
                    : errorRate(b.calls, b.errors) - errorRate(a.calls, a.errors),
            ),
        [data.topTools, sortBy],
    );

    const maxCalls = Math.max(...sorted.map((t) => t.calls), 1);
    const totalCalls = sorted.reduce((a, t) => a + t.calls, 0);
    const totalErrors = sorted.reduce((a, t) => a + t.errors, 0);
    const overallRate = errorRate(totalCalls, totalErrors);

    return (
        <div className="space-y-4">
            {/* Summary row */}
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                <Stat label="Total calls" value={totalCalls.toLocaleString()} />
                <Stat
                    label="Overall success"
                    value={`${(100 - overallRate).toFixed(1)}%`}
                    tone={overallRate < 5 ? 'success' : overallRate < 20 ? 'warning' : 'danger'}
                />
                <Stat label="Tools tracked" value={sorted.length.toLocaleString()} />
                <Stat
                    label="Total errors"
                    value={totalErrors.toLocaleString()}
                    tone={totalErrors > 0 ? 'danger' : 'neutral'}
                />
            </div>

            <Card
                title="Tool call volume"
                action={
                    <button
                        type="button"
                        onClick={() => setSortBy(sortBy === 'calls' ? 'errors' : 'calls')}
                        className="flex items-center gap-1 rounded px-2 py-1 text-[11px] text-[#C4C0B6] hover:bg-[#3D3C36] hover:text-[#E8E4DD] transition"
                    >
                        <ArrowUpDown className="h-3 w-3" />
                        Sort by {sortBy === 'calls' ? 'error rate' : 'volume'}
                    </button>
                }
            >
                {sorted.length === 0 ? (
                    <div className="py-6 text-center text-[13px] text-[#C4C0B6]">No calls in this range.</div>
                ) : (
                    <div className="space-y-3">
                        {sorted.map((t) => {
                            const rate = errorRate(t.calls, t.errors);
                            const barColor =
                                rate > 15
                                    ? 'bg-[#C45D4A]/60'
                                    : rate > 5
                                      ? 'bg-[#D4882A]/50'
                                      : 'bg-[#4CAF6E]/40';
                            const prev = prevMap.get(t.toolName);
                            const trendPct =
                                prev && prev.calls > 0
                                    ? ((t.calls - prev.calls) / prev.calls) * 100
                                    : null;

                            return (
                                <div key={t.toolName}>
                                    <div className="mb-1 flex items-center justify-between gap-2 text-[12px]">
                                        <span className="font-sans text-[#E8E4DD] truncate max-w-[280px]">
                                            {t.toolName}
                                        </span>
                                        <div className="flex shrink-0 items-center gap-3 font-mono text-[11px]">
                                            {trendPct !== null && Math.abs(trendPct) >= 10 && (
                                                <span
                                                    className={
                                                        trendPct > 0
                                                            ? 'text-[#5DBE82]'
                                                            : 'text-[#C45D4A]'
                                                    }
                                                >
                                                    {trendPct > 0 ? '▲' : '▼'}{' '}
                                                    {Math.abs(trendPct).toFixed(0)}% vs prev {days}d
                                                </span>
                                            )}
                                            {trendPct === null && (
                                                <span className="text-[#C4C0B6]/40 text-[10px]">new</span>
                                            )}
                                            {rate > 0 && (
                                                <span
                                                    className={
                                                        rate > 5 ? 'text-[#C45D4A]' : 'text-[#C4C0B6]'
                                                    }
                                                >
                                                    {rate.toFixed(1)}% err
                                                </span>
                                            )}
                                            <span className="text-[#C4C0B6]">
                                                p50 {t.p50}ms
                                            </span>
                                            <span className="text-[#E8E4DD] w-16 text-right">
                                                {t.calls.toLocaleString()}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="h-2 overflow-hidden rounded bg-[#1A1917]">
                                        <div
                                            className={`h-full rounded transition-all ${barColor}`}
                                            style={{ width: `${(t.calls / maxCalls) * 100}%` }}
                                        />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </Card>
        </div>
    );
}

/* ─── Recent Calls tab ──────────────────────────────────────────────────────── */

function RecentCallsTab({ calls }: { calls: RecentCall[] }) {
    const [search, setSearch] = useState('');
    const [errorsOnly, setErrorsOnly] = useState(false);
    const [expandedId, setExpandedId] = useState<number | null>(null);

    const filtered = useMemo(() => {
        return calls.filter((c) => {
            if (errorsOnly && !c.errorClass) return false;
            if (search) {
                const q = search.toLowerCase();
                if (!c.toolName?.toLowerCase().includes(q) && !c.errorClass?.toLowerCase().includes(q))
                    return false;
            }
            return true;
        });
    }, [calls, errorsOnly, search]);

    return (
        <div className="space-y-3">
            {/* Filter bar */}
            <div className="flex flex-wrap items-center gap-2">
                <div className="relative flex-1 min-w-[200px] max-w-[360px]">
                    <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#C4C0B6]" />
                    <input
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Filter by tool or error…"
                        className="h-8 w-full rounded-md border border-[#3D3C36] bg-[#24231F] pl-8 pr-8 text-[12px] text-[#E8E4DD] placeholder:text-[#C4C0B6]/50 focus:outline-none focus:ring-1 focus:ring-[#4CAF6E]/40"
                    />
                    {search && (
                        <button
                            type="button"
                            onClick={() => setSearch('')}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-[#C4C0B6] hover:text-[#E8E4DD]"
                        >
                            <X className="h-3.5 w-3.5" />
                        </button>
                    )}
                </div>
                <button
                    type="button"
                    onClick={() => setErrorsOnly(!errorsOnly)}
                    className={`h-8 rounded-md border px-3 text-[12px] font-medium transition ${
                        errorsOnly
                            ? 'border-[#C45D4A]/40 bg-[#C45D4A]/10 text-[#C45D4A]'
                            : 'border-[#3D3C36] bg-[#24231F] text-[#C4C0B6] hover:text-[#E8E4DD]'
                    }`}
                >
                    Errors only
                </button>
                <span className="text-[12px] text-[#C4C0B6]">
                    {filtered.length} of {calls.length} calls
                </span>
            </div>

            {/* Table */}
            <div className="overflow-hidden rounded-md border border-[#3D3C36]">
                <table className="w-full text-[12px]">
                    <thead>
                        <tr className="bg-[#2E2D28] text-[10px] uppercase tracking-wide text-[#C4C0B6]">
                            <th className="px-3 py-2 text-left">Time</th>
                            <th className="px-3 py-2 text-left">Tool</th>
                            <th className="px-3 py-2 text-left">Client</th>
                            <th className="px-3 py-2 text-right">Latency</th>
                            <th className="px-3 py-2 text-right">Out</th>
                            <th className="px-3 py-2 text-left">Status</th>
                        </tr>
                    </thead>
                    <tbody className="font-mono">
                        {filtered.length === 0 && (
                            <tr>
                                <td colSpan={6} className="px-3 py-8 text-center text-[#C4C0B6]">
                                    {calls.length === 0
                                        ? 'No calls yet.'
                                        : 'No calls match the current filter.'}
                                </td>
                            </tr>
                        )}
                        {filtered.map((c) => {
                            const isOpen = expandedId === c.id;
                            return (
                                <Fragment key={c.id}>
                                    <tr
                                        onClick={() => setExpandedId(isOpen ? null : c.id)}
                                        className={`cursor-pointer border-t border-[#3D3C36] hover:bg-[#2E2D28] ${
                                            c.errorClass ? 'text-[#E8E4DD] bg-[#C45D4A]/5' : 'text-[#E8E4DD]'
                                        }`}
                                    >
                                        <td className="px-3 py-1.5 text-[#C4C0B6]">{formatTime(c.createdAt)}</td>
                                        <td className="px-3 py-1.5">
                                            {c.toolName ?? <span className="text-[#C4C0B6]">—</span>}
                                            <span className="ml-2 text-[10px] text-[#C4C0B6]">
                                                {c.opType === OP_TYPE.WRITE ? 'write' : 'read'}
                                            </span>
                                        </td>
                                        <td className="px-3 py-1.5 text-[#C4C0B6]">
                                            {c.clientSource ?? 'chat'}
                                        </td>
                                        <td className="px-3 py-1.5 text-right text-[#C4C0B6]">
                                            {c.latencyMs != null ? `${c.latencyMs}ms` : '—'}
                                        </td>
                                        <td className="px-3 py-1.5 text-right text-[#C4C0B6]">
                                            {formatBytes(c.bytesOut)}
                                        </td>
                                        <td className="px-3 py-1.5">
                                            {c.errorClass ? (
                                                <span className="text-[#C45D4A]">{c.errorClass}</span>
                                            ) : (
                                                <span className="text-[#5DBE82]">ok</span>
                                            )}
                                        </td>
                                    </tr>
                                    {isOpen && (
                                        <tr className="border-t border-[#3D3C36] bg-[#1A1917]">
                                            <td colSpan={6} className="px-3 py-2 space-y-2">
                                                {c.errorMessage && (
                                                    <div>
                                                        <div className="text-[10px] uppercase tracking-wide text-[#C45D4A]">
                                                            error
                                                        </div>
                                                        <pre className="mt-1 overflow-x-auto rounded bg-[#C45D4A]/10 p-2 font-mono text-[11px] text-[#C45D4A]">
                                                            {c.errorMessage}
                                                        </pre>
                                                    </div>
                                                )}
                                                <div>
                                                    <div className="text-[10px] uppercase tracking-wide text-[#C4C0B6]">
                                                        args
                                                    </div>
                                                    <pre className="mt-1 overflow-x-auto rounded bg-[#24231F] p-2 font-mono text-[11px] text-[#E8E4DD]">
                                                        {JSON.stringify(c.args ?? null, null, 2)}
                                                    </pre>
                                                </div>
                                                <div className="text-[11px] text-[#C4C0B6]">
                                                    user: {c.userId ?? '—'} · session: {c.sessionId ?? '—'}
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </Fragment>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

/* ─── Shared primitives ─────────────────────────────────────────────────────── */

function Card({
    title,
    className,
    action,
    children,
}: {
    title: string;
    className?: string;
    action?: React.ReactNode;
    children: React.ReactNode;
}) {
    return (
        <section className={`rounded-lg border border-[#3D3C36] bg-[#24231F] p-4 ${className ?? ''}`}>
            <div className="mb-3 flex items-center justify-between">
                <h2 className="text-[11px] font-semibold uppercase tracking-wide text-[#C4C0B6]">
                    {title}
                </h2>
                {action}
            </div>
            {children}
        </section>
    );
}

type StatTone = 'success' | 'warning' | 'danger' | 'neutral';

function Stat({ label, value, tone = 'neutral' }: { label: string; value: string; tone?: StatTone }) {
    const color =
        tone === 'success'
            ? 'text-[#5DBE82]'
            : tone === 'warning'
              ? 'text-[#D4882A]'
              : tone === 'danger'
                ? 'text-[#C45D4A]'
                : 'text-[#E8E4DD]';
    return (
        <div className="rounded-lg border border-[#3D3C36] bg-[#24231F] p-3">
            <div className="text-[11px] font-medium uppercase tracking-wide text-[#C4C0B6]">
                {label}
            </div>
            <div className={`mt-1 font-mono text-[22px] font-semibold ${color}`}>{value}</div>
        </div>
    );
}
