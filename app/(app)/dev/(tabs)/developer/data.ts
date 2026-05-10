import 'server-only';

import { cookies } from 'next/headers';

const COOKIE_NAME = 'dev_growth_override';

export async function getGrowthOverrideData(): Promise<{ state: 'on' | 'off' }> {
    const store = await cookies();
    const value = store.get(COOKIE_NAME)?.value;
    const state: 'on' | 'off' = value === 'off' ? 'off' : 'on';
    return { state };
}

export type GrowthOverrideData = Awaited<ReturnType<typeof getGrowthOverrideData>>;
