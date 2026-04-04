'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { initPostHog, trackPageView, type BootstrapUser } from '@/lib/analytics';

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
    }, [bootstrapUser]);

    useEffect(() => {
        if (prevPathRef.current !== pathname) {
            trackPageView(pathname);
            prevPathRef.current = pathname;
        }
    }, [pathname]);

    return <>{children}</>;
}
