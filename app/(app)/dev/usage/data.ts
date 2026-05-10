import 'server-only';

import { db, schema } from '@/lib/db';
import { sql, and, eq, gte, lt, isNotNull, inArray, desc, type SQL } from 'drizzle-orm';
import { OP_TYPE } from '@/lib/db/tracking';
import {
    excludeDevOpsFilter,
    excludeDevOpsFilterForAlias,
    operationErrorRowCount,
    operationRowCount,
    operationTypeRowCount,
} from '@/lib/dev-ops-filter';

const PLATFORM_START = new Date('2026-03-25T00:00:00Z');

export interface GetUsageDataOptions {
    days?: number;
    tz?: string;
    source?: string | null;
    platform?: 'google_ads' | 'meta_ads' | null;
    includeDev?: boolean;
}

export async function getUsageData({
    days: rawDays = 30,
    tz = 'UTC',
    source = null,
    platform = null,
    includeDev = false,
}: GetUsageDataOptions = {}) {
    const days = Number.isFinite(rawDays) ? Math.min(Math.max(rawDays, 1), 90) : 30;

    const now = new Date();
    const since = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    const prevSince = new Date(now.getTime() - 2 * days * 24 * 60 * 60 * 1000);

    const sinceIso = since.toISOString();
    const nowIso = now.toISOString();
    const interactionLookbackIso = new Date(since.getTime() - 30 * 60 * 1000).toISOString();

    const platformFilter = platform ? eq(schema.operations.platform, platform) : null;
    const devExcludeForAlias = (alias: SQL) =>
        includeDev ? sql`` : sql`AND ${excludeDevOpsFilterForAlias(alias)}`;

    const whereRecent = and(
        gte(schema.operations.createdAt, since),
        ...(includeDev ? [] : [excludeDevOpsFilter()]),
        ...(platformFilter ? [platformFilter] : []),
    );
    const wherePrev = and(
        gte(schema.operations.createdAt, prevSince),
        lt(schema.operations.createdAt, since),
        ...(includeDev ? [] : [excludeDevOpsFilter()]),
        ...(platformFilter ? [platformFilter] : []),
    );

    const tzLiteral = sql.raw(`'${tz}'`);
    const localDate = sql`date((${schema.operations.createdAt} AT TIME ZONE 'UTC') AT TIME ZONE ${tzLiteral})`;

    const dailySourceFilter =
        source === 'chat'
            ? sql`${schema.operations.clientSource} is null`
            : source
                ? sql`${schema.operations.clientSource} = ${source}`
                : null;

    const whereDaily = dailySourceFilter
        ? and(whereRecent, dailySourceFilter)
        : whereRecent;

    const interactionSourceFilter =
        source === 'chat'
            ? sql`AND o.client_source is null`
            : source
                ? sql`AND o.client_source = ${source}`
                : sql``;

    const [totalsRow, prevTotalsRow, newUsersRow, dailyCounts, dailyInteractions, topUsers, topTools] = await Promise.all([
        db()
            .select({
                calls: operationRowCount(schema.operations),
                errors: operationErrorRowCount(schema.operations),
                activeUsers: sql<number>`count(distinct ${schema.operations.userId}) filter (where ${schema.operations.userId} is not null)::int`,
            })
            .from(schema.operations)
            .where(whereRecent),

        db()
            .select({
                calls: operationRowCount(schema.operations),
                errors: operationErrorRowCount(schema.operations),
                activeUsers: sql<number>`count(distinct ${schema.operations.userId}) filter (where ${schema.operations.userId} is not null)::int`,
            })
            .from(schema.operations)
            .where(wherePrev),

        db()
            .select({
                newUsers: sql<number>`count(distinct ${schema.operations.userId})::int`,
            })
            .from(schema.operations)
            .where(
                and(
                    whereRecent,
                    isNotNull(schema.operations.userId),
                    sql`not exists (
            select 1 from operations older
            where older.user_id = ${schema.operations.userId}
              and older.created_at < ${sinceIso}::timestamp
              ${devExcludeForAlias(sql`older.user_id`)}
              ${platform ? sql`and older.platform = ${platform}` : sql``}
          )`,
                ),
            ),

        db()
            .select({
                day: sql<string>`to_char(${localDate}, 'YYYY-MM-DD')`,
                reads: operationTypeRowCount(schema.operations, OP_TYPE.READ),
                writes: operationTypeRowCount(schema.operations, OP_TYPE.WRITE),
                errors: operationErrorRowCount(schema.operations),
                dau: sql<number>`count(distinct ${schema.operations.userId}) filter (where ${schema.operations.userId} is not null)::int`,
            })
            .from(schema.operations)
            .where(whereDaily)
            .groupBy(localDate)
            .orderBy(localDate),

        db().execute(sql`
      WITH filtered AS (
        SELECT
          o.id,
          o.user_id,
          o.session_id,
          o.account_id,
          COALESCE(o.client_source, 'chat') AS client_source,
          o.platform,
          o.created_at,
          o.success
        FROM operations o
        WHERE o.created_at >= ${interactionLookbackIso}::timestamp
          AND o.created_at < ${nowIso}::timestamp
          ${includeDev ? sql`` : sql`AND ${excludeDevOpsFilterForAlias(sql`o.user_id`)}`}
          ${platform ? sql`AND o.platform = ${platform}` : sql``}
          ${interactionSourceFilter}
      ),
      ordered AS (
        SELECT
          *,
          LAG(created_at) OVER (
            PARTITION BY
              COALESCE(user_id, 'session:' || COALESCE(session_id::text, 'none')),
              account_id,
              client_source,
              platform
            ORDER BY created_at, id
          ) AS prev_created_at
        FROM filtered
      ),
      marked AS (
        SELECT
          *,
          CASE
            WHEN prev_created_at IS NULL THEN 1
            WHEN created_at - prev_created_at > interval '30 minutes' THEN 1
            ELSE 0
          END AS new_interaction
        FROM ordered
      ),
      numbered AS (
        SELECT
          *,
          SUM(new_interaction) OVER (
            PARTITION BY
              COALESCE(user_id, 'session:' || COALESCE(session_id::text, 'none')),
              account_id,
              client_source,
              platform
            ORDER BY created_at, id
          ) AS interaction_seq
        FROM marked
      ),
      interactions AS (
        SELECT
          COALESCE(user_id, 'session:' || COALESCE(session_id::text, 'none')) AS actor_key,
          account_id,
          client_source,
          platform,
          interaction_seq,
          MIN(created_at) AS interaction_start,
          (ARRAY_AGG(success ORDER BY created_at DESC, id DESC))[1] = 1 AS ended_successfully
        FROM numbered
        GROUP BY actor_key, account_id, client_source, platform, interaction_seq
      ),
      interaction_days AS (
        SELECT
          date((interaction_start AT TIME ZONE 'UTC') AT TIME ZONE ${tzLiteral}) AS local_day,
          ended_successfully
        FROM interactions
        WHERE interaction_start >= ${sinceIso}::timestamp
      )
      SELECT
        to_char(local_day, 'YYYY-MM-DD') AS day,
        count(*)::int AS interactions,
        count(*) FILTER (WHERE ended_successfully)::int AS successful_interactions
      FROM interaction_days
      GROUP BY local_day
      ORDER BY local_day
    `),

        db()
            .select({
                userId: schema.operations.userId,
                calls: operationRowCount(schema.operations),
                errors: operationErrorRowCount(schema.operations),
                googleEmail: sql<string | null>`max(${schema.mcpSessions.googleEmail})`,
                primaryAccountId: sql<string | null>`max(${schema.mcpSessions.customerId})`,
            })
            .from(schema.operations)
            .leftJoin(
                schema.mcpSessions,
                sql`${schema.mcpSessions.userId} = ${schema.operations.userId}`,
            )
            .where(and(whereRecent, isNotNull(schema.operations.userId)))
            .groupBy(schema.operations.userId)
            .having(sql`${operationErrorRowCount(schema.operations)} > 0`)
            .orderBy(desc(operationErrorRowCount(schema.operations)))
            .limit(10),

        db().execute(sql`
      WITH per_op AS (
        SELECT
          tool_name,
          latency_ms,
          CASE WHEN success = 0 OR error_class IS NOT NULL THEN 1 ELSE 0 END AS is_error
        FROM operations
        WHERE created_at >= ${sinceIso}::timestamp
          AND tool_name IS NOT NULL
          ${includeDev ? sql`` : sql`AND ${excludeDevOpsFilterForAlias(sql`user_id`)}`}
          ${platform ? sql`AND platform = ${platform}` : sql``}
      )
      SELECT
        tool_name AS "toolName",
        count(*)::int AS calls,
        sum(is_error)::int AS errors,
        coalesce(percentile_disc(0.5) WITHIN GROUP (ORDER BY latency_ms) FILTER (WHERE latency_ms IS NOT NULL), 0)::int AS p50,
        coalesce(percentile_disc(0.95) WITHIN GROUP (ORDER BY latency_ms) FILTER (WHERE latency_ms IS NOT NULL), 0)::int AS p95
      FROM per_op
      GROUP BY tool_name
      ORDER BY calls DESC
      LIMIT 20
    `),
    ]);

    const topUserIds = topUsers
        .map((u) => u.userId)
        .filter((id): id is string => id != null);

    const errorClassByUser = new Map<string, string[]>();
    if (topUserIds.length > 0) {
        const errorClassRows = await db()
            .select({
                userId: schema.operations.userId,
                errorClass: schema.operations.errorClass,
                cnt: operationRowCount(schema.operations),
            })
            .from(schema.operations)
            .where(
                and(
                    whereRecent,
                    isNotNull(schema.operations.errorClass),
                    inArray(schema.operations.userId, topUserIds),
                ),
            )
            .groupBy(schema.operations.userId, schema.operations.errorClass)
            .orderBy(desc(operationRowCount(schema.operations)));

        for (const row of errorClassRows) {
            if (!row.userId || !row.errorClass) continue;
            const arr = errorClassByUser.get(row.userId) ?? [];
            if (arr.length < 3) arr.push(row.errorClass);
            errorClassByUser.set(row.userId, arr);
        }
    }

    const totals = totalsRow[0] ?? { calls: 0, errors: 0, activeUsers: 0 };
    const prev = prevTotalsRow[0] ?? { calls: 0, errors: 0, activeUsers: 0 };
    const newUsers = newUsersRow[0]?.newUsers ?? 0;
    const interactionsByDay = new Map(
        (
            dailyInteractions as unknown as Array<{
                day: string;
                interactions: number | string;
                successful_interactions: number | string;
            }>
        ).map((row) => [
            row.day,
            {
                interactions: Number(row.interactions ?? 0),
                successfulInteractions: Number(row.successful_interactions ?? 0),
            },
        ]),
    );

    const priorWindowPredatesPlatform = prevSince < PLATFORM_START;

    const prevTotals = priorWindowPredatesPlatform
        ? { calls: null, errors: null, activeUsers: null }
        : { calls: prev.calls, errors: prev.errors, activeUsers: prev.activeUsers };

    return {
        days,
        range: { from: sinceIso, to: nowIso },
        totals: {
            calls: totals.calls,
            errors: totals.errors,
            activeUsers: totals.activeUsers,
            newUsers,
        },
        prevTotals,
        daily: dailyCounts.map((day) => {
            const interaction = interactionsByDay.get(day.day) ?? {
                interactions: 0,
                successfulInteractions: 0,
            };
            return {
                ...day,
                interactions: interaction.interactions,
                successfulInteractions: interaction.successfulInteractions,
                interactionSuccessRate:
                    interaction.interactions > 0
                        ? (interaction.successfulInteractions / interaction.interactions) * 100
                        : null,
            };
        }),
        topUsersByErrors: topUsers.map((u) => ({
            userId: u.userId,
            googleEmail: u.googleEmail,
            primaryAccountId: u.primaryAccountId,
            calls: u.calls,
            errors: u.errors,
            topErrorClasses: errorClassByUser.get(u.userId ?? '') ?? [],
        })),
        topTools: (
            topTools as unknown as Array<{
                toolName: string | null;
                calls: number | string;
                errors: number | string;
                p50: number | string;
                p95: number | string;
            }>
        ).map((t) => ({
            toolName: t.toolName,
            calls: Number(t.calls),
            errors: Number(t.errors),
            p50: Number(t.p50),
            p95: Number(t.p95),
        })),
    };
}

export type UsageData = Awaited<ReturnType<typeof getUsageData>>;
