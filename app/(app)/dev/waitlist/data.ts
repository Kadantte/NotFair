import 'server-only';

import { desc } from 'drizzle-orm';
import { db, schema } from '@/lib/db';

export async function getWaitlistData() {
    const rows = await db()
        .select({
            id: schema.waitlistSignups.id,
            key: schema.waitlistSignups.key,
            userId: schema.waitlistSignups.userId,
            email: schema.waitlistSignups.email,
            metadata: schema.waitlistSignups.metadata,
            createdAt: schema.waitlistSignups.createdAt,
            approvedAt: schema.waitlistSignups.approvedAt,
        })
        .from(schema.waitlistSignups)
        .orderBy(desc(schema.waitlistSignups.createdAt));

    return {
        rows: rows.map((r) => ({
            ...r,
            createdAt: r.createdAt.toISOString(),
            approvedAt: r.approvedAt ? r.approvedAt.toISOString() : null,
        })),
    };
}

export type WaitlistData = Awaited<ReturnType<typeof getWaitlistData>>;
