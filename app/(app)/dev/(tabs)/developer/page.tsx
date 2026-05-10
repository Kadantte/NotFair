import { DeveloperView } from './developer-view';
import { getGrowthOverrideData } from './data';
import type { GrowthOverrideData } from './data';

export default async function DevDeveloperPage() {
    let initialData: GrowthOverrideData | undefined;
    try {
        initialData = await getGrowthOverrideData();
    } catch (err) {
        console.error('[dev/developer] Server prefetch failed:', err);
    }

    return <DeveloperView initialData={initialData} />;
}
