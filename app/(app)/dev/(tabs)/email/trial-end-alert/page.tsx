import 'server-only';

import type Stripe from 'stripe';
import { db, schema } from '@/lib/db';
import { EMAIL_SEND_KIND } from '@/lib/db/schema';
import { sql, desc, eq, and, inArray } from 'drizzle-orm';
import { isPlanEntitled, planFromSubscriptionRow } from '@/lib/subscription';
import {
    MAX_PER_RUN_TRIAL_END,
    nextTrialEndCronTriggerUtc,
} from '@/lib/email/trial-end-config';
import { buildTrialEndEmail } from '@/lib/email/trial-end';
import { loadTrialEndCandidates } from '@/lib/email/trial-end-runner';
import { TrialEndView, type DashboardSendRow } from './trial-end-view';

export const dynamic = 'force-dynamic';

const ELIGIBLE_CAP = 1000;
const SENT_HISTORY_CAP = 500;

// Dashboard is always scoped to production data. The cron itself uses
// stripeMode() so it scopes to the running env's subscriptions, but the
// dashboard is a tool we use to monitor real customers — viewing test data
// here would be misleading. Test-env sends still land in the email_sends
// table; they're just not surfaced on this page.
const DASHBOARD_ENV = 'live' as const;

async function loadDashboardData() {
    const env = DASHBOARD_ENV;

    const sends = await db()
        .select({
            id: schema.emailSends.id,
            userId: schema.emailSends.userId,
            email: schema.emailSends.email,
            status: schema.emailSends.status,
            sentAt: schema.emailSends.sentAt,
            deliveredAt: schema.emailSends.deliveredAt,
            openedAt: schema.emailSends.openedAt,
            clickedAt: schema.emailSends.clickedAt,
            bouncedAt: schema.emailSends.bouncedAt,
            bounceType: schema.emailSends.bounceType,
        })
        .from(schema.emailSends)
        .where(
            and(
                eq(schema.emailSends.kind, EMAIL_SEND_KIND.TRIAL_END),
                eq(schema.emailSends.env, env),
            ),
        )
        .orderBy(desc(schema.emailSends.sentAt))
        .limit(SENT_HISTORY_CAP);

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

    const sendRows: DashboardSendRow[] = sends.map((send) => {
        const sub = subsByUser.get(send.userId);
        const plan = planFromSubscriptionRow({ data: sub?.data ?? null });
        const stripeStatus = sub?.stripeStatus ?? null;
        const becamePaidAfterSend = plan === 'growth' && !!stripeStatus && isPlanEntitled(stripeStatus);
        return {
            id: send.id,
            userId: send.userId,
            email: send.email,
            sentAtIso: send.sentAt.toISOString(),
            deliveredAtIso: send.deliveredAt ? send.deliveredAt.toISOString() : null,
            openedAtIso: send.openedAt ? send.openedAt.toISOString() : null,
            clickedAtIso: send.clickedAt ? send.clickedAt.toISOString() : null,
            bouncedAtIso: send.bouncedAt ? send.bouncedAt.toISOString() : null,
            bounceType: send.bounceType,
            plan,
            stripeStatus,
            becamePaidAfterSend,
        };
    });

    const eligibleRaw = await loadTrialEndCandidates({ env, limit: ELIGIBLE_CAP });
    const eligible = eligibleRaw.map((c) => ({
        userId: c.userId,
        email: c.email,
        trialEndedAtIso: c.trialEndsAt.toISOString(),
    }));
    const eligibleCapped = eligible.length >= ELIGIBLE_CAP;
    return { sends: sendRows, eligible, eligibleCapped, env };
}

export default async function TrialEndAlertDashboard() {
    const { sends, eligible, eligibleCapped, env } = await loadDashboardData();
    const nextTrigger = nextTrialEndCronTriggerUtc();
    // Preview uses a placeholder name so the personalized greeting is visible;
    // production sends use each recipient's real first name from auth.users.
    const emailPreview = buildTrialEndEmail({ firstName: 'Alex' });

    return (
        <TrialEndView
            sends={sends}
            eligible={eligible}
            eligibleCapped={eligibleCapped}
            env={env}
            maxPerRun={MAX_PER_RUN_TRIAL_END}
            nextTriggerIso={nextTrigger.toISOString()}
            emailPreview={emailPreview}
        />
    );
}
