'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { initPostHog, trackPageView, type BootstrapUser } from '@/lib/analytics';
import posthog from 'posthog-js';
import { UTM_KEYS, UTM_STORAGE_PREFIX } from '@/lib/utm';

export function PostHogProvider({
    children,
    bootstrapUser,
}: {
    children: React.ReactNode;
    bootstrapUser?: BootstrapUser;
}) {
    const pathname = usePathname();
    const prevPathRef = useRef<string | null>(null);

    useEffect(() => {
        initPostHog(bootstrapUser);

        // Set UTM attribution as person properties from sessionStorage
        try {
            const utm: Record<string, string> = {};
            for (const key of UTM_KEYS) {
                const val = sessionStorage.getItem(`${UTM_STORAGE_PREFIX}${key}`);
                if (val) utm[key] = val;
            }
            const referrer = sessionStorage.getItem(`${UTM_STORAGE_PREFIX}referrer`);
            if (referrer) utm.signup_referrer = referrer;
            if (Object.keys(utm).length > 0) {
                posthog.setPersonPropertiesForFlags(utm);
                posthog.setPersonProperties(utm);
            }
        } catch {
            // sessionStorage unavailable (e.g. private browsing)
        }
    }, [bootstrapUser]);

    useEffect(() => {
        if (prevPathRef.current !== pathname) {
            trackPageView(pathname);
            prevPathRef.current = pathname;
        }
    }, [pathname]);

    return <>{children}</>;
}
