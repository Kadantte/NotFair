import { redirect } from 'next/navigation';

// Tab removed in favor of /dev/customers — keep the route so bookmarks don't
// 404. Drop this file once analytics shows no traffic on /dev/influencers.
export default function DevInfluencersRedirect() {
    redirect('/dev/customers');
}
