import { CustomersView } from './customers-view';
import { getCustomersData } from './data';
import type { CustomersData } from './data';

export default async function DevCustomersPage() {
    let initialData: CustomersData | undefined;
    try {
        initialData = await getCustomersData();
    } catch (err) {
        console.error('[dev/customers] Server prefetch failed:', err);
    }

    return <CustomersView initialData={initialData} />;
}
