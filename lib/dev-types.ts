// Shared API response types for /dev dashboard routes and pages.
// This file is type-only — no runtime imports.

// ─── Usage route types (/api/dev/usage) ──────────────────────────────────────

export type DailyChartRow = {
    day: string;
    reads: number;
    writes: number;
    errors: number;
    dau: number;
    interactions: number;
    successfulInteractions: number;
    interactionSuccessRate: number | null;
};

export type LowSuccessUser = {
    userId: string;
    googleEmail: string | null;
    primaryAccountId: string | null;
    interactions: number;
    successfulInteractions: number;
    /** 0–100. */
    successRate: number;
    topErrorClasses: string[];
};

export type LowSuccessUsers = {
    windowDays: number;
    minInteractions: number;
    users: LowSuccessUser[];
};

export type TopTool = {
    toolName: string | null;
    calls: number;
    errors: number;
    p50: number;
    p95: number;
};

export type UsageTotals = {
    calls: number;
    errors: number;
    activeUsers: number;
    newUsers: number;
};

export type PrevTotals = {
    calls: number | null;
    errors: number | null;
    activeUsers: number | null;
};

export type UsageStats = {
    days: number;
    range: { from: string; to: string };
    totals: UsageTotals;
    prevTotals: PrevTotals;
    daily: DailyChartRow[];
    lowSuccessUsers: LowSuccessUsers;
    topTools: TopTool[];
};

// ─── Activity route types (/api/dev/[accountId]/activity) ────────────────────

export type ActivityCall = {
    id: number;
    toolName: string | null;
    opType: 'read' | 'write';
    clientSource: string | null;
    latencyMs: number | null;
    bytesOut: number | null;
    errorClass: string | null;
    errorMessage: string | null;
    args: unknown;
    createdAt: string;
    requestId: string | null;
};

export type ActivityStats = {
    calls: number;
    errors: number;
    errorRate: number;
    p50: number;
    lastCallAt: string | null;
    lastCallAgoMs: number | null;
};

export type ActivityPayload = {
    days: number;
    stats: ActivityStats;
    recentCalls: ActivityCall[];
};
