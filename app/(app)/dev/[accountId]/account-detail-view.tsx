'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { RefreshCw, AlertCircle, ArrowLeft, RotateCcw, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DeltaBadge } from '@/components/delta-badge';
import { formatAction, formatValue, ENTITY_BADGE_COLORS } from '@/lib/operations-format';
import { OutreachPanel } from './outreach-panel';
import { LatestAuditCard, AuditRow } from './audit-card';
import { ImpressionShareCard } from './impression-share-card';
import { ActivityPanel, type ActivityPanelHandle } from './activity-panel';
import type { AccountDetail } from './types';

const PERSONAL_EMAIL_DOMAINS = new Set([
    'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com',
    'aol.com', 'protonmail.com', 'proton.me', 'live.com', 'me.com', 'msn.com',
]);

function deriveWebsiteUrl(email: string): string | null {
    const at = email.lastIndexOf('@');
    if (at < 0) return null;
    const domain = email.slice(at + 1).toLowerCase().trim();
    if (!domain || PERSONAL_EMAIL_DOMAINS.has(domain)) return null;
    return `https://${domain}`;
}

// Module-level cache — survives client-side navigations
let cachedDetail: { accountId: string; data: AccountDetail } | null = null;

export function AccountDetailView({
    accountId,
    initialDetail,
}: {
    accountId: string;
    initialDetail: AccountDetail | null;
}) {
    const [data, setData] = useState<AccountDetail | null>(() => {
        // Prefer in-flight module cache (back-nav), then server-prefetched initial
        if (cachedDetail?.accountId === accountId) return cachedDetail.data;
        if (initialDetail) {
            cachedDetail = { accountId, data: initialDetail };
            return initialDetail;
        }
        return null;
    });
    const [loading, setLoading] = useState(!data);
    const [error, setError] = useState<string | null>(null);
    const activityRef = useRef<ActivityPanelHandle>(null);

    const fetchDetail = useCallback(async (background = false) => {
        if (!background) setLoading(true);
        setError(null);
        try {
            const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
            const res = await fetch(`/api/dev/${accountId}?tz=${encodeURIComponent(tz)}`, { credentials: 'include' });
            if (res.status === 403) { setError('Access denied'); return; }
            if (!res.ok) throw new Error('Failed to fetch');
            const result: AccountDetail = await res.json();
            setData(result);
            cachedDetail = { accountId, data: result };
        } catch {
            setError('Failed to load account details');
        } finally {
            setLoading(false);
        }
    }, [accountId]);

    useEffect(() => {
        fetchDetail(!!data);
    }, [fetchDetail]);

    const maxDaily = Math.max(data?.dailyUsage.reduce((max, d) => Math.max(max, d.total), 0) ?? 0, 1);
    const websiteUrl = data?.email ? deriveWebsiteUrl(data.email) : null;
    const businessName = data?.connectedAccounts[0]?.name ?? null;

    return (
        <section className="flex min-h-0 h-full flex-col overflow-hidden">
            <header className="shrink-0 border-b border-[#3D3C36] bg-[#24231F]/80 backdrop-blur-xl">
                <div className="flex w-full items-center gap-3 px-4 py-3 sm:px-6">
                    <Link
                        href="/dev"
                        className="flex items-center justify-center rounded-lg p-1.5 text-[#C4C0B6] hover:bg-[#E8E4DD]/6 hover:text-[#E8E4DD] transition-colors shrink-0"
                    >
                        <ArrowLeft className="w-4 h-4" />
                    </Link>
                    <div className="min-w-0 flex-1 flex items-baseline gap-3 flex-wrap">
                        <h1 className="text-base sm:text-lg font-semibold tracking-tight text-[#E8E4DD] truncate">
                            {businessName ?? data?.email ?? `Account ${accountId}`}
                        </h1>
                        {data?.email && (
                            <span className="text-xs text-[#C4C0B6] font-mono truncate">{data.email}</span>
                        )}
                        <span className="text-[10px] text-[#C4C0B6]/70 font-mono tabular-nums">{accountId}</span>
                        {websiteUrl && (
                            <a
                                href={websiteUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 text-xs text-[#4CAF6E] hover:underline"
                            >
                                {websiteUrl.replace(/^https?:\/\//, '')}
                                <ExternalLink className="w-3 h-3" />
                            </a>
                        )}
                        {data?.lastLogin && (
                            <span className="text-[10px] text-[#C4C0B6]/70">
                                last login {new Date(data.lastLogin).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                            </span>
                        )}
                    </div>
                    <Button
                        onClick={() => {
                            cachedDetail = null;
                            fetchDetail(false);
                            activityRef.current?.refresh();
                        }}
                        disabled={loading}
                        variant="outline"
                        size="sm"
                        className="border-[#3D3C36] bg-[#24231F] hover:bg-[#2E2D28] text-[#C4C0B6] hover:text-[#E8E4DD] gap-1.5 shrink-0"
                    >
                        <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                        <span className="hidden sm:inline">Refresh</span>
                    </Button>
                </div>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-6 space-y-6">
                {error && (
                    <div className="bg-[#C45D4A]/10 border border-[#C45D4A]/30 rounded-lg p-3 flex items-center gap-3 text-[#C45D4A]">
                        <AlertCircle className="w-5 h-5 shrink-0" />
                        <p className="text-sm">{error}</p>
                    </div>
                )}

                {loading && !data ? (
                    <div className="flex flex-col items-center justify-center py-20 gap-4">
                        <div className="w-8 h-8 border-2 border-[#4CAF6E] border-t-transparent rounded-full animate-spin" />
                        <p className="text-[#C4C0B6] animate-pulse text-sm">Loading account details...</p>
                    </div>
                ) : data ? (
                    <>
                        {/* Two-column command center: audit (left) + reach out (right) */}
                        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 lg:gap-6">
                            {/* LEFT: audit (60%) */}
                            <div className="lg:col-span-3 space-y-4">
                                {data.auditHistory.length > 0 ? (
                                    <LatestAuditCard audit={data.auditHistory[0]} />
                                ) : (
                                    <div className="rounded-xl border border-[#3D3C36] bg-[#24231F]/40 p-8 text-center text-sm text-[#C4C0B6]">
                                        No audit yet for this account.
                                    </div>
                                )}
                                {data.auditHistory[0]?.impressionShareDiagnosis && (
                                    <ImpressionShareCard diagnosis={data.auditHistory[0].impressionShareDiagnosis} />
                                )}
                            </div>

                            {/* RIGHT: reach out (40%, sticky on desktop) */}
                            <div className="lg:col-span-2">
                                {data.email && (
                                    <div className="lg:sticky lg:top-0">
                                        <OutreachPanel email={data.email} alwaysOpen />
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Past audits (collapsed by default for context) */}
                        {data.auditHistory.length > 1 && (
                            <details className="group">
                                <summary className="cursor-pointer list-none flex items-center gap-2 text-xs text-[#C4C0B6] uppercase tracking-widest hover:text-[#E8E4DD] transition-colors">
                                    <span className="group-open:rotate-90 transition-transform">&#9654;</span>
                                    Past audits ({data.auditHistory.length - 1})
                                </summary>
                                <div className="mt-3 space-y-2">
                                    {data.auditHistory.slice(1).map(audit => (
                                        <AuditRow key={audit.id} audit={audit} />
                                    ))}
                                </div>
                            </details>
                        )}

                        {/* Daily usage (14d) */}
                        {data.dailyUsage.length > 0 && (
                            <details className="group">
                                <summary className="cursor-pointer list-none flex items-center gap-2 text-xs text-[#C4C0B6] uppercase tracking-widest hover:text-[#E8E4DD] transition-colors mb-3">
                                    <span className="group-open:rotate-90 transition-transform">&#9654;</span>
                                    Usage (14d) · {data.dailyUsage.reduce((s, d) => s + d.total, 0)} ops
                                </summary>
                                <div className="space-y-1.5">
                                    {data.dailyUsage.map(day => (
                                        <div key={day.date} className="flex items-center gap-3">
                                            <span className="w-[72px] shrink-0 text-xs text-[#C4C0B6] font-mono tabular-nums">
                                                {day.date.slice(5)}
                                            </span>
                                            <div className="flex-1 flex items-center gap-0.5 h-4">
                                                <div
                                                    className="h-3 rounded-sm bg-[#4CAF6E]/60"
                                                    style={{ width: `${(day.reads / maxDaily) * 100}%` }}
                                                />
                                                <div
                                                    className="h-3 rounded-sm bg-[#D4882A]/60"
                                                    style={{ width: `${(day.writes / maxDaily) * 100}%` }}
                                                />
                                            </div>
                                            <span className="w-[40px] shrink-0 text-right text-xs text-[#E8E4DD] font-mono tabular-nums">
                                                {day.total}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                                <div className="flex items-center gap-4 mt-2 text-[10px] text-[#C4C0B6] uppercase tracking-widest">
                                    <span className="flex items-center gap-1.5">
                                        <span className="w-2 h-2 rounded-sm bg-[#4CAF6E]/60" /> Reads
                                    </span>
                                    <span className="flex items-center gap-1.5">
                                        <span className="w-2 h-2 rounded-sm bg-[#D4882A]/60" /> Writes
                                    </span>
                                </div>
                            </details>
                        )}

                        {/* Campaigns touched */}
                        {data.campaigns.length > 0 && (
                            <details className="group">
                                <summary className="cursor-pointer list-none flex items-center gap-2 text-xs text-[#C4C0B6] uppercase tracking-widest hover:text-[#E8E4DD] transition-colors mb-3">
                                    <span className="group-open:rotate-90 transition-transform">&#9654;</span>
                                    Campaigns touched ({data.campaigns.length})
                                </summary>
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                                    {data.campaigns.map(c => (
                                        <div
                                            key={c.campaignId ?? 'null'}
                                            className="border border-[#3D3C36] rounded-lg bg-[#24231F]/40 p-3"
                                        >
                                            <div className="text-xs text-[#C4C0B6] font-mono tabular-nums truncate">
                                                {c.campaignId ?? 'No campaign ID'}
                                            </div>
                                            <div className="flex items-center gap-4 mt-2">
                                                <div>
                                                    <div className="text-[10px] text-[#C4C0B6] uppercase tracking-widest">Ops</div>
                                                    <div className="text-sm text-[#E8E4DD] font-mono tabular-nums">{c.totalOps}</div>
                                                </div>
                                                <div>
                                                    <div className="text-[10px] text-[#C4C0B6] uppercase tracking-widest">Writes</div>
                                                    <div className="text-sm text-[#D4882A] font-mono tabular-nums">{c.writes}</div>
                                                </div>
                                                <div className="ml-auto text-[10px] text-[#C4C0B6] font-mono">
                                                    {new Date(c.lastOp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </details>
                        )}

                        {/* Recent operations */}
                        <details className="group">
                            <summary className="cursor-pointer list-none flex items-center gap-2 text-xs text-[#C4C0B6] uppercase tracking-widest hover:text-[#E8E4DD] transition-colors mb-3">
                                <span className="group-open:rotate-90 transition-transform">&#9654;</span>
                                Recent operations ({data.recentOperations.length})
                            </summary>
                            {data.recentOperations.length === 0 ? (
                                <div className="text-center py-12 border border-[#3D3C36] rounded-lg bg-[#24231F]/40">
                                    <p className="text-sm text-[#C4C0B6]">No operations recorded</p>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {data.recentOperations.map(op => (
                                        <div key={op.id} className="border border-[#3D3C36] rounded-lg bg-[#24231F]/40 p-3">
                                            <div className="flex items-center justify-between gap-2 mb-1.5">
                                                <div className="flex items-center gap-2 min-w-0">
                                                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide ${op.opType === 'write' ? 'bg-amber-500/15 text-amber-400' : 'bg-emerald-500/15 text-emerald-400'}`}>
                                                        {op.opType}
                                                    </span>
                                                    <span className="text-sm font-medium text-[#E8E4DD]">
                                                        {formatAction(op.action)}
                                                    </span>
                                                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded border text-[10px] font-medium ${ENTITY_BADGE_COLORS[op.entityType] ?? ENTITY_BADGE_COLORS.unknown}`}>
                                                        {op.entityType}
                                                    </span>
                                                    {op.rolledBack && (
                                                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded border text-[10px] font-medium bg-[#C4C0B6]/10 text-[#C4C0B6] border-[#C4C0B6]/20">
                                                            <RotateCcw className="w-2.5 h-2.5" />
                                                            Reverted
                                                        </span>
                                                    )}
                                                    {op.source && (
                                                        <span className="inline-flex items-center px-1.5 py-0.5 rounded border text-[10px] font-medium bg-[#4A90D9]/10 text-[#4A90D9] border-[#4A90D9]/20">
                                                            {op.source}
                                                        </span>
                                                    )}
                                                </div>
                                                <span className="text-[10px] text-[#C4C0B6] font-mono tabular-nums whitespace-nowrap shrink-0">
                                                    {new Date(op.timestamp).toLocaleString(undefined, {
                                                        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                                                    })}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-2 text-xs font-mono">
                                                <span className="text-[#C4C0B6] tabular-nums">{formatValue(op.action, op.beforeValue)}</span>
                                                <DeltaBadge before={op.beforeValue} after={op.afterValue} />
                                                <span className="text-[#E8E4DD] tabular-nums">{formatValue(op.action, op.afterValue)}</span>
                                            </div>
                                            {op.reasoning && (
                                                <p className="text-xs text-[#C4C0B6] mt-1.5 line-clamp-2">{op.reasoning}</p>
                                            )}
                                            {op.campaignId && (
                                                <p className="text-[10px] text-[#C4C0B6]/60 font-mono mt-1">Campaign {op.campaignId}</p>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </details>

                        {/* Activity section */}
                        <ActivityPanel ref={activityRef} accountId={accountId} />
                    </>
                ) : null}
            </div>
        </section>
    );
}
