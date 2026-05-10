import { DevNav } from '../_components/dev-nav';
import { DeveloperView } from './developer-view';
import { requireDevEmailForPage } from '@/lib/dev-access';
import { getGrowthOverrideData } from './data';
import type { GrowthOverrideData } from './data';

export default async function DevDeveloperPage() {
    await requireDevEmailForPage();

    let initialData: GrowthOverrideData | undefined;
    try {
        initialData = await getGrowthOverrideData();
    } catch (err) {
        console.error('[dev/developer] Server prefetch failed:', err);
    }

    return (
        <section className="flex min-h-0 h-full flex-col overflow-hidden">
            <DevNav />
            <DeveloperView initialData={initialData} />
        </section>
    );
}
