import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { UsagePage } from '@/components/usage-page';

/**
 * Server-component wrapper that gates /usage on a real connected session.
 * Ads-less users (signed in via Google but no Google Ads customer yet)
 * belong on /manage-ads-accounts so they can pick a platform.
 */
export default async function UsageRoute() {
    const session = await getSession();
    if (session.connected && session.pendingSetup) {
        redirect('/manage-ads-accounts');
    }
    return <UsagePage />;
}
