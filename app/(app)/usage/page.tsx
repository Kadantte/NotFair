import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { unsupportedFeatureRedirect } from '@/lib/onboarding-redirect';
import { UsagePage } from '@/components/usage-page';

/**
 * Server-component wrapper that gates /usage on a real connected session.
 * Multi-platform aware: 0 platforms → onboarding, Meta-only → Meta home,
 * otherwise render the page (the Google customer is assumed downstream).
 */
export default async function UsageRoute() {
    const session = await getSession();
    const unsupported = unsupportedFeatureRedirect(session);
    if (unsupported) {
        redirect(unsupported);
    }
    return <UsagePage />;
}
