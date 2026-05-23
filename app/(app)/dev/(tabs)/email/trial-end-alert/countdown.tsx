'use client';

import { useEffect, useState } from 'react';

/**
 * Live countdown to the next cron trigger. The server renders a static
 * fallback ("in 4h 23m"), this component takes over on hydration and
 * ticks every second. Decoupled so the rest of the dashboard stays a
 * pure server component.
 */
export function CronCountdown({ nextTriggerIso }: { nextTriggerIso: string }) {
    const target = new Date(nextTriggerIso).getTime();
    const [now, setNow] = useState<number | null>(null);

    useEffect(() => {
        setNow(Date.now());
        const id = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(id);
    }, []);

    // Until hydration, fall back to a static "—" so SSR markup stays stable
    // and we don't fight React for the text node.
    if (now == null) return <span className="font-mono text-[11px] text-[#C4C0B6]">…</span>;

    const ms = Math.max(0, target - now);
    const h = Math.floor(ms / 3_600_000);
    const m = Math.floor((ms % 3_600_000) / 60_000);
    const s = Math.floor((ms % 60_000) / 1000);
    const label = h > 0 ? `${h}h ${m}m ${s}s` : m > 0 ? `${m}m ${s}s` : `${s}s`;

    return <span className="font-mono text-[11px] text-[#4CAF6E]">in {label}</span>;
}
