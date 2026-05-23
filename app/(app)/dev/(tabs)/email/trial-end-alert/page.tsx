import 'server-only';

import type Stripe from 'stripe';
import { db, schema } from '@/lib/db';
import { EMAIL_SEND_KIND } from '@/lib/db/schema';
import { sql, desc, eq, and, inArray } from 'drizzle-orm';
import { stripeMode } from '@/lib/stripe/config';
import { isPlanEntitled, planFromSubscriptionRow } from '@/lib/subscription';

export const dynamic = 'force-dynamic';

interface SendRow {
    id: number;
    userId: string;
    email: string;
    resendId: string;
    status: string;
    sentAt: Date;
    deliveredAt: Date | null;
    openedAt: Date | null;
    clickedAt: Date | null;
    bouncedAt: Date | null;
    bounceType: string | null;
    errorMessage: string | null;
}

interface DashboardRow extends SendRow {
    plan: 'free' | 'growth';
    stripeStatus: string | null;
    becamePaidAfterSend: boolean;
}

async function loadTrialEndDashboard(): Promise<{ rows: DashboardRow[]; env: 'test' | 'live' }> {
    const env = stripeMode();

    const sends = await db()
        .select({
            id: schema.emailSends.id,
            userId: schema.emailSends.userId,
            email: schema.emailSends.email,
            resendId: schema.emailSends.resendId,
            status: schema.emailSends.status,
            sentAt: schema.emailSends.sentAt,
            deliveredAt: schema.emailSends.deliveredAt,
            openedAt: schema.emailSends.openedAt,
            clickedAt: schema.emailSends.clickedAt,
            bouncedAt: schema.emailSends.bouncedAt,
            bounceType: schema.emailSends.bounceType,
            errorMessage: schema.emailSends.errorMessage,
        })
        .from(schema.emailSends)
        .where(
            and(
                eq(schema.emailSends.kind, EMAIL_SEND_KIND.TRIAL_END),
                eq(schema.emailSends.env, env),
            ),
        )
        .orderBy(desc(schema.emailSends.sentAt))
        .limit(500);

    const userIds = [...new Set(sends.map((s) => s.userId))];
    const subsByUser = new Map<string, { data: Stripe.Subscription | null; stripeStatus: string | null }>();
    if (userIds.length > 0) {
        const subs = await db()
            .select({
                userId: schema.subscriptions.userId,
                data: schema.subscriptions.data,
                stripeStatus: sql<string | null>`${schema.subscriptions.data}->>'status'`,
            })
            .from(schema.subscriptions)
            .where(
                and(
                    inArray(schema.subscriptions.userId, userIds),
                    eq(schema.subscriptions.env, env),
                ),
            );
        for (const s of subs) {
            subsByUser.set(s.userId, {
                data: s.data as Stripe.Subscription | null,
                stripeStatus: s.stripeStatus,
            });
        }
    }

    const rows: DashboardRow[] = sends.map((send) => {
        const sub = subsByUser.get(send.userId);
        const plan = planFromSubscriptionRow({ data: sub?.data ?? null });
        const stripeStatus = sub?.stripeStatus ?? null;
        // "Became paid after the email" — they're on Growth right now AND the
        // current Stripe row says entitled. We don't have the conversion
        // timestamp on the sub row directly (Stripe is source of truth), but
        // for the dashboard's purpose the live state is what matters.
        const becamePaidAfterSend = plan === 'growth' && !!stripeStatus && isPlanEntitled(stripeStatus);
        return { ...send, plan, stripeStatus, becamePaidAfterSend };
    });

    return { rows, env };
}

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
    ) : (
        <span className="text-[#C4C0B6]/40">—</span>
    );
}

function BounceBadge({ on, type }: { on: boolean; type: string | null }) {
    if (!on) return <span className="text-[#C4C0B6]/40">—</span>;
    return (
        <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[#C45D4A] bg-[#C45D4A]/15 border border-[#C45D4A]/30" title={type ?? undefined}>
            Bounced{type ? ` · ${type}` : ''}
        </span>
    );
}

function PaidBadge({ plan, status }: { plan: 'free' | 'growth'; status: string | null }) {
    if (plan === 'growth') {
        return (
            <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[#4CAF6E] bg-[#4CAF6E]/15 border border-[#4CAF6E]/30" title={status ?? undefined}>
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

function formatDateTime(d: Date | null): string {
    if (!d) return '—';
    return new Date(d).toLocaleString(undefined, {
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

export default async function TrialEndAlertDashboard() {
    const { rows, env } = await loadTrialEndDashboard();

    const total = rows.length;
    const delivered = rows.filter((r) => r.deliveredAt != null).length;
    const opened = rows.filter((r) => r.openedAt != null).length;
    const clicked = rows.filter((r) => r.clickedAt != null).length;
    const bounced = rows.filter((r) => r.bouncedAt != null).length;
    const paid = rows.filter((r) => r.becamePaidAfterSend).length;

    return (
        <div className="flex h-full flex-col overflow-hidden">
            <header className="shrink-0 border-b border-[#3D3C36] bg-[#24231F]/80 px-4 py-4 sm:px-6">
                <div className="flex items-baseline justify-between gap-3">
                    <div>
                        <h1 className="text-[16px] font-semibold text-[#E8E4DD]">Trial-end alert</h1>
                        <p className="mt-0.5 text-[12px] text-[#C4C0B6]">
                            Last 500 sends · env={env} · webhook: <code className="font-mono">/api/webhooks/resend</code>
                        </p>
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
                {total === 0 ? (
                    <div className="m-6 rounded-lg border border-dashed border-[#3D3C36] bg-[#24231F]/40 p-10 text-center">
                        <p className="text-sm text-[#C4C0B6]">No trial-end emails have been sent yet on env={env}.</p>
                        <p className="mt-1 text-[12px] text-[#C4C0B6]/60">The daily cron runs at 16:00 UTC and inserts a row per successful send.</p>
                    </div>
                ) : (
                    <table className="w-full text-left border-collapse">
                        <thead className="sticky top-0 z-10 bg-[#24231F]">
                            <tr className="border-b border-[#3D3C36]">
                                <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-widest text-[#C4C0B6]">Recipient</th>
                                <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-widest text-[#C4C0B6]">Sent</th>
                                <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-widest text-[#C4C0B6]">Delivered</th>
                                <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-widest text-[#C4C0B6]">Opened</th>
                                <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-widest text-[#C4C0B6]">CTA Clicked</th>
                                <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-widest text-[#C4C0B6]">Bounced</th>
                                <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-widest text-[#C4C0B6]">Paid?</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((row) => (
                                <tr key={row.id} className="border-b border-[#3D3C36]/60 hover:bg-[#2E2D28]/40">
                                    <td className="px-4 py-2.5">
                                        <div className="text-[13px] text-[#E8E4DD]">{row.email}</div>
                                        <div className="font-mono text-[10px] text-[#C4C0B6]/50">{row.userId}</div>
                                    </td>
                                    <td className="px-4 py-2.5 font-mono text-[11px] text-[#C4C0B6]">{formatDateTime(row.sentAt)}</td>
                                    <td className="px-4 py-2.5"><StageBadge on={row.deliveredAt != null} label="Delivered" /></td>
                                    <td className="px-4 py-2.5"><StageBadge on={row.openedAt != null} label="Opened" /></td>
                                    <td className="px-4 py-2.5"><StageBadge on={row.clickedAt != null} label="Clicked" /></td>
                                    <td className="px-4 py-2.5"><BounceBadge on={row.bouncedAt != null} type={row.bounceType} /></td>
                                    <td className="px-4 py-2.5"><PaidBadge plan={row.plan} status={row.stripeStatus} /></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}
