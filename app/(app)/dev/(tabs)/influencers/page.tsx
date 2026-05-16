import { InfluencersView } from './influencers-view';
import { getInfluencersAction } from '@/app/(app)/influencers/actions';
import { requireDevEmailForPage } from '@/lib/dev-access';

export default async function DevInfluencersPage() {
    // Gate before invoking the server action. Next.js renders layouts and
    // pages in parallel, so the parent DevLayout's auth check doesn't prevent
    // this page from firing `getInfluencersAction` for unauth requests — that
    // call would then throw "Forbidden" and surface in the browser console
    // alongside the (correct) 404. Re-checking here keeps the 404 clean.
    await requireDevEmailForPage();
    const initialInfluencers = await getInfluencersAction();
    return <InfluencersView initialInfluencers={initialInfluencers} />;
}
