'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { RefreshCw, AlertCircle, ChevronRight, Loader2, X, Upload, Users, Send, ChevronDown, Eye, Filter, Clock, ArrowUpDown, ArrowUp, ArrowDown, Check, Copy, Sparkles, Trash2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    getContactsAction,
    importContactsAction,
    deleteContactAction,
    sendOutreachAction,
    scheduleContactAction,
} from '../outreach/actions';
import { deriveMetrics, STATUS_CONFIG, BOUNCE_RATE_WARN } from '@/lib/outreach-metrics';
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
import {
    errorRateColor,
    SOURCE_LABELS,
    DEV_RANGE_OPTIONS,
    ChartTooltipShell,
    RangePicker,
} from '@/lib/dev-format';
import type { UsageStats } from '@/lib/dev-types';

const CHART_MARGIN = { top: 4, right: 8, left: 0, bottom: 32 };
const CHART_CURSOR = { fill: '#3D3C36', opacity: 0.4 };
const LEGEND_STYLE = { color: '#C4C0B6', fontSize: 12, paddingTop: 8 };

function formatYTick(v: number): string {
    return v >= 1000 ? `${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)}k` : String(v);
}

function formatCurrency(amount: number, currencyCode?: string | null, opts: { compact?: boolean } = {}): string {
    const fractionDigits = opts.compact ? 0 : 2;
    if (currencyCode) {
        try {
            return new Intl.NumberFormat(undefined, {
                style: 'currency',
                currency: currencyCode,
                minimumFractionDigits: fractionDigits,
                maximumFractionDigits: fractionDigits,
            }).format(amount);
        } catch { /* invalid currency code fallback */ }
    }
    return `$${amount.toLocaleString(undefined, { minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits })}`;
}

const DAYS_PER_YEAR = 365;

function deriveBudgetDisplay(c: Customer) {
    const acctWithCurrency = c.accounts.find((a) => a.currencyCode);
    const totalLocalDaily = c.accounts.reduce((s, a) => s + (a.dailyBudget ?? 0), 0);
    return {
        hasBudget: c.accounts.some((a) => a.dailyBudget != null),
        currency: acctWithCurrency?.currencyCode ?? null,
        flag: acctWithCurrency?.flag ?? null,
        country: acctWithCurrency?.country ?? null,
        annualLocal: totalLocalDaily * DAYS_PER_YEAR,
        annualUsd: c.dailyBudgetUsd != null ? c.dailyBudgetUsd * DAYS_PER_YEAR : null,
    };
}

/** Parse a timestamp string (with or without trailing Z) into a Date */
function parseTs(iso: string): Date {
    return new Date(iso.endsWith('Z') ? iso : iso + 'Z');
}

function formatDateTime(iso: string): string {
    return parseTs(iso).toLocaleString(undefined, {
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short',
    });
}

function formatDateShort(iso: string, year = false): string {
    return parseTs(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', ...(year && { year: 'numeric' }) });
}



type Contact = Awaited<ReturnType<typeof getContactsAction>>[number];

type CustomerAccount = {
    id: string;
    name: string;
    dailyBudget?: number | null;
    dailyBudgetUsd?: number | null;
    activeCampaigns?: number | null;
    currencyCode?: string | null;
    country?: string | null;
    flag?: string | null;
};
type Customer = {
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
    outreachStatus: 'contacted' | 'drafted' | 'none';
    lastContactedAt: string | null;
    errorsCount: number;
    calls30d: number;
    errorRate: number;
};

type CustomerSortKey = 'email' | 'accounts' | 'operations' | 'budget' | 'firstSeen' | 'lastActive' | 'errorRate';
type SortDir = 'asc' | 'desc';

type ResetPreview = {
    userId: string;
    googleEmail: string | null;
    accountIds: string[];
    counts: Record<string, number>;
    total: number;
    stripeCustomers: { env: 'test' | 'live'; stripeCustomerId: string }[];
};

type Tab = 'customers' | 'usage' | 'outreach' | 'developer';

const TAB_STORAGE_KEY = 'dev:activeTab';
const VALID_TABS: ReadonlySet<Tab> = new Set(['customers', 'usage', 'outreach', 'developer']);

function readStoredTab(): Tab {
    if (typeof window === 'undefined') return 'customers';
    const raw = window.localStorage.getItem(TAB_STORAGE_KEY);
    return raw && VALID_TABS.has(raw as Tab) ? (raw as Tab) : 'customers';
}

// Module-level cache keyed by "days|source|platform" per CLAUDE.md stale-while-revalidate pattern.
const usageStatsCache = new Map<string, UsageStats>();
type UsagePlatform = 'all' | 'google_ads' | 'meta_ads';
const USAGE_PLATFORM_LABELS: Record<UsagePlatform, string> = {
    all: 'All platforms',
    google_ads: 'Google Ads',
    meta_ads: 'Meta Ads',
};
let cachedContacts: Contact[] | null = null;
let cachedCustomers: Customer[] | null = null;
let cachedDraftEmails: Set<string> | null = null;

export default function DevPage() {
    const router = useRouter();
    const [activeTab, setActiveTab] = useState<Tab>('customers');
    const [usageDays, setUsageDays] = useState(30);
    const [includeDev, setIncludeDev] = useState(false);
    const [stats, setStats] = useState<UsageStats | null>(usageStatsCache.get('30|all|all|prod') ?? null);
    const [loading, setLoading] = useState(!usageStatsCache.has('30|all|all|prod'));
    const [error, setError] = useState<string | null>(null);
    const [contacts, setContacts] = useState<Contact[]>(cachedContacts ?? []);
    const [loadingContacts, setLoadingContacts] = useState(!cachedContacts);
    const [customers, setCustomers] = useState<Customer[]>(cachedCustomers ?? []);
    const [loadingCustomers, setLoadingCustomers] = useState(!cachedCustomers);
    const [sortKey, setSortKey] = useState<CustomerSortKey>('operations');
    const [sortDir, setSortDir] = useState<SortDir>('desc');
    const [importing, setImporting] = useState(false);
    const [deletingContactId, setDeletingContactId] = useState<number | null>(null);
    const [sendingId, setSendingId] = useState<number | null>(null);
    const [schedulingId, setSchedulingId] = useState<number | null>(null);
    const [sendError, setSendError] = useState<string | null>(null);
    const [impersonatingAccountId, setImpersonatingAccountId] = useState<string | null>(null);
    const [statusFilter, setStatusFilter] = useState<string>('all');
    const [usageSource, setUsageSource] = useState<string>('all');
    const [usagePlatform, setUsagePlatform] = useState<UsagePlatform>('all');
    const [copiedEmail, setCopiedEmail] = useState<string | null>(null);
    const [growthOverride, setGrowthOverride] = useState<'on' | 'off' | null>(null);
    const [togglingGrowthOverride, setTogglingGrowthOverride] = useState(false);
    const [metaWaitlistWall, setMetaWaitlistWall] = useState<'on' | 'off' | null>(null);
    const [togglingMetaWaitlistWall, setTogglingMetaWaitlistWall] = useState(false);
    const [resetPreview, setResetPreview] = useState<ResetPreview | null>(null);
    const [loadingResetPreview, setLoadingResetPreview] = useState(false);
    const [resetModalOpen, setResetModalOpen] = useState(false);
    const [resetting, setResetting] = useState(false);
    const [resetDone, setResetDone] = useState(false);

    useEffect(() => {
        let cancelled = false;
        fetch('/api/dev/growth-override', { credentials: 'include' })
            .then((r) => r.ok ? r.json() : null)
            .then((data) => {
                if (cancelled || !data) return;
                setGrowthOverride(data.state === 'off' ? 'off' : 'on');
            })
            .catch(() => { /* dev-only endpoint, fine if it 403s */ });
        fetch('/api/dev/meta-waitlist-override', { credentials: 'include' })
            .then((r) => r.ok ? r.json() : null)
            .then((data) => {
                if (cancelled || !data) return;
                setMetaWaitlistWall(data.state === 'off' ? 'off' : 'on');
            })
            .catch(() => { /* dev-only endpoint, fine if it 403s */ });
        return () => { cancelled = true; };
    }, []);

    async function openResetModal() {
        setResetDone(false);
        setError(null);
        setResetModalOpen(true);
        setLoadingResetPreview(true);
        try {
            const res = await fetch('/api/dev/reset-account', { credentials: 'include' });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                setError(data.error || 'Failed to load reset preview');
                setResetModalOpen(false);
                return;
            }
            setResetPreview(await res.json());
        } catch {
            setError('Failed to load reset preview');
            setResetModalOpen(false);
        } finally {
            setLoadingResetPreview(false);
        }
    }

    async function confirmReset() {
        setResetting(true);
        setError(null);
        try {
            const res = await fetch('/api/dev/reset-account', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ confirm: true }),
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                setError(data.error || 'Reset failed');
                return;
            }
            setResetDone(true);
        } catch {
            setError('Reset failed');
        } finally {
            setResetting(false);
        }
    }

    async function toggleGrowthOverride() {
        if (growthOverride === null) return;
        const next = growthOverride === 'on' ? 'off' : 'on';
        setTogglingGrowthOverride(true);
        try {
            const res = await fetch('/api/dev/growth-override', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ enabled: next === 'on' }),
            });
            if (!res.ok) throw new Error('Failed');
            const data = await res.json();
            setGrowthOverride(data.state === 'off' ? 'off' : 'on');
        } catch {
            setError('Failed to toggle growth override');
        } finally {
            setTogglingGrowthOverride(false);
        }
    }

    async function toggleMetaWaitlistWall() {
        if (metaWaitlistWall === null) return;
        const next = metaWaitlistWall === 'on' ? 'off' : 'on';
        setTogglingMetaWaitlistWall(true);
        try {
            const res = await fetch('/api/dev/meta-waitlist-override', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ enabled: next === 'on' }),
            });
            if (!res.ok) throw new Error('Failed');
            const data = await res.json();
            setMetaWaitlistWall(data.state === 'off' ? 'off' : 'on');
            // The wall is server-rendered on /manage-ads-accounts, so refresh
            // route caches so the toggle is visible without a hard reload.
            router.refresh();
        } catch {
            setError('Failed to toggle Meta waitlist wall');
        } finally {
            setTogglingMetaWaitlistWall(false);
        }
    }

    const handleCopyEmail = useCallback((email: string, e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (!email) return;
        navigator.clipboard.writeText(email).then(() => {
            setCopiedEmail(email);
            setTimeout(() => setCopiedEmail((cur) => (cur === email ? null : cur)), 1500);
        }).catch(() => {});
    }, []);

    const metrics = useMemo(() => contacts.length > 0 ? deriveMetrics(contacts) : null, [contacts]);
    const filteredContacts = useMemo(() => statusFilter === 'all' ? contacts : contacts.filter((c) => c.status === statusFilter), [contacts, statusFilter]);

    const sortedCustomers = useMemo(() => {
        const sorted = [...customers];
        sorted.sort((a, b) => {
            let cmp = 0;
            switch (sortKey) {
                case 'email':
                    cmp = (a.googleEmail ?? '').localeCompare(b.googleEmail ?? '');
                    break;
                case 'accounts':
                    cmp = a.accountCount - b.accountCount;
                    break;
                case 'operations':
                    cmp = a.totalOps - b.totalOps;
                    break;
                case 'budget':
                    // Sort on USD-normalized totals so EUR vs JPY accounts are comparable.
                    cmp = (a.dailyBudgetUsd ?? 0) - (b.dailyBudgetUsd ?? 0);
                    break;
                case 'firstSeen':
                    cmp = new Date(a.firstSeen).getTime() - new Date(b.firstSeen).getTime();
                    break;
                case 'lastActive':
                    cmp = new Date(a.lastActive).getTime() - new Date(b.lastActive).getTime();
                    break;
                case 'errorRate':
                    cmp = a.errorRate - b.errorRate;
                    break;
            }
            return sortDir === 'asc' ? cmp : -cmp;
        });
        return sorted;
    }, [customers, sortKey, sortDir]);

    function toggleSort(key: CustomerSortKey) {
        if (sortKey === key) {
            setSortDir((d) => d === 'asc' ? 'desc' : 'asc');
        } else {
            setSortKey(key);
            setSortDir(key === 'email' ? 'asc' : 'desc');
        }
    }

    async function handleViewAs(accountId: string, e: React.MouseEvent) {
        e.preventDefault();
        e.stopPropagation();
        setImpersonatingAccountId(accountId);
        try {
            const res = await fetch('/api/dev/impersonate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ accountId }),
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                setError(data.error || 'Failed to impersonate');
                setImpersonatingAccountId(null);
                return;
            }
            window.location.assign('/campaigns');
        } catch {
            setError('Failed to impersonate');
            setImpersonatingAccountId(null);
        }
    }

    const fetchContacts = useCallback(async (background = false) => {
        if (!background) setLoadingContacts(true);
        try {
            const data = await getContactsAction();
            setContacts(data);
            cachedContacts = data;
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load contacts');
        } finally {
            setLoadingContacts(false);
        }
    }, []);

    const fetchStats = useCallback(async ({ days, source = 'all', platform = 'all', dev = false, background = false, fresh = false }: { days: number; source?: string; platform?: UsagePlatform; dev?: boolean; background?: boolean; fresh?: boolean }) => {
        const cacheKey = `${days}|${source}|${platform}|${dev ? 'dev' : 'prod'}`;
        const cached = usageStatsCache.get(cacheKey);
        if (cached && !fresh) {
            setStats(cached);
            if (background) return;
        }
        if (!background || !cached) setLoading(true);
        setError(null);
        try {
            const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
            const params = new URLSearchParams({ tz, days: String(days) });
            if (source !== 'all') params.set('source', source);
            if (platform !== 'all') params.set('platform', platform);
            if (dev) params.set('includeDev', '1');
            if (fresh) params.set('fresh', '1');
            const res = await fetch(`/api/dev/usage?${params}`, { credentials: 'include' });
            if (res.status === 403) {
                setError('Access denied');
                return;
            }
            if (!res.ok) throw new Error('Failed to fetch');
            const data: UsageStats = await res.json();
            setStats(data);
            usageStatsCache.set(cacheKey, data);
        } catch {
            setError('Failed to load usage stats');
        } finally {
            setLoading(false);
        }
    }, []);

    const fetchDraftEmails = useCallback(async () => {
        try {
            const res = await fetch('/api/dev/customers/drafts', { credentials: 'include' });
            if (!res.ok) return;
            const { emails } = (await res.json()) as { emails: string[] };
            const set = new Set(emails.map((e) => e.toLowerCase()));
            cachedDraftEmails = set;
            // Patch outreachStatus on customers already in state.
            setCustomers((prev) => prev.map((c) => {
                if (c.outreachStatus !== 'none') return c;
                const key = c.googleEmail?.toLowerCase();
                if (key && set.has(key)) return { ...c, outreachStatus: 'drafted' as const };
                return c;
            }));
            cachedCustomers = (cachedCustomers ?? []).map((c) => {
                if (c.outreachStatus !== 'none') return c;
                const key = c.googleEmail?.toLowerCase();
                if (key && set.has(key)) return { ...c, outreachStatus: 'drafted' as const };
                return c;
            });
        } catch { /* best-effort: out-of-band Gmail drafts just won't get pills */ }
    }, []);

    const fetchCustomers = useCallback(async (background = false, fresh = false) => {
        if (!background) setLoadingCustomers(true);
        try {
            const res = await fetch(`/api/dev/customers${fresh ? '?fresh=1' : ''}`, { credentials: 'include' });
            if (!res.ok) throw new Error('Failed to fetch');
            const data = await res.json();
            // Merge in any cached Gmail-draft pills so refreshes don't flicker.
            const drafts = cachedDraftEmails;
            const customers: Customer[] = drafts
                ? data.customers.map((c: Customer) => {
                    if (c.outreachStatus !== 'none') return c;
                    const key = c.googleEmail?.toLowerCase();
                    if (key && drafts.has(key)) return { ...c, outreachStatus: 'drafted' as const };
                    return c;
                })
                : data.customers;
            setCustomers(customers);
            cachedCustomers = customers;
        } catch {
            setError('Failed to load customers');
        } finally {
            setLoadingCustomers(false);
        }
    }, []);

    // Restore the user's last-used tab on mount. The `tabRestored` flag
    // gates the lazy fetcher so we don't waste a round-trip on the
    // SSR-default 'customers' tab when the stored choice is something else.
    const [tabRestored, setTabRestored] = useState(false);
    useEffect(() => {
        const stored = readStoredTab();
        if (stored !== 'customers') setActiveTab(stored);
        setTabRestored(true);
    }, []);

    // Persist active tab — but only after the initial restore so we don't
    // overwrite the stored value with the SSR default.
    useEffect(() => {
        if (!tabRestored) return;
        window.localStorage.setItem(TAB_STORAGE_KEY, activeTab);
    }, [activeTab, tabRestored]);

    // Lazy-load per tab. Only fetch what the user is looking at; prefetch
    // the other heavy tab (the user typically alternates customers/usage)
    // in the background once the active tab has data.
    useEffect(() => {
        if (!tabRestored) return;
        if (activeTab === 'customers') {
            fetchCustomers(!!cachedCustomers);
            // Out-of-band Gmail drafts — non-blocking.
            if (!cachedDraftEmails) fetchDraftEmails();
        } else if (activeTab === 'usage') {
            const cacheKey = `${usageDays}|${usageSource}|${usagePlatform}|${includeDev ? 'dev' : 'prod'}`;
            fetchStats({ days: usageDays, source: usageSource, platform: usagePlatform, dev: includeDev, background: !!usageStatsCache.get(cacheKey) });
        } else if (activeTab === 'outreach') {
            fetchContacts(!!cachedContacts);
        }
    }, [activeTab, tabRestored, fetchCustomers, fetchStats, fetchContacts, fetchDraftEmails, usageSource, usageDays, usagePlatform, includeDev]);

    // Idle prefetch of the other heavy tab so the first switch is instant.
    useEffect(() => {
        if (!tabRestored || typeof window === 'undefined') return;
        const idle = (window as unknown as { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback
            ?? ((cb: () => void) => window.setTimeout(cb, 800));
        const handle = idle(() => {
            const cacheKey = `${usageDays}|${usageSource}|${usagePlatform}|${includeDev ? 'dev' : 'prod'}`;
            if (activeTab === 'customers' && !usageStatsCache.has(cacheKey)) fetchStats({ days: usageDays, source: usageSource, platform: usagePlatform, dev: includeDev, background: true });
            else if (activeTab === 'usage' && !cachedCustomers) {
                fetchCustomers(true);
                if (!cachedDraftEmails) fetchDraftEmails();
            }
        });
        return () => {
            const cancel = (window as unknown as { cancelIdleCallback?: (h: number) => void }).cancelIdleCallback;
            if (cancel && typeof handle === 'number') cancel(handle);
        };
    }, [activeTab, tabRestored, fetchCustomers, fetchStats, fetchDraftEmails, usageSource, usageDays, usagePlatform, includeDev]);

    async function handleCSVUpload(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;
        setImporting(true);
        const text = await file.text();
        const lines = text.split('\n').filter((l) => l.trim());
        if (lines.length < 2) { setImporting(false); return; }
        const header = lines[0].split(',').map((h) => h.trim().toLowerCase());
        const emailIdx = header.findIndex((h) => ['email', 'e-mail', 'email_address'].includes(h));
        const companyIdx = header.findIndex((h) => ['company', 'organization', 'company_name'].includes(h));
        if (emailIdx === -1) { setImporting(false); return; }
        const rows = lines.slice(1).map((line) => {
            const cols = line.split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
            return { email: cols[emailIdx] || '', company: companyIdx >= 0 ? cols[companyIdx] : undefined };
        }).filter((r) => r.email && r.email.includes('@'));
        await importContactsAction(rows);
        await fetchContacts(true);
        setImporting(false);
        e.target.value = '';
    }

    async function handleDeleteContact(id: number) {
        setDeletingContactId(id);
        await deleteContactAction(id);
        await fetchContacts(true);
        setDeletingContactId(null);
    }

    async function handleSend(id: number) {
        setSendingId(id);
        setSendError(null);
        try {
            await sendOutreachAction(id);
            await fetchContacts(true);
        } catch (err) {
            setSendError(err instanceof Error ? err.message : 'Send failed');
        } finally {
            setSendingId(null);
        }
    }

    async function handleSchedule(id: number) {
        setSchedulingId(id);
        setSendError(null);
        try {
            // Match schedule-sends.ts logic: Mon=12pm PT, Tue-Fri=9am PT (UTC-7 PDT)
            const ptOffsetMs = 7 * 60 * 60 * 1000;
            const nowPT = new Date(Date.now() - ptOffsetMs);
            const next = new Date(nowPT);
            // Mon (1) starts at 12pm; all other weekdays at 9am
            const startHour = next.getDay() === 1 ? 12 : 9;
            next.setHours(startHour, 0, 0, 0);
            // If already past the window today, advance to next day
            if (next <= nowPT) {
                next.setDate(next.getDate() + 1);
                next.setHours(next.getDay() === 1 ? 12 : 9, 0, 0, 0);
            }
            // Skip weekends
            while (next.getDay() === 0 || next.getDay() === 6) {
                next.setDate(next.getDate() + 1);
                next.setHours(next.getDay() === 1 ? 12 : 9, 0, 0, 0);
            }
            await scheduleContactAction(id, new Date(next.getTime() + ptOffsetMs));
            await fetchContacts(true);
        } catch (err) {
            setSendError(err instanceof Error ? err.message : 'Schedule failed');
        } finally {
            setSchedulingId(null);
        }
    }

    return (
        <section className="flex min-h-0 h-full flex-col overflow-hidden">
            <header className="shrink-0 border-b border-[#3D3C36] bg-[#24231F]/80 backdrop-blur-xl">
                <div className="flex w-full items-center justify-between gap-3 px-4 py-3 sm:px-6 sm:py-4">
                    <div className="min-w-0">
                        <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-[#E8E4DD]">Dev</h1>
                        <p className="mt-0.5 text-xs sm:text-sm text-[#C4C0B6] hidden sm:block">API usage and operations tracking</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        <Button
                            onClick={() => {
                                usageStatsCache.clear();
                                cachedContacts = null;
                                cachedCustomers = null;
                                cachedDraftEmails = null;
                                if (activeTab === 'customers') {
                                    fetchCustomers(false, true);
                                    fetchDraftEmails();
                                } else if (activeTab === 'usage') {
                                    fetchStats({ days: usageDays, source: usageSource, platform: usagePlatform, dev: includeDev, fresh: true });
                                } else {
                                    fetchContacts(false);
                                }
                            }}
                            disabled={loading || loadingCustomers || loadingContacts}
                            variant="outline"
                            size="sm"
                            className="border-[#3D3C36] bg-[#24231F] hover:bg-[#2E2D28] text-[#C4C0B6] hover:text-[#E8E4DD] gap-1.5"
                        >
                            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                            <span className="hidden sm:inline">Refresh</span>
                        </Button>
                    </div>
                </div>
                <div className="flex gap-0 px-4 sm:px-6 border-t border-[#3D3C36]/50">
                    {(['customers', 'usage', 'outreach', 'developer'] as const).map((tab) => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className={`px-4 py-2.5 text-[13px] font-medium capitalize transition-colors border-b-2 -mb-px ${
                                activeTab === tab
                                    ? 'border-[#4CAF6E] text-[#E8E4DD]'
                                    : 'border-transparent text-[#C4C0B6] hover:text-[#E8E4DD]'
                            }`}
                        >
                            {tab === 'developer' ? 'Developer Options' : tab}
                        </button>
                    ))}
                </div>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-6 space-y-6 sm:space-y-8">
                {error && (
                    <div className="bg-[#C45D4A]/10 border border-[#C45D4A]/30 rounded-lg p-3 sm:p-4 flex items-center gap-3 text-[#C45D4A]">
                        <AlertCircle className="w-5 h-5 shrink-0" />
                        <p className="text-sm">{error}</p>
                    </div>
                )}

                {activeTab === 'usage' && (loading && !stats ? (
                    <div className="flex flex-col items-center justify-center py-20 gap-4">
                        <div className="w-8 h-8 border-2 border-[#4CAF6E] border-t-transparent rounded-full animate-spin" />
                        <p className="text-[#C4C0B6] animate-pulse text-sm">Loading usage stats...</p>
                    </div>
                ) : stats ? (
                    <>
                        {/* ── Platform filter + dev toggle (apply to whole tab) ── */}
                        <div className="flex flex-wrap items-center gap-1.5">
                            {(['all', 'google_ads', 'meta_ads'] as const).map((p) => {
                                const active = usagePlatform === p;
                                return (
                                    <button
                                        key={p}
                                        onClick={() => {
                                            if (active) return;
                                            setUsagePlatform(p);
                                            fetchStats({ days: usageDays, source: usageSource, platform: p, dev: includeDev, background: !!usageStatsCache.get(`${usageDays}|${usageSource}|${p}|${includeDev ? 'dev' : 'prod'}`) });
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

                            {/* Dev-traffic toggle. Default excludes DEV_EMAILS so internal
                                test traffic doesn't dominate the charts; flip on to verify
                                your own activity (e.g. integration tests). */}
                            <button
                                type="button"
                                onClick={() => {
                                    const next = !includeDev;
                                    setIncludeDev(next);
                                    fetchStats({
                                        days: usageDays,
                                        source: usageSource,
                                        platform: usagePlatform,
                                        dev: next,
                                        background: !!usageStatsCache.get(`${usageDays}|${usageSource}|${usagePlatform}|${next ? 'dev' : 'prod'}`),
                                    });
                                }}
                                title={
                                    includeDev
                                        ? 'Including DEV_EMAILS rows (your own traffic). Click to exclude.'
                                        : 'Excluding DEV_EMAILS rows (default). Click to include your own traffic.'
                                }
                                className={`ml-2 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                                    includeDev
                                        ? 'border-[#D4882A]/40 bg-[#D4882A]/[0.12] text-[#D4882A]'
                                        : 'border-[#3D3C36] bg-[#24231F] text-[#C4C0B6] hover:text-[#E8E4DD] hover:border-[#4D4C46]'
                                }`}
                            >
                                {includeDev ? 'Including test users' : 'Excluding test users'}
                            </button>
                        </div>

                        {/* ── Stat tiles ── */}
                        {(() => {
                            const currCallsRate = stats.totals.calls > 0
                                ? (stats.totals.errors / stats.totals.calls) * 100 : 0;
                            const prevCallsRate = stats.prevTotals.calls != null
                                && stats.prevTotals.errors != null
                                && stats.prevTotals.calls > 0
                                ? (stats.prevTotals.errors / stats.prevTotals.calls) * 100 : null;

                            type Tile = {
                                label: string;
                                display: string;
                                curr: number;
                                prev: number | null;
                                isErrorRate?: boolean;
                                noTrend?: boolean;
                                sub?: string;
                                absoluteDelta?: boolean;
                            };

                            const tiles: Tile[] = [
                                { label: 'Total Calls', display: stats.totals.calls.toLocaleString(), curr: stats.totals.calls, prev: stats.prevTotals.calls },
                                { label: 'Error Rate', display: `${currCallsRate.toFixed(1)}%`, curr: currCallsRate, prev: prevCallsRate, isErrorRate: true },
                                { label: 'Active Users', display: stats.totals.activeUsers.toLocaleString(), curr: stats.totals.activeUsers, prev: stats.prevTotals.activeUsers, absoluteDelta: true },
                                { label: 'New Users', display: stats.totals.newUsers.toLocaleString(), curr: stats.totals.newUsers, prev: null, noTrend: true, sub: 'this period' },
                            ];

                            return (
                            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
                                {tiles.map((tile) => {
                                    let trendChip: React.ReactNode = null;
                                    if (!tile.noTrend) {
                                        if (tile.isErrorRate) {
                                            if (prevCallsRate != null) {
                                                const delta = currCallsRate - prevCallsRate;
                                                const absDelta = Math.abs(delta).toFixed(1);
                                                trendChip = delta > 0.05 ? (
                                                    <span className="text-[11px] font-medium text-[#C45D4A]">▲ {absDelta}pp vs prev {usageDays}d</span>
                                                ) : delta < -0.05 ? (
                                                    <span className="text-[11px] font-medium text-[#5DBE82]">▼ {absDelta}pp vs prev {usageDays}d</span>
                                                ) : (
                                                    <span className="text-[11px] text-[#C4C0B6]">≈ flat vs prev {usageDays}d</span>
                                                );
                                            } else {
                                                trendChip = <span className="text-[11px] text-[#C4C0B6]/60">new</span>;
                                            }
                                        } else if (tile.absoluteDelta) {
                                            if (tile.prev === null) {
                                                trendChip = <span className="text-[11px] text-[#C4C0B6]/60">new</span>;
                                            } else {
                                                const absDelta = tile.curr - tile.prev;
                                                trendChip = absDelta > 0 ? (
                                                    <span className="text-[11px] font-medium text-[#4CAF6E]">▲ {absDelta} vs prev {usageDays}d</span>
                                                ) : absDelta < 0 ? (
                                                    <span className="text-[11px] text-[#C4C0B6]">▼ {Math.abs(absDelta)} vs prev {usageDays}d</span>
                                                ) : (
                                                    <span className="text-[11px] text-[#C4C0B6]">≈ flat vs prev {usageDays}d</span>
                                                );
                                            }
                                        } else {
                                            if (tile.prev === null) {
                                                trendChip = <span className="text-[11px] text-[#C4C0B6]/60">new</span>;
                                            } else if (tile.prev > 0) {
                                                const pct = ((tile.curr - tile.prev) / tile.prev) * 100;
                                                const absPct = Math.abs(pct).toFixed(0);
                                                trendChip = pct >= 1 ? (
                                                    <span className="text-[11px] font-medium text-[#4CAF6E]">▲ {absPct}% vs prev {usageDays}d</span>
                                                ) : pct <= -1 ? (
                                                    <span className="text-[11px] text-[#C4C0B6]">▼ {absPct}% vs prev {usageDays}d</span>
                                                ) : (
                                                    <span className="text-[11px] text-[#C4C0B6]">≈ flat vs prev {usageDays}d</span>
                                                );
                                            } else {
                                                trendChip = <span className="text-[11px] text-[#C4C0B6]/60">new</span>;
                                            }
                                        }
                                    } else if (tile.sub) {
                                        trendChip = <span className="text-[11px] text-[#C4C0B6]">{tile.sub}</span>;
                                    }
                                    return (
                                        <div key={tile.label} className="border border-[#3D3C36] rounded-lg bg-[#24231F] px-4 py-3">
                                            <div className="text-[10px] font-semibold text-[#C4C0B6] uppercase tracking-widest mb-1">{tile.label}</div>
                                            <div className="text-[22px] sm:text-[26px] font-semibold font-mono tabular-nums text-[#E8E4DD] leading-none">{tile.display}</div>
                                            <div className="mt-1">{trendChip}</div>
                                        </div>
                                    );
                                })}
                            </div>
                            );
                        })()}

                        {/* ── Volume + errors chart ── */}
                        <div className="border border-[#3D3C36] rounded-xl bg-[#24231F]/40 overflow-hidden">
                            <div className="flex items-center justify-between px-4 py-3 border-b border-[#3D3C36]">
                                <h2 className="text-base font-semibold text-[#E8E4DD]">
                                    Volume + Errors ({DEV_RANGE_OPTIONS.find(o => o.value === usageDays)?.label ?? `${usageDays}d`})
                                </h2>
                                <div className="flex items-center gap-2">
                                    {/* Source filter — chart-only per plan */}
                                    <div className="flex items-center gap-1.5">
                                        <Filter className="w-3.5 h-3.5 text-[#C4C0B6]" />
                                        <select
                                            value={usageSource}
                                            onChange={(e) => {
                                                setUsageSource(e.target.value);
                                                usageStatsCache.clear();
                                                fetchStats({ days: usageDays, source: e.target.value, platform: usagePlatform, dev: includeDev });
                                            }}
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
                                        value={usageDays}
                                        onChange={(v) => {
                                            setUsageDays(v);
                                            const key = `${v}|${usageSource}|${usagePlatform}|${includeDev ? 'dev' : 'prod'}`;
                                            fetchStats({ days: v, source: usageSource, platform: usagePlatform, dev: includeDev, background: !!usageStatsCache.get(key) });
                                        }}
                                    />
                                </div>
                            </div>
                            {stats.daily.length === 0 ? (
                                <p className="text-sm text-[#C4C0B6] text-center py-8">No API usage in this range.</p>
                            ) : (
                                <div className="p-4">
                                    <ResponsiveContainer width="100%" height={280}>
                                        <ComposedChart
                                            data={stats.daily.map(d => ({
                                                ...d,
                                                date: d.day.slice(5), // MM-DD
                                                errorPct: (d.reads + d.writes) > 0
                                                    ? (d.errors / (d.reads + d.writes)) * 100
                                                    : 0,
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
                                                    const reads = (payload.find(p => p.dataKey === 'reads')?.value ?? 0) as number;
                                                    const writes = (payload.find(p => p.dataKey === 'writes')?.value ?? 0) as number;
                                                    const errPct = (payload.find(p => p.dataKey === 'errorPct')?.value ?? 0) as number;
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
                        </div>

                        {/* ── DAU chart ── */}
                        <div className="border border-[#3D3C36] rounded-xl bg-[#24231F]/40 overflow-hidden">
                            <div className="flex items-center justify-between px-4 py-3 border-b border-[#3D3C36]">
                                <div>
                                    <h2 className="text-base font-semibold text-[#E8E4DD]">
                                        Daily Active Users
                                    </h2>
                                    {stats.daily.length > 0 && (() => {
                                        const dauValues = stats.daily.map(d => d.dau);
                                        const peak = Math.max(...dauValues);
                                        const avg = Math.round(dauValues.reduce((a, b) => a + b, 0) / dauValues.length);
                                        const today = dauValues[dauValues.length - 1] ?? 0;
                                        return (
                                            <p className="text-[11px] text-[#C4C0B6] mt-0.5 font-mono tabular-nums">
                                                today {today} · avg {avg} · peak {peak}
                                            </p>
                                        );
                                    })()}
                                </div>
                            </div>
                            {stats.daily.length === 0 ? (
                                <p className="text-sm text-[#C4C0B6] text-center py-8">No active users in this range.</p>
                            ) : (
                                <div className="p-4">
                                    <ResponsiveContainer width="100%" height={180}>
                                        <AreaChart
                                            data={stats.daily.map(d => ({
                                                ...d,
                                                date: d.day.slice(5), // MM-DD
                                            }))}
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
                                                    const dau = (payload.find(p => p.dataKey === 'dau')?.value ?? 0) as number;
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
                        </div>

                        {/* ── Two-column: top users by errors + top tools ── */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
                            {/* Top users by errors */}
                            <div className="border border-[#3D3C36] rounded-xl bg-[#24231F]/40 overflow-hidden">
                                <div className="px-4 py-3 border-b border-[#3D3C36]">
                                    <h2 className="text-sm font-semibold text-[#E8E4DD]">Top Users by Errors</h2>
                                    <p className="text-[11px] text-[#C4C0B6] mt-0.5">Click a row to open their account</p>
                                </div>
                                {stats.topUsersByErrors.length === 0 ? (
                                    <div className="px-4 py-8 text-center text-sm text-[#5DBE82]">
                                        No errors in this range.
                                    </div>
                                ) : (
                                    <div className="divide-y divide-[#3D3C36]/50">
                                        {stats.topUsersByErrors.map((u) => {
                                            const rate = u.calls > 0 ? (u.errors / u.calls) * 100 : 0;
                                            const rateColor = errorRateColor(rate);
                                            const target = u.primaryAccountId ? `/dev/${u.primaryAccountId}` : null;
                                            const row = (
                                                <div className="flex items-start gap-3 px-4 py-2.5">
                                                    <div className="min-w-0 flex-1">
                                                        <div className="text-[13px] font-mono text-[#E8E4DD] truncate">
                                                            {u.googleEmail ?? u.userId ?? 'Unknown'}
                                                        </div>
                                                        <div className="text-[11px] text-[#C4C0B6] font-mono mt-0.5">
                                                            {u.errors.toLocaleString()} errs / {u.calls.toLocaleString()} calls
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
                                                        {rate.toFixed(1)}%
                                                    </div>
                                                </div>
                                            );
                                            return target ? (
                                                <Link
                                                    key={u.userId ?? u.googleEmail ?? 'u'}
                                                    href={target}
                                                    prefetch
                                                    className="block hover:bg-[#2E2D28] transition-colors cursor-pointer"
                                                >
                                                    {row}
                                                </Link>
                                            ) : (
                                                <div key={u.userId ?? u.googleEmail ?? 'u'} className="block">
                                                    {row}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>

                            {/* Top tools */}
                            <div className="border border-[#3D3C36] rounded-xl bg-[#24231F]/40 overflow-hidden">
                                <div className="px-4 py-3 border-b border-[#3D3C36]">
                                    <h2 className="text-sm font-semibold text-[#E8E4DD]">Top Tools</h2>
                                </div>
                                {stats.topTools.length === 0 ? (
                                    <div className="px-4 py-8 text-center text-sm text-[#C4C0B6]">
                                        No tool calls yet.
                                    </div>
                                ) : (() => {
                                    const maxCalls = Math.max(...stats.topTools.map(t => t.calls), 1);
                                    return (
                                        <div className="px-4 py-3 space-y-2.5 max-h-[480px] overflow-y-auto">
                                            {stats.topTools.map((t) => {
                                                const rate = t.calls > 0 ? (t.errors / t.calls) * 100 : 0;
                                                const hasWarning = rate >= 5;
                                                const barColor = rate >= 15
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
                                                                    <span className={errorRateColor(rate)}>
                                                                        {rate.toFixed(1)}%
                                                                    </span>
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
                                })()}
                            </div>
                        </div>
                    </>
                ) : null)}

                {/* ── Customers Tab ── */}
                {activeTab === 'customers' && (loadingCustomers && customers.length === 0 ? (
                    <div className="flex items-center justify-center py-12">
                        <Loader2 className="h-5 w-5 animate-spin text-[#C4C0B6]" />
                    </div>
                ) : customers.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-[#3D3C36] bg-[#24231F]/40 p-10 text-center">
                        <Users className="mx-auto mb-3 h-8 w-8 text-[#C4C0B6]/30" />
                        <p className="text-sm text-[#C4C0B6]">No customers yet.</p>
                    </div>
                ) : (
                    <div>
                        <h2 className="text-base sm:text-lg font-semibold text-[#E8E4DD] mb-3 sm:mb-4">
                            Customers
                            <span className="ml-2 font-mono text-xs text-[#C4C0B6] font-normal">{customers.length}</span>
                        </h2>
                        <>
                        {/* Mobile: card layout */}
                            <div className="sm:hidden mb-3 flex items-center gap-2">
                                <label className="text-[10px] font-semibold text-[#C4C0B6] uppercase tracking-widest">Sort</label>
                                <select
                                    value={sortKey}
                                    onChange={(e) => setSortKey(e.target.value as CustomerSortKey)}
                                    className="flex-1 bg-[#24231F] border border-[#3D3C36] rounded-md px-2 py-1.5 text-xs text-[#E8E4DD]"
                                >
                                    <option value="operations">Operations</option>
                                    <option value="errorRate">Error Rate (30d)</option>
                                    <option value="budget">Annual Budget (USD)</option>
                                    <option value="accounts">Accounts</option>
                                    <option value="lastActive">Last Active</option>
                                    <option value="firstSeen">First Seen</option>
                                    <option value="email">Customer</option>
                                </select>
                                <button
                                    type="button"
                                    onClick={() => setSortDir((d) => d === 'asc' ? 'desc' : 'asc')}
                                    className="p-1.5 rounded-md border border-[#3D3C36] bg-[#24231F] text-[#C4C0B6] hover:text-[#E8E4DD]"
                                    title={sortDir === 'asc' ? 'Ascending' : 'Descending'}
                                >
                                    {sortDir === 'asc' ? <ArrowUp className="w-3.5 h-3.5" /> : <ArrowDown className="w-3.5 h-3.5" />}
                                </button>
                            </div>
                            <div className="sm:hidden space-y-2">
                                {sortedCustomers.map((c) => {
                                    const { hasBudget, currency, flag, country, annualUsd, annualLocal } = deriveBudgetDisplay(c);
                                    return (
                                    <div key={c.userId ?? c.primaryAccountId} className="border border-[#3D3C36] rounded-lg bg-[#24231F]/40 p-3">
                                        <div className="flex items-center justify-between mb-2">
                                            <div className="min-w-0">
                                                {c.googleEmail ? (
                                                    <button
                                                        type="button"
                                                        onClick={(e) => handleCopyEmail(c.googleEmail!, e)}
                                                        className="group/email inline-flex items-center gap-1.5 text-sm text-[#E8E4DD] truncate max-w-full hover:text-[#4CAF6E] transition-colors"
                                                    >
                                                        <span className="truncate">{c.googleEmail}</span>
                                                        {copiedEmail === c.googleEmail ? (
                                                            <Check className="w-3 h-3 shrink-0 text-[#4CAF6E]" />
                                                        ) : (
                                                            <Copy className="w-3 h-3 shrink-0 opacity-60" />
                                                        )}
                                                    </button>
                                                ) : (
                                                    <div className="text-sm text-[#E8E4DD] truncate">{c.userId || 'Unknown'}</div>
                                                )}
                                                <div className="flex items-center gap-1.5 text-xs text-[#C4C0B6]/60 font-mono">
                                                    <span>{c.primaryAccountId}</span>
                                                    {flag && <span className="text-[13px] leading-none" title={country ?? undefined}>{flag}</span>}
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-1 shrink-0">
                                                <button
                                                    type="button"
                                                    onClick={(e) => handleViewAs(c.primaryAccountId, e)}
                                                    disabled={impersonatingAccountId === c.primaryAccountId}
                                                    className="p-1.5 rounded-md text-[#C4C0B6] hover:bg-[#D4882A]/15 hover:text-[#D4882A] transition-colors disabled:opacity-50"
                                                    title="View as this account"
                                                >
                                                    {impersonatingAccountId === c.primaryAccountId
                                                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                        : <Eye className="w-3.5 h-3.5" />}
                                                </button>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3 mb-2 px-2 py-1.5 rounded-md bg-[#1A1917]/60 border border-[#3D3C36]/50">
                                            {hasBudget && (
                                                <div className="flex-1">
                                                    <div className="text-[10px] text-[#C4C0B6] uppercase tracking-widest">Annual Budget</div>
                                                    <div className="text-sm text-[#4CAF6E] font-mono tabular-nums font-medium">
                                                        {annualUsd != null ? formatCurrency(annualUsd, 'USD', { compact: true }) : '—'}
                                                    </div>
                                                    {currency && currency !== 'USD' && (
                                                        <div className="text-[10px] text-[#C4C0B6]/60 font-mono">≈ {formatCurrency(annualLocal, currency, { compact: true })}/yr</div>
                                                    )}
                                                </div>
                                            )}
                                            <div className={hasBudget ? '' : 'flex-1'}>
                                                <div className="text-[10px] text-[#C4C0B6] uppercase tracking-widest">Operations</div>
                                                {c.totalOps > 0 ? (
                                                    <>
                                                        <div className="text-sm text-[#E8E4DD] font-mono tabular-nums font-medium">{c.totalOps.toLocaleString()}</div>
                                                        <div className="text-[10px] text-[#C4C0B6]/60 font-mono">{c.reads.toLocaleString()}r · {c.writes.toLocaleString()}w</div>
                                                    </>
                                                ) : (
                                                    <div className="text-sm text-[#C4C0B6]/40">—</div>
                                                )}
                                            </div>
                                            <div>
                                                <div className="text-[10px] text-[#C4C0B6] uppercase tracking-widest">Errors (30d)</div>
                                                {c.calls30d > 0 ? (
                                                    <div className={`text-sm font-mono tabular-nums font-medium ${errorRateColor(c.errorRate)}`}>
                                                        {c.errorsCount} ({c.errorRate.toFixed(1)}%)
                                                    </div>
                                                ) : (
                                                    <div className="text-sm text-[#C4C0B6]/40">—</div>
                                                )}
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-3 gap-3 text-center">
                                            <div>
                                                <div className="text-[10px] text-[#C4C0B6] uppercase tracking-widest">Accounts</div>
                                                <div className="text-sm text-[#E8E4DD] font-mono tabular-nums">{c.accountCount}</div>
                                            </div>
                                            <div>
                                                <div className="text-[10px] text-[#C4C0B6] uppercase tracking-widest">First Seen</div>
                                                <div className="text-[11px] text-[#C4C0B6] font-mono">{formatDateShort(c.firstSeen, true)}</div>
                                            </div>
                                            <div>
                                                <div className="text-[10px] text-[#C4C0B6] uppercase tracking-widest">Last Active</div>
                                                <div className="text-[11px] text-[#C4C0B6] font-mono">{formatDateShort(c.lastActive)}</div>
                                            </div>
                                        </div>
                                        {c.accounts.length > 0 && (
                                            <div className="mt-2 space-y-1 max-h-48 overflow-y-auto">
                                                {c.accounts.map((a) => {
                                                    const annualUsdAcct = a.dailyBudgetUsd != null ? a.dailyBudgetUsd * DAYS_PER_YEAR : null;
                                                    return (
                                                        <div key={a.id} className="flex items-center justify-between text-[10px] bg-[#1A1917] border border-[#3D3C36]/50 rounded px-1.5 py-1 text-[#C4C0B6] font-mono">
                                                            <span className="truncate mr-2 inline-flex items-center gap-1">
                                                                {a.flag && <span title={a.country ?? undefined}>{a.flag}</span>}
                                                                <span className="truncate">{a.name || a.id}</span>
                                                            </span>
                                                            {annualUsdAcct != null && (
                                                                <span className="text-[#4CAF6E] whitespace-nowrap">{formatCurrency(annualUsdAcct, 'USD', { compact: true })}/yr · {a.activeCampaigns ?? 0} campaigns</span>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                    );
                                })}
                            </div>

                            {/* Desktop: table layout */}
                            <div className="hidden sm:block border border-[#3D3C36] rounded-xl bg-[#24231F]/40 overflow-hidden">
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr className="border-b border-[#3D3C36]">
                                            {([
                                                { key: 'email' as const, label: 'Customer' },
                                                { key: 'accounts' as const, label: 'Accounts' },
                                                { key: 'operations' as const, label: 'Operations' },
                                                { key: 'errorRate' as const, label: 'Errors (30d)' },
                                                { key: 'budget' as const, label: 'Annual Budget' },
                                                { key: 'firstSeen' as const, label: 'First Seen' },
                                                { key: 'lastActive' as const, label: 'Last Active' },
                                            ]).map((col) => (
                                                <th key={col.key} className="px-4 py-3 text-[10px] font-semibold text-[#C4C0B6] uppercase tracking-widest">
                                                    <button
                                                        type="button"
                                                        onClick={() => toggleSort(col.key)}
                                                        className="inline-flex items-center gap-1 hover:text-[#E8E4DD] transition-colors"
                                                    >
                                                        {col.label}
                                                        {sortKey === col.key ? (
                                                            sortDir === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
                                                        ) : (
                                                            <ArrowUpDown className="w-3 h-3 opacity-30" />
                                                        )}
                                                    </button>
                                                </th>
                                            ))}
                                            <th className="px-4 py-3" />
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {sortedCustomers.map((c) => {
                                            const { hasBudget, currency, flag, country, annualUsd, annualLocal } = deriveBudgetDisplay(c);
                                            const totalCampaigns = c.accounts.reduce((s, a) => s + (a.activeCampaigns ?? 0), 0);
                                            return (
                                            <tr
                                                key={c.userId ?? c.primaryAccountId}
                                                onClick={() => router.push(`/dev/${c.primaryAccountId}`)}
                                                onMouseEnter={() => router.prefetch(`/dev/${c.primaryAccountId}`)}
                                                className="border-b border-[#3D3C36]/50 hover:bg-[#24231F]/60 transition-colors cursor-pointer"
                                            >
                                                <td className="px-4 py-2.5">
                                                    <div className="flex items-center gap-2">
                                                        {c.googleEmail ? (
                                                            <button
                                                                type="button"
                                                                onClick={(e) => handleCopyEmail(c.googleEmail!, e)}
                                                                title={copiedEmail === c.googleEmail ? 'Copied!' : 'Click to copy email'}
                                                                className="group/email inline-flex items-center gap-1.5 text-sm text-[#E8E4DD] truncate min-w-0 hover:text-[#4CAF6E] transition-colors"
                                                            >
                                                                <span className="truncate">{c.googleEmail}</span>
                                                                {copiedEmail === c.googleEmail ? (
                                                                    <Check className="w-3 h-3 shrink-0 text-[#4CAF6E]" />
                                                                ) : (
                                                                    <Copy className="w-3 h-3 shrink-0 opacity-0 group-hover/email:opacity-60 transition-opacity" />
                                                                )}
                                                            </button>
                                                        ) : (
                                                            <div className="text-sm text-[#E8E4DD] truncate">{c.userId || 'Unknown'}</div>
                                                        )}
                                                        {c.outreachStatus === 'drafted' && (
                                                            <span className="shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-[#D4882A] bg-[#D4882A]/15 border border-[#D4882A]/30" title="Outreach draft ready to review">
                                                                Draft
                                                            </span>
                                                        )}
                                                        {c.outreachStatus === 'contacted' && (
                                                            <span className="shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-[#4CAF6E] bg-[#4CAF6E]/15 border border-[#4CAF6E]/30" title={c.lastContactedAt ? `Sent ${formatDateTime(c.lastContactedAt)}` : 'Sent'}>
                                                                Sent
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="flex items-center gap-1.5 text-xs text-[#C4C0B6]/60 font-mono tabular-nums">
                                                        <span>{c.primaryAccountId}</span>
                                                        {flag && (
                                                            <span className="text-[13px] leading-none" title={country ?? undefined}>{flag}</span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="px-4 py-2.5">
                                                    <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
                                                        {c.accounts.length === 0 ? (
                                                            <span className="text-sm text-[#C4C0B6]/40">—</span>
                                                        ) : c.accounts.map((a) => (
                                                            <Link key={a.id} href={`/dev/${a.id}`} prefetch onClick={(e) => e.stopPropagation()} className="text-[11px] bg-[#1A1917] border border-[#3D3C36]/50 rounded px-1.5 py-0.5 text-[#C4C0B6] font-mono hover:border-[#4CAF6E]/30 hover:text-[#E8E4DD] transition-colors">{a.name || a.id}</Link>
                                                        ))}
                                                    </div>
                                                </td>
                                                <td className="px-4 py-2.5">
                                                    {c.totalOps > 0 ? (
                                                        <div>
                                                            <div className="text-sm text-[#E8E4DD] font-mono tabular-nums font-medium">{c.totalOps.toLocaleString()}</div>
                                                            <div className="text-[10px] text-[#C4C0B6]/60 font-mono">{c.reads.toLocaleString()}r · {c.writes.toLocaleString()}w</div>
                                                        </div>
                                                    ) : (
                                                        <span className="text-sm text-[#C4C0B6]/40">—</span>
                                                    )}
                                                </td>
                                                <td className="px-4 py-2.5">
                                                    {c.calls30d > 0 ? (
                                                        <div className={`font-mono tabular-nums text-sm font-medium ${errorRateColor(c.errorRate)}`}>
                                                            {c.errorsCount} ({c.errorRate.toFixed(1)}%)
                                                        </div>
                                                    ) : (
                                                        <span className="text-sm text-[#C4C0B6]/40">—</span>
                                                    )}
                                                </td>
                                                <td className="px-4 py-2.5">
                                                    {hasBudget ? (
                                                        <div>
                                                            <div className="text-sm text-[#4CAF6E] font-mono tabular-nums" title={c.dailyBudgetUsd != null ? `${formatCurrency(c.dailyBudgetUsd, 'USD')}/day` : undefined}>
                                                                {annualUsd != null ? formatCurrency(annualUsd, 'USD', { compact: true }) : '—'}
                                                            </div>
                                                            <div className="text-[10px] text-[#C4C0B6]/60 font-mono">
                                                                {currency && currency !== 'USD'
                                                                    ? `≈ ${formatCurrency(annualLocal, currency, { compact: true })}/yr · ${totalCampaigns} campaign${totalCampaigns !== 1 ? 's' : ''}`
                                                                    : `${totalCampaigns} campaign${totalCampaigns !== 1 ? 's' : ''}`}
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <span className="text-sm text-[#C4C0B6]/40">—</span>
                                                    )}
                                                </td>
                                                <td className="px-4 py-2.5 text-xs text-[#C4C0B6] font-mono">{formatDateShort(c.firstSeen, true)}</td>
                                                <td className="px-4 py-2.5 text-xs text-[#C4C0B6] font-mono">{formatDateTime(c.lastActive)}</td>
                                                <td className="px-4 py-2.5">
                                                    <button
                                                        type="button"
                                                        onClick={(e) => handleViewAs(c.primaryAccountId, e)}
                                                        disabled={impersonatingAccountId === c.primaryAccountId}
                                                        className="p-1.5 rounded-md text-[#C4C0B6] hover:bg-[#D4882A]/15 hover:text-[#D4882A] transition-colors disabled:opacity-50"
                                                        title="View as this account"
                                                    >
                                                        {impersonatingAccountId === c.primaryAccountId
                                                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                            : <Eye className="w-3.5 h-3.5" />}
                                                    </button>
                                                </td>
                                            </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </>
                    </div>
                ))}

                {/* ── Outreach Tab ── */}
                {activeTab === 'outreach' && metrics && metrics.sent > 0 && (
                    <div>
                        <h2 className="text-base sm:text-lg font-semibold text-[#E8E4DD] mb-3 sm:mb-4">Outreach</h2>

                        {/* Summary cards */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mb-4">
                            {[
                                { label: 'Total Leads', value: metrics.total, color: 'text-[#E8E4DD]' },
                                { label: 'Sent', value: metrics.sent, color: 'text-[#E8E4DD]' },
                                { label: 'Bounce Rate', value: `${(metrics.bounceRate * 100).toFixed(1)}%`, color: metrics.bounceRate > BOUNCE_RATE_WARN ? 'text-[#C45D4A]' : 'text-[#4CAF6E]' },
                                { label: 'Reply Rate', value: `${(metrics.replyRate * 100).toFixed(1)}%`, color: metrics.replyRate > 0 ? 'text-[#4CAF6E]' : 'text-[#C4C0B6]' },
                            ].map((card) => (
                                <div key={card.label} className="border border-[#3D3C36] rounded-lg bg-[#24231F]/40 p-3 sm:p-4">
                                    <div className="text-[10px] font-semibold text-[#C4C0B6] uppercase tracking-widest mb-1">{card.label}</div>
                                    <div className={`text-xl sm:text-2xl font-mono tabular-nums font-semibold ${card.color}`}>{card.value}</div>
                                </div>
                            ))}
                        </div>

                        {/* Domain bounce breakdown */}
                        {metrics.domainBreakdown.length > 0 && (
                            <div className="border border-[#3D3C36] rounded-xl bg-[#24231F]/40 overflow-hidden">
                                <div className="px-4 py-3 border-b border-[#3D3C36]">
                                    <span className="text-[10px] font-semibold text-[#C4C0B6] uppercase tracking-widest">Bounce Rate by Domain</span>
                                </div>
                                <div className="divide-y divide-[#3D3C36]/50">
                                    {metrics.domainBreakdown.map((d) => (
                                        <div key={d.domain} className="flex items-center gap-3 px-4 py-2">
                                            <span className="text-[13px] font-mono text-[#E8E4DD] min-w-0 truncate flex-1">{d.domain}</span>
                                            <span className="text-[12px] font-mono tabular-nums text-[#C4C0B6] shrink-0">{d.total} sent</span>
                                            <span className="text-[12px] font-mono tabular-nums text-[#C45D4A] shrink-0">{d.bounced} bounced</span>
                                            <span className={`text-[12px] font-mono tabular-nums shrink-0 w-14 text-right font-medium ${d.bounceRate > BOUNCE_RATE_WARN ? 'text-[#C45D4A]' : 'text-[#4CAF6E]'}`}>
                                                {(d.bounceRate * 100).toFixed(0)}%
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* ── Leads ── */}
                {activeTab === 'outreach' && (
                <div>
                    <div className="flex items-center justify-between mb-3 sm:mb-4">
                        <div className="flex items-center gap-3">
                            <h2 className="text-base sm:text-lg font-semibold text-[#E8E4DD]">Leads</h2>
                            {!loadingContacts && (
                                <span className="font-mono text-xs text-[#C4C0B6]">
                                    {statusFilter === 'all' ? contacts.length : `${filteredContacts.length}/${contacts.length}`}
                                </span>
                            )}
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="relative">
                                <Filter className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-[#C4C0B6] pointer-events-none" />
                                <select
                                    value={statusFilter}
                                    onChange={(e) => setStatusFilter(e.target.value)}
                                    className="appearance-none pl-7 pr-6 py-1.5 text-[12px] rounded-md border border-[#3D3C36] bg-[#24231F] text-[#E8E4DD] hover:bg-[#2E2D28] focus:outline-none focus:ring-1 focus:ring-[#4CAF6E]/50 cursor-pointer"
                                >
                                    <option value="all">All statuses</option>
                                    {STATUS_CONFIG.map((s) => (
                                        <option key={s.key} value={s.key}>{s.label}</option>
                                    ))}
                                </select>
                                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-[#C4C0B6] pointer-events-none" />
                            </div>
                            <label>
                                <input type="file" accept=".csv" onChange={handleCSVUpload} className="hidden" />
                                <Button variant="outline" size="sm" disabled={importing} className="gap-1.5 border-[#3D3C36] bg-[#24231F] hover:bg-[#2E2D28] text-[#C4C0B6] hover:text-[#E8E4DD]" asChild>
                                    <span>
                                        {importing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                                        <span className="hidden sm:inline">Import CSV</span>
                                    </span>
                                </Button>
                            </label>
                        </div>
                    </div>

                    {loadingContacts ? (
                        <div className="flex items-center justify-center py-12">
                            <Loader2 className="h-5 w-5 animate-spin text-[#C4C0B6]" />
                        </div>
                    ) : filteredContacts.length === 0 ? (
                        <div className="rounded-lg border border-dashed border-[#3D3C36] bg-[#24231F]/40 p-10 text-center">
                            <Users className="mx-auto mb-3 h-8 w-8 text-[#C4C0B6]/30" />
                            <p className="text-sm text-[#C4C0B6]">{contacts.length === 0 ? 'No leads yet. Import a CSV or add via script.' : 'No leads match this filter.'}</p>
                        </div>
                    ) : (
                        <div className="border border-[#3D3C36] rounded-xl bg-[#24231F]/40 overflow-hidden">
                            {sendError && (
                                <div className="bg-[#C45D4A]/10 border-b border-[#C45D4A]/30 px-4 py-2.5 flex items-center gap-2 text-[13px] text-[#C45D4A]">
                                    <AlertCircle className="w-4 h-4 shrink-0" />
                                    {sendError}
                                    <button onClick={() => setSendError(null)} className="ml-auto"><X className="w-3.5 h-3.5" /></button>
                                </div>
                            )}
                            <div className="max-h-[32rem] overflow-y-auto divide-y divide-[#3D3C36]/50">
                                {filteredContacts.map((c) => {
                                    const sc = STATUS_CONFIG.find((s) => s.key === c.status);
                                    const badgeStyle = sc
                                        ? { backgroundColor: `${sc.color}26`, color: sc.color }
                                        : { backgroundColor: '#C4C0B626', color: '#C4C0B6' };
                                    const hasDraft = !!c.draftSubject;
                                    return (
                                        <Link
                                            key={c.id}
                                            href={`/dev/contacts/${c.id}`}
                                            prefetch
                                            className="group flex items-center gap-2 px-4 py-2.5 hover:bg-[#24231F]/60 transition-colors cursor-pointer"
                                        >
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex items-center gap-2">
                                                        <span className="truncate text-[13px] text-[#E8E4DD] font-mono">{c.email}</span>
                                                        <span className="shrink-0 rounded px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider" style={badgeStyle}>
                                                            {c.status}
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center gap-2 mt-0.5">
                                                        <span className="text-[12px] text-[#C4C0B6]">{c.company || '—'}</span>
                                                        {hasDraft && c.status === 'drafted' && <span className="text-[11px] text-[#C4C0B6]/60">· draft ready</span>}
                                                        {c.status === 'scheduled' && c.scheduledAt && <span className="text-[11px] text-[#C084FC]/60">· sends {new Date(c.scheduledAt).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>}
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-1 shrink-0">
                                                    {hasDraft && c.status === 'drafted' && (
                                                        <>
                                                            <Button
                                                                size="sm"
                                                                disabled={schedulingId === c.id || sendingId === c.id}
                                                                onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleSchedule(c.id); }}
                                                                className="gap-1.5 bg-[#C084FC]/20 text-[#C084FC] hover:bg-[#C084FC]/30 border border-[#C084FC]/40 h-7 text-[12px] px-2.5"
                                                            >
                                                                {schedulingId === c.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Clock className="h-3 w-3" />}
                                                                Schedule
                                                            </Button>
                                                            <Button
                                                                size="sm"
                                                                disabled={sendingId === c.id || schedulingId === c.id}
                                                                onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleSend(c.id); }}
                                                                className="gap-1.5 bg-[#4CAF6E] text-[#E8E4DD] hover:bg-[#3D9A5C] h-7 text-[12px] px-2.5"
                                                            >
                                                                {sendingId === c.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                                                                Send
                                                            </Button>
                                                        </>
                                                    )}
                                                    {hasDraft && c.status === 'scheduled' && (
                                                        <Button
                                                            size="sm"
                                                            disabled={sendingId === c.id}
                                                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleSend(c.id); }}
                                                            className="gap-1.5 bg-[#24231F] text-[#C4C0B6] hover:text-[#E8E4DD] border border-[#3D3C36] h-7 text-[12px] px-2.5"
                                                        >
                                                            {sendingId === c.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                                                            Send now
                                                        </Button>
                                                    )}
                                                    <Button
                                                        variant="ghost"
                                                        size="icon-sm"
                                                        disabled={deletingContactId === c.id}
                                                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDeleteContact(c.id); }}
                                                        className="text-[#C4C0B6] opacity-0 group-hover:opacity-100 hover:text-[#C45D4A] transition-opacity"
                                                    >
                                                        {deletingContactId === c.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
                                                    </Button>
                                                    <ChevronRight className="w-4 h-4 text-[#C4C0B6]" />
                                                </div>
                                        </Link>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>
                )}

                {/* ── Developer Options Tab ── */}
                {activeTab === 'developer' && (
                    <div className="space-y-4">
                        <h2 className="text-base sm:text-lg font-semibold text-[#E8E4DD] mb-3 sm:mb-4">Developer Options</h2>

                        <div className="border border-[#3D3C36] rounded-xl bg-[#24231F] p-4 sm:p-5">
                            <div className="flex items-start gap-3">
                                <div className="shrink-0 rounded-md bg-[#4CAF6E]/15 p-2">
                                    <Sparkles className="w-4 h-4 text-[#4CAF6E]" />
                                </div>
                                <div className="min-w-0 flex-1">
                                    <h3 className="text-sm font-semibold text-[#E8E4DD]">Growth override</h3>
                                    <p className="mt-1 text-xs text-[#C4C0B6] leading-relaxed">
                                        When ON, your session is granted a synthetic Growth plan regardless of
                                        the real subscription state in the DB. Toggle OFF to test the app as
                                        the underlying subscription tier (Free, paywalls, etc.).
                                    </p>
                                    <div className="mt-3">
                                        <Button
                                            onClick={toggleGrowthOverride}
                                            disabled={growthOverride === null || togglingGrowthOverride}
                                            variant="outline"
                                            size="sm"
                                            className={`gap-1.5 ${growthOverride === 'on'
                                                ? 'border-[#4CAF6E]/40 bg-[#4CAF6E]/[0.08] text-[#4CAF6E] hover:bg-[#4CAF6E]/[0.14]'
                                                : 'border-[#D4882A]/40 bg-[#D4882A]/[0.08] text-[#D4882A] hover:bg-[#D4882A]/[0.14]'
                                            }`}
                                        >
                                            {togglingGrowthOverride
                                                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                : <Sparkles className="w-3.5 h-3.5" />}
                                            Growth override: {growthOverride === 'on' ? 'ON' : growthOverride === 'off' ? 'OFF (real subscription)' : '…'}
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="border border-[#3D3C36] rounded-xl bg-[#24231F] p-4 sm:p-5">
                            <div className="flex items-start gap-3">
                                <div className="shrink-0 rounded-md bg-[#1877F2]/15 p-2">
                                    <Eye className="w-4 h-4 text-[#1877F2]" />
                                </div>
                                <div className="min-w-0 flex-1">
                                    <h3 className="text-sm font-semibold text-[#E8E4DD]">Meta waitlist wall</h3>
                                    <p className="mt-1 text-xs text-[#C4C0B6] leading-relaxed">
                                        Meta App Review is pending — non-developer customers always see a
                                        &ldquo;Coming soon, join waitlist&rdquo; wall on{' '}
                                        <code className="font-mono text-[#E8E4DD]">/manage-ads-accounts</code>{' '}
                                        and{' '}
                                        <code className="font-mono text-[#E8E4DD]">/manage-ads-accounts/meta-ads</code>.
                                        Toggle off to preview the underlying connect/manage UX as a developer.
                                    </p>
                                    <div className="mt-3">
                                        <Button
                                            onClick={toggleMetaWaitlistWall}
                                            disabled={metaWaitlistWall === null || togglingMetaWaitlistWall}
                                            variant="outline"
                                            size="sm"
                                            className={`gap-1.5 ${metaWaitlistWall === 'on'
                                                ? 'border-[#D4882A]/40 bg-[#D4882A]/[0.08] text-[#D4882A] hover:bg-[#D4882A]/[0.14]'
                                                : 'border-[#4CAF6E]/40 bg-[#4CAF6E]/[0.08] text-[#4CAF6E] hover:bg-[#4CAF6E]/[0.14]'
                                            }`}
                                        >
                                            {togglingMetaWaitlistWall
                                                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                : <Eye className="w-3.5 h-3.5" />}
                                            Wall: {metaWaitlistWall === 'on' ? 'ON (customer view)' : metaWaitlistWall === 'off' ? 'OFF (preview underlying UX)' : '…'}
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="border border-[#C45D4A]/30 rounded-xl bg-[#C45D4A]/[0.04] p-4 sm:p-5">
                            <div className="flex items-start gap-3">
                                <div className="shrink-0 rounded-md bg-[#C45D4A]/15 p-2">
                                    <AlertTriangle className="w-4 h-4 text-[#C45D4A]" />
                                </div>
                                <div className="min-w-0 flex-1">
                                    <h3 className="text-sm font-semibold text-[#E8E4DD]">Reset Account</h3>
                                    <p className="mt-1 text-xs text-[#C4C0B6] leading-relaxed">
                                        Permanently delete every database row tied to your currently signed-in
                                        account — sessions, chat threads, audits, operations, integrations,
                                        subscription state, and per-account snapshots — plus the Stripe customer
                                        in both test and live mode. You will be signed out and need to reconnect
                                        afterwards.
                                    </p>
                                    <p className="mt-1 text-[11px] text-[#C45D4A]/80">
                                        Disabled while impersonating another account.
                                    </p>
                                    <div className="mt-3">
                                        <Button
                                            onClick={openResetModal}
                                            disabled={loadingResetPreview || resetting}
                                            variant="outline"
                                            size="sm"
                                            className="gap-1.5 border-[#C45D4A]/40 bg-[#C45D4A]/[0.08] text-[#C45D4A] hover:bg-[#C45D4A]/15"
                                        >
                                            {loadingResetPreview
                                                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                : <Trash2 className="w-3.5 h-3.5" />}
                                            Reset account
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

            </div>

            {resetModalOpen && (
                <div
                    role="dialog"
                    aria-modal="true"
                    className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
                    onClick={() => { if (!resetting) setResetModalOpen(false); }}
                >
                    <div
                        className="w-full max-w-lg rounded-xl border border-[#3D3C36] bg-[#24231F] shadow-2xl"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-[#3D3C36]">
                            <div className="flex items-center gap-2 min-w-0">
                                <AlertTriangle className="w-4 h-4 shrink-0 text-[#C45D4A]" />
                                <h3 className="text-sm font-semibold text-[#E8E4DD] truncate">
                                    {resetDone ? 'Account reset' : 'Reset account?'}
                                </h3>
                            </div>
                            <button
                                onClick={() => { if (!resetting) setResetModalOpen(false); }}
                                disabled={resetting}
                                className="text-[#C4C0B6] hover:text-[#E8E4DD] disabled:opacity-50"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        <div className="px-5 py-4 max-h-[60vh] overflow-y-auto">
                            {resetDone ? (
                                <div className="space-y-3">
                                    <p className="text-sm text-[#E8E4DD]">All data tied to your account has been deleted.</p>
                                    <p className="text-xs text-[#C4C0B6]">You have been signed out. Reconnect to continue using the app.</p>
                                </div>
                            ) : loadingResetPreview ? (
                                <div className="flex items-center justify-center py-8">
                                    <Loader2 className="w-5 h-5 animate-spin text-[#C4C0B6]" />
                                </div>
                            ) : resetPreview ? (
                                <div className="space-y-3">
                                    <div className="text-xs text-[#C4C0B6] leading-relaxed">
                                        The following rows will be <span className="text-[#C45D4A] font-medium">permanently deleted</span> for{' '}
                                        <span className="font-mono text-[#E8E4DD]">{resetPreview.googleEmail || resetPreview.userId}</span>
                                        {resetPreview.accountIds.length > 0 && (
                                            <> across accounts <span className="font-mono text-[#E8E4DD]">{resetPreview.accountIds.join(', ')}</span></>
                                        )}.
                                    </div>
                                    {resetPreview.stripeCustomers.length > 0 && (
                                        <div className="rounded-md border border-[#3D3C36] bg-[#1A1917] px-3 py-2 text-xs">
                                            <div className="text-[10px] font-semibold text-[#C4C0B6] uppercase tracking-widest mb-1">Stripe customers (will also be deleted)</div>
                                            {resetPreview.stripeCustomers.map((c) => (
                                                <div key={`${c.env}:${c.stripeCustomerId}`} className="flex items-center justify-between font-mono text-[#E8E4DD]">
                                                    <span>{c.stripeCustomerId}</span>
                                                    <span className={c.env === 'live' ? 'text-[#C45D4A]' : 'text-[#D4882A]'}>{c.env}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                    {resetPreview.total === 0 && resetPreview.stripeCustomers.length === 0 ? (
                                        <div className="rounded-md border border-[#3D3C36] bg-[#1A1917] px-3 py-3 text-xs text-[#C4C0B6]">
                                            No rows match — there is nothing to delete.
                                        </div>
                                    ) : resetPreview.total === 0 ? null : (
                                        <div className="rounded-md border border-[#3D3C36] bg-[#1A1917] overflow-hidden">
                                            <div className="grid grid-cols-[1fr_auto] gap-x-4 text-xs font-mono">
                                                {Object.entries(resetPreview.counts)
                                                    .filter(([, n]) => n > 0)
                                                    .sort((a, b) => b[1] - a[1])
                                                    .map(([table, n]) => (
                                                        <div key={table} className="contents">
                                                            <div className="px-3 py-1.5 text-[#C4C0B6] border-b border-[#3D3C36]/50">{table}</div>
                                                            <div className="px-3 py-1.5 text-[#E8E4DD] tabular-nums text-right border-b border-[#3D3C36]/50">{n.toLocaleString()}</div>
                                                        </div>
                                                    ))}
                                                <div className="contents">
                                                    <div className="px-3 py-2 text-[#E8E4DD] font-semibold">Total</div>
                                                    <div className="px-3 py-2 text-[#E8E4DD] font-semibold tabular-nums text-right">{resetPreview.total.toLocaleString()}</div>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="text-xs text-[#C4C0B6]">No preview available.</div>
                            )}
                        </div>

                        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-[#3D3C36]">
                            {resetDone ? (
                                <Button
                                    onClick={() => { window.location.assign('/connect'); }}
                                    size="sm"
                                    className="bg-[#4CAF6E] text-[#E8E4DD] hover:bg-[#3D9A5C]"
                                >
                                    Go to /connect
                                </Button>
                            ) : (
                                <>
                                    <Button
                                        onClick={() => setResetModalOpen(false)}
                                        disabled={resetting}
                                        variant="outline"
                                        size="sm"
                                        className="border-[#3D3C36] bg-[#24231F] hover:bg-[#2E2D28] text-[#C4C0B6] hover:text-[#E8E4DD]"
                                    >
                                        Cancel
                                    </Button>
                                    <Button
                                        onClick={confirmReset}
                                        disabled={resetting || loadingResetPreview || !resetPreview || (resetPreview.total === 0 && resetPreview.stripeCustomers.length === 0)}
                                        size="sm"
                                        className="gap-1.5 bg-[#C45D4A] text-[#E8E4DD] hover:bg-[#A84A3A]"
                                    >
                                        {resetting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                                        Delete everything
                                    </Button>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </section>
    );
}
