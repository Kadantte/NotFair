import 'server-only';

import { unstable_cache } from 'next/cache';
import { db, schema } from '@/lib/db';
import { sql, and, eq, gte, lt, isNotNull, type SQL } from 'drizzle-orm';
import { OP_TYPE } from '@/lib/db/tracking';
import {
    excludeDevOpsFilter,
    excludeDevOpsFilterForAlias,
    operationErrorRowCount,
    operationRowCount,
    operationTypeRowCount,
} from '@/lib/dev-ops-filter';

const PLATFORM_START = new Date('2026-03-25T00:00:00Z');

// "Top Users by Low Success Rate" surfaces fresh quality signal — a long
// global window would let stale outages dominate. Pin to a short fixed window
// and require enough interactions to filter noise from one-shot users.
const LOW_SUCCESS_WINDOW_DAYS = 3;
const LOW_SUCCESS_MIN_INTERACTIONS = 3;

export interface GetUsageDataOptions {
    days?: number;
    tz?: string;
    source?: string | null;
    platform?: 'google_ads' | 'meta_ads' | null;
    includeDev?: boolean;
}

async function fetchUsageData({
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

    const lowSuccessSince = new Date(now.getTime() - LOW_SUCCESS_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const lowSuccessSinceIso = lowSuccessSince.toISOString();
    // 30-min buffer matches the interaction-stitching gap used elsewhere — without
    // it, the first interaction of the window could be misclassified as "new".
    const lowSuccessLookbackIso = new Date(lowSuccessSince.getTime() - 30 * 60 * 1000).toISOString();

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

    const chatSourceFilter = sql`${schema.operations.clientSource} IN ('chat', 'adsagent-chat')`;
    const dailySourceFilter =
        source === 'chat' || source === 'adsagent-chat'
            ? chatSourceFilter
            : source === 'unknown'
                ? sql`${schema.operations.clientSource} IS NULL`
            : source
                ? sql`${schema.operations.clientSource} = ${source}`
                : null;

    const whereDaily = dailySourceFilter
        ? and(whereRecent, dailySourceFilter)
        : whereRecent;

    const interactionSourceFilter =
        source === 'chat' || source === 'adsagent-chat'
            ? sql`AND o.client_source IN ('chat', 'adsagent-chat')`
            : source === 'unknown'
                ? sql`AND o.client_source IS NULL`
            : source
                ? sql`AND o.client_source = ${source}`
                : sql``;

    const [totalsRow, prevTotalsRow, newUsersRow, dailyCounts, dailyInteractions, lowSuccessUsers, topTools] = await Promise.all([
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
          CASE
            WHEN o.client_source IN ('chat', 'adsagent-chat') THEN 'chat'
            WHEN o.client_source IS NULL THEN 'unknown'
            ELSE o.client_source
          END AS client_source,
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

        // Fixed short window: long ranges let stale outages dominate and one-shot
        // users dilute the rate. Stitches ops into interactions on a 30-min gap.
        db().execute(sql`
      WITH filtered AS (
        SELECT
          o.id,
          o.user_id,
          o.account_id,
          CASE
            WHEN o.client_source IN ('chat', 'adsagent-chat') THEN 'chat'
            WHEN o.client_source IS NULL THEN 'unknown'
            ELSE o.client_source
          END AS client_source,
          o.platform,
          o.created_at,
          o.success,
          o.error_class
        FROM operations o
        WHERE o.created_at >= ${lowSuccessLookbackIso}::timestamp
          AND o.created_at < ${nowIso}::timestamp
          AND o.user_id IS NOT NULL
          ${includeDev ? sql`` : sql`AND ${excludeDevOpsFilterForAlias(sql`o.user_id`)}`}
          ${platform ? sql`AND o.platform = ${platform}` : sql``}
          ${interactionSourceFilter}
      ),
      ordered AS (
        SELECT
          *,
          LAG(created_at) OVER (
            PARTITION BY user_id, account_id, client_source, platform
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
            PARTITION BY user_id, account_id, client_source, platform
            ORDER BY created_at, id
          ) AS interaction_seq
        FROM marked
      ),
      interactions AS (
        SELECT
          user_id,
          account_id,
          client_source,
          platform,
          interaction_seq,
          MIN(created_at) AS interaction_start,
          (ARRAY_AGG(success ORDER BY created_at DESC, id DESC))[1] = 1 AS ended_successfully
        FROM numbered
        GROUP BY user_id, account_id, client_source, platform, interaction_seq
      ),
      per_user AS (
        SELECT
          user_id,
          count(*)::int AS interactions,
          count(*) FILTER (WHERE ended_successfully)::int AS successful_interactions
        FROM interactions
        WHERE interaction_start >= ${lowSuccessSinceIso}::timestamp
        GROUP BY user_id
        HAVING count(*) >= ${LOW_SUCCESS_MIN_INTERACTIONS}
      ),
      ranked_error_classes AS (
        SELECT
          user_id,
          error_class,
          count(*) AS cnt,
          ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY count(*) DESC, error_class) AS rk
        FROM filtered
        WHERE error_class IS NOT NULL
        GROUP BY user_id, error_class
      ),
      top_error_classes AS (
        SELECT user_id, ARRAY_AGG(error_class ORDER BY cnt DESC) AS error_classes
        FROM ranked_error_classes
        WHERE rk <= 3
        GROUP BY user_id
      )
      SELECT
        pu.user_id AS "userId",
        pu.interactions,
        pu.successful_interactions AS "successfulInteractions",
        s.google_email AS "googleEmail",
        s.customer_id AS "primaryAccountId",
        COALESCE(tec.error_classes, ARRAY[]::text[]) AS "topErrorClasses"
      FROM per_user pu
      LEFT JOIN top_error_classes tec ON tec.user_id = pu.user_id
      LEFT JOIN LATERAL (
        SELECT google_email, customer_id
        FROM mcp_sessions
        WHERE user_id = pu.user_id
        ORDER BY created_at DESC NULLS LAST
        LIMIT 1
      ) s ON TRUE
      ORDER BY
        (pu.successful_interactions::float / NULLIF(pu.interactions, 0)) ASC,
        pu.interactions DESC
      LIMIT 10
    `),

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

    const lowSuccessRows = lowSuccessUsers as unknown as Array<{
        userId: string;
        interactions: number | string;
        successfulInteractions: number | string;
        googleEmail: string | null;
        primaryAccountId: string | null;
        topErrorClasses: string[] | null;
    }>;

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
        lowSuccessUsers: {
            windowDays: LOW_SUCCESS_WINDOW_DAYS,
            minInteractions: LOW_SUCCESS_MIN_INTERACTIONS,
            users: lowSuccessRows.map((u) => {
                const interactions = Number(u.interactions ?? 0);
                const successfulInteractions = Number(u.successfulInteractions ?? 0);
                return {
                    userId: u.userId,
                    googleEmail: u.googleEmail,
                    primaryAccountId: u.primaryAccountId,
                    interactions,
                    successfulInteractions,
                    successRate:
                        interactions > 0
                            ? (successfulInteractions / interactions) * 100
                            : 0,
                    topErrorClasses: u.topErrorClasses ?? [],
                };
            }),
        },
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

export type UsageData = Awaited<ReturnType<typeof fetchUsageData>>;

// Cache key includes every input that changes the result. Short revalidate
// keeps repeat tab visits / refreshes near-instant without serving very stale
// data; the API route can still pass `fresh` to bypass via a different code
// path. Tag lets us invalidate from elsewhere if needed.
export function getUsageData(opts: GetUsageDataOptions = {}): Promise<UsageData> {
    const days = Number.isFinite(opts.days) ? Math.min(Math.max(opts.days as number, 1), 90) : 30;
    const tz = opts.tz ?? 'UTC';
    const source = opts.source ?? 'all';
    const platform = opts.platform ?? 'all';
    const includeDev = opts.includeDev ? '1' : '0';
    return unstable_cache(
        () => fetchUsageData(opts),
        ['dev-usage', String(days), tz, source, platform, includeDev],
        { revalidate: 60, tags: ['dev-usage'] },
    )();
}
