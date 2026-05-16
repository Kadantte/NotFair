import { OutreachView } from './outreach-view';
import { getContactsAction } from '@/app/(app)/outreach/actions';
import { requireDevEmailForPage } from '@/lib/dev-access';
import type { Contact } from '../../_components/dev-types';

export default async function DevOutreachPage() {
    // See dev/influencers/page.tsx — parallel layout+page rendering means we
    // must re-gate here, otherwise the unauthenticated path leaks a
    // "Forbidden" prefetch error into the browser console next to the 404.
    await requireDevEmailForPage();
    const initialContacts = (await getContactsAction()) as Contact[];
    return <OutreachView initialContacts={initialContacts} />;
}
