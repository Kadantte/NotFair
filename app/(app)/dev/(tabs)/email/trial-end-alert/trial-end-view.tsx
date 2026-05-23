'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, Check, ChevronDown, ChevronRight, Loader2, Search, Send, X } from 'lucide-react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { CronCountdown } from './countdown';

export interface DashboardSendRow {
    id: number;
    userId: string;
    email: string;
    sentAtIso: string;
    deliveredAtIso: string | null;
    openedAtIso: string | null;
    clickedAtIso: string | null;
    bouncedAtIso: string | null;
    bounceType: string | null;
    plan: 'free' | 'growth';
    stripeStatus: string | null;
    becamePaidAfterSend: boolean;
}

export interface DashboardEligibleRow {
    userId: string;
    email: string;
    trialEndedAtIso: string;
}

export interface EmailPreview {
    subject: string;
    html: string;
    text: string;
}

interface Props {
    sends: DashboardSendRow[];
    eligible: DashboardEligibleRow[];
    eligibleCapped: boolean;
    env: 'test' | 'live';
    maxPerRun: number;
    nextTriggerIso: string;
    emailPreview: EmailPreview;
}

const PAGE_SIZE = 25;

export function TrialEndView(props: Props) {
    const total = props.sends.length;
    const delivered = props.sends.filter((r) => r.deliveredAtIso != null).length;
    const opened = props.sends.filter((r) => r.openedAtIso != null).length;
    const clicked = props.sends.filter((r) => r.clickedAtIso != null).length;
    const bounced = props.sends.filter((r) => r.bouncedAtIso != null).length;
    const paid = props.sends.filter((r) => r.becamePaidAfterSend).length;

    const queuedForLater = Math.max(0, props.eligible.length - props.maxPerRun);

    return (
        <div className="flex h-full flex-col overflow-hidden">
            <header className="shrink-0 border-b border-[#3D3C36] bg-[#24231F]/80 px-4 py-4 sm:px-6">
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                    <div>
                        <h1 className="text-[16px] font-semibold text-[#E8E4DD]">Trial-end alert</h1>
                        <p className="mt-0.5 text-[12px] text-[#C4C0B6]">
                            env={props.env} · webhook: <code className="font-mono">/api/webhooks/resend</code> · per-row <span className="font-mono">Send</span> hits one customer at a time
                        </p>
                    </div>
                    <div className="rounded-lg border border-[#3D3C36] bg-[#1A1917]/60 px-3 py-2 text-right">
                        <div className="text-[10px] font-semibold uppercase tracking-widest text-[#C4C0B6]">Next cron run</div>
                        <div className="mt-0.5 font-mono text-[12px] text-[#E8E4DD]">
                            {new Date(props.nextTriggerIso).toLocaleString(undefined, {
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                                timeZoneName: 'short',
                            })}
                        </div>
                        <div className="mt-0.5"><CronCountdown nextTriggerIso={props.nextTriggerIso} /></div>
                    </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-6 sm:gap-3">
                    <StatCard label="Sent" value={String(total)} />
                    <StatCard label="Delivered" value={String(delivered)} sub={pct(delivered, total)} />
                    <StatCard label="Opened" value={String(opened)} sub={pct(opened, total)} />
                    <StatCard label="Clicked" value={String(clicked)} sub={pct(clicked, total)} />
                    <StatCard label="Bounced" value={String(bounced)} sub={pct(bounced, total)} />
                    <StatCard label="Paid now" value={String(paid)} sub={pct(paid, total)} />
                </div>
            </header>

            <div className="flex-1 overflow-auto">
                <EmailPreviewSection preview={props.emailPreview} />
                <EligibleSection
                    eligible={props.eligible}
                    eligibleCapped={props.eligibleCapped}
                    queuedForLater={queuedForLater}
                    maxPerRun={props.maxPerRun}
                    env={props.env}
                />
                <SentSection sends={props.sends} env={props.env} />
            </div>
        </div>
    );
}

// ─── Email preview ─────────────────────────────────────────────────────

function EmailPreviewSection({ preview }: { preview: EmailPreview }) {
    // Collapsed by default — preview is the rarest thing to look at on this
    // dashboard. Toggling open mounts the iframe lazily.
    const [expanded, setExpanded] = useState(false);
    const [mode, setMode] = useState<'html' | 'text'>('html');

    return (
        <section className="border-b border-[#3D3C36] bg-[#1A1917]/40 px-4 py-4 sm:px-6">
            <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="flex w-full items-center gap-2 text-left"
            >
                {expanded ? <ChevronDown className="h-4 w-4 text-[#C4C0B6]" /> : <ChevronRight className="h-4 w-4 text-[#C4C0B6]" />}
                <h2 className="text-[13px] font-semibold uppercase tracking-widest text-[#C4C0B6]">
                    Email preview
                </h2>
                <span className="font-mono text-[11px] text-[#C4C0B6]/70 truncate">
                    {preview.subject}
                </span>
            </button>

            {expanded && (
                <div className="mt-3 space-y-3">
                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-[#C4C0B6]">
                        <span className="rounded border border-[#3D3C36] bg-[#1A1917]/60 px-2 py-1 font-mono">
                            From: NotFair &lt;alert@updates.notfair.co&gt;
                        </span>
                        <span className="rounded border border-[#3D3C36] bg-[#1A1917]/60 px-2 py-1 font-mono">
                            Reply-To: tong@notfair.co
                        </span>
                        <span className="rounded border border-[#3D3C36] bg-[#1A1917]/60 px-2 py-1 font-mono">
                            Subject: {preview.subject}
                        </span>
                        <div className="ml-auto inline-flex overflow-hidden rounded-md border border-[#3D3C36]">
                            <button
                                type="button"
                                onClick={() => setMode('html')}
                                className={`px-2 py-1 text-[11px] font-semibold uppercase tracking-wider transition-colors ${
                                    mode === 'html' ? 'bg-[#4CAF6E]/20 text-[#4CAF6E]' : 'bg-[#1A1917]/60 text-[#C4C0B6] hover:bg-[#2E2D28]'
                                }`}
                            >HTML</button>
                            <button
                                type="button"
                                onClick={() => setMode('text')}
                                className={`px-2 py-1 text-[11px] font-semibold uppercase tracking-wider transition-colors border-l border-[#3D3C36] ${
                                    mode === 'text' ? 'bg-[#4CAF6E]/20 text-[#4CAF6E]' : 'bg-[#1A1917]/60 text-[#C4C0B6] hover:bg-[#2E2D28]'
                                }`}
                            >Text</button>
                        </div>
                    </div>

                    {mode === 'html' ? (
                        <iframe
                            // sandbox blocks scripts but allows CSS / forms — our email has no
                            // scripts, just inline styles. allow-popups so the upgrade CTA
                            // opens in a new tab during preview without breaking out of the
                            // iframe.
                            sandbox="allow-popups allow-popups-to-escape-sandbox"
                            srcDoc={preview.html}
                            className="h-[640px] w-full rounded-lg border border-[#3D3C36] bg-white"
                            title="Trial-end email preview"
                        />
                    ) : (
                        <pre className="max-h-[640px] overflow-auto rounded-lg border border-[#3D3C36] bg-[#1A1917]/80 p-4 font-mono text-[12px] leading-relaxed text-[#E8E4DD] whitespace-pre-wrap">
{preview.text}
                        </pre>
                    )}
                </div>
            )}
        </section>
    );
}

// ─── Eligible (queued for future runs) ─────────────────────────────────

type RowSendState =
    | { status: 'idle' }
    | { status: 'loading-preview' }
    | { status: 'sending' }
    | { status: 'ok'; message: string }
    | { status: 'err'; message: string };

interface PreviewState {
    userId: string;
    email: string;
    subject: string;
    html: string;
    text: string;
    firstName: string | null;
}

function EligibleSection({
    eligible,
    eligibleCapped,
    queuedForLater,
    maxPerRun,
    env,
}: {
    eligible: DashboardEligibleRow[];
    eligibleCapped: boolean;
    queuedForLater: number;
    maxPerRun: number;
    env: 'test' | 'live';
}) {
    const router = useRouter();
    const [, startTransition] = useTransition();
    const [expanded, setExpanded] = useState(true);
    const [query, setQuery] = useState('');
    const [page, setPage] = useState(1);
    // Per-row state, keyed by userId, so multiple sends can be in-flight
    // and resolve independently without re-rendering each other.
    const [rowState, setRowState] = useState<Record<string, RowSendState>>({});
    // Modal state — at most one open at a time. Null when closed.
    const [preview, setPreview] = useState<PreviewState | null>(null);
    const [previewError, setPreviewError] = useState<string | null>(null);

    const filtered = useMemo(() => {
        if (!query.trim()) return eligible;
        const q = query.trim().toLowerCase();
        return eligible.filter((r) => r.email.toLowerCase().includes(q) || r.userId.toLowerCase().includes(q));
    }, [eligible, query]);

    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    const safePage = Math.min(page, totalPages);
    const start = (safePage - 1) * PAGE_SIZE;
    const visible = filtered.slice(start, start + PAGE_SIZE);

    const openPreview = async (userId: string) => {
        const current = rowState[userId]?.status;
        if (current === 'loading-preview' || current === 'sending') return;
        setRowState((s) => ({ ...s, [userId]: { status: 'loading-preview' } }));
        setPreviewError(null);
        try {
            const res = await fetch(
                `/api/dev/email/trial-end/preview?userId=${encodeURIComponent(userId)}&env=${env}`,
                { credentials: 'include' },
            );
            // API returns `recipient` (more email-domain natural) but PreviewState
            // uses `email` everywhere else in this component for consistency.
            const body = (await res.json().catch(() => ({}))) as {
                subject?: string;
                html?: string;
                text?: string;
                recipient?: string;
                firstName?: string | null;
                userId?: string;
                error?: string;
                message?: string;
            };
            if (!res.ok) {
                const msg: string = body.message ?? body.error ?? `HTTP ${res.status}`;
                setRowState((s) => ({ ...s, [userId]: { status: 'err', message: msg } }));
                return;
            }
            const fetched: PreviewState = {
                userId: body.userId ?? userId,
                email: body.recipient ?? '',
                subject: body.subject ?? '',
                html: body.html ?? '',
                text: body.text ?? '',
                firstName: body.firstName ?? null,
            };
            // Reset to idle — modal is now the source of truth for "in-progress".
            setRowState((s) => ({ ...s, [userId]: { status: 'idle' } }));
            setPreview(fetched);
        } catch (err) {
            setRowState((s) => ({
                ...s,
                [userId]: { status: 'err', message: err instanceof Error ? err.message : String(err) },
            }));
        }
    };

    const confirmSend = async () => {
        if (!preview) return;
        const userId = preview.userId;
        setRowState((s) => ({ ...s, [userId]: { status: 'sending' } }));
        try {
            const res = await fetch('/api/dev/email/trial-end/send-one', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId, env }),
            });
            const body = (await res.json().catch(() => ({}))) as
                | { sent: true; email: string; resendId: string }
                | { sent: false; reason: 'not_eligible' | 'send_failed'; userId: string; email?: string; error?: string }
                | { error: string };

            if (!res.ok) {
                const msg: string = ('error' in body && typeof body.error === 'string' && body.error.length > 0)
                    ? body.error
                    : `HTTP ${res.status}`;
                setPreviewError(msg);
                setRowState((s) => ({ ...s, [userId]: { status: 'err', message: msg } }));
                return;
            }
            if ('sent' in body && body.sent) {
                setRowState((s) => ({ ...s, [userId]: { status: 'ok', message: `Sent · ${body.resendId.slice(0, 8)}…` } }));
                setPreview(null);
                startTransition(() => router.refresh());
            } else if ('sent' in body && !body.sent) {
                const reason: string = body.reason === 'not_eligible'
                    ? 'No longer eligible (paid, opted out, or already sent)'
                    : `Send failed: ${body.error ?? 'unknown'}`;
                setPreviewError(reason);
                setRowState((s) => ({ ...s, [userId]: { status: 'err', message: reason } }));
            }
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            setPreviewError(message);
            setRowState((s) => ({ ...s, [userId]: { status: 'err', message } }));
        }
    };

    const sendingFromModal = preview ? rowState[preview.userId]?.status === 'sending' : false;

    return (
        <section className="border-b border-[#3D3C36] bg-[#1A1917]/40 px-4 py-4 sm:px-6">
            <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="flex w-full items-center gap-2 text-left"
            >
                {expanded ? <ChevronDown className="h-4 w-4 text-[#C4C0B6]" /> : <ChevronRight className="h-4 w-4 text-[#C4C0B6]" />}
                <h2 className="text-[13px] font-semibold uppercase tracking-widest text-[#C4C0B6]">
                    Eligible for next run
                </h2>
                <span className="font-mono text-[11px] text-[#C4C0B6]/70">
                    {eligible.length}{eligibleCapped ? '+' : ''} matching · next run sends up to {maxPerRun}
                    {queuedForLater > 0 && ` · ${queuedForLater} queued for later`}
                </span>
            </button>

            {expanded && (
                <>
                    <SearchBar value={query} onChange={(v) => { setQuery(v); setPage(1); }} placeholder="Filter by email or user id…" />

                    {filtered.length === 0 ? (
                        <EmptyHint>
                            {eligible.length === 0
                                ? "Nobody is queued. Either no trials have lapsed since the last run, or everyone post-trial has either been emailed, paid up, or opted out."
                                : "No matches for that search."}
                        </EmptyHint>
                    ) : (
                        <div className="mt-3 overflow-hidden rounded-lg border border-[#3D3C36]">
                            <table className="w-full text-left border-collapse">
                                <thead className="bg-[#24231F]">
                                    <tr className="border-b border-[#3D3C36]">
                                        <th className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-widest text-[#C4C0B6] w-12">#</th>
                                        <th className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-widest text-[#C4C0B6]">Recipient</th>
                                        <th className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-widest text-[#C4C0B6]">Trial ended</th>
                                        <th className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-widest text-[#C4C0B6]">Scheduled for</th>
                                        <th className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-widest text-[#C4C0B6] text-right">Send</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {visible.map((row, i) => {
                                        const overallIndex = start + i;
                                        const inNextBatch = overallIndex < maxPerRun;
                                        const state = rowState[row.userId] ?? { status: 'idle' as const };
                                        return (
                                            <tr key={row.userId} className="border-b border-[#3D3C36]/60 last:border-b-0 hover:bg-[#2E2D28]/40">
                                                <td className="px-4 py-2 font-mono text-[11px] text-[#C4C0B6]/60">{overallIndex + 1}</td>
                                                <td className="px-4 py-2">
                                                    <div className="text-[13px] text-[#E8E4DD]">{row.email}</div>
                                                    <div className="font-mono text-[10px] text-[#C4C0B6]/50">{row.userId}</div>
                                                </td>
                                                <td className="px-4 py-2 font-mono text-[11px] text-[#C4C0B6]">{formatDateTime(row.trialEndedAtIso)}</td>
                                                <td className="px-4 py-2">
                                                    {inNextBatch ? (
                                                        <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[#4CAF6E] bg-[#4CAF6E]/15 border border-[#4CAF6E]/30">
                                                            Next run
                                                        </span>
                                                    ) : (
                                                        <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[#D4882A] bg-[#D4882A]/15 border border-[#D4882A]/30">
                                                            Queued · day {Math.floor(overallIndex / maxPerRun) + 1}
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="px-4 py-2 text-right">
                                                    <SendButton
                                                        state={state}
                                                        onSend={() => openPreview(row.userId)}
                                                    />
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                            <Pager page={safePage} totalPages={totalPages} total={filtered.length} onChange={setPage} />
                        </div>
                    )}
                </>
            )}

            <ConfirmSendModal
                preview={preview}
                error={previewError}
                sending={sendingFromModal}
                onCancel={() => { setPreview(null); setPreviewError(null); }}
                onConfirm={confirmSend}
            />
        </section>
    );
}

function ConfirmSendModal({
    preview,
    error,
    sending,
    onCancel,
    onConfirm,
}: {
    preview: PreviewState | null;
    error: string | null;
    sending: boolean;
    onCancel: () => void;
    onConfirm: () => void;
}) {
    const [mode, setMode] = useState<'html' | 'text'>('html');
    const open = preview !== null;

    return (
        <Dialog open={open} onOpenChange={(next) => { if (!next && !sending) onCancel(); }}>
            <DialogContent className="!max-w-3xl !w-[92vw] bg-[#1A1917] border-[#3D3C36] text-[#E8E4DD] p-0 gap-0">
                <DialogHeader className="px-5 pt-5 pb-3 border-b border-[#3D3C36]">
                    <DialogTitle className="text-[15px] font-semibold text-[#E8E4DD]">
                        Send trial-end email
                    </DialogTitle>
                    <DialogDescription className="text-[12px] text-[#C4C0B6]">
                        Review the exact content that will land in this customer's inbox before confirming.
                    </DialogDescription>
                </DialogHeader>

                {preview && (
                    <div className="px-5 py-4 space-y-3 max-h-[70vh] overflow-y-auto">
                        <div className="grid grid-cols-1 gap-1.5 text-[12px]">
                            <KV label="To">
                                <span className="font-mono text-[#E8E4DD]">{preview.email}</span>
                                {preview.firstName && (
                                    <span className="ml-2 inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[#4CAF6E] bg-[#4CAF6E]/15 border border-[#4CAF6E]/30">
                                        Greeting: {preview.firstName}
                                    </span>
                                )}
                                {!preview.firstName && (
                                    <span className="ml-2 inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[#D4882A] bg-[#D4882A]/15 border border-[#D4882A]/30">
                                        Greeting: fallback (no name on file)
                                    </span>
                                )}
                            </KV>
                            <KV label="From"><span className="font-mono">NotFair &lt;alert@updates.notfair.co&gt;</span></KV>
                            <KV label="Reply-To"><span className="font-mono">tong@notfair.co</span></KV>
                            <KV label="Subject"><span className="font-mono">{preview.subject}</span></KV>
                        </div>

                        <div className="flex items-center justify-end">
                            <div className="inline-flex overflow-hidden rounded-md border border-[#3D3C36]">
                                <button
                                    type="button"
                                    onClick={() => setMode('html')}
                                    className={`px-2 py-1 text-[11px] font-semibold uppercase tracking-wider ${
                                        mode === 'html' ? 'bg-[#4CAF6E]/20 text-[#4CAF6E]' : 'bg-[#1A1917]/60 text-[#C4C0B6] hover:bg-[#2E2D28]'
                                    }`}
                                >HTML</button>
                                <button
                                    type="button"
                                    onClick={() => setMode('text')}
                                    className={`px-2 py-1 text-[11px] font-semibold uppercase tracking-wider border-l border-[#3D3C36] ${
                                        mode === 'text' ? 'bg-[#4CAF6E]/20 text-[#4CAF6E]' : 'bg-[#1A1917]/60 text-[#C4C0B6] hover:bg-[#2E2D28]'
                                    }`}
                                >Text</button>
                            </div>
                        </div>

                        {mode === 'html' ? (
                            <iframe
                                sandbox="allow-popups allow-popups-to-escape-sandbox"
                                srcDoc={preview.html}
                                className="h-[460px] w-full rounded-lg border border-[#3D3C36] bg-white"
                                title="Email preview"
                            />
                        ) : (
                            <pre className="max-h-[460px] overflow-auto rounded-lg border border-[#3D3C36] bg-[#1A1917]/80 p-4 font-mono text-[12px] leading-relaxed text-[#E8E4DD] whitespace-pre-wrap">
{preview.text}
                            </pre>
                        )}

                        {error && (
                            <div className="rounded-md border border-[#C45D4A]/40 bg-[#C45D4A]/10 px-3 py-2 text-[12px] text-[#E89A8B]">
                                {error}
                            </div>
                        )}
                    </div>
                )}

                <DialogFooter className="px-5 py-3 border-t border-[#3D3C36] flex flex-row justify-end gap-2 sm:gap-2">
                    <button
                        type="button"
                        onClick={onCancel}
                        disabled={sending}
                        className="inline-flex items-center gap-1.5 rounded-md border border-[#3D3C36] bg-[#1A1917]/60 px-3 py-1.5 text-[12px] text-[#C4C0B6] hover:bg-[#2E2D28] disabled:opacity-60"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={onConfirm}
                        disabled={sending}
                        className="inline-flex items-center gap-1.5 rounded-md border border-[#4CAF6E]/40 bg-[#4CAF6E]/15 px-3 py-1.5 text-[12px] font-semibold text-[#4CAF6E] hover:bg-[#4CAF6E]/25 disabled:opacity-60"
                    >
                        {sending ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Sending…</> : <><Send className="h-3.5 w-3.5" /> Send now</>}
                    </button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function KV({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="flex items-baseline gap-2">
            <span className="w-[64px] shrink-0 text-[10px] font-semibold uppercase tracking-widest text-[#C4C0B6]">{label}</span>
            <span className="flex-1 min-w-0 text-[12px] text-[#E8E4DD]">{children}</span>
        </div>
    );
}

function SendButton({ state, onSend }: { state: RowSendState; onSend: () => void }) {
    if (state.status === 'loading-preview') {
        return (
            <span className="inline-flex items-center gap-1.5 rounded-md border border-[#3D3C36] bg-[#1A1917]/60 px-2.5 py-1 text-[11px] text-[#C4C0B6]">
                <Loader2 className="h-3 w-3 animate-spin" /> Loading…
            </span>
        );
    }
    if (state.status === 'sending') {
        return (
            <span className="inline-flex items-center gap-1.5 rounded-md border border-[#3D3C36] bg-[#1A1917]/60 px-2.5 py-1 text-[11px] text-[#C4C0B6]">
                <Loader2 className="h-3 w-3 animate-spin" /> Sending…
            </span>
        );
    }
    if (state.status === 'ok') {
        return (
            <span
                className="inline-flex items-center gap-1.5 rounded-md border border-[#4CAF6E]/40 bg-[#4CAF6E]/10 px-2.5 py-1 text-[11px] font-mono text-[#7DDA9D]"
                title={state.message}
            >
                <Check className="h-3 w-3" /> {state.message}
            </span>
        );
    }
    if (state.status === 'err') {
        return (
            <button
                type="button"
                onClick={onSend}
                className="inline-flex items-center gap-1.5 rounded-md border border-[#C45D4A]/40 bg-[#C45D4A]/10 px-2.5 py-1 text-[11px] text-[#E89A8B] hover:bg-[#C45D4A]/20"
                title={state.message}
            >
                <AlertCircle className="h-3 w-3" /> Retry
            </button>
        );
    }
    return (
        <button
            type="button"
            onClick={onSend}
            className="inline-flex items-center gap-1.5 rounded-md border border-[#4CAF6E]/40 bg-[#4CAF6E]/15 px-2.5 py-1 text-[11px] font-semibold text-[#4CAF6E] hover:bg-[#4CAF6E]/25"
        >
            <Send className="h-3 w-3" /> Send
        </button>
    );
}

// ─── Sent history ──────────────────────────────────────────────────────

function SentSection({ sends, env }: { sends: DashboardSendRow[]; env: 'test' | 'live' }) {
    const [expanded, setExpanded] = useState(true);
    const [query, setQuery] = useState('');
    const [page, setPage] = useState(1);

    const filtered = useMemo(() => {
        if (!query.trim()) return sends;
        const q = query.trim().toLowerCase();
        return sends.filter((r) => r.email.toLowerCase().includes(q) || r.userId.toLowerCase().includes(q));
    }, [sends, query]);

    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    const safePage = Math.min(page, totalPages);
    const start = (safePage - 1) * PAGE_SIZE;
    const visible = filtered.slice(start, start + PAGE_SIZE);

    return (
        <section className="px-4 py-4 sm:px-6">
            <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="flex w-full items-center gap-2 text-left"
            >
                {expanded ? <ChevronDown className="h-4 w-4 text-[#C4C0B6]" /> : <ChevronRight className="h-4 w-4 text-[#C4C0B6]" />}
                <h2 className="text-[13px] font-semibold uppercase tracking-widest text-[#C4C0B6]">
                    Sent history
                </h2>
                <span className="font-mono text-[11px] text-[#C4C0B6]/70">
                    {sends.length} send{sends.length === 1 ? '' : 's'}
                </span>
            </button>

            {expanded && (
                <>
                    <SearchBar value={query} onChange={(v) => { setQuery(v); setPage(1); }} placeholder="Filter by email or user id…" />

                    {filtered.length === 0 ? (
                        <EmptyHint>
                            {sends.length === 0
                                ? `No trial-end emails have been sent yet on env=${env}. The daily cron runs at 16:00 UTC and inserts a row per successful send.`
                                : "No matches for that search."}
                        </EmptyHint>
                    ) : (
                        <div className="mt-3 overflow-hidden rounded-lg border border-[#3D3C36]">
                            <table className="w-full text-left border-collapse">
                                <thead className="bg-[#24231F]">
                                    <tr className="border-b border-[#3D3C36]">
                                        <th className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-widest text-[#C4C0B6]">Recipient</th>
                                        <th className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-widest text-[#C4C0B6]">Sent</th>
                                        <th className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-widest text-[#C4C0B6]">Delivered</th>
                                        <th className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-widest text-[#C4C0B6]">Opened</th>
                                        <th className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-widest text-[#C4C0B6]">CTA Clicked</th>
                                        <th className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-widest text-[#C4C0B6]">Bounced</th>
                                        <th className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-widest text-[#C4C0B6]">Paid?</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {visible.map((row) => (
                                        <tr key={row.id} className="border-b border-[#3D3C36]/60 last:border-b-0 hover:bg-[#2E2D28]/40">
                                            <td className="px-4 py-2.5">
                                                <div className="text-[13px] text-[#E8E4DD]">{row.email}</div>
                                                <div className="font-mono text-[10px] text-[#C4C0B6]/50">{row.userId}</div>
                                            </td>
                                            <td className="px-4 py-2.5 font-mono text-[11px] text-[#C4C0B6]">{formatDateTime(row.sentAtIso)}</td>
                                            <td className="px-4 py-2.5"><StageBadge on={row.deliveredAtIso != null} label="Delivered" /></td>
                                            <td className="px-4 py-2.5"><StageBadge on={row.openedAtIso != null} label="Opened" /></td>
                                            <td className="px-4 py-2.5"><StageBadge on={row.clickedAtIso != null} label="Clicked" /></td>
                                            <td className="px-4 py-2.5"><BounceBadge on={row.bouncedAtIso != null} type={row.bounceType} /></td>
                                            <td className="px-4 py-2.5"><PaidBadge plan={row.plan} status={row.stripeStatus} /></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            <Pager page={safePage} totalPages={totalPages} total={filtered.length} onChange={setPage} />
                        </div>
                    )}
                </>
            )}
        </section>
    );
}

// ─── Small UI bits ─────────────────────────────────────────────────────

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
    return (
        <div className="rounded-lg border border-[#3D3C36] bg-[#24231F] px-4 py-3">
            <div className="text-[10px] font-semibold uppercase tracking-widest text-[#C4C0B6]">{label}</div>
            <div className="mt-1 font-mono text-[20px] leading-tight text-[#E8E4DD]">{value}</div>
            {sub && <div className="mt-0.5 font-mono text-[11px] text-[#C4C0B6]">{sub}</div>}
        </div>
    );
}

function StageBadge({ on, label }: { on: boolean; label: string }) {
    return on ? (
        <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[#4CAF6E] bg-[#4CAF6E]/15 border border-[#4CAF6E]/30">
            {label}
        </span>
    ) : <span className="text-[#C4C0B6]/40">—</span>;
}

function BounceBadge({ on, type }: { on: boolean; type: string | null }) {
    if (!on) return <span className="text-[#C4C0B6]/40">—</span>;
    return (
        <span
            className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[#C45D4A] bg-[#C45D4A]/15 border border-[#C45D4A]/30"
            title={type ?? undefined}
        >
            Bounced{type ? ` · ${type}` : ''}
        </span>
    );
}

function PaidBadge({ plan, status }: { plan: 'free' | 'growth'; status: string | null }) {
    if (plan === 'growth') {
        return (
            <span
                className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[#4CAF6E] bg-[#4CAF6E]/15 border border-[#4CAF6E]/30"
                title={status ?? undefined}
            >
                Growth
            </span>
        );
    }
    return (
        <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[#C4C0B6] bg-[#1A1917]/70 border border-[#3D3C36]">
            Free
        </span>
    );
}

function SearchBar({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
    return (
        <div className="relative mt-3 max-w-md">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#C4C0B6]/60" />
            <input
                type="text"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder={placeholder}
                className="h-9 w-full rounded-lg border border-[#3D3C36] bg-[#24231F] pl-8 pr-8 font-mono text-[12px] text-[#E8E4DD] outline-none placeholder:text-[#C4C0B6]/45 focus:border-[#4CAF6E]/60"
            />
            {value && (
                <button
                    type="button"
                    onClick={() => onChange('')}
                    className="absolute right-2 top-1/2 grid h-5 w-5 -translate-y-1/2 place-items-center rounded-md text-[#C4C0B6] hover:bg-[#2E2D28] hover:text-[#E8E4DD]"
                    aria-label="Clear search"
                >
                    <X className="h-3 w-3" />
                </button>
            )}
        </div>
    );
}

function Pager({
    page, totalPages, total, onChange,
}: {
    page: number; totalPages: number; total: number; onChange: (page: number) => void;
}) {
    if (totalPages <= 1) {
        return (
            <div className="flex items-center justify-end border-t border-[#3D3C36]/60 bg-[#24231F]/40 px-4 py-2 text-[11px] text-[#C4C0B6]">
                {total} row{total === 1 ? '' : 's'}
            </div>
        );
    }
    return (
        <div className="flex items-center justify-between border-t border-[#3D3C36]/60 bg-[#24231F]/40 px-4 py-2 text-[11px] text-[#C4C0B6]">
            <span>Page {page} of {totalPages} · {total} rows</span>
            <div className="flex gap-1">
                <button
                    type="button"
                    disabled={page <= 1}
                    onClick={() => onChange(page - 1)}
                    className="rounded border border-[#3D3C36] bg-[#1A1917]/60 px-2 py-1 text-[#C4C0B6] hover:bg-[#2E2D28] disabled:opacity-40"
                >Prev</button>
                <button
                    type="button"
                    disabled={page >= totalPages}
                    onClick={() => onChange(page + 1)}
                    className="rounded border border-[#3D3C36] bg-[#1A1917]/60 px-2 py-1 text-[#C4C0B6] hover:bg-[#2E2D28] disabled:opacity-40"
                >Next</button>
            </div>
        </div>
    );
}

function EmptyHint({ children }: { children: React.ReactNode }) {
    return (
        <div className="mt-3 rounded-lg border border-dashed border-[#3D3C36] bg-[#24231F]/40 p-6 text-center">
            <p className="text-sm text-[#C4C0B6]">{children}</p>
        </div>
    );
}

function formatDateTime(iso: string): string {
    return new Date(iso).toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

function pct(numerator: number, denominator: number): string {
    if (denominator === 0) return '0%';
    return `${((numerator / denominator) * 100).toFixed(1)}%`;
}
