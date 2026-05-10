import { DevNav } from '../_components/dev-nav';
import { WaitlistView } from './waitlist-view';
import { requireDevEmailForPage } from '@/lib/dev-access';
import { getWaitlistData } from './data';
import type { WaitlistData } from './data';

export default async function DevWaitlistPage() {
    await requireDevEmailForPage();

    let initialData: WaitlistData | undefined;
    try {
        initialData = await getWaitlistData();
    } catch (err) {
        console.error('[dev/waitlist] Server prefetch failed:', err);
    }

    return (
        <section className="flex min-h-0 h-full flex-col overflow-hidden">
            <DevNav />
            <WaitlistView initialData={initialData} />
        </section>
    );
}
