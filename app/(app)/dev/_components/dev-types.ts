export type CustomerAccount = {
    id: string;
    name: string;
    dailyBudget?: number | null;
    dailyBudgetUsd?: number | null;
    activeCampaigns?: number | null;
    currencyCode?: string | null;
    country?: string | null;
    flag?: string | null;
};

export type CustomerAttribution = {
    source: string | null;
    medium: string | null;
    campaign: string | null;
    term: string | null;
    content: string | null;
    referrer: string | null;
    label: string;
    detail: string | null;
};

export type Customer = {
    userId: string | null;
    googleEmail: string | null;
    primaryAccountId: string;
    accounts: CustomerAccount[];
    accountCount: number;
    sessions: number;
    lastActive: string;
    firstSeen: string;
    reads: number;
    writes: number;
    totalOps: number;
    dailyBudgetUsd: number | null;
    attribution: CustomerAttribution;
    errorsCount: number;
    calls30d: number;
    errorRate: number;
    plan: 'free' | 'growth';
    inTrial: boolean;
};

export type CustomerSortKey = 'email' | 'accounts' | 'operations' | 'budget' | 'firstSeen' | 'lastActive' | 'errorRate' | 'plan';
export type SortDir = 'asc' | 'desc';

export type WaitlistRow = {
    id: number;
    key: string;
    userId: string | null;
    email: string | null;
    metadata: Record<string, unknown>;
    createdAt: string;
    approvedAt: string | null;
};

export type ResetPreview = {
    userId: string;
    googleEmail: string | null;
    accountIds: string[];
    counts: Record<string, number>;
    total: number;
    stripeCustomers: { env: 'test' | 'live'; stripeCustomerId: string }[];
};

export type Tab = 'customers' | 'usage' | 'email' | 'developer' | 'waitlist';
export type UsagePlatform = 'all' | 'google_ads' | 'meta_ads';
