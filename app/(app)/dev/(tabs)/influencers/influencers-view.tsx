'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
    AlertCircle, ChevronDown, ChevronRight, Clock, ExternalLink, Filter, Loader2,
    Plus, RefreshCw, Send, Sparkles, Users, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    addInfluencerAction,
    deleteInfluencerAction,
    generateInfluencerDraftAction,
    getInfluencersAction,
    type InfluencerInput,
    type InfluencerRow,
} from '@/app/(app)/influencers/actions';
import { scheduleContactAction, sendOutreachAction } from '@/app/(app)/outreach/actions';
import { STATUS_CONFIG } from '@/lib/outreach-metrics';
import { nextBusinessSendTimePT } from '@/lib/scheduling';
import { formatCompactNumber } from '@/app/(app)/dev/_components/dev-utils';
import {
    FOLLOWER_MAX, FOLLOWER_MIN, PLATFORMS, PLATFORM_LABELS, isInFollowerRange,
    type Platform,
} from '@/app/(app)/influencers/types';

type Props = {
    initialInfluencers?: InfluencerRow[];
};

type RangeFilter = 'all' | 'in-range' | 'out-of-range' | 'unknown';

export function InfluencersView({ initialInfluencers }: Props) {
    const [influencers, setInfluencers] = useState<InfluencerRow[]>(initialInfluencers ?? []);
    const [loading, setLoading] = useState(!initialInfluencers);
    const [error, setError] = useState<string | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);
    const [statusFilter, setStatusFilter] = useState<string>('all');
    const [platformFilter, setPlatformFilter] = useState<string>('all');
    const [rangeFilter, setRangeFilter] = useState<RangeFilter>('all');
    const [showAddForm, setShowAddForm] = useState(false);
    const [generatingId, setGeneratingId] = useState<number | null>(null);
    const [sendingId, setSendingId] = useState<number | null>(null);
    const [schedulingId, setSchedulingId] = useState<number | null>(null);
    const [deletingId, setDeletingId] = useState<number | null>(null);

    const refresh = useCallback(async (background = false) => {
        if (!background) setLoading(true);
        try {
            const list = await getInfluencersAction();
            setInfluencers(list);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load influencers');
        } finally {
            setLoading(false);
        }
    }, []);

    // Only fetch on mount when SSR didn't supply data (e.g., action threw a
    // transient error). When `initialInfluencers` is present, trust it — the
    // server just produced fresh rows; re-fetching would flicker the list.
    useEffect(() => {
        if (!initialInfluencers) refresh(false);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const stats = useMemo(() => deriveStats(influencers), [influencers]);

    const filtered = useMemo(() => {
        return influencers.filter((row) => {
            if (statusFilter !== 'all' && row.status !== statusFilter) return false;
            if (platformFilter !== 'all' && (row.platform ?? '') !== platformFilter) return false;
            return matchesRange(row.followerCount, rangeFilter);
        });
    }, [influencers, statusFilter, platformFilter, rangeFilter]);

    async function handleAdd(input: InfluencerInput) {
        setActionError(null);
        try {
            await addInfluencerAction(input);
            await refresh(true);
            setShowAddForm(false);
        } catch (err) {
            setActionError(err instanceof Error ? err.message : 'Add failed');
        }
    }

    async function handleGenerate(id: number) {
        setGeneratingId(id);
        setActionError(null);
        try {
            await generateInfluencerDraftAction(id, { overwrite: false });
            await refresh(true);
        } catch (err) {
            setActionError(err instanceof Error ? err.message : 'Generate failed');
        } finally {
            setGeneratingId(null);
        }
    }

    async function handleSend(id: number) {
        setSendingId(id);
        setActionError(null);
        try {
            await sendOutreachAction(id);
            await refresh(true);
        } catch (err) {
            setActionError(err instanceof Error ? err.message : 'Send failed');
        } finally {
            setSendingId(null);
        }
    }

    async function handleSchedule(id: number) {
        setSchedulingId(id);
        setActionError(null);
        try {
            await scheduleContactAction(id, nextBusinessSendTimePT());
            await refresh(true);
        } catch (err) {
            setActionError(err instanceof Error ? err.message : 'Schedule failed');
        } finally {
            setSchedulingId(null);
        }
    }

    async function handleDelete(id: number) {
        setDeletingId(id);
        setActionError(null);
        try {
            await deleteInfluencerAction(id);
            await refresh(true);
        } catch (err) {
            setActionError(err instanceof Error ? err.message : 'Delete failed');
        } finally {
            setDeletingId(null);
        }
    }

    return (
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 sm:px-6 sm:py-6 space-y-5 sm:space-y-8">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                    <h1 className="text-base sm:text-lg font-semibold text-[#E8E4DD]">Influencer Reachout</h1>
                    <p className="text-[12px] text-[#C4C0B6] mt-0.5">
                        Affiliate-target creators between {FOLLOWER_MIN.toLocaleString()}–{FOLLOWER_MAX.toLocaleString()} followers. Discovered & curated by the agent.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        onClick={() => setShowAddForm((v) => !v)}
                        size="sm"
                        className="h-8 gap-1.5 bg-[#4CAF6E] text-[#1A1917] hover:bg-[#3D9A5C] sm:h-9"
                    >
                        <Plus className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Add influencer</span>
                    </Button>
                    <Button
                        onClick={() => refresh(false)}
                        disabled={loading}
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1.5 border-[#3D3C36] bg-[#24231F] text-[#C4C0B6] hover:bg-[#2E2D28] hover:text-[#E8E4DD] sm:h-9"
                    >
                        <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                        <span className="hidden sm:inline">Refresh</span>
                    </Button>
                </div>
            </div>

            {error && (
                <div className="bg-[#C45D4A]/10 border border-[#C45D4A]/30 rounded-lg p-3 sm:p-4 flex items-center gap-3 text-[#C45D4A]">
                    <AlertCircle className="w-5 h-5 shrink-0" />
                    <p className="text-sm">{error}</p>
                </div>
            )}

            {showAddForm && (
                <AddInfluencerForm
                    onSubmit={handleAdd}
                    onCancel={() => setShowAddForm(false)}
                />
            )}

            {stats.total > 0 && <StatsPanel stats={stats} />}

            <div>
                <div className="flex flex-wrap items-center justify-between gap-2 mb-3 sm:mb-4">
                    <div className="flex items-center gap-3">
                        <h2 className="text-base sm:text-lg font-semibold text-[#E8E4DD]">Targets</h2>
                        {!loading && (
                            <span className="font-mono text-xs text-[#C4C0B6]">
                                {filtered.length === influencers.length ? influencers.length : `${filtered.length}/${influencers.length}`}
                            </span>
                        )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <FilterSelect value={platformFilter} onChange={setPlatformFilter} icon={<Filter className="w-3 h-3" />}>
                            <option value="all">All platforms</option>
                            {PLATFORMS.map((p) => (
                                <option key={p} value={p}>{PLATFORM_LABELS[p]}</option>
                            ))}
                        </FilterSelect>
                        <FilterSelect value={rangeFilter} onChange={(v) => setRangeFilter(v as RangeFilter)} icon={<Users className="w-3 h-3" />}>
                            <option value="all">Any followers</option>
                            <option value="in-range">In range ({FOLLOWER_MIN.toLocaleString()}–{FOLLOWER_MAX.toLocaleString()})</option>
                            <option value="out-of-range">Out of range</option>
                            <option value="unknown">Unknown count</option>
                        </FilterSelect>
                        <FilterSelect value={statusFilter} onChange={setStatusFilter} icon={<Filter className="w-3 h-3" />}>
                            <option value="all">All statuses</option>
                            {STATUS_CONFIG.map((s) => (
                                <option key={s.key} value={s.key}>{s.label}</option>
                            ))}
                        </FilterSelect>
                    </div>
                </div>

                {actionError && (
                    <div className="mb-3 rounded-lg border border-[#C45D4A]/30 bg-[#C45D4A]/10 px-3 py-2 text-[13px] text-[#C45D4A] flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        {actionError}
                        <button onClick={() => setActionError(null)} className="ml-auto"><X className="w-3.5 h-3.5" /></button>
                    </div>
                )}

                {loading ? (
                    <div className="flex items-center justify-center py-12">
                        <Loader2 className="h-5 w-5 animate-spin text-[#C4C0B6]" />
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-[#3D3C36] bg-[#24231F]/40 p-10 text-center">
                        <Users className="mx-auto mb-3 h-8 w-8 text-[#C4C0B6]/30" />
                        <p className="text-sm text-[#C4C0B6]">
                            {influencers.length === 0
                                ? 'No influencer targets yet. Click "Add influencer" or ask the agent to discover candidates.'
                                : 'No targets match these filters.'}
                        </p>
                    </div>
                ) : (
                    <div className="border border-[#3D3C36] rounded-xl bg-[#24231F]/40 overflow-hidden">
                        <div className="max-h-[40rem] overflow-y-auto divide-y divide-[#3D3C36]/50">
                            {filtered.map((row) => (
                                <InfluencerRowCard
                                    key={row.id}
                                    row={row}
                                    onGenerate={() => handleGenerate(row.id)}
                                    onSend={() => handleSend(row.id)}
                                    onSchedule={() => handleSchedule(row.id)}
                                    onDelete={() => handleDelete(row.id)}
                                    generating={generatingId === row.id}
                                    sending={sendingId === row.id}
                                    scheduling={schedulingId === row.id}
                                    deleting={deletingId === row.id}
                                />
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

type DerivedStats = {
    total: number;
    byPlatform: { platform: string; count: number; followers: number }[];
    byStatus: Map<string, number>;
    totalReach: number;
    inRangeCount: number;
    agentDiscovered: number;
    manualDiscovered: number;
};

function deriveStats(rows: InfluencerRow[]): DerivedStats {
    const byPlatformMap = new Map<string, { count: number; followers: number }>();
    const byStatus = new Map<string, number>();
    let totalReach = 0;
    let inRangeCount = 0;
    let agentDiscovered = 0;
    let manualDiscovered = 0;

    for (const r of rows) {
        const plat = r.platform || 'unknown';
        const cur = byPlatformMap.get(plat) ?? { count: 0, followers: 0 };
        cur.count += 1;
        cur.followers += r.followerCount ?? 0;
        byPlatformMap.set(plat, cur);

        byStatus.set(r.status, (byStatus.get(r.status) ?? 0) + 1);
        if (r.discoveredBy === 'agent') agentDiscovered += 1;
        else if (r.discoveredBy === 'manual') manualDiscovered += 1;
        totalReach += r.followerCount ?? 0;
        if (isInFollowerRange(r.followerCount)) inRangeCount += 1;
    }

    return {
        total: rows.length,
        byPlatform: [...byPlatformMap.entries()]
            .map(([platform, v]) => ({ platform, count: v.count, followers: v.followers }))
            .sort((a, b) => b.count - a.count),
        byStatus,
        totalReach,
        inRangeCount,
        agentDiscovered,
        manualDiscovered,
    };
}

function matchesRange(n: number | null, filter: RangeFilter): boolean {
    if (filter === 'all') return true;
    if (n == null) return filter === 'unknown';
    const inR = isInFollowerRange(n);
    return filter === 'in-range' ? inR : !inR;
}

function StatsPanel({ stats }: { stats: DerivedStats }) {
    const sentStatuses = ['contacted', 'delivered', 'opened', 'clicked', 'replied'];
    const sentCount = sentStatuses.reduce((s, k) => s + (stats.byStatus.get(k) ?? 0), 0);
    const repliedCount = stats.byStatus.get('replied') ?? 0;
    const cards = [
        { label: 'Agent-found', value: stats.agentDiscovered, color: 'text-[#9BC4FF]', sub: `${stats.manualDiscovered} added by you` },
        { label: 'In range', value: stats.inRangeCount, color: 'text-[#4CAF6E]', sub: `of ${stats.total} total` },
        { label: 'Total reach', value: formatCompactNumber(stats.totalReach), color: 'text-[#E8E4DD]', sub: `across ${stats.byPlatform.length} platforms` },
        { label: 'Sent', value: sentCount, color: 'text-[#D4882A]', sub: `${repliedCount} replied` },
    ];
    return (
        <div>
            <div className="flex items-center gap-2 mb-3 sm:mb-4">
                <Sparkles className="w-3.5 h-3.5 text-[#9BC4FF]" />
                <h2 className="text-base sm:text-lg font-semibold text-[#E8E4DD]">Agent activity</h2>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mb-4">
                {cards.map((c) => (
                    <div key={c.label} className="border border-[#3D3C36] rounded-lg bg-[#24231F]/40 p-3 sm:p-4">
                        <div className="text-[10px] font-semibold text-[#C4C0B6] uppercase tracking-widest mb-1">{c.label}</div>
                        <div className={`text-xl sm:text-2xl font-mono tabular-nums font-semibold ${c.color}`}>{c.value}</div>
                        {c.sub && <div className="text-[11px] text-[#C4C0B6]/70 mt-0.5">{c.sub}</div>}
                    </div>
                ))}
            </div>

            {stats.byPlatform.length > 0 && (
                <div className="border border-[#3D3C36] rounded-xl bg-[#24231F]/40 overflow-hidden">
                    <div className="px-4 py-3 border-b border-[#3D3C36]">
                        <span className="text-[10px] font-semibold text-[#C4C0B6] uppercase tracking-widest">By platform</span>
                    </div>
                    <div className="divide-y divide-[#3D3C36]/50">
                        {stats.byPlatform.map((p) => (
                            <div key={p.platform} className="flex items-center gap-3 px-4 py-2">
                                <span className="text-[13px] text-[#E8E4DD] capitalize min-w-0 flex-1 truncate">{p.platform}</span>
                                <span className="text-[12px] font-mono tabular-nums text-[#C4C0B6] shrink-0">{p.count} target{p.count === 1 ? '' : 's'}</span>
                                <span className="text-[12px] font-mono tabular-nums text-[#4CAF6E] shrink-0">{formatCompactNumber(p.followers)} reach</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

function InfluencerRowCard(props: {
    row: InfluencerRow;
    onGenerate: () => void;
    onSend: () => void;
    onSchedule: () => void;
    onDelete: () => void;
    generating: boolean;
    sending: boolean;
    scheduling: boolean;
    deleting: boolean;
}) {
    const { row, onGenerate, onSend, onSchedule, onDelete, generating, sending, scheduling, deleting } = props;
    const sc = STATUS_CONFIG.find((s) => s.key === row.status);
    const badgeStyle = sc
        ? { backgroundColor: `${sc.color}26`, color: sc.color }
        : { backgroundColor: '#C4C0B626', color: '#C4C0B6' };
    const hasDraft = !!row.draftSubject;
    // Placeholder emails (`unverified+<slug>@notfair.co`) route to Tong's own
    // inbox via plus-addressing — safe-on-accidental-send, but the creator
    // never sees it. Block the email-flow buttons for these rows and surface
    // a "manual outreach" badge so it's obvious at a glance.
    const isPlaceholderEmail = row.email.startsWith('unverified+') && row.email.endsWith('@notfair.co');
    const rangeTone: 'in' | 'out' | 'unknown' =
        row.followerCount == null ? 'unknown' : isInFollowerRange(row.followerCount) ? 'in' : 'out';
    const followerToneClass = {
        in: 'bg-[#4CAF6E]/15 text-[#7DDA9D]',
        out: 'bg-[#D4882A]/15 text-[#E1A95E]',
        unknown: 'bg-[#3D3C36]/40 text-[#C4C0B6]',
    }[rangeTone];
    const fullName = [row.firstName, row.lastName].filter(Boolean).join(' ');

    return (
        <div className="group flex items-start gap-3 px-4 py-3 hover:bg-[#24231F]/60 transition-colors">
            <Link
                href={`/dev/contacts/${row.id}`}
                prefetch
                className="min-w-0 flex-1 cursor-pointer"
            >
                <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[13px] text-[#E8E4DD] font-medium truncate">
                        {fullName || row.handle || row.email}
                    </span>
                    {row.handle && fullName && (
                        <span className="text-[12px] text-[#C4C0B6] font-mono">@{row.handle}</span>
                    )}
                    <span className="shrink-0 rounded px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider" style={badgeStyle}>
                        {row.status}
                    </span>
                    {row.platform && (
                        <span className="shrink-0 rounded px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider border border-[#3D3C36] text-[#C4C0B6] capitalize">
                            {row.platform}
                        </span>
                    )}
                    {row.followerCount != null && (
                        <span className={`shrink-0 rounded px-2 py-0.5 text-[10px] font-mono tabular-nums ${followerToneClass}`}>
                            {formatCompactNumber(row.followerCount)} followers
                        </span>
                    )}
                    {row.niche && (
                        <span className="shrink-0 text-[11px] text-[#C4C0B6]">· {row.niche}</span>
                    )}
                </div>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                    {isPlaceholderEmail ? (
                        <span
                            className="shrink-0 rounded px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider bg-[#D4882A]/15 text-[#E1A95E]"
                            title="No public email found. Reach out via DM, contact form, or LinkedIn — see notes below."
                        >
                            Manual outreach
                        </span>
                    ) : (
                        <span className="text-[12px] text-[#C4C0B6] font-mono truncate">{row.email}</span>
                    )}
                    {row.profileUrl && (
                        <a
                            href={row.profileUrl}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-1 text-[11px] text-[#6B8AED] hover:text-[#9BC4FF]"
                        >
                            profile <ExternalLink className="w-3 h-3" />
                        </a>
                    )}
                    {hasDraft && row.status === 'drafted' && (
                        <span className="text-[11px] text-[#C4C0B6]/60">· draft ready</span>
                    )}
                    {row.status === 'scheduled' && row.scheduledAt && (
                        <span className="text-[11px] text-[#C084FC]/70">
                            · sends {new Date(row.scheduledAt).toLocaleDateString('en-US', {
                                weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
                            })}
                        </span>
                    )}
                    {row.discoveredBy && (
                        <span className="text-[11px] text-[#C4C0B6]/60">· discovered by {row.discoveredBy}</span>
                    )}
                </div>
                {row.notes && (
                    <p className="mt-1 text-[12px] text-[#C4C0B6]/80 line-clamp-2">{row.notes}</p>
                )}
            </Link>
            <div className="flex items-center gap-1 shrink-0">
                {!hasDraft && !isPlaceholderEmail && (
                    <Button
                        size="sm"
                        disabled={generating}
                        onClick={onGenerate}
                        className="gap-1.5 bg-[#6B8AED]/20 text-[#9BC4FF] hover:bg-[#6B8AED]/30 border border-[#6B8AED]/40 h-7 text-[12px] px-2.5"
                    >
                        {generating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                        Draft
                    </Button>
                )}
                {hasDraft && !isPlaceholderEmail && row.status === 'drafted' && (
                    <>
                        <Button
                            size="sm"
                            disabled={scheduling || sending}
                            onClick={onSchedule}
                            className="gap-1.5 bg-[#C084FC]/20 text-[#C084FC] hover:bg-[#C084FC]/30 border border-[#C084FC]/40 h-7 text-[12px] px-2.5"
                        >
                            {scheduling ? <Loader2 className="h-3 w-3 animate-spin" /> : <Clock className="h-3 w-3" />}
                            Schedule
                        </Button>
                        <Button
                            size="sm"
                            disabled={sending || scheduling}
                            onClick={onSend}
                            className="gap-1.5 bg-[#4CAF6E] text-[#E8E4DD] hover:bg-[#3D9A5C] h-7 text-[12px] px-2.5"
                        >
                            {sending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                            Send
                        </Button>
                    </>
                )}
                {hasDraft && !isPlaceholderEmail && row.status === 'scheduled' && (
                    <Button
                        size="sm"
                        disabled={sending}
                        onClick={onSend}
                        className="gap-1.5 bg-[#24231F] text-[#C4C0B6] hover:text-[#E8E4DD] border border-[#3D3C36] h-7 text-[12px] px-2.5"
                    >
                        {sending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                        Send now
                    </Button>
                )}
                <Button
                    variant="ghost"
                    size="icon-sm"
                    disabled={deleting}
                    onClick={onDelete}
                    className="text-[#C4C0B6] opacity-0 group-hover:opacity-100 hover:text-[#C45D4A] transition-opacity"
                >
                    {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
                </Button>
                <Link
                    href={`/dev/contacts/${row.id}`}
                    prefetch
                    aria-label="Open detail"
                    className="text-[#C4C0B6] hover:text-[#E8E4DD]"
                >
                    <ChevronRight className="w-4 h-4" />
                </Link>
            </div>
        </div>
    );
}

function AddInfluencerForm({
    onSubmit,
    onCancel,
}: {
    onSubmit: (input: InfluencerInput) => Promise<void>;
    onCancel: () => void;
}) {
    const [submitting, setSubmitting] = useState(false);
    const [form, setForm] = useState<{
        email: string;
        firstName: string;
        lastName: string;
        platform: Platform;
        handle: string;
        followerCount: string;
        niche: string;
        profileUrl: string;
        notes: string;
    }>({
        email: '',
        firstName: '',
        lastName: '',
        platform: 'youtube',
        handle: '',
        followerCount: '',
        niche: '',
        profileUrl: '',
        notes: '',
    });

    async function submit(e: React.FormEvent) {
        e.preventDefault();
        if (!form.email.trim() || !form.email.includes('@')) return;
        setSubmitting(true);
        try {
            await onSubmit({
                email: form.email,
                firstName: form.firstName || null,
                lastName: form.lastName || null,
                platform: form.platform || null,
                handle: form.handle || null,
                followerCount: form.followerCount ? Number(form.followerCount) : null,
                niche: form.niche || null,
                profileUrl: form.profileUrl || null,
                notes: form.notes || null,
                discoveredBy: 'manual',
            });
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <form
            onSubmit={submit}
            className="rounded-xl border border-[#3D3C36] bg-[#24231F]/60 p-4 sm:p-5 space-y-3"
        >
            <div className="flex items-center justify-between">
                <h3 className="text-[13px] font-semibold text-[#E8E4DD]">New influencer target</h3>
                <button type="button" onClick={onCancel} className="text-[#C4C0B6] hover:text-[#E8E4DD]">
                    <X className="w-4 h-4" />
                </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <Input label="Email *" value={form.email} onChange={(v) => setForm({ ...form, email: v })} required type="email" placeholder="creator@example.com" />
                <SelectInput label="Platform" value={form.platform} onChange={(v) => setForm({ ...form, platform: v as Platform })}>
                    {PLATFORMS.map((p) => (
                        <option key={p} value={p}>{PLATFORM_LABELS[p]}</option>
                    ))}
                </SelectInput>
                <Input label="Handle" value={form.handle} onChange={(v) => setForm({ ...form, handle: v })} placeholder="surfsideppc" />
                <Input label="Follower count" value={form.followerCount} onChange={(v) => setForm({ ...form, followerCount: v.replace(/[^\d]/g, '') })} placeholder="12500" inputMode="numeric" />
                <Input label="First name" value={form.firstName} onChange={(v) => setForm({ ...form, firstName: v })} placeholder="Aaron" />
                <Input label="Last name" value={form.lastName} onChange={(v) => setForm({ ...form, lastName: v })} placeholder="Young" />
                <Input label="Niche" value={form.niche} onChange={(v) => setForm({ ...form, niche: v })} placeholder="Google Ads tutorials" />
                <Input label="Profile URL" value={form.profileUrl} onChange={(v) => setForm({ ...form, profileUrl: v })} placeholder="https://youtube.com/@..." />
            </div>
            <Textarea
                label="Notes"
                value={form.notes}
                onChange={(v) => setForm({ ...form, notes: v })}
                placeholder="Why this creator? Any context for personalizing outreach…"
            />
            <div className="flex items-center justify-end gap-2">
                <Button type="button" onClick={onCancel} variant="outline" size="sm" className="border-[#3D3C36] bg-[#24231F] text-[#C4C0B6] hover:bg-[#2E2D28] hover:text-[#E8E4DD]">
                    Cancel
                </Button>
                <Button type="submit" disabled={submitting} size="sm" className="bg-[#4CAF6E] text-[#1A1917] hover:bg-[#3D9A5C] gap-1.5">
                    {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                    Add
                </Button>
            </div>
        </form>
    );
}

function FilterSelect({
    value, onChange, children, icon,
}: {
    value: string;
    onChange: (v: string) => void;
    children: React.ReactNode;
    icon?: React.ReactNode;
}) {
    return (
        <div className="relative">
            {icon && <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#C4C0B6] pointer-events-none">{icon}</span>}
            <select
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className={`appearance-none ${icon ? 'pl-7' : 'pl-3'} pr-6 py-1.5 text-[12px] rounded-md border border-[#3D3C36] bg-[#24231F] text-[#E8E4DD] hover:bg-[#2E2D28] focus:outline-none focus:ring-1 focus:ring-[#4CAF6E]/50 cursor-pointer`}
            >
                {children}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-[#C4C0B6] pointer-events-none" />
        </div>
    );
}

function Input({
    label, value, onChange, placeholder, required, type, inputMode,
}: {
    label: string;
    value: string;
    onChange: (v: string) => void;
    placeholder?: string;
    required?: boolean;
    type?: string;
    inputMode?: 'numeric' | 'text';
}) {
    return (
        <label className="block">
            <span className="block text-[10px] font-semibold text-[#C4C0B6] uppercase tracking-widest mb-1">{label}</span>
            <input
                type={type ?? 'text'}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder={placeholder}
                required={required}
                inputMode={inputMode}
                className="w-full h-8 px-2.5 text-[13px] rounded-md border border-[#3D3C36] bg-[#1A1917] text-[#E8E4DD] placeholder:text-[#C4C0B6]/50 focus:outline-none focus:ring-1 focus:ring-[#4CAF6E]/50"
            />
        </label>
    );
}

function Textarea({
    label, value, onChange, placeholder,
}: {
    label: string;
    value: string;
    onChange: (v: string) => void;
    placeholder?: string;
}) {
    return (
        <label className="block">
            <span className="block text-[10px] font-semibold text-[#C4C0B6] uppercase tracking-widest mb-1">{label}</span>
            <textarea
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder={placeholder}
                rows={2}
                className="w-full px-2.5 py-2 text-[13px] rounded-md border border-[#3D3C36] bg-[#1A1917] text-[#E8E4DD] placeholder:text-[#C4C0B6]/50 focus:outline-none focus:ring-1 focus:ring-[#4CAF6E]/50 resize-y"
            />
        </label>
    );
}

function SelectInput({
    label, value, onChange, children,
}: {
    label: string;
    value: string;
    onChange: (v: string) => void;
    children: React.ReactNode;
}) {
    return (
        <label className="block">
            <span className="block text-[10px] font-semibold text-[#C4C0B6] uppercase tracking-widest mb-1">{label}</span>
            <div className="relative">
                <select
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    className="w-full appearance-none h-8 pl-2.5 pr-7 text-[13px] rounded-md border border-[#3D3C36] bg-[#1A1917] text-[#E8E4DD] focus:outline-none focus:ring-1 focus:ring-[#4CAF6E]/50"
                >
                    {children}
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-[#C4C0B6] pointer-events-none" />
            </div>
        </label>
    );
}
