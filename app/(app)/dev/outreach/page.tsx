import { DevNav } from '../_components/dev-nav';
import { OutreachView } from './outreach-view';
import { requireDevEmailForPage } from '@/lib/dev-access';
import { getContactsAction } from '@/app/(app)/outreach/actions';
import type { Contact } from '../_components/dev-types';

export default async function DevOutreachPage() {
    await requireDevEmailForPage();

    let initialContacts: Contact[] | undefined;
    try {
        initialContacts = (await getContactsAction()) as Contact[];
    } catch (err) {
        console.error('[dev/outreach] Server prefetch failed:', err);
    }

    return (
        <section className="flex min-h-0 h-full flex-col overflow-hidden">
            <DevNav />
            <OutreachView initialContacts={initialContacts} />
        </section>
    );
}
