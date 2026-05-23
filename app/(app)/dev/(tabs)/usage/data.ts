import 'server-only';

import { unstable_cache } from 'next/cache';
import { db, schema } from '@/lib/db';
import { sql, and, eq, gte, type SQL } from 'drizzle-orm';
import { OP_TYPE } from '@/lib/db/tracking';
import {
    excludeDevOpsFilter,
    excludeDevOpsFilterForAlias,
    operationErrorRowCount,
    operationTypeRowCount,
} from '@/lib/dev-ops-filter';
import type {
    DailyCountRow,
    LowSuccessUser,
    LowSuccessUsers,
    TopTool,
} from '@/lib/dev-types';

// "Top Users by Low Success Rate" surfaces fresh quality signal — a long
// global window would let stale outages dominate. Pin to a short fixed window
// and require enough interactions to filter noise from one-shot users.
const LOW_SUCCESS_WINDOW_DAYS = 3;
const LOW_SUCCESS_MIN_INTERACTIONS = 3;

const CACHE_TTL_SECONDS = 60;

export interface UsageQueryOptions {
    days?: number;
    tz?: string;
    source?: string | null;
    platform?: 'google_ads' | 'meta_ads' | null;
    includeDev?: boolean;
}

type NormalizedOptions = {
    days: number;
    tz: string;
    source: string | null;
    platform: 'google_ads' | 'meta_ads' | null;
    includeDev: boolean;
};

function normalize(opts: UsageQueryOptions): NormalizedOptions {
    const rawDays = opts.days ?? 60;
    const days = Number.isFinite(rawDays) ? Math.min(Math.max(rawDays, 1), 120) : 60;
    return {
        days,
        tz: opts.tz ?? 'UTC',
        source: opts.source ?? null,
        platform: opts.platform ?? null,
        includeDev: !!opts.includeDev,
    };
}

function cacheKey(prefix: string, opts: NormalizedOptions): string[] {
    return [
        prefix,
        String(opts.days),
        opts.tz,
        opts.source ?? 'all',
        opts.platform ?? 'all',
        opts.includeDev ? 'dev' : 'prod',
    ];
}

function timeWindows(days: number) {
    const now = new Date();
    const since = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    const prevSince = new Date(now.getTime() - 2 * days * 24 * 60 * 60 * 1000);
    return { now, since, prevSince };
}

function clientSourceFilter(source: string | null): SQL | null {
    if (!source) return null;
    if (source === 'chat' || source === 'adsagent-chat') {
        return sql`${schema.operations.clientSource} IN ('chat', 'adsagent-chat')`;
    }
    if (source === 'unknown') {
        return sql`${schema.operations.clientSource} IS NULL`;
    }
    return sql`${schema.operations.clientSource} = ${source}`;
}

function rawClientSourceFilter(source: string | null): SQL {
    if (!source) return sql``;
    if (source === 'chat' || source === 'adsagent-chat') {
        return sql`AND o.client_source IN ('chat', 'adsagent-chat')`;
    }
    if (source === 'unknown') {
        return sql`AND o.client_source IS NULL`;
    }
    return sql`AND o.client_source = ${source}`;
}

// ─── Daily counts (reads/writes/errors/dau per day) ──────────────────────────

async function fetchDailyCounts(opts: NormalizedOptions): Promise<DailyCountRow[]> {
    const { since } = timeWindows(opts.days);

    const platformFilter = opts.platform ? eq(schema.operations.platform, opts.platform) : null;
    const sourceFilter = clientSourceFilter(opts.source);

    const whereDaily = and(
        gte(schema.operations.createdAt, since),
        ...(opts.includeDev ? [] : [excludeDevOpsFilter()]),
        ...(platformFilter ? [platformFilter] : []),
        ...(sourceFilter ? [sourceFilter] : []),
    );

    const tzLiteral = sql.raw(`'${opts.tz}'`);
    const localDate = sql`date((${schema.operations.createdAt} AT TIME ZONE 'UTC') AT TIME ZONE ${tzLiteral})`;

    const rows = await db()
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
        .orderBy(localDate);

    return rows;
}

export function getUsageDaily(opts: UsageQueryOptions = {}): Promise<DailyCountRow[]> {
    const normalized = normalize(opts);
    return unstable_cache(
        () => fetchDailyCounts(normalized),
        cacheKey('dev-usage-daily', normalized),
        { revalidate: CACHE_TTL_SECONDS, tags: ['dev-usage'] },
    )();
}

// ─── Low-success users (fixed short window) ──────────────────────────────────

async function fetchLowSuccess(opts: NormalizedOptions): Promise<LowSuccessUsers> {
    const { now } = timeWindows(opts.days);
    const lowSuccessSince = new Date(now.getTime() - LOW_SUCCESS_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const lowSuccessSinceIso = lowSuccessSince.toISOString();
    const lowSuccessLookbackIso = new Date(lowSuccessSince.getTime() - 30 * 60 * 1000).toISOString();
    const nowIso = now.toISOString();

    const devExclude = opts.includeDev
        ? sql``
        : sql`AND ${excludeDevOpsFilterForAlias(sql`o.user_id`)}`;
    const platformClause = opts.platform ? sql`AND o.platform = ${opts.platform}` : sql``;
    const sourceClause = rawClientSourceFilter(opts.source);

    const rows = await db().execute(sql`
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
          (o.success = 1 OR o.error_class = 'RATE_LIMIT')::int AS success,
          o.error_class
        FROM operations o
        WHERE o.created_at >= ${lowSuccessLookbackIso}::timestamp
          AND o.created_at < ${nowIso}::timestamp
          AND o.user_id IS NOT NULL
          ${devExclude}
          ${platformClause}
          ${sourceClause}
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
        WHERE error_class IS NOT NULL AND error_class <> 'RATE_LIMIT'
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
    `);

    const users: LowSuccessUser[] = (
        rows as unknown as Array<{
            userId: string;
            interactions: number | string;
            successfulInteractions: number | string;
            googleEmail: string | null;
            primaryAccountId: string | null;
            topErrorClasses: string[] | null;
        }>
    ).map((u) => {
        const interactions = Number(u.interactions ?? 0);
        const successfulInteractions = Number(u.successfulInteractions ?? 0);
        return {
            userId: u.userId,
            googleEmail: u.googleEmail,
            primaryAccountId: u.primaryAccountId,
            interactions,
            successfulInteractions,
            successRate: interactions > 0 ? (successfulInteractions / interactions) * 100 : 0,
            topErrorClasses: u.topErrorClasses ?? [],
        };
    });

    return {
        windowDays: LOW_SUCCESS_WINDOW_DAYS,
        minInteractions: LOW_SUCCESS_MIN_INTERACTIONS,
        users,
    };
}

export function getUsageLowSuccess(opts: UsageQueryOptions = {}): Promise<LowSuccessUsers> {
    const normalized = normalize(opts);
    return unstable_cache(
        () => fetchLowSuccess(normalized),
        cacheKey('dev-usage-low-success', normalized),
        { revalidate: CACHE_TTL_SECONDS, tags: ['dev-usage'] },
    )();
}

// ─── Top tools ───────────────────────────────────────────────────────────────

async function fetchTopTools(opts: NormalizedOptions): Promise<TopTool[]> {
    const { since } = timeWindows(opts.days);
    const sinceIso = since.toISOString();

    const devExclude = opts.includeDev
        ? sql``
        : sql`AND ${excludeDevOpsFilterForAlias(sql`user_id`)}`;
    const platformClause = opts.platform ? sql`AND platform = ${opts.platform}` : sql``;

    const rows = await db().execute(sql`
      WITH per_op AS (
        SELECT
          tool_name,
          latency_ms,
          -- RATE_LIMIT is our own quota enforcement; don't count it as an error.
          CASE
            WHEN error_class = 'RATE_LIMIT' THEN 0
            WHEN success = 0 OR error_class IS NOT NULL THEN 1
            ELSE 0
          END AS is_error
        FROM operations
        WHERE created_at >= ${sinceIso}::timestamp
          AND tool_name IS NOT NULL
          ${devExclude}
          ${platformClause}
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
    `);

    return (
        rows as unknown as Array<{
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
    }));
}

export function getUsageTopTools(opts: UsageQueryOptions = {}): Promise<TopTool[]> {
    const normalized = normalize(opts);
    return unstable_cache(
        () => fetchTopTools(normalized),
        cacheKey('dev-usage-top-tools', normalized),
        { revalidate: CACHE_TTL_SECONDS, tags: ['dev-usage'] },
    )();
}

// ─── Section dispatch (used by the API route) ────────────────────────────────

export type UsageSection = 'daily' | 'lowSuccess' | 'topTools';

export const USAGE_SECTIONS: readonly UsageSection[] = [
    'daily',
    'lowSuccess',
    'topTools',
] as const;

export function isUsageSection(value: string | null): value is UsageSection {
    return value !== null && (USAGE_SECTIONS as readonly string[]).includes(value);
}

export function getUsageSection(section: UsageSection, opts: UsageQueryOptions) {
    switch (section) {
        case 'daily':
            return getUsageDaily(opts);
        case 'lowSuccess':
            return getUsageLowSuccess(opts);
        case 'topTools':
            return getUsageTopTools(opts);
    }
}
