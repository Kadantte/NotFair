'use client';

import {
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer,
    Bar,
    ComposedChart,
    Line,
    AreaChart,
    Area,
} from 'recharts';
import { ChartTooltipShell, DEV_RANGE_OPTIONS } from '@/lib/dev-format';
import type { DailyCountRow } from '@/lib/dev-types';
import { formatYTick, CHART_MARGIN, CHART_CURSOR, LEGEND_STYLE } from '../../_components/dev-utils';

function rangeLabel(usageDays: number): string {
    return DEV_RANGE_OPTIONS.find((o) => o.value === usageDays)?.label ?? `${usageDays}d`;
}

function ChartCard({ title, subtitle, children }: { title: string; subtitle?: React.ReactNode; children: React.ReactNode }) {
    return (
        <div className="border border-[#3D3C36] rounded-xl bg-[#24231F]/40 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#3D3C36]">
                <div>
                    <h2 className="text-base font-semibold text-[#E8E4DD]">{title}</h2>
                    {subtitle}
                </div>
            </div>
            {children}
        </div>
    );
}

function ChartLoading({ height }: { height: number }) {
    return (
        <div className="p-4">
            <div className="rounded-lg bg-[#1A1917]/40 animate-pulse" style={{ height }} />
        </div>
    );
}

// ─── Volume + Errors ─────────────────────────────────────────────────────────

export function VolumeErrorsChart({
    daily,
    loading,
    usageDays,
}: {
    daily: DailyCountRow[] | null;
    loading: boolean;
    usageDays: number;
}) {
    return (
        <ChartCard title={`Volume + Errors (${rangeLabel(usageDays)})`}>
            {loading || !daily ? (
                <ChartLoading height={280} />
            ) : daily.length === 0 ? (
                <p className="text-sm text-[#C4C0B6] text-center py-8">No API usage in this range.</p>
            ) : (
                <div className="p-4">
                    <ResponsiveContainer width="100%" height={280}>
                        <ComposedChart
                            data={daily.map((d) => ({
                                ...d,
                                date: d.day.slice(5),
                                errorPct:
                                    d.reads + d.writes > 0 ? (d.errors / (d.reads + d.writes)) * 100 : 0,
                            }))}
                            margin={CHART_MARGIN}
                            barCategoryGap="30%"
                        >
                            <CartesianGrid strokeDasharray="3 3" stroke="#3D3C36" vertical={false} />
                            <XAxis
                                dataKey="date"
                                stroke="#3D3C36"
                                tick={{ fill: '#C4C0B6', fontSize: 11, fontFamily: 'JetBrains Mono, monospace' }}
                                tickLine={false}
                                angle={-45}
                                textAnchor="end"
                                interval="preserveStartEnd"
                                minTickGap={20}
                            />
                            <YAxis
                                yAxisId="vol"
                                stroke="#3D3C36"
                                tick={{ fill: '#C4C0B6', fontSize: 11 }}
                                tickLine={false}
                                axisLine={false}
                                tickFormatter={formatYTick}
                                width={40}
                            />
                            <YAxis
                                yAxisId="err"
                                orientation="right"
                                stroke="#3D3C36"
                                tick={{ fill: '#C45D4A', fontSize: 11 }}
                                tickLine={false}
                                axisLine={false}
                                tickFormatter={(v: number) => `${v.toFixed(0)}%`}
                                width={36}
                            />
                            <Tooltip
                                cursor={CHART_CURSOR}
                                content={({ active, payload, label }) => {
                                    if (!active || !payload?.length) return null;
                                    const reads = (payload.find((p) => p.dataKey === 'reads')?.value ?? 0) as number;
                                    const writes = (payload.find((p) => p.dataKey === 'writes')?.value ?? 0) as number;
                                    const errPct = (payload.find((p) => p.dataKey === 'errorPct')?.value ?? 0) as number;
                                    return (
                                        <ChartTooltipShell label={label}>
                                            <div className="flex items-center gap-2 text-[#4CAF6E]">
                                                <span className="w-2 h-2 rounded-sm bg-[#4CAF6E] inline-block" />
                                                {reads.toLocaleString()} reads
                                            </div>
                                            <div className="flex items-center gap-2 text-[#D4882A] mt-0.5">
                                                <span className="w-2 h-2 rounded-sm bg-[#D4882A] inline-block" />
                                                {writes.toLocaleString()} writes
                                            </div>
                                            {errPct > 0 && (
                                                <div className="flex items-center gap-2 text-[#C45D4A] mt-0.5">
                                                    <span className="w-2 h-2 rounded-full bg-[#C45D4A] inline-block" />
                                                    {errPct.toFixed(1)}% error rate
                                                </div>
                                            )}
                                            <div className="text-[#E8E4DD] mt-1 pt-1 border-t border-[#3D3C36]">
                                                {(reads + writes).toLocaleString()} total
                                            </div>
                                        </ChartTooltipShell>
                                    );
                                }}
                            />
                            <Legend wrapperStyle={LEGEND_STYLE} />
                            <Bar yAxisId="vol" dataKey="reads" name="Reads" stackId="a" fill="#4CAF6E" fillOpacity={0.75} />
                            <Bar yAxisId="vol" dataKey="writes" name="Writes" stackId="a" fill="#D4882A" fillOpacity={0.75} radius={[3, 3, 0, 0]} />
                            <Line yAxisId="err" type="monotone" dataKey="errorPct" name="Error %" dot={{ r: 3, fill: '#C45D4A', strokeWidth: 0 }} stroke="#C45D4A" strokeWidth={1.5} />
                        </ComposedChart>
                    </ResponsiveContainer>
                </div>
            )}
        </ChartCard>
    );
}

// ─── Daily active users ──────────────────────────────────────────────────────

export function DauChart({
    daily,
    loading,
}: {
    daily: DailyCountRow[] | null;
    loading: boolean;
}) {
    const subtitle = (() => {
        if (loading || !daily) {
            return <p className="text-[11px] text-[#C4C0B6] mt-0.5 font-mono tabular-nums">loading…</p>;
        }
        if (daily.length === 0) return null;
        const dauValues = daily.map((d) => d.dau);
        const peak = Math.max(...dauValues);
        const avg = Math.round(dauValues.reduce((a, b) => a + b, 0) / dauValues.length);
        const today = dauValues[dauValues.length - 1] ?? 0;
        return (
            <p className="text-[11px] text-[#C4C0B6] mt-0.5 font-mono tabular-nums">
                today {today} · avg {avg} · peak {peak}
            </p>
        );
    })();

    return (
        <ChartCard title="Daily Active Users" subtitle={subtitle}>
            {loading || !daily ? (
                <ChartLoading height={180} />
            ) : daily.length === 0 ? (
                <p className="text-sm text-[#C4C0B6] text-center py-8">No active users in this range.</p>
            ) : (
                <div className="p-4">
                    <ResponsiveContainer width="100%" height={180}>
                        <AreaChart
                            data={daily.map((d) => ({ ...d, date: d.day.slice(5) }))}
                            margin={CHART_MARGIN}
                        >
                            <defs>
                                <linearGradient id="dauFill" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="#4CAF6E" stopOpacity={0.35} />
                                    <stop offset="100%" stopColor="#4CAF6E" stopOpacity={0.02} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="#3D3C36" vertical={false} />
                            <XAxis
                                dataKey="date"
                                stroke="#3D3C36"
                                tick={{ fill: '#C4C0B6', fontSize: 11, fontFamily: 'JetBrains Mono, monospace' }}
                                tickLine={false}
                                angle={-45}
                                textAnchor="end"
                                interval="preserveStartEnd"
                                minTickGap={20}
                            />
                            <YAxis
                                stroke="#3D3C36"
                                tick={{ fill: '#C4C0B6', fontSize: 11 }}
                                tickLine={false}
                                axisLine={false}
                                allowDecimals={false}
                                width={32}
                            />
                            <Tooltip
                                cursor={CHART_CURSOR}
                                content={({ active, payload, label }) => {
                                    if (!active || !payload?.length) return null;
                                    const dau = (payload.find((p) => p.dataKey === 'dau')?.value ?? 0) as number;
                                    return (
                                        <ChartTooltipShell label={label}>
                                            <div className="flex items-center gap-2 text-[#4CAF6E]">
                                                <span className="w-2 h-2 rounded-sm bg-[#4CAF6E] inline-block" />
                                                {dau.toLocaleString()} active {dau === 1 ? 'user' : 'users'}
                                            </div>
                                        </ChartTooltipShell>
                                    );
                                }}
                            />
                            <Area
                                type="monotone"
                                dataKey="dau"
                                stroke="#4CAF6E"
                                strokeWidth={1.5}
                                fill="url(#dauFill)"
                                dot={{ r: 2.5, fill: '#4CAF6E', strokeWidth: 0 }}
                                activeDot={{ r: 4, fill: '#4CAF6E', strokeWidth: 0 }}
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            )}
        </ChartCard>
    );
}
