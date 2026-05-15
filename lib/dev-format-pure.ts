// Pure (non-React) helpers — safe to import from both server and client code.

// ─── Formatter utilities ─────────────────────────────────────────────────────

export function formatBytes(n: number | null): string {
    if (n == null) return '—';
    if (n < 1024) return `${n}B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`;
    return `${(n / 1024 / 1024).toFixed(1)}MB`;
}

export function formatTime(iso: string): string {
    const d = new Date(iso);
    const now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    return sameDay
        ? d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })
        : d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function errorRate(calls: number, errors: number): number {
    if (calls === 0) return 0;
    return (errors / calls) * 100;
}

/** Returns a tailwind text color class for an error rate (in percent). */
export function errorRateColor(rate: number): string {
    if (rate >= 5) return 'text-[#C45D4A]';
    if (rate >= 1) return 'text-[#D4882A]';
    return 'text-[#C4C0B6]';
}

export const SOURCE_LABELS: Record<string, string> = {
    'claude-code': 'Claude Code',
    'claude-desktop': 'Claude Desktop',
    'anthropic/toolbox': 'Toolbox',
    'claude-ai': 'Claude.ai',
    'mcp-remote': 'MCP Remote',
    'chat': 'Chat',
    'unknown': 'Unknown / legacy',
};

export function normalizeClientSource(source: string | null | undefined): string {
    if (!source) return 'unknown';
    if (source === 'adsagent-chat') return 'chat';
    return source;
}

export function sourceLabel(source: string): string {
    const normalized = normalizeClientSource(source);
    return SOURCE_LABELS[normalized] ?? normalized;
}

export const DEV_RANGE_OPTIONS = [
    { label: '24h', value: 1 },
    { label: '7d', value: 7 },
    { label: '60d', value: 60 },
    { label: '90d', value: 90 },
] as const;
