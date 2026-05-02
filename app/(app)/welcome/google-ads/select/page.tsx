import { redirect } from 'next/navigation';
import { AccountSelector, type SelectableAccount } from '@/components/account-selector';
import { getSession } from '@/lib/session';
import { parseCustomerIds } from '@/lib/google-ads';

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
 * /welcome where they pick a platform.
 */
export default async function GoogleAdsSelectRoute({ searchParams }: Props) {
    const sp = await searchParams;

    const accounts = parseAccounts(sp.accounts);
    const mode: 'create' | 'update' = sp.mode === 'update' ? 'update' : 'create';

    // Bare URL with nothing to pick from → go to the platform-picker hub.
    if (accounts.length === 0) {
        redirect('/welcome');
    }

    // Confirm the user actually has a session backing the pending token.
    // If they don't, /api/auth/select-account would 404 anyway — bounce them
    // to /welcome rather than presenting a doomed picker.
    const session = await getSession();
    if (!session.connected) {
        redirect('/connect');
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

    // Default post-save destination is /connect (the MCP setup hub). The
    // AccountSelector falls back to this when the API doesn't return a
    // redirectUrl (i.e. update mode and post-promotion saves).
    const next = sp.next && sp.next.startsWith('/') ? sp.next : '/connect';

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
                        headline={mode === 'update' ? 'Manage Google Ads accounts' : 'Select your Google Ads accounts'}
                        body="Pick the Google Ads accounts you want NotFair to manage."
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
