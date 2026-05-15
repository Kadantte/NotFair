import { sql, type SQL } from "drizzle-orm";
import { schema } from "@/lib/db";
import { DEV_EMAILS } from "@/lib/dev-emails";

/**
 * Comma-separated, parameterized SQL list of lowercased dev emails. Embed
 * inside `IN (${devEmailSqlList()})` when writing raw subqueries against the
 * `operations` / `mcp_sessions` tables.
 */
export function devEmailSqlList(): SQL {
  return sql.join(
    DEV_EMAILS.map((e) => sql`${e.toLowerCase()}`),
    sql`, `,
  );
}

/**
 * SQL fragment that is true when an `operations` row is NOT attributed to a
 * dev user — i.e., its `user_id` doesn't join to an `mcp_sessions` row whose
 * `google_email` is in `DEV_EMAILS`. Null user_id is kept (NOT EXISTS is
 * vacuously true). Use in WHERE clauses on `schema.operations` so dev-dashboard
 * aggregates exclude internal testing.
 */
export function excludeDevOpsFilter(): SQL {
  return sql`not exists (select 1 from ${schema.mcpSessions} where ${schema.mcpSessions.userId} = ${schema.operations.userId} and lower(${schema.mcpSessions.googleEmail}) in (${devEmailSqlList()}))`;
}

/**
 * Same as `excludeDevOpsFilter` but accepts an arbitrary SQL reference for the
 * user_id column. Use this inside raw-SQL subqueries where you can't reference
 * `schema.operations.userId` directly (e.g. a correlated subquery with an alias).
 *
 * Example:
 *   excludeDevOpsFilterForAlias(sql`o2.user_id`)
 */
export function excludeDevOpsFilterForAlias(userIdRef: SQL): SQL {
  return sql`NOT EXISTS (SELECT 1 FROM mcp_sessions s WHERE s.user_id = ${userIdRef} AND lower(s.google_email) IN (${devEmailSqlList()}))`;
}

// `count(distinct id)` would be equivalent here — id is the PK — but it forces
// Postgres into a Sort + external merge that spilled to disk and turned the
// /dev/customers aggregates into 1.7–2.4s queries. Plain `count(*)` produces
// the same number via HashAggregate. Every caller queries `FROM operations`
// directly (no fan-out JOIN), so the equivalence holds. If you ever join
// operations to a table that fans out rows, use a CTE/subquery to pre-dedupe
// before counting rather than reintroducing `count(distinct id)` here.

/** Count billable operation rows. Bulk fan-out rows count individually. */
export function operationRowCount(): SQL<number> {
  return sql<number>`count(*)::int`;
}

/** Count billable operation rows for one operation type. */
export function operationTypeRowCount(ops: typeof schema.operations, opType: number): SQL<number> {
  return sql<number>`count(*) filter (where ${ops.opType} = ${opType})::int`;
}

/**
 * Count failed/rejected operation rows. Bulk fan-out rows count individually.
 *
 * RATE_LIMIT is excluded: those rejections originate from our own quota
 * enforcement (lib/mcp/rate-limit.ts), not from a bug or upstream failure.
 * Counting them as errors inflates every dashboard's "error rate" with
 * self-inflicted noise and would push us to ship band-aids that mask real
 * issues. Real errors are THROWN / WRITE_REJECTED / LOGGING.
 */
export function operationErrorRowCount(ops: typeof schema.operations): SQL<number> {
  return sql<number>`count(*) filter (where ${ops.errorClass} is not null and ${ops.errorClass} <> 'RATE_LIMIT')::int`;
}
