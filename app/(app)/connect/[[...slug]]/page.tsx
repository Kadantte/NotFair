import { cookies } from 'next/headers';
import { ConnectPage } from '@/components/connect-page';
import { COOKIE_NAMES } from '@/lib/auth-cookies';
import { getSession } from '@/lib/session';

type Props = {
    params: Promise<{ slug?: string[] }>;
};

export default async function AppConnectPage({ params }: Props) {
    const session = await getSession();
    const { slug } = await params;

    // Last-attempted Google email is set by the OAuth callback when the user
    // OAuth'd successfully but had no usable Ads accounts. We read it server-
    // side because the cookie is httpOnly. The connect page surfaces it in
    // the no-account error banner so the user can self-diagnose "I used the
    // wrong Google account."
    const cookieStore = await cookies();
    const lastAttemptEmail = cookieStore.get(COOKIE_NAMES.lastAttemptEmail)?.value ?? null;

    return (
        <ConnectPage
            initialSession={session}
            slug={slug}
            lastAttemptEmail={lastAttemptEmail}
        />
    );
}
