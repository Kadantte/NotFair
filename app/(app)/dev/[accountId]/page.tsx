'use client';

import { Fragment, useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { RefreshCw, AlertCircle, ArrowLeft, RotateCcw, ExternalLink, ChevronDown, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DeltaBadge } from '@/components/delta-badge';
import { formatAction, formatValue, ENTITY_BADGE_COLORS } from '@/lib/operations-format';
import { OutreachPanel } from './outreach-panel';
import { formatTime, formatBytes, errorRateColor, DEV_RANGE_OPTIONS, RangePicker } from '@/lib/dev-format';
import type { ActivityCall, ActivityStats, ActivityPayload } from '@/lib/dev-types';

type Operation = {
    id: number;
    opType: 'read' | 'write';
    action: string;
    entityType: string;
    entityId: string;
    campaignId: string | null;
    beforeValue: string;
    afterValue: string;
    reasoning: string | null;
    rolledBack: boolean;
    source: string | null;
    timestamp: string;
};

type CampaignStat = {
    campaignId: string | null;
    totalOps: number;
    writes: number;
    lastOp: string;
};

type DailyUsage = {
    date: string;
    reads: number;
    writes: number;
    total: number;
};

type CampaignISBreakdown = {
    campaignName: string;
    impressionShare: number | null;
    budgetLostIS: number | null;
    rankLostIS: number | null;
    totalImpressions: number;
    totalCost: number;
    diagnosis: 'budget' | 'rank' | 'structural' | 'healthy';
};

type ImpressionShareDiagnosis = {
    avgIS: number | null;
    budgetLost: number | null;
    rankLost: number | null;
    diagnosis: string;
    campaignBreakdown: CampaignISBreakdown[];
};

type AuditSnapshot = {
    id: number;
    overallScore: number;
    category: string;
    wasteRate: number;
    demandCaptured: number | null;
    cpa: number | null;
    wastedSpend: number;
    totalSpend: number;
    campaignCount: number;
    topActions: Array<{ action: string; impact: string }>;
    impressionShareDiagnosis: ImpressionShareDiagnosis | null;
    createdAt: string;
};

type AccountDetail = {
    accountId: string;
    email: string | null;
    connectedAccounts: { id: string; name: string }[];
    lastLogin: string | null;
    recentOperations: Operation[];
    dailyUsage: DailyUsage[];
    campaigns: CampaignStat[];
    auditHistory: AuditSnapshot[];
};

let cachedDetail: { accountId: string; data: AccountDetail } | null = null;
const activityCache = new Map<string, ActivityPayload>();

export default function DevAccountDetailPage() {
    const { accountId } = useParams<{ accountId: string }>();
    const [data, setData] = useState<AccountDetail | null>(
        cachedDetail?.accountId === accountId ? cachedDetail.data : null,
    );
    const [loading, setLoading] = useState(!data);
    const [error, setError] = useState<string | null>(null);

    // Activity section state
    const [activityDays, setActivityDays] = useState(30);
    const [activityData, setActivityData] = useState<ActivityPayload | null>(
        activityCache.get(`${accountId}|30`) ?? null,
    );
    const [activityLoading, setActivityLoading] = useState(!activityData);
    const [expandedCallId, setExpandedCallId] = useState<number | null>(null);

    const fetchActivity = useCallback(async (days: number, background = false) => {
        const key = `${accountId}|${days}`;
        const cached = activityCache.get(key);
        if (cached) {
            setActivityData(cached);
            if (background) return;
        }
        if (!background || !cached) setActivityLoading(true);
        try {
            const res = await fetch(`/api/dev/${accountId}/activity?days=${days}`, { credentials: 'include' });
            if (!res.ok) return;
            const payload: ActivityPayload = await res.json();
            setActivityData(payload);
            activityCache.set(key, payload);
        } catch { /* best-effort */ } finally {
            setActivityLoading(false);
        }
    }, [accountId]);

    useEffect(() => {
        fetchActivity(activityDays, !!activityCache.get(`${accountId}|${activityDays}`));
    }, [fetchActivity, activityDays, accountId]);

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
                            activityCache.delete(`${accountId}|${activityDays}`);
                            fetchDetail(false);
                            fetchActivity(activityDays, false);
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
                                    <ImpressionAnalysisCard diagnosis={data.auditHistory[0].impressionShareDiagnosis} />
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

                        {/* ── Activity section ── */}
                        <div className="border border-[#3D3C36] rounded-xl bg-[#24231F]/60 overflow-hidden">
                            <div className="flex items-center justify-between px-4 py-3 border-b border-[#3D3C36]">
                                <h2 className="text-sm font-semibold text-[#E8E4DD]">Activity</h2>
                                <RangePicker
                                    options={DEV_RANGE_OPTIONS}
                                    value={activityDays}
                                    onChange={setActivityDays}
                                />
                            </div>

                            {activityLoading && !activityData ? (
                                <div className="flex items-center justify-center py-8">
                                    <div className="w-5 h-5 border-2 border-[#4CAF6E] border-t-transparent rounded-full animate-spin" />
                                </div>
                            ) : activityData ? (
                                <>
                                    {/* Stat row */}
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-0 divide-x divide-[#3D3C36] border-b border-[#3D3C36]">
                                        {[
                                            { label: 'Calls', value: activityData.stats.calls.toLocaleString() },
                                            { label: 'Errors', value: activityData.stats.errors.toLocaleString(), color: activityData.stats.errors > 0 ? 'text-[#C45D4A]' : undefined },
                                            { label: 'Error Rate', value: `${activityData.stats.errorRate.toFixed(1)}%`, color: activityData.stats.errorRate > 0 ? errorRateColor(activityData.stats.errorRate) : undefined },
                                            { label: 'p50 Latency', value: activityData.stats.p50 > 0 ? `${activityData.stats.p50}ms` : '—' },
                                        ].map((s) => (
                                            <div key={s.label} className="px-4 py-3">
                                                <div className="text-[10px] font-semibold text-[#C4C0B6] uppercase tracking-widest">{s.label}</div>
                                                <div className={`text-lg font-mono tabular-nums font-semibold mt-0.5 ${s.color ?? 'text-[#E8E4DD]'}`}>{s.value}</div>
                                            </div>
                                        ))}
                                    </div>

                                    {/* Recent calls (errors-first) */}
                                    {activityData.recentCalls.length === 0 ? (
                                        <div className="px-4 py-8 text-center text-sm text-[#5DBE82]">
                                            No errors in this range.
                                        </div>
                                    ) : (
                                        <div className="divide-y divide-[#3D3C36]/50 max-h-[480px] overflow-y-auto">
                                            {activityData.recentCalls.map((call) => {
                                                const isExpanded = expandedCallId === call.id;
                                                return (
                                                    <Fragment key={call.id}>
                                                        <div
                                                            className={`px-4 py-2.5 cursor-pointer hover:bg-[#2E2D28] transition-colors ${call.errorClass ? 'bg-[#C45D4A]/[0.03]' : ''}`}
                                                            onClick={() => setExpandedCallId(isExpanded ? null : call.id)}
                                                        >
                                                            <div className="flex items-center gap-3">
                                                                <div className="min-w-0 flex-1">
                                                                    <div className="flex items-center gap-2 text-[13px]">
                                                                        <span className="font-mono text-[#E8E4DD] truncate">
                                                                            {call.toolName ?? '—'}
                                                                        </span>
                                                                        <span className={`text-[10px] font-medium uppercase px-1 py-0.5 rounded ${call.opType === 'write' ? 'bg-[#D4882A]/15 text-[#D4882A]' : 'bg-[#4CAF6E]/15 text-[#4CAF6E]'}`}>
                                                                            {call.opType}
                                                                        </span>
                                                                        {call.errorClass && (
                                                                            <span className="text-[11px] font-mono text-[#C45D4A] bg-[#C45D4A]/10 px-1.5 py-0.5 rounded">
                                                                                {call.errorClass}
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                    <div className="text-[11px] text-[#C4C0B6] font-mono mt-0.5">
                                                                        {formatTime(call.createdAt)}
                                                                        {call.latencyMs != null && <span className="ml-2">{call.latencyMs}ms</span>}
                                                                        {call.bytesOut != null && <span className="ml-2">{formatBytes(call.bytesOut)}</span>}
                                                                        {call.clientSource && <span className="ml-2 text-[#C4C0B6]/60">{call.clientSource}</span>}
                                                                    </div>
                                                                </div>
                                                                {isExpanded
                                                                    ? <ChevronDown className="w-3.5 h-3.5 text-[#C4C0B6] shrink-0" />
                                                                    : <ChevronRight className="w-3.5 h-3.5 text-[#C4C0B6] shrink-0" />
                                                                }
                                                            </div>
                                                        </div>
                                                        {isExpanded && (
                                                            <div className="px-4 py-3 bg-[#1A1917] space-y-2 text-[12px] font-mono">
                                                                {call.errorMessage && (
                                                                    <div>
                                                                        <div className="text-[10px] uppercase tracking-wide text-[#C45D4A] mb-1">Error</div>
                                                                        <pre className="overflow-x-auto rounded bg-[#C45D4A]/10 p-2 text-[11px] text-[#C45D4A] whitespace-pre-wrap">{call.errorMessage}</pre>
                                                                    </div>
                                                                )}
                                                                <div>
                                                                    <div className="text-[10px] uppercase tracking-wide text-[#C4C0B6] mb-1">Args</div>
                                                                    <pre className="overflow-x-auto rounded bg-[#24231F] p-2 text-[11px] text-[#E8E4DD] whitespace-pre-wrap">{JSON.stringify(call.args ?? null, null, 2)}</pre>
                                                                </div>
                                                            </div>
                                                        )}
                                                    </Fragment>
                                                );
                                            })}
                                        </div>
                                    )}
                                </>
                            ) : (
                                <div className="px-4 py-8 text-center text-sm text-[#C4C0B6]">No activity data available.</div>
                            )}
                        </div>
                    </>
                ) : null}
            </div>
        </section>
    );
}

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

const CATEGORY_COLORS: Record<string, string> = {
    Critical: 'text-[#C45D4A]',
    'Needs Work': 'text-[#D4882A]',
    OK: 'text-[#C4C0B6]',
    Strong: 'text-[#4CAF6E]',
    Excellent: 'text-[#4CAF6E]',
};

function scoreColor(score: number) {
    if (score >= 80) return 'text-[#4CAF6E]';
    if (score >= 60) return 'text-[#C4C0B6]';
    if (score >= 40) return 'text-[#D4882A]';
    return 'text-[#C45D4A]';
}

function LatestAuditCard({ audit }: { audit: AuditSnapshot }) {
    const created = new Date(audit.createdAt);
    return (
        <div className="border border-[#3D3C36] rounded-xl bg-[#24231F]/60 overflow-hidden">
            <div className="px-4 py-3 sm:px-5 sm:py-4 border-b border-[#3D3C36]/60 flex items-center gap-4 flex-wrap">
                <div className="flex items-baseline gap-2">
                    <span className={`text-3xl sm:text-4xl font-semibold font-mono tabular-nums ${scoreColor(audit.overallScore)}`}>
                        {audit.overallScore}
                    </span>
                    <span className="text-[10px] text-[#C4C0B6] uppercase tracking-widest">/ 100</span>
                </div>
                <span className={`text-sm font-medium ${CATEGORY_COLORS[audit.category] ?? 'text-[#C4C0B6]'}`}>
                    {audit.category}
                </span>
                <div className="ml-auto flex items-center gap-3 sm:gap-4 text-xs text-[#C4C0B6] flex-wrap">
                    <span>${audit.totalSpend.toFixed(0)} spend</span>
                    {audit.cpa !== null && <span>CPA ${audit.cpa.toFixed(2)}</span>}
                    {audit.demandCaptured !== null && <span>{audit.demandCaptured.toFixed(0)}% demand</span>}
                    <span>{audit.campaignCount} campaign{audit.campaignCount === 1 ? '' : 's'}</span>
                    <span className="font-mono tabular-nums text-[#C4C0B6]/70">
                        {created.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                    </span>
                </div>
            </div>
            {audit.topActions.length > 0 && (
                <div className="px-4 py-3 sm:px-5 sm:py-4 space-y-2">
                    <div className="text-[10px] text-[#C4C0B6] uppercase tracking-widest mb-1">Top actions</div>
                    {audit.topActions.map((item, i) => (
                        <div key={i} className="flex items-start gap-2 text-[13px]">
                            <span className="text-[#D4882A] shrink-0 mt-0.5">&#8226;</span>
                            <div className="min-w-0">
                                <span className="text-[#E8E4DD]">{item.action}</span>
                                {item.impact && (
                                    <span className="text-[#C4C0B6] ml-1.5">— {item.impact}</span>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

function pct(value: number | null): string {
    if (value === null || Number.isNaN(value)) return '--';
    return `${(value * 100).toFixed(0)}%`;
}

const DIAGNOSIS_BADGE: Record<CampaignISBreakdown['diagnosis'], { label: string; cls: string }> = {
    healthy: { label: 'Healthy', cls: 'bg-[#4CAF6E]/15 text-[#4CAF6E]' },
    budget: { label: 'Budget-limited', cls: 'bg-[#D4882A]/15 text-[#D4882A]' },
    rank: { label: 'Rank-limited', cls: 'bg-[#C45D4A]/15 text-[#C45D4A]' },
    structural: { label: 'Structural', cls: 'bg-[#C45D4A]/20 text-[#C45D4A]' },
};

function ImpressionAnalysisCard({ diagnosis }: { diagnosis: ImpressionShareDiagnosis }) {
    const sorted = [...diagnosis.campaignBreakdown].sort(
        (a, b) => b.totalImpressions - a.totalImpressions,
    );
    return (
        <div className="border border-[#3D3C36] rounded-xl bg-[#24231F]/60 overflow-hidden">
            <div className="px-4 py-3 sm:px-5 sm:py-4 border-b border-[#3D3C36]/60">
                <div className="flex items-baseline justify-between gap-3 mb-1">
                    <h2 className="text-base sm:text-lg font-semibold text-[#E8E4DD]">Impression analysis</h2>
                    <div className="flex items-baseline gap-3 text-xs text-[#C4C0B6]">
                        <span><span className="text-[#E8E4DD] font-mono tabular-nums">{pct(diagnosis.avgIS)}</span> captured</span>
                        <span><span className="text-[#D4882A] font-mono tabular-nums">{pct(diagnosis.budgetLost)}</span> lost to budget</span>
                        <span><span className="text-[#C45D4A] font-mono tabular-nums">{pct(diagnosis.rankLost)}</span> lost to rank</span>
                    </div>
                </div>
                {/* Stacked bar */}
                <div className="mt-2 h-2 w-full rounded-full bg-[#1A1917] overflow-hidden flex">
                    <div className="h-full bg-[#4CAF6E]" style={{ width: `${(diagnosis.avgIS ?? 0) * 100}%` }} />
                    <div className="h-full bg-[#D4882A]" style={{ width: `${(diagnosis.budgetLost ?? 0) * 100}%` }} />
                    <div className="h-full bg-[#C45D4A]" style={{ width: `${(diagnosis.rankLost ?? 0) * 100}%` }} />
                </div>
                <p className="text-[12px] text-[#C4C0B6] mt-2 leading-relaxed">{diagnosis.diagnosis}</p>
            </div>
            {sorted.length > 0 && (
                <div className="divide-y divide-[#3D3C36]/40">
                    {sorted.map((c) => {
                        const badge = DIAGNOSIS_BADGE[c.diagnosis];
                        return (
                            <div key={c.campaignName} className="px-4 py-3 sm:px-5">
                                <div className="flex items-center justify-between gap-3 mb-1.5">
                                    <span className="text-[13px] text-[#E8E4DD] font-medium truncate">{c.campaignName}</span>
                                    <span className={`shrink-0 inline-block rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider ${badge.cls}`}>
                                        {badge.label}
                                    </span>
                                </div>
                                <div className="flex items-center gap-3 text-[11px] text-[#C4C0B6] font-mono tabular-nums">
                                    <span>IS {pct(c.impressionShare)}</span>
                                    <span className="text-[#D4882A]">budget {pct(c.budgetLostIS)}</span>
                                    <span className="text-[#C45D4A]">rank {pct(c.rankLostIS)}</span>
                                    <span className="ml-auto text-[#C4C0B6]/70">{c.totalImpressions.toLocaleString()} impr · ${c.totalCost.toFixed(0)}</span>
                                </div>
                                <div className="mt-1.5 h-1.5 w-full rounded-full bg-[#1A1917] overflow-hidden flex">
                                    <div className="h-full bg-[#4CAF6E]" style={{ width: `${(c.impressionShare ?? 0) * 100}%` }} />
                                    <div className="h-full bg-[#D4882A]" style={{ width: `${(c.budgetLostIS ?? 0) * 100}%` }} />
                                    <div className="h-full bg-[#C45D4A]" style={{ width: `${(c.rankLostIS ?? 0) * 100}%` }} />
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

function AuditRow({ audit }: { audit: AuditSnapshot }) {
    const [expanded, setExpanded] = useState(false);
    return (
        <div className="border border-[#3D3C36] rounded-lg bg-[#24231F]/40">
            <button
                type="button"
                onClick={() => setExpanded(!expanded)}
                className="w-full p-3 flex items-center gap-3 text-left hover:bg-[#E8E4DD]/5 transition-colors rounded-lg"
            >
                {/* Score */}
                <span className={`text-lg font-semibold font-mono tabular-nums w-10 shrink-0 ${scoreColor(audit.overallScore)}`}>
                    {audit.overallScore}
                </span>
                {/* Category badge */}
                <span className={`text-xs font-medium ${CATEGORY_COLORS[audit.category] ?? 'text-[#C4C0B6]'}`}>
                    {audit.category}
                </span>
                {/* Key metrics */}
                <span className="hidden sm:flex items-center gap-3 text-xs text-[#C4C0B6] ml-auto mr-2">
                    <span>Waste: {audit.wasteRate.toFixed(0)}%</span>
                    {audit.cpa !== null && <span>CPA: ${audit.cpa.toFixed(2)}</span>}
                    <span>${audit.totalSpend.toFixed(0)} spend</span>
                    <span>{audit.campaignCount} campaigns</span>
                </span>
                {/* Date */}
                <span className="text-[10px] text-[#C4C0B6] font-mono tabular-nums whitespace-nowrap shrink-0 ml-auto sm:ml-0">
                    {new Date(audit.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                    {' '}
                    {new Date(audit.createdAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                </span>
                {/* Expand indicator */}
                <span className={`text-[#C4C0B6] text-xs transition-transform ${expanded ? 'rotate-90' : ''}`}>
                    &#9654;
                </span>
            </button>
            {expanded && audit.topActions.length > 0 && (
                <div className="px-3 pb-3 pt-0 border-t border-[#3D3C36]">
                    <div className="pt-2 space-y-1.5">
                        {audit.topActions.map((item, i) => (
                            <div key={i} className="flex items-start gap-2 text-xs">
                                <span className="text-[#D4882A] shrink-0 mt-0.5">&#8226;</span>
                                <div>
                                    <span className="text-[#E8E4DD]">{item.action}</span>
                                    {item.impact && (
                                        <span className="text-[#C4C0B6] ml-1.5">— {item.impact}</span>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
