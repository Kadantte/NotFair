import { DevNav } from '../_components/dev-nav';
import { CustomersView } from './customers-view';
import { requireDevEmailForPage } from '@/lib/dev-access';
import { getCustomersData } from './data';
import type { CustomersData } from './data';

export default async function DevCustomersPage() {
    await requireDevEmailForPage();

    let initialData: CustomersData | undefined;
    try {
        initialData = await getCustomersData();
    } catch (err) {
        console.error('[dev/customers] Server prefetch failed:', err);
    }

    return (
        <section className="flex min-h-0 h-full flex-col overflow-hidden">
            <DevNav />
            <CustomersView initialData={initialData} />
        </section>
    );
}
