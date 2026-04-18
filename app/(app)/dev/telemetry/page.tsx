'use client';

import { Fragment, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, ArrowLeft, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

type TopTool = {
    toolName: string;
    calls: number;
    p50: number;
    p95: number;
    avgBytes: number;
    errors: number;
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
    opType: number;
    args: unknown;
    createdAt: string;
};

type DailyCount = { day: string; reads: number; writes: number };
type ErrorRow = { errorClass: string; calls: number };

type TelemetryPayload = {
    days: number;
    topTools: TopTool[];
    topArgShapes: TopArgShape[];
    recentCalls: RecentCall[];
    dailyCounts: DailyCount[];
    errorBreakdown: ErrorRow[];
};

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

// Module-level cache keyed by range so flipping 7d→30d→7d doesn't refetch.
const cache = new Map<number, TelemetryPayload>();

export default function TelemetryPage() {
    const [days, setDays] = useState(7);
    const [data, setData] = useState<TelemetryPayload | null>(cache.get(days) ?? null);
    const [loading, setLoading] = useState(!data);
    const [error, setError] = useState<string | null>(null);
    const [expandedId, setExpandedId] = useState<number | null>(null);

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

    return (
        <div className="min-h-full px-4 py-6 md:px-8">
            <div className="mx-auto max-w-[1400px]">
                <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
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
                            Per-tool-call data from the MCP + chat chokepoints. Args are redacted + truncated at write time.
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

                {data && (
                    <div className="grid gap-4 lg:grid-cols-2">
                        <div className="lg:col-span-2 grid grid-cols-2 gap-2 md:grid-cols-4">
                            <Stat
                                label="Total calls"
                                value={data.topTools.reduce((a, t) => a + t.calls, 0).toLocaleString()}
                            />
                            <Stat
                                label="Unique tools"
                                value={data.topTools.length.toLocaleString()}
                            />
                            <Stat
                                label="Error rows"
                                value={data.errorBreakdown.reduce((a, e) => a + e.calls, 0).toLocaleString()}
                                tone={data.errorBreakdown.length ? 'danger' : 'neutral'}
                            />
                            <Stat
                                label="Arg shapes"
                                value={data.topArgShapes.length.toLocaleString()}
                            />
                        </div>

                        <Card title="Top tools by volume">
                            <div className="overflow-hidden rounded-md border border-[#3D3C36]">
                                <table className="w-full text-[13px]">
                                    <thead>
                                        <tr className="bg-[#2E2D28] text-[11px] uppercase tracking-wide text-[#C4C0B6]">
                                            <th className="px-3 py-2 text-left">Tool</th>
                                            <th className="px-3 py-2 text-right">Calls</th>
                                            <th className="px-3 py-2 text-right">p50</th>
                                            <th className="px-3 py-2 text-right">p95</th>
                                            <th className="px-3 py-2 text-right">Err %</th>
                                        </tr>
                                    </thead>
                                    <tbody className="font-mono">
                                        {data.topTools.length === 0 && (
                                            <tr>
                                                <td colSpan={5} className="px-3 py-6 text-center text-[#C4C0B6]">
                                                    No calls in this range yet.
                                                </td>
                                            </tr>
                                        )}
                                        {data.topTools.map((t) => {
                                            const rate = errorRate(t.calls, t.errors);
                                            return (
                                                <tr key={t.toolName} className="border-t border-[#3D3C36] text-[#E8E4DD]">
                                                    <td className="px-3 py-1.5 font-sans">{t.toolName}</td>
                                                    <td className="px-3 py-1.5 text-right">{t.calls.toLocaleString()}</td>
                                                    <td className="px-3 py-1.5 text-right text-[#C4C0B6]">{t.p50}ms</td>
                                                    <td className="px-3 py-1.5 text-right text-[#C4C0B6]">{t.p95}ms</td>
                                                    <td className={`px-3 py-1.5 text-right ${rate > 5 ? 'text-[#C45D4A]' : 'text-[#C4C0B6]'}`}>
                                                        {rate.toFixed(1)}%
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </Card>

                        <Card title="Daily volume (reads vs writes)">
                            <div className="space-y-1 font-mono text-[12px]">
                                {data.dailyCounts.length === 0 && (
                                    <div className="py-4 text-center text-[#C4C0B6]">No data.</div>
                                )}
                                {data.dailyCounts.map((d) => {
                                    const total = d.reads + d.writes;
                                    const maxTotal = Math.max(...data.dailyCounts.map((x) => x.reads + x.writes), 1);
                                    const pct = (total / maxTotal) * 100;
                                    return (
                                        <div key={d.day} className="flex items-center gap-3">
                                            <div className="w-24 shrink-0 text-[#C4C0B6]">{d.day}</div>
                                            <div className="relative h-5 flex-1 overflow-hidden rounded bg-[#24231F]">
                                                <div
                                                    className="h-full bg-[#4CAF6E]/30"
                                                    style={{ width: `${(d.reads / maxTotal) * 100}%` }}
                                                />
                                                <div
                                                    className="absolute top-0 h-full bg-[#D4882A]/50"
                                                    style={{ left: `${(d.reads / maxTotal) * 100}%`, width: `${(d.writes / maxTotal) * 100}%` }}
                                                />
                                            </div>
                                            <div className="w-20 shrink-0 text-right text-[#E8E4DD]">
                                                {total.toLocaleString()}
                                            </div>
                                            <div className="w-16 shrink-0 text-right text-[#C4C0B6]">
                                                {pct > 0 ? `${pct.toFixed(0)}%` : ''}
                                            </div>
                                        </div>
                                    );
                                })}
                                <div className="mt-3 flex gap-4 border-t border-[#3D3C36] pt-2 text-[11px] text-[#C4C0B6]">
                                    <span className="flex items-center gap-1.5">
                                        <span className="h-2 w-2 rounded-sm bg-[#4CAF6E]/60" /> Reads
                                    </span>
                                    <span className="flex items-center gap-1.5">
                                        <span className="h-2 w-2 rounded-sm bg-[#D4882A]/70" /> Writes
                                    </span>
                                </div>
                            </div>
                        </Card>

                        <Card title="Errors by class">
                            {data.errorBreakdown.length === 0 ? (
                                <div className="py-4 text-center text-[13px] text-[#5DBE82]">
                                    No errors in this range. 🎉
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

                        <Card title="Top arg shapes (what users are actually asking for)">
                            {data.topArgShapes.length === 0 ? (
                                <div className="py-4 text-center text-[13px] text-[#C4C0B6]">
                                    No grouped args yet. This populates as calls flow through.
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

                        <Card title="Last 50 calls" className="lg:col-span-2">
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
                                        {data.recentCalls.length === 0 && (
                                            <tr>
                                                <td colSpan={6} className="px-3 py-6 text-center text-[#C4C0B6]">
                                                    No calls yet.
                                                </td>
                                            </tr>
                                        )}
                                        {data.recentCalls.map((c) => {
                                            const isOpen = expandedId === c.id;
                                            return (
                                                <Fragment key={c.id}>
                                                    <tr
                                                        onClick={() => setExpandedId(isOpen ? null : c.id)}
                                                        className="cursor-pointer border-t border-[#3D3C36] text-[#E8E4DD] hover:bg-[#2E2D28]"
                                                    >
                                                        <td className="px-3 py-1.5 text-[#C4C0B6]">{formatTime(c.createdAt)}</td>
                                                        <td className="px-3 py-1.5">
                                                            {c.toolName ?? <span className="text-[#C4C0B6]">—</span>}
                                                            <span className="ml-2 text-[10px] text-[#C4C0B6]">
                                                                {c.opType === 1 ? 'write' : 'read'}
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
                                                            <td colSpan={6} className="px-3 py-2">
                                                                <div className="text-[10px] uppercase tracking-wide text-[#C4C0B6]">
                                                                    args
                                                                </div>
                                                                <pre className="mt-1 overflow-x-auto rounded bg-[#24231F] p-2 font-mono text-[11px] text-[#E8E4DD]">
                                                                    {JSON.stringify(c.args ?? null, null, 2)}
                                                                </pre>
                                                                <div className="mt-1 text-[11px] text-[#C4C0B6]">
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
                        </Card>
                    </div>
                )}
            </div>
        </div>
    );
}

function Card({ title, className, children }: { title: string; className?: string; children: React.ReactNode }) {
    return (
        <section className={`rounded-lg border border-[#3D3C36] bg-[#24231F] p-4 ${className ?? ''}`}>
            <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-[#C4C0B6]">
                {title}
            </h2>
            {children}
        </section>
    );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'danger' | 'neutral' }) {
    return (
        <div className="rounded-lg border border-[#3D3C36] bg-[#24231F] p-3">
            <div className="text-[11px] font-medium uppercase tracking-wide text-[#C4C0B6]">
                {label}
            </div>
            <div
                className={`mt-1 font-mono text-[22px] font-semibold ${
                    tone === 'danger' ? 'text-[#C45D4A]' : 'text-[#E8E4DD]'
                }`}
            >
                {value}
            </div>
        </div>
    );
}
