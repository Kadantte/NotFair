import { WaitlistView } from './waitlist-view';
import { getWaitlistData } from './data';
import type { WaitlistData } from './data';

export default async function DevWaitlistPage() {
    let initialData: WaitlistData | undefined;
    try {
        initialData = await getWaitlistData();
    } catch (err) {
        console.error('[dev/waitlist] Server prefetch failed:', err);
    }

    return <WaitlistView initialData={initialData} />;
}
