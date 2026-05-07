'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { identifyUser, initPostHog, trackPageView, trackEvent, type BootstrapUser } from '@/lib/analytics';
import posthog from 'posthog-js';
import { UTM_KEYS, UTM_STORAGE_PREFIX } from '@/lib/utm';

const CONNECT_EVENT_COOKIE = 'gads_connect_event';

function consumeConnectEventCookie() {
    if (typeof document === 'undefined') return;
    const match = document.cookie.match(/(?:^|; )gads_connect_event=([^;]*)/);
    if (!match) return;
    document.cookie = `${CONNECT_EVENT_COOKIE}=; path=/; max-age=0`;
    try {
        const data = JSON.parse(decodeURIComponent(match[1])) as {
            count?: number;
            first?: boolean;
            destination?: string;
        };
        trackEvent('account_connected', {
            account_count: typeof data.count === 'number' ? data.count : 1,
            auth_method: 'google',
            is_first_connect: !!data.first,
            destination: data.destination ?? null,
        });
    } catch {
        /* malformed cookie — already cleared */
    }
}

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
        initPostHog();
        consumeConnectEventCookie();

        if (bootstrapUser?.distinctId) {
            try {
                const currentDistinctId = posthog.get_distinct_id?.();
                const aliasKey = `nf_ph_alias_${bootstrapUser.distinctId}`;
                if (
                    currentDistinctId &&
                    currentDistinctId !== bootstrapUser.distinctId &&
                    !localStorage.getItem(aliasKey)
                ) {
                    posthog.alias(bootstrapUser.distinctId, currentDistinctId);
                    localStorage.setItem(aliasKey, '1');
                }
                identifyUser(bootstrapUser.distinctId, bootstrapUser.properties);
            } catch {
                identifyUser(bootstrapUser.distinctId, bootstrapUser.properties);
            }
        }

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
