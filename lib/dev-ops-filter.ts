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

/** Count billable operation rows. Bulk fan-out rows count individually. */
export function operationRowCount(ops: typeof schema.operations): SQL<number> {
  return sql<number>`count(distinct ${ops.id})::int`;
}

/** Count billable operation rows for one operation type. */
export function operationTypeRowCount(ops: typeof schema.operations, opType: number): SQL<number> {
  return sql<number>`count(distinct ${ops.id}) filter (where ${ops.opType} = ${opType})::int`;
}

/** Count failed/rejected operation rows. Bulk fan-out rows count individually. */
export function operationErrorRowCount(ops: typeof schema.operations): SQL<number> {
  return sql<number>`count(distinct ${ops.id}) filter (where ${ops.errorClass} is not null)::int`;
}
