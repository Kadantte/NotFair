import 'server-only';
import { db, schema } from '@/lib/db';
import { sql, desc, eq, and } from 'drizzle-orm';
import { OP_TYPE, CODE_TO_ENTITY, ENTITY_CODE, resolveToolLabel } from '@/lib/db/tracking';
import { operationRowCount, operationTypeRowCount } from '@/lib/dev-ops-filter';
import { unstable_cache } from 'next/cache';
import type { AccountDetail, AuditSnapshot, ImpressionShareDiagnosis } from './types';

function toIso(value: Date | string | null | undefined): string | null {
    if (!value) return null;
    return value instanceof Date ? value.toISOString() : value;
}

async function fetchAccountDetail(accountId: string, tz: string): Promise<AccountDetail> {
    const [accountInfo, recentOps, dailyUsage, campaignStats, auditHistory] = await Promise.all([
        // Account info from most recent session
        db()
            .select({
                email: schema.mcpSessions.googleEmail,
                customerId: schema.mcpSessions.customerId,
                customerIds: schema.mcpSessions.customerIds,
                lastLogin: schema.mcpSessions.createdAt,
            })
            .from(schema.mcpSessions)
            .where(eq(schema.mcpSessions.customerId, accountId))
            .orderBy(desc(schema.mcpSessions.createdAt))
            .limit(1),

        // Recent operations (last 100, reads + writes)
        db()
            .select()
            .from(schema.operations)
            .where(eq(schema.operations.accountId, accountId))
            .orderBy(desc(schema.operations.createdAt))
            .limit(100),

        // Daily usage for last 14 days
        (() => {
            // tz is already sanitized via regex — safe to inline as literal
            const tzLiteral = sql.raw(`'${tz}'`);
            const localDate = sql`date((${schema.operations.createdAt} AT TIME ZONE 'UTC') AT TIME ZONE ${tzLiteral})`;
            return db()
                .select({
                    date: sql<string>`${localDate}`.as('date'),
                    reads: operationTypeRowCount(schema.operations, OP_TYPE.READ),
                    writes: operationTypeRowCount(schema.operations, OP_TYPE.WRITE),
                    total: operationRowCount(),
                })
                .from(schema.operations)
                .where(
                    and(
                        eq(schema.operations.accountId, accountId),
                        sql`${schema.operations.createdAt} >= now() - interval '14 days'`,
                    ),
                )
                .groupBy(localDate)
                .orderBy(desc(localDate));
        })(),

        // Distinct campaigns touched in operations
        db()
            .select({
                campaignId: schema.operations.campaignId,
                ops: operationRowCount(),
                writes: operationTypeRowCount(schema.operations, OP_TYPE.WRITE),
                lastOp: sql<string>`max(${schema.operations.createdAt})`.as('last_op'),
            })
            .from(schema.operations)
            .where(
                and(
                    eq(schema.operations.accountId, accountId),
                    sql`${schema.operations.campaignId} is not null`,
                ),
            )
            .groupBy(schema.operations.campaignId)
            .orderBy(desc(operationRowCount()))
            .limit(50),

        // Audit snapshots (most recent 20)
        db()
            .select({
                id: schema.auditSnapshots.id,
                overallScore: schema.auditSnapshots.overallScore,
                category: schema.auditSnapshots.category,
                wasteRate: schema.auditSnapshots.wasteRate,
                demandCaptured: schema.auditSnapshots.demandCaptured,
                cpa: schema.auditSnapshots.cpa,
                wastedSpend: schema.auditSnapshots.wastedSpend,
                totalSpend: schema.auditSnapshots.totalSpend,
                campaignCount: schema.auditSnapshots.campaignCount,
                topActions: schema.auditSnapshots.topActions,
                impressionShareDiagnosis: schema.auditSnapshots.impressionShareDiagnosis,
                createdAt: schema.auditSnapshots.createdAt,
            })
            .from(schema.auditSnapshots)
            .where(eq(schema.auditSnapshots.accountId, accountId))
            .orderBy(desc(schema.auditSnapshots.createdAt))
            .limit(20),
    ]);

    const info = accountInfo[0] ?? null;

    // Parse customerIds to get connected account names
    let connectedAccounts: { id: string; name: string }[] = [];
    if (info?.customerIds) {
        try {
            connectedAccounts = JSON.parse(info.customerIds);
        } catch { /* ignore */ }
    }

    return {
        accountId,
        email: info?.email ?? null,
        connectedAccounts,
        lastLogin: toIso(info?.lastLogin),
        recentOperations: recentOps.map((op) => ({
            id: op.id,
            opType: op.opType === OP_TYPE.WRITE ? 'write' : 'read',
            action: resolveToolLabel(op),
            entityType: CODE_TO_ENTITY[op.entityCode ?? ENTITY_CODE.unknown] ?? 'unknown',
            entityId: op.entityId ?? '',
            campaignId: op.campaignId,
            beforeValue: op.beforeValue ?? '',
            afterValue: op.afterValue ?? '',
            reasoning: op.reasoning,
            rolledBack: op.rolledBack === 1,
            source: op.clientSource ?? null,
            timestamp: toIso(op.createdAt) ?? '',
        })),
        dailyUsage,
        campaigns: campaignStats.map((c) => ({
            campaignId: c.campaignId,
            totalOps: Number(c.ops),
            writes: Number(c.writes),
            lastOp: c.lastOp,
        })),
        auditHistory: auditHistory.map((a): AuditSnapshot => ({
            ...a,
            topActions: (a.topActions ?? []) as AuditSnapshot['topActions'],
            impressionShareDiagnosis: (a.impressionShareDiagnosis ?? null) as ImpressionShareDiagnosis | null,
            createdAt: toIso(a.createdAt) ?? '',
        })),
    };
}

export function getAccountDetail(accountId: string, tz: string): Promise<AccountDetail> {
    return unstable_cache(
        () => fetchAccountDetail(accountId, tz),
        ['dev-account-detail', accountId, tz],
        { revalidate: 120, tags: [`dev-account:${accountId}`] },
    )();
}
