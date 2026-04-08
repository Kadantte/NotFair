import { ConnectPage } from '@/components/connect-page';
import { getSession } from '@/lib/session';

type Props = {
    params: Promise<{ slug?: string[] }>;
};

export default async function AppConnectPage({ params }: Props) {
    const session = await getSession();
    const { slug } = await params;

    return <ConnectPage initialSession={session} slug={slug} />;
}
