import { OutreachView } from './outreach-view';
import { getContactsAction } from '@/app/(app)/outreach/actions';
import type { Contact } from '../../_components/dev-types';

export default async function DevOutreachPage() {
    let initialContacts: Contact[] | undefined;
    try {
        initialContacts = (await getContactsAction()) as Contact[];
    } catch (err) {
        console.error('[dev/outreach] Server prefetch failed:', err);
    }

    return <OutreachView initialContacts={initialContacts} />;
}
