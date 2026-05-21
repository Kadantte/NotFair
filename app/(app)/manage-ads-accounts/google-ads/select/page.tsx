import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { AccountSelector, type SelectableAccount } from '@/components/account-selector';
import { getSession } from '@/lib/session';
import { DEFAULT_ACTIVATION_PATH, safeInternalPathOrDefault } from '@/lib/app-routes';

type Props = {
    searchParams: Promise<{
        pending?: string;
        accounts?: string;
        selected?: string;
        next?: string;
        mode?: string;
    }>;
};

/**
 * Google Ads multi-account picker. Lands here from /auth/callback after a
 * successful OAuth that returned 2+ usable Ads accounts. The candidate
 * accounts come in via URL params (the auth callback already pre-validated
 * them against Google), so this page does no Google API work itself —
 * just renders the picker and forwards the user's choice to
 * /api/auth/select-account.
 *
 * Without a `pending` token there's nothing to show; users are bounced to
 * /manage-ads-accounts where they pick a platform.
 */
export default async function GoogleAdsSelectRoute({ searchParams }: Props) {
    const t = await getTranslations('ManageAdsAccounts');
    const sp = await searchParams;

    const accounts = parseAccounts(sp.accounts);
    const mode: 'create' | 'update' = sp.mode === 'update' ? 'update' : 'create';

    // Bare URL with nothing to pick from → go to the platform-picker hub.
    if (accounts.length === 0) {
        redirect('/manage-ads-accounts');
    }

    // Confirm the user actually has a session backing the pending token.
    // If they don't, /api/auth/select-account would 404 anyway — bounce them
    // to /login rather than presenting a doomed picker.
    const session = await getSession();
    if (!session.connected) {
        redirect('/login');
    }

    // In update mode, read the LIVE selection from the session (not the URL).
    // The `selected` param was the snapshot at the time /api/auth/add-account
    // generated the link; toggle-immediate commits since then would otherwise
    // not be reflected on refresh.
    //
    // In create mode the session is still pending (customerIds: []), so the
    // URL's `selected` is the only signal — fall back to it.
    const preselected =
        mode === 'update' && session.customerIds.length > 0
            ? session.customerIds.map((a) => a.id)
            : parseSelected(sp.selected);

    // New signup default is auto mode: after account selection NotFair should
    // start working, not ask the user to invent a prompt.
    const next = safeInternalPathOrDefault(sp.next, DEFAULT_ACTIVATION_PATH);

    return (
        <section className="flex h-full min-h-0 flex-col overflow-hidden">
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-8">
                <div className="mx-auto max-w-4xl">
                    <AccountSelector
                        accounts={accounts}
                        pendingToken={sp.pending ?? null}
                        mode={mode}
                        preselectedIds={preselected}
                        next={next}
                        submitEndpoint="/api/auth/select-account"
                        headline={mode === 'update' ? t('manageGoogleHeadline') : t('selectGoogleHeadline')}
                        body={t('pickGoogleAccountsBody')}
                    />
                </div>
            </div>
        </section>
    );
}

function parseAccounts(raw: string | undefined): SelectableAccount[] {
    if (!raw) return [];
    try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed.filter(
            (account: unknown): account is SelectableAccount =>
                typeof account === 'object' &&
                account !== null &&
                'id' in account &&
                typeof (account as { id: unknown }).id === 'string' &&
                'name' in account &&
                typeof (account as { name: unknown }).name === 'string',
        );
    } catch {
        return [];
    }
}

function parseSelected(raw: string | undefined): string[] {
    if (!raw) return [];
    try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed.filter((value): value is string => typeof value === 'string');
    } catch {
        return [];
    }
}
