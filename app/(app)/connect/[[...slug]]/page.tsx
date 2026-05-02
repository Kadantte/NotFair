import { redirect } from 'next/navigation';
import { ConnectPage } from '@/components/connect-page';
import { getSession } from '@/lib/session';

type Props = {
    params: Promise<{ slug?: string[] }>;
    searchParams: Promise<{ reason?: string; pending?: string; mode?: string; accounts?: string; selected?: string; next?: string }>;
};

export default async function AppConnectPage({ params, searchParams }: Props) {
    const sp = await searchParams;

    // No-accounts states moved to the dedicated /welcome route. Forward stale
    // URLs (bookmarks, email links from before the move) so users land on the
    // right empty-state page instead of seeing nothing.
    if (sp.reason === 'no_accounts' || sp.reason === 'no_client_accounts') {
        redirect('/welcome');
    }

    // Account-selection moved off /connect to /welcome/<platform>/select.
    // Forward any stale URLs that still carry the picker params there.
    if (sp.pending || sp.mode === 'update') {
        const params = new URLSearchParams();
        if (sp.pending) params.set('pending', sp.pending);
        if (sp.mode) params.set('mode', sp.mode);
        if (sp.accounts) params.set('accounts', sp.accounts);
        if (sp.selected) params.set('selected', sp.selected);
        if (sp.next) params.set('next', sp.next);
        redirect(`/welcome/google-ads/select?${params.toString()}`);
    }

    const session = await getSession();
    const { slug } = await params;

    // Ads-less users hitting bare /connect belong on /welcome — that's the
    // dedicated empty-state for "you're signed in but haven't picked a
    // platform yet." Sub-paths like /connect/claude-connector remain open
    // because the welcome page's CTAs may link to them.
    if (
        session.connected &&
        session.pendingSetup &&
        (!slug || slug.length === 0)
    ) {
        redirect('/welcome');
    }

    return (
        <ConnectPage
            initialSession={session}
            slug={slug}
        />
    );
}
