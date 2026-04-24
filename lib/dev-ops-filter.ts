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
