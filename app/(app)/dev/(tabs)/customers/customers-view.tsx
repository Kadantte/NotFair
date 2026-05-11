'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
    RefreshCw, AlertCircle, ChevronRight, ChevronLeft, Loader2, X,
    Users, Eye, ArrowUpDown, ArrowUp, ArrowDown, Check, Copy, Search,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { errorRateColor } from '@/lib/dev-format';
import type { Customer, CustomerSortKey, SortDir } from '../../_components/dev-types';
import {
    deriveBudgetDisplay,
    attributionTone,
    attributionDetailLabel,
    attributionDisplayLabel,
    customerMatchesSearch,
    formatCurrency,
    formatDateTime,
    formatDateShort,
} from '../../_components/dev-utils';

const CUSTOMER_PAGE_SIZE = 50;

// Module-level stale-while-revalidate cache (CLAUDE.md pattern).
let cachedCustomers: Customer[] | null = null;
let cachedDraftEmails: Set<string> | null = null;

function PlanBadge({ plan, inTrial }: { plan: 'free' | 'growth'; inTrial: boolean }) {
    if (inTrial) return (
        <span className="shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-[#D4882A] bg-[#D4882A]/15 border border-[#D4882A]/30">Trial</span>
    );
    if (plan === 'growth') return (
        <span className="shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-[#4CAF6E] bg-[#4CAF6E]/15 border border-[#4CAF6E]/30">Growth</span>
    );
    return null;
}

type Props = { initialData?: { customers: Customer[] } };

export function CustomersView({ initialData }: Props) {
    // Seed from server prefetch if available and cache is empty.
    if (initialData && !cachedCustomers) {
        cachedCustomers = initialData.customers;
    }
    const [customers, setCustomers] = useState<Customer[]>(cachedCustomers ?? []);
    const [loadingCustomers, setLoadingCustomers] = useState(!cachedCustomers);
    const [error, setError] = useState<string | null>(null);
    const [customerSearch, setCustomerSearch] = useState('');
    const [customerPage, setCustomerPage] = useState(1);
    const [sortKey, setSortKey] = useState<CustomerSortKey>('operations');
    const [sortDir, setSortDir] = useState<SortDir>('desc');
    const [impersonatingAccountId, setImpersonatingAccountId] = useState<string | null>(null);
    const [copiedEmail, setCopiedEmail] = useState<string | null>(null);
    const router = useRouter();

    const applyDrafts = useCallback((list: Customer[], drafts: Set<string>): Customer[] => {
        return list.map((c) => {
            if (c.outreachStatus !== 'none') return c;
            const key = c.googleEmail?.toLowerCase();
            return key && drafts.has(key) ? { ...c, outreachStatus: 'drafted' as const } : c;
        });
    }, []);

    const fetchDraftEmails = useCallback(async () => {
        try {
            const res = await fetch('/api/dev/customers/drafts', { credentials: 'include' });
            if (!res.ok) return;
            const { emails } = (await res.json()) as { emails: string[] };
            const set = new Set(emails.map((e) => e.toLowerCase()));
            cachedDraftEmails = set;
            setCustomers((prev) => applyDrafts(prev, set));
            cachedCustomers = applyDrafts(cachedCustomers ?? [], set);
        } catch { /* best-effort */ }
    }, [applyDrafts]);

    const fetchCustomers = useCallback(async (background = false, fresh = false) => {
        if (!background) setLoadingCustomers(true);
        try {
            const res = await fetch(`/api/dev/customers${fresh ? '?fresh=1' : ''}`, { credentials: 'include' });
            if (!res.ok) throw new Error('Failed to fetch');
            const data = await res.json();
            const next: Customer[] = cachedDraftEmails ? applyDrafts(data.customers, cachedDraftEmails) : data.customers;
            setCustomers(next);
            cachedCustomers = next;
        } catch {
            setError('Failed to load customers');
        } finally {
            setLoadingCustomers(false);
        }
    }, [applyDrafts]);

    useEffect(() => {
        fetchCustomers(!!cachedCustomers);
        if (!cachedDraftEmails) fetchDraftEmails();
    }, [fetchCustomers, fetchDraftEmails]);

    const handleCopyEmail = useCallback((email: string, e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (!email) return;
        navigator.clipboard.writeText(email).then(() => {
            setCopiedEmail(email);
            setTimeout(() => setCopiedEmail((cur) => (cur === email ? null : cur)), 1500);
        }).catch(() => {});
    }, []);

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

    function toggleSort(key: CustomerSortKey) {
        if (sortKey === key) {
            setSortDir((d) => d === 'asc' ? 'desc' : 'asc');
        } else {
            setSortKey(key);
            setSortDir(key === 'email' ? 'asc' : 'desc');
        }
    }

    const normalizedCustomerSearch = customerSearch.trim().toLowerCase();

    const filteredCustomers = useMemo(() => {
        return customers.filter((customer) => customerMatchesSearch(customer, normalizedCustomerSearch));
    }, [customers, normalizedCustomerSearch]);

    const sortedCustomers = useMemo(() => {
        const sorted = [...filteredCustomers];
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
                case 'plan':
                    cmp = (a.plan === 'growth' ? (a.inTrial ? 1 : 2) : 0) - (b.plan === 'growth' ? (b.inTrial ? 1 : 2) : 0);
                    break;
            }
            return sortDir === 'asc' ? cmp : -cmp;
        });
        return sorted;
    }, [filteredCustomers, sortKey, sortDir]);

    const customerResultCount = sortedCustomers.length;
    const customerPageCount = Math.max(1, Math.ceil(customerResultCount / CUSTOMER_PAGE_SIZE));
    const boundedCustomerPage = Math.min(customerPage, customerPageCount);
    const customerPageStartIndex = (boundedCustomerPage - 1) * CUSTOMER_PAGE_SIZE;
    const paginatedCustomers = useMemo(() => {
        return sortedCustomers.slice(customerPageStartIndex, customerPageStartIndex + CUSTOMER_PAGE_SIZE);
    }, [sortedCustomers, customerPageStartIndex]);
    const customerRangeStart = customerResultCount === 0 ? 0 : customerPageStartIndex + 1;
    const customerRangeEnd = Math.min(customerPageStartIndex + CUSTOMER_PAGE_SIZE, customerResultCount);

    useEffect(() => {
        setCustomerPage(1);
    }, [normalizedCustomerSearch, sortKey, sortDir]);

    useEffect(() => {
        setCustomerPage((page) => Math.min(page, customerPageCount));
    }, [customerPageCount]);

    const customerPaginationControls = customerResultCount > 0 ? (
        <div className="mt-3 flex flex-col gap-2 border-t border-[#3D3C36]/50 pt-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="font-mono text-[11px] text-[#C4C0B6]">
                Showing {customerRangeStart.toLocaleString()}-{customerRangeEnd.toLocaleString()} of {customerResultCount.toLocaleString()}
                {customerResultCount !== customers.length ? ` matching ${customers.length.toLocaleString()}` : ''}
            </div>
            <div className="flex items-center gap-2">
                <button
                    type="button"
                    onClick={() => setCustomerPage((page) => Math.max(1, page - 1))}
                    disabled={boundedCustomerPage <= 1}
                    className="grid h-8 w-8 place-items-center rounded-md border border-[#3D3C36] bg-[#24231F] text-[#C4C0B6] transition-colors hover:bg-[#2E2D28] hover:text-[#E8E4DD] disabled:cursor-not-allowed disabled:opacity-40"
                    aria-label="Previous customers page"
                >
                    <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                <div className="min-w-20 text-center font-mono text-[11px] text-[#C4C0B6]">
                    {boundedCustomerPage.toLocaleString()} / {customerPageCount.toLocaleString()}
                </div>
                <button
                    type="button"
                    onClick={() => setCustomerPage((page) => Math.min(customerPageCount, page + 1))}
                    disabled={boundedCustomerPage >= customerPageCount}
                    className="grid h-8 w-8 place-items-center rounded-md border border-[#3D3C36] bg-[#24231F] text-[#C4C0B6] transition-colors hover:bg-[#2E2D28] hover:text-[#E8E4DD] disabled:cursor-not-allowed disabled:opacity-40"
                    aria-label="Next customers page"
                >
                    <ChevronRight className="h-3.5 w-3.5" />
                </button>
            </div>
        </div>
    ) : null;

    return (
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 sm:px-6 sm:py-6 space-y-5 sm:space-y-8">
            <div className="flex items-center justify-end">
                <Button
                    onClick={() => {
                        cachedCustomers = null;
                        cachedDraftEmails = null;
                        fetchCustomers(false, true);
                        fetchDraftEmails();
                    }}
                    disabled={loadingCustomers}
                    variant="outline"
                    size="sm"
                    className="h-8 border-[#3D3C36] bg-[#24231F] hover:bg-[#2E2D28] text-[#C4C0B6] hover:text-[#E8E4DD] gap-1.5 sm:h-9"
                >
                    <RefreshCw className={`w-3.5 h-3.5 ${loadingCustomers ? 'animate-spin' : ''}`} />
                    <span className="hidden sm:inline">Refresh</span>
                </Button>
            </div>

            {error && (
                <div className="bg-[#C45D4A]/10 border border-[#C45D4A]/30 rounded-lg p-3 sm:p-4 flex items-center gap-3 text-[#C45D4A]">
                    <AlertCircle className="w-5 h-5 shrink-0" />
                    <p className="text-sm">{error}</p>
                </div>
            )}

            {loadingCustomers && customers.length === 0 ? (
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
                        <div className="mb-3 flex flex-col gap-3 sm:mb-4">
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                <h2 className="text-[15px] font-semibold text-[#E8E4DD] sm:text-lg">
                                    Customers
                                    <span className="ml-2 font-mono text-xs font-normal text-[#C4C0B6]">
                                        {customerResultCount === customers.length
                                            ? customers.length.toLocaleString()
                                            : `${customerResultCount.toLocaleString()}/${customers.length.toLocaleString()}`}
                                    </span>
                                </h2>
                                <div className="sm:w-80">
                                    <div className="relative min-w-0 sm:w-80">
                                        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#C4C0B6]/70" />
                                        <input
                                            type="search"
                                            value={customerSearch}
                                            onChange={(e) => setCustomerSearch(e.target.value)}
                                            placeholder="Email, account, source"
                                            aria-label="Search customers"
                                            className="h-9 w-full rounded-lg border border-[#3D3C36] bg-[#24231F] pl-8 pr-8 font-mono text-[12px] text-[#E8E4DD] outline-none transition-colors placeholder:text-[#C4C0B6]/45 focus:border-[#4CAF6E]/60"
                                        />
                                        {customerSearch && (
                                            <button
                                                type="button"
                                                onClick={() => setCustomerSearch('')}
                                                className="absolute right-2 top-1/2 grid h-5 w-5 -translate-y-1/2 place-items-center rounded-md text-[#C4C0B6] hover:bg-[#2E2D28] hover:text-[#E8E4DD]"
                                                aria-label="Clear customer search"
                                            >
                                                <X className="h-3.5 w-3.5" />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                            <div className="flex items-center gap-2 sm:hidden">
                                <select
                                    aria-label="Sort customers"
                                    value={sortKey}
                                    onChange={(e) => setSortKey(e.target.value as CustomerSortKey)}
                                    className="h-9 min-w-0 flex-1 rounded-lg border border-[#3D3C36] bg-[#24231F] px-2 text-xs text-[#E8E4DD]"
                                >
                                    <option value="operations">Operations</option>
                                    <option value="errorRate">Error Rate (30d)</option>
                                    <option value="budget">Annual Budget (USD)</option>
                                    <option value="accounts">Accounts</option>
                                    <option value="lastActive">Last Active</option>
                                    <option value="firstSeen">First Seen</option>
                                    <option value="email">Customer</option>
                                    <option value="plan">Plan</option>
                                </select>
                                <button
                                    type="button"
                                    onClick={() => setSortDir((d) => d === 'asc' ? 'desc' : 'asc')}
                                    className="grid h-9 w-9 place-items-center rounded-lg border border-[#3D3C36] bg-[#24231F] text-[#C4C0B6] hover:text-[#E8E4DD]"
                                    title={sortDir === 'asc' ? 'Ascending' : 'Descending'}
                                >
                                    {sortDir === 'asc' ? <ArrowUp className="w-3.5 h-3.5" /> : <ArrowDown className="w-3.5 h-3.5" />}
                                </button>
                            </div>
                        </div>
                        <div className="sm:hidden space-y-3">
                            {customerResultCount === 0 ? (
                                <div className="rounded-lg border border-dashed border-[#3D3C36] bg-[#24231F]/40 p-8 text-center">
                                    <Users className="mx-auto mb-3 h-7 w-7 text-[#C4C0B6]/30" />
                                    <p className="text-sm text-[#C4C0B6]">No customers match this search.</p>
                                </div>
                            ) : paginatedCustomers.map((c) => {
                                const { hasBudget, currency, flag, country, annualUsd, annualLocal } = deriveBudgetDisplay(c);
                                const totalCampaigns = c.accounts.reduce((s, a) => s + (a.activeCampaigns ?? 0), 0);
                                const attribution = c.attribution ?? {
                                    source: null,
                                    medium: null,
                                    campaign: null,
                                    term: null,
                                    content: null,
                                    referrer: null,
                                    label: 'Unknown source',
                                    detail: null,
                                };
                                const hasUtm = !!(attribution.source || attribution.medium || attribution.campaign || attribution.term || attribution.content);
                                const sourceDetail = attributionDetailLabel(attribution);
                                const sourceLabel = attributionDisplayLabel(attribution);
                                const captureLabel = hasUtm ? 'UTM' : attribution.referrer ? 'Referrer' : null;
                                return (
                                <div
                                    key={c.userId ?? c.primaryAccountId}
                                    onClick={() => router.push('/dev/' + c.primaryAccountId)}
                                    className="block cursor-pointer rounded-2xl border border-[#3D3C36] bg-[#24231F]/55 p-3 shadow-[0_12px_32px_rgba(0,0,0,0.16)] transition-colors active:bg-[#2E2D28]/80"
                                >
                                    <div className="mb-2.5 flex items-start gap-3">
                                        <div className="min-w-0 flex-1">
                                            {c.googleEmail ? (
                                                <button
                                                    type="button"
                                                    onClick={(e) => handleCopyEmail(c.googleEmail!, e)}
                                                    className="group/email flex max-w-full items-center gap-1.5 text-left text-[15px] font-medium leading-5 text-[#E8E4DD] hover:text-[#4CAF6E] transition-colors"
                                                >
                                                    <span className="truncate">{c.googleEmail}</span>
                                                    {copiedEmail === c.googleEmail ? (
                                                        <Check className="h-3.5 w-3.5 shrink-0 text-[#4CAF6E]" />
                                                    ) : (
                                                        <Copy className="h-3.5 w-3.5 shrink-0 opacity-50" />
                                                    )}
                                                </button>
                                            ) : (
                                                <div className="truncate text-[15px] font-medium leading-5 text-[#E8E4DD]">{c.userId || 'Unknown customer'}</div>
                                            )}
                                            <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5">
                                                <Link href={`/dev/${c.primaryAccountId}`} prefetch className="font-mono text-[11px] text-[#C4C0B6]/55 hover:text-[#E8E4DD] hover:underline">
                                                    {c.primaryAccountId}
                                                </Link>
                                                {flag && <span className="text-[13px] leading-none" title={country ?? undefined}>{flag}</span>}
                                                {c.outreachStatus === 'drafted' && (
                                                    <span className="rounded-full border border-[#D4882A]/30 bg-[#D4882A]/10 px-2 py-0.5 text-[10px] font-semibold text-[#D4882A]">Draft</span>
                                                )}
                                                {c.outreachStatus === 'contacted' && (
                                                    <span className="rounded-full border border-[#4CAF6E]/30 bg-[#4CAF6E]/10 px-2 py-0.5 text-[10px] font-semibold text-[#4CAF6E]">Sent</span>
                                                )}
                                                <PlanBadge plan={c.plan} inTrial={c.inTrial} />
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={(e) => handleViewAs(c.primaryAccountId, e)}
                                            disabled={impersonatingAccountId === c.primaryAccountId}
                                            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-[#3D3C36] bg-[#1A1917]/60 text-[#C4C0B6] transition-colors hover:border-[#D4882A]/40 hover:bg-[#D4882A]/15 hover:text-[#D4882A] disabled:opacity-50"
                                            title="View as this account"
                                        >
                                            {impersonatingAccountId === c.primaryAccountId
                                                ? <Loader2 className="h-4 w-4 animate-spin" />
                                                : <Eye className="h-4 w-4" />}
                                        </button>
                                    </div>

                                    <div className="grid grid-cols-3 divide-x divide-[#3D3C36]/60 rounded-xl border border-[#3D3C36]/60 bg-[#1A1917]/55 overflow-hidden">
                                        <div className="bg-[#4CAF6E]/[0.04] px-2.5 py-2">
                                            <div className="text-[9px] font-semibold uppercase tracking-widest text-[#C4C0B6]/60">Budget</div>
                                            <div className="mt-1 truncate font-mono text-[14px] font-semibold tabular-nums text-[#4CAF6E]">
                                                {hasBudget && annualUsd != null ? formatCurrency(annualUsd, 'USD', { compact: true }) : '—'}
                                            </div>
                                            {currency && currency !== 'USD' && (
                                                <div className="mt-0.5 truncate font-mono text-[9px] text-[#C4C0B6]/45">≈ {formatCurrency(annualLocal, currency, { compact: true })}</div>
                                            )}
                                        </div>
                                        <div className="px-2.5 py-2">
                                            <div className="text-[9px] font-semibold uppercase tracking-widest text-[#C4C0B6]/60">Ops</div>
                                            <div className="mt-1 font-mono text-[14px] font-semibold tabular-nums text-[#E8E4DD]">{c.totalOps > 0 ? c.totalOps.toLocaleString() : '—'}</div>
                                            {c.totalOps > 0 && <div className="mt-0.5 font-mono text-[9px] text-[#C4C0B6]/45">{c.reads.toLocaleString()}r · {c.writes.toLocaleString()}w</div>}
                                        </div>
                                        <div className="px-2.5 py-2">
                                            <div className="text-[9px] font-semibold uppercase tracking-widest text-[#C4C0B6]/60">Errors</div>
                                            {c.calls30d > 0 ? (
                                                <div className={`mt-1 font-mono text-[14px] font-semibold tabular-nums ${errorRateColor(c.errorRate)}`}>
                                                    {c.errorRate.toFixed(1)}%
                                                </div>
                                            ) : (
                                                <div className="mt-1 font-mono text-[14px] text-[#C4C0B6]/40">—</div>
                                            )}
                                            {c.calls30d > 0 && <div className="mt-0.5 font-mono text-[9px] text-[#C4C0B6]/45">{c.errorsCount}/{c.calls30d} calls</div>}
                                        </div>
                                    </div>

                                    <div className="mt-2 flex min-h-10 items-center justify-between gap-3 rounded-xl border border-[#3D3C36]/45 bg-[#1A1917]/35 px-3 py-1.5">
                                        <div className="flex min-w-0 items-center gap-2">
                                            <span className="shrink-0 text-[9px] font-semibold uppercase tracking-wider text-[#C4C0B6]/55">Source</span>
                                            <span className={`max-w-[122px] truncate rounded-full border px-2 py-0.5 text-[10px] font-medium ${attributionTone(attribution)}`} title={attribution.referrer ?? attribution.detail ?? undefined}>
                                                {sourceLabel}
                                            </span>
                                            {captureLabel && <span className="shrink-0 text-[10px] text-[#C4C0B6]/55">{captureLabel}</span>}
                                        </div>
                                        <div className="min-w-0 max-w-[38%] truncate text-right font-mono text-[10px] text-[#C4C0B6]/65" title={attribution.referrer ?? attribution.detail ?? undefined}>
                                            {sourceDetail}
                                        </div>
                                    </div>

                                    {c.accounts.length > 0 && (
                                        <details className="mt-2 rounded-lg border border-[#3D3C36]/45 bg-[#1A1917]/25" onClick={(e) => e.stopPropagation()}>
                                            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-[11px] text-[#C4C0B6]">
                                                <span className="min-w-0 truncate">Seen <span className="font-mono text-[#E8E4DD]">{formatDateShort(c.firstSeen)}</span> → <span className="font-mono text-[#E8E4DD]">{formatDateShort(c.lastActive)}</span></span>
                                                <span className="shrink-0"><span className="font-mono text-[#E8E4DD]">{c.accountCount}</span> acct · <span className="font-mono text-[#E8E4DD]">{totalCampaigns}</span> camp</span>
                                            </summary>
                                            <div className="space-y-1 border-t border-[#3D3C36]/45 p-2">
                                                {c.accounts.map((a) => {
                                                    const annualUsdAcct = a.dailyBudgetUsd != null ? a.dailyBudgetUsd * 365 : null;
                                                    return (
                                                        <Link key={a.id} href={`/dev/${a.id}`} prefetch onClick={(e) => e.stopPropagation()} className="flex items-center justify-between gap-2 rounded-md border border-[#3D3C36]/40 bg-[#1A1917] px-2 py-1.5 font-mono text-[10px] text-[#C4C0B6] transition-colors hover:border-[#4CAF6E]/30 hover:text-[#E8E4DD]">
                                                            <span className="inline-flex min-w-0 items-center gap-1 truncate">
                                                                {a.flag && <span title={a.country ?? undefined}>{a.flag}</span>}
                                                                <span className="truncate">{a.name || a.id}</span>
                                                            </span>
                                                            <span className="shrink-0 text-[#4CAF6E]">{annualUsdAcct != null ? `${formatCurrency(annualUsdAcct, 'USD', { compact: true })}/yr` : 'no budget'}</span>
                                                        </Link>
                                                    );
                                                })}
                                            </div>
                                        </details>
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
                                            { key: 'plan' as const, label: 'Plan' },
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
                                    {customerResultCount === 0 ? (
                                        <tr>
                                            <td colSpan={9} className="px-4 py-10 text-center">
                                                <Users className="mx-auto mb-3 h-7 w-7 text-[#C4C0B6]/30" />
                                                <p className="text-sm text-[#C4C0B6]">No customers match this search.</p>
                                            </td>
                                        </tr>
                                    ) : paginatedCustomers.map((c) => {
                                        const { hasBudget, currency, flag, country, annualUsd, annualLocal } = deriveBudgetDisplay(c);
                                        const totalCampaigns = c.accounts.reduce((s, a) => s + (a.activeCampaigns ?? 0), 0);
                                        return (
                                        <tr
                                            key={c.userId ?? c.primaryAccountId}
                                            onClick={() => router.push('/dev/' + c.primaryAccountId)}
                                            className="cursor-pointer border-b border-[#3D3C36]/50 hover:bg-[#24231F]/60 transition-colors"
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
                                                    <PlanBadge plan={c.plan} inTrial={c.inTrial} />
                                                </div>
                                                <div className="flex items-center gap-1.5 text-xs text-[#C4C0B6]/60 font-mono tabular-nums">
                                                    <Link href={`/dev/${c.primaryAccountId}`} prefetch onClick={(e) => e.stopPropagation()} className="hover:text-[#E8E4DD] hover:underline">
                                                        {c.primaryAccountId}
                                                    </Link>
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
                                            <td className="px-4 py-2.5">
                                                <PlanBadge plan={c.plan} inTrial={c.inTrial} />
                                                {c.plan === 'free' && !c.inTrial && (
                                                    <span className="text-xs text-[#C4C0B6]/40">Free</span>
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
                        {customerPaginationControls}
                </div>
            )}
        </div>
    );
}
