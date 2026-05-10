import { requireDevEmailForPage } from '@/lib/dev-access';

// Auth gate for every /dev route (tab pages + account-detail). DevNav lives in
// the (tabs) route group's layout so the account-detail view can render its
// own header without DevNav stacked on top.
export default async function DevLayout({ children }: { children: React.ReactNode }) {
    await requireDevEmailForPage();
    return <>{children}</>;
}
