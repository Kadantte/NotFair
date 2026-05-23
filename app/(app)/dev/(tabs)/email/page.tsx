import { redirect } from 'next/navigation';

// /dev/email has no index view of its own (yet). The DevNav tab points
// here; bounce to the only dashboard we currently track. When a second
// email-kind dashboard ships, replace this with a list of links to each.
export default function DevEmailIndex() {
    redirect('/dev/email/trial-end-alert');
}
