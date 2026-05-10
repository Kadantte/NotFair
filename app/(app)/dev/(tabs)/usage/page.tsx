import { Suspense } from 'react';
import { UsageView } from './usage-view';
import { UsageSkeleton } from './usage-skeleton';
import { getUsageData } from './data';
import type { UsageData } from './data';

type UsagePlatform = 'google_ads' | 'meta_ads' | null;

export default async function DevUsagePage({
    searchParams,
}: {
    searchParams: Promise<Record<string, string>>;
}) {
    const sp = await searchParams;
    const rawDays = parseInt(sp.days ?? '30', 10);
    const days = Number.isFinite(rawDays) ? Math.min(Math.max(rawDays, 1), 90) : 30;
    const rawPlatform = sp.platform;
    const platform: UsagePlatform =
        rawPlatform === 'google_ads' || rawPlatform === 'meta_ads' ? rawPlatform : null;

    // Stream the data section: the layout + skeleton flush immediately, the DB
    // query keeps streaming on the same response. The user sees the page shell
    // before getUsageData resolves.
    return (
        <Suspense fallback={<UsageSkeleton />}>
            <UsageDataBoundary days={days} platform={platform} />
        </Suspense>
    );
}

async function UsageDataBoundary({
    days,
    platform,
}: {
    days: number;
    platform: UsagePlatform;
}) {
    let initialData: UsageData | undefined;
    try {
        // UTC server-side; client refetches with the user's tz on mount.
        initialData = await getUsageData({ days, platform, tz: 'UTC' });
    } catch (err) {
        console.error('[dev/usage] Server prefetch failed:', err);
    }
    return <UsageView initialData={initialData} />;
}
