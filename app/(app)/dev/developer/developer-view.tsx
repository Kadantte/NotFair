'use client';

import { useEffect, useState } from 'react';
import { Loader2, Sparkles, AlertTriangle, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ResetPreview } from '../_components/dev-types';

type Props = { initialData?: { state: 'on' | 'off' } };

export function DeveloperView({ initialData }: Props) {
    const [error, setError] = useState<string | null>(null);
    const [growthOverride, setGrowthOverride] = useState<'on' | 'off' | null>(initialData?.state ?? null);
    const [togglingGrowthOverride, setTogglingGrowthOverride] = useState(false);
    const [resetPreview, setResetPreview] = useState<ResetPreview | null>(null);
    const [loadingResetPreview, setLoadingResetPreview] = useState(false);
    const [resetModalOpen, setResetModalOpen] = useState(false);
    const [resetting, setResetting] = useState(false);
    const [resetDone, setResetDone] = useState(false);

    // If not prefetched server-side, fetch on mount.
    useEffect(() => {
        if (growthOverride !== null) return; // already seeded from server prefetch
        let cancelled = false;
        fetch('/api/dev/growth-override', { credentials: 'include' })
            .then((r) => r.ok ? r.json() : null)
            .then((data) => {
                if (cancelled || !data) return;
                setGrowthOverride(data.state === 'off' ? 'off' : 'on');
            })
            .catch(() => { /* dev-only endpoint, fine if it 403s */ });
        return () => { cancelled = true; };
    }, [growthOverride]);

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

    return (
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 sm:px-6 sm:py-6 space-y-5 sm:space-y-8">
            {error && (
                <div className="bg-[#C45D4A]/10 border border-[#C45D4A]/30 rounded-lg p-3 sm:p-4 flex items-center gap-3 text-[#C45D4A]">
                    <AlertTriangle className="w-5 h-5 shrink-0" />
                    <p className="text-sm">{error}</p>
                </div>
            )}

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
        </div>
    );
}
