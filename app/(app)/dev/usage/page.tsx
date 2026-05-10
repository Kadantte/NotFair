import { DevNav } from '../_components/dev-nav';
import { UsageView } from './usage-view';
import { requireDevEmailForPage } from '@/lib/dev-access';
import { getUsageData } from './data';
import type { UsageData } from './data';

export default async function DevUsagePage({
    searchParams,
}: {
    searchParams: Promise<Record<string, string>>;
}) {
    await requireDevEmailForPage();

    const sp = await searchParams;
    const rawDays = parseInt(sp.days ?? '30', 10);
    const days = Number.isFinite(rawDays) ? Math.min(Math.max(rawDays, 1), 90) : 30;
    const rawPlatform = sp.platform;
    const platform =
        rawPlatform === 'google_ads' || rawPlatform === 'meta_ads' ? rawPlatform : null;

    let initialData: UsageData | undefined;
    try {
        // Use UTC as server-side timezone default; client will refetch with the
        // user's local timezone on first interaction or filter change.
        initialData = await getUsageData({ days, platform, tz: 'UTC' });
    } catch (err) {
        console.error('[dev/usage] Server prefetch failed:', err);
    }

    return (
        <section className="flex min-h-0 h-full flex-col overflow-hidden">
            <DevNav />
            <UsageView initialData={initialData} />
        </section>
    );
}
