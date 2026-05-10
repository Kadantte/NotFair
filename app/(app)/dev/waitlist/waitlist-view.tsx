'use client';

import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, AlertCircle, Loader2, X, ChevronDown, Check, Filter, ListChecks } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatDateTime } from '../_components/dev-utils';
import type { WaitlistRow } from '../_components/dev-types';

// Module-level stale-while-revalidate cache.
let cachedWaitlist: WaitlistRow[] | null = null;

type Props = { initialData?: { rows: WaitlistRow[] } };

export function WaitlistView({ initialData }: Props) {
    // Seed from server prefetch if available and cache is empty.
    if (initialData && !cachedWaitlist) {
        cachedWaitlist = initialData.rows;
    }
    const [waitlist, setWaitlist] = useState<WaitlistRow[]>(cachedWaitlist ?? []);
    const [loadingWaitlist, setLoadingWaitlist] = useState(!cachedWaitlist);
    const [error, setError] = useState<string | null>(null);
    const [waitlistKeyFilter, setWaitlistKeyFilter] = useState<string>('all');
    const [approvingWaitlistId, setApprovingWaitlistId] = useState<number | null>(null);

    const fetchWaitlist = useCallback(async (background = false) => {
        if (!background) setLoadingWaitlist(true);
        try {
            const res = await fetch('/api/dev/waitlist', { credentials: 'include' });
            if (!res.ok) throw new Error('Failed to fetch');
            const data = (await res.json()) as { rows: WaitlistRow[] };
            setWaitlist(data.rows);
            cachedWaitlist = data.rows;
        } catch {
            setError('Failed to load waitlist');
        } finally {
            setLoadingWaitlist(false);
        }
    }, []);

    useEffect(() => {
        fetchWaitlist(!!cachedWaitlist);
    }, [fetchWaitlist]);

    async function toggleWaitlistApproval(id: number, approved: boolean) {
        setApprovingWaitlistId(id);
        try {
            const res = await fetch('/api/dev/waitlist', {
                method: 'PATCH',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, approved }),
            });
            if (!res.ok) throw new Error('Failed');
            const data = (await res.json()) as { id: number; approvedAt: string | null };
            setWaitlist((prev) => {
                const next = prev.map((w) => (w.id === data.id ? { ...w, approvedAt: data.approvedAt } : w));
                cachedWaitlist = next;
                return next;
            });
        } catch {
            setError(approved ? 'Failed to approve signup' : 'Failed to revoke approval');
        } finally {
            setApprovingWaitlistId(null);
        }
    }

    return (
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 sm:px-6 sm:py-6 space-y-5 sm:space-y-8">
            <div className="flex items-center justify-end">
                <Button
                    onClick={() => {
                        cachedWaitlist = null;
                        fetchWaitlist(false);
                    }}
                    disabled={loadingWaitlist}
                    variant="outline"
                    size="sm"
                    className="h-8 border-[#3D3C36] bg-[#24231F] hover:bg-[#2E2D28] text-[#C4C0B6] hover:text-[#E8E4DD] gap-1.5 sm:h-9"
                >
                    <RefreshCw className={`w-3.5 h-3.5 ${loadingWaitlist ? 'animate-spin' : ''}`} />
                    <span className="hidden sm:inline">Refresh</span>
                </Button>
            </div>

            {error && (
                <div className="bg-[#C45D4A]/10 border border-[#C45D4A]/30 rounded-lg p-3 sm:p-4 flex items-center gap-3 text-[#C45D4A]">
                    <AlertCircle className="w-5 h-5 shrink-0" />
                    <p className="text-sm">{error}</p>
                </div>
            )}

            <div>
                <div className="flex items-center justify-between mb-3 sm:mb-4 gap-3 flex-wrap">
                    <div className="flex items-center gap-3 min-w-0">
                        <h2 className="text-base sm:text-lg font-semibold text-[#E8E4DD]">Waitlist</h2>
                        {!loadingWaitlist && (
                            <span className="font-mono text-xs text-[#C4C0B6]">
                                {waitlistKeyFilter === 'all'
                                    ? waitlist.length
                                    : `${waitlist.filter((w) => w.key === waitlistKeyFilter).length}/${waitlist.length}`}
                            </span>
                        )}
                    </div>
                    <div className="relative">
                        <Filter className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-[#C4C0B6] pointer-events-none" />
                        <select
                            value={waitlistKeyFilter}
                            onChange={(e) => setWaitlistKeyFilter(e.target.value)}
                            className="appearance-none pl-7 pr-6 py-1.5 text-[12px] rounded-md border border-[#3D3C36] bg-[#24231F] text-[#E8E4DD] hover:bg-[#2E2D28] focus:outline-none focus:ring-1 focus:ring-[#4CAF6E]/50 cursor-pointer"
                        >
                            <option value="all">All keys</option>
                            {Array.from(new Set(waitlist.map((w) => w.key))).sort().map((k) => (
                                <option key={k} value={k}>{k}</option>
                            ))}
                        </select>
                        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-[#C4C0B6] pointer-events-none" />
                    </div>
                </div>

                {loadingWaitlist && waitlist.length === 0 ? (
                    <div className="flex items-center justify-center py-12">
                        <Loader2 className="h-5 w-5 animate-spin text-[#C4C0B6]" />
                    </div>
                ) : waitlist.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-[#3D3C36] bg-[#24231F]/40 p-10 text-center">
                        <ListChecks className="mx-auto mb-3 h-8 w-8 text-[#C4C0B6]/30" />
                        <p className="text-sm text-[#C4C0B6]">No waitlist signups yet.</p>
                    </div>
                ) : (() => {
                    const rows = waitlistKeyFilter === 'all'
                        ? waitlist
                        : waitlist.filter((w) => w.key === waitlistKeyFilter);
                    if (rows.length === 0) {
                        return (
                            <div className="rounded-lg border border-dashed border-[#3D3C36] bg-[#24231F]/40 p-10 text-center">
                                <p className="text-sm text-[#C4C0B6]">No signups match this filter.</p>
                            </div>
                        );
                    }
                    return (
                        <div className="border border-[#3D3C36] rounded-xl bg-[#24231F]/40 overflow-hidden">
                            <div className="grid grid-cols-[auto_1fr_auto_auto_auto] gap-x-4 gap-y-0 px-4 py-2 border-b border-[#3D3C36] text-[10px] font-semibold text-[#C4C0B6] uppercase tracking-widest">
                                <span>Key</span>
                                <span>Email</span>
                                <span>User</span>
                                <span>Joined</span>
                                <span className="text-right">Approval</span>
                            </div>
                            <div className="divide-y divide-[#3D3C36]/50 max-h-[32rem] overflow-y-auto">
                                {rows.map((w) => {
                                    const isApproved = !!w.approvedAt;
                                    const busy = approvingWaitlistId === w.id;
                                    const canApprove = !!w.userId;
                                    return (
                                        <div key={w.id} className="grid grid-cols-[auto_1fr_auto_auto_auto] gap-x-4 items-center px-4 py-2.5 hover:bg-[#24231F]/60 transition-colors">
                                            <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-[#1877F2]/10 text-[#9BC4FF] border border-[#1877F2]/20">{w.key}</span>
                                            <span className="text-[13px] font-mono text-[#E8E4DD] truncate min-w-0">{w.email ?? '—'}</span>
                                            <span className="text-[12px] font-mono text-[#C4C0B6] truncate">{w.userId ?? <span className="italic text-[#C4C0B6]/60">anon</span>}</span>
                                            <span className="text-[12px] font-mono text-[#C4C0B6] tabular-nums whitespace-nowrap">{formatDateTime(w.createdAt)}</span>
                                            <div className="flex items-center justify-end gap-2 whitespace-nowrap">
                                                {isApproved && (
                                                    <span
                                                        title={`Approved ${formatDateTime(w.approvedAt!)}`}
                                                        className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#4CAF6E]/10 text-[#7DDA9D] border border-[#4CAF6E]/30"
                                                    >
                                                        Approved
                                                    </span>
                                                )}
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    disabled={busy || !canApprove}
                                                    onClick={() => toggleWaitlistApproval(w.id, !isApproved)}
                                                    title={canApprove
                                                        ? (isApproved ? 'Revoke approval' : 'Approve this signup')
                                                        : 'Anonymous signup — needs a user id to approve'}
                                                    className={`gap-1.5 h-7 px-2 text-[11px] ${isApproved
                                                        ? 'border-[#3D3C36] bg-[#24231F] hover:bg-[#2E2D28] text-[#C4C0B6] hover:text-[#E8E4DD]'
                                                        : 'border-[#4CAF6E]/40 bg-[#4CAF6E]/10 hover:bg-[#4CAF6E]/20 text-[#7DDA9D]'}`}
                                                >
                                                    {busy ? (
                                                        <Loader2 className="w-3 h-3 animate-spin" />
                                                    ) : isApproved ? (
                                                        <X className="w-3 h-3" />
                                                    ) : (
                                                        <Check className="w-3 h-3" />
                                                    )}
                                                    {isApproved ? 'Revoke' : 'Approve'}
                                                </Button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    );
                })()}
            </div>
        </div>
    );
}
