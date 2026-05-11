import { redirect } from 'next/navigation';
import { ConnectPage } from '@/components/connect-page';
import { getSession } from '@/lib/session';

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

    // 0-platform users belong on onboarding (the platform picker). Users
    // with at least one platform connected — even if it's only Meta — can
    // browse the Google MCP setup instructions; ConnectPage shows a
    // "no Google Ads linked" warning banner so they know connecting MCP
    // alone isn't enough.
    if (!slug || slug.length === 0) {
        if (!session.connected) redirect('/login?next=%2Fconnect%2Fgoogle-ads');
        const hasGoogle = !session.pendingSetup && !!session.customerId;
        const hasMeta = session.metaAccounts.length > 0;
        if (!hasGoogle && !hasMeta) {
            redirect('/manage-ads-accounts');
        }
    }

    return (
        <ConnectPage
            initialSession={session}
            slug={slug}
        />
    );
}
