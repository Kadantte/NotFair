import { requireDevEmailForPage } from '@/lib/dev-access';
import { getAccountDetail } from './data';
import { AccountDetailView } from './account-detail-view';

export default async function DevAccountDetailPage({
    params,
}: {
    params: Promise<{ accountId: string }>;
}) {
    await requireDevEmailForPage();
    const { accountId } = await params;
    const initialDetail = await getAccountDetail(accountId, 'UTC').catch(() => null);
    return <AccountDetailView accountId={accountId} initialDetail={initialDetail} />;
}
