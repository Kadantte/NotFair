// Shared API response types for /dev dashboard routes and pages.
// This file is type-only — no runtime imports.

// ─── Usage route types (/api/dev/usage) ──────────────────────────────────────
//
// The Usage tab fetches each section independently so the fast queries can
// paint while the slow per-interaction CTEs are still resolving. Keep these
// shapes per-section — there is no "everything-in-one" response.

export type DailyCountRow = {
    day: string;
    reads: number;
    writes: number;
    errors: number;
    dau: number;
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
