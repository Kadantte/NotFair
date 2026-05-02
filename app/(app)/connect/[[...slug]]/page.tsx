import { redirect } from 'next/navigation';
import { ConnectPage } from '@/components/connect-page';
import { getSession } from '@/lib/session';
import { unsupportedFeatureRedirect } from '@/lib/onboarding-redirect';

type Props = {
    params: Promise<{ slug?: string[] }>;
    searchParams: Promise<{ reason?: string; pending?: string; mode?: string; accounts?: string; selected?: string; next?: string }>;
};

export default async function AppConnectPage({ params, searchParams }: Props) {
    const sp = await searchParams;

    // No-accounts states route to /manage-ads-accounts (the platform picker).
    if (sp.reason === 'no_accounts' || sp.reason === 'no_client_accounts') {
        redirect('/manage-ads-accounts');
    }

    // Account-selection moved off /connect to /manage-ads-accounts/<platform>/select.
    // Forward any stale URLs that still carry the picker params there.
    if (sp.pending || sp.mode === 'update') {
        const params = new URLSearchParams();
        if (sp.pending) params.set('pending', sp.pending);
        if (sp.mode) params.set('mode', sp.mode);
        if (sp.accounts) params.set('accounts', sp.accounts);
        if (sp.selected) params.set('selected', sp.selected);
        if (sp.next) params.set('next', sp.next);
        redirect(`/manage-ads-accounts/google-ads/select?${params.toString()}`);
    }

    const session = await getSession();
    const { slug } = await params;

    // Bare /connect on a Google-Ads-less session: route to the platform-
    // appropriate home. 0 platforms → onboarding, Meta-only → Meta MCP page.
    // Sub-paths like /connect/claude-connector remain open because they
    // don't depend on a connected platform.
    if (!slug || slug.length === 0) {
        const unsupported = unsupportedFeatureRedirect(session);
        if (unsupported) {
            redirect(unsupported);
        }
    }

    return (
        <ConnectPage
            initialSession={session}
            slug={slug}
        />
    );
}
