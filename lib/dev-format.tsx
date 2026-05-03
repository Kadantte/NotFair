'use client';

import React from 'react';

// ─── Re-export pure helpers so callers can use a single import path ───────────
export {
    formatBytes,
    formatTime,
    errorRate,
    errorRateColor,
    SOURCE_LABELS,
    sourceLabel,
    DEV_RANGE_OPTIONS,
} from '@/lib/dev-format-pure';

// ─── Shared primitives ───────────────────────────────────────────────────────

export function DevCard({
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

export type StatTone = 'success' | 'warning' | 'danger' | 'neutral';

export function DevStat({ label, value, tone = 'neutral' }: { label: string; value: string; tone?: StatTone }) {
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
            <div className={`mt-1 font-mono text-[22px] font-semibold tabular-nums ${color}`}>{value}</div>
        </div>
    );
}

// ─── Chart tooltip shell ─────────────────────────────────────────────────────

/** Wraps chart tooltip rows in the standard dark popover shell. */
export function ChartTooltipShell({
    label,
    children,
}: {
    label: React.ReactNode;
    children: React.ReactNode;
}) {
    return (
        <div className="bg-[#2E2D28] border border-[#3D3C36] rounded-lg px-3 py-2 shadow-lg text-xs font-mono">
            <div className="text-[#C4C0B6] mb-1.5">{label}</div>
            {children}
        </div>
    );
}

// ─── Range picker ─────────────────────────────────────────────────────────────

/** Pill-style range selector. `options` should be readonly tuples like DEV_RANGE_OPTIONS. */
export function RangePicker<T extends number>({
    options,
    value,
    onChange,
}: {
    options: readonly { label: string; value: T }[];
    value: T;
    onChange: (v: T) => void;
}) {
    return (
        <div className="inline-flex rounded-md border border-[#3D3C36] bg-[#1A1917] p-0.5">
            {options.map((opt) => (
                <button
                    key={opt.value}
                    type="button"
                    onClick={() => onChange(opt.value)}
                    className={`rounded px-2.5 py-1 text-[11px] font-medium transition min-h-[32px] ${
                        value === opt.value
                            ? 'bg-[#4CAF6E]/15 text-[#4CAF6E]'
                            : 'text-[#C4C0B6] hover:text-[#E8E4DD]'
                    }`}
                >
                    {opt.label}
                </button>
            ))}
        </div>
    );
}
