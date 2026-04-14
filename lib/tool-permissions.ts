import { db, schema } from "@/lib/db";
import { and, eq, inArray } from "drizzle-orm";
import { sql } from "drizzle-orm";

export type ToolPermissionMode = "always_allow" | "needs_approval" | "blocked";

export const TOOL_PERMISSION_MODES: ToolPermissionMode[] = [
  "always_allow",
  "needs_approval",
  "blocked",
];

export function isToolPermissionMode(v: unknown): v is ToolPermissionMode {
  return typeof v === "string" && (TOOL_PERMISSION_MODES as string[]).includes(v);
}

/**
 * Default mode for a tool when the user hasn't explicitly set one.
 * Read tools auto-allow; everything else requires approval.
 */
export function defaultModeFor(readOnly: boolean): ToolPermissionMode {
  return readOnly ? "always_allow" : "needs_approval";
}

export async function getToolPermissions(userId: string): Promise<Record<string, ToolPermissionMode>> {
  const rows = await db()
    .select({
      toolName: schema.toolPermissions.toolName,
      mode: schema.toolPermissions.mode,
    })
    .from(schema.toolPermissions)
    .where(eq(schema.toolPermissions.userId, userId));

  const out: Record<string, ToolPermissionMode> = {};
  for (const r of rows) {
    if (isToolPermissionMode(r.mode)) {
      out[r.toolName] = r.mode;
    }
  }
  return out;
}

export async function setToolPermissions(
  userId: string,
  updates: Array<{ toolName: string; mode: ToolPermissionMode }>,
): Promise<void> {
  if (updates.length === 0) return;
  await db()
    .insert(schema.toolPermissions)
    .values(
      updates.map(u => ({
        userId,
        toolName: u.toolName,
        mode: u.mode,
      })),
    )
    .onConflictDoUpdate({
      target: [schema.toolPermissions.userId, schema.toolPermissions.toolName],
      set: {
        mode: sql`excluded.mode`,
        updatedAt: sql`now()`,
      },
    });
}

export async function clearToolPermissions(
  userId: string,
  toolNames: string[],
): Promise<void> {
  if (toolNames.length === 0) return;
  await db()
    .delete(schema.toolPermissions)
    .where(
      and(
        eq(schema.toolPermissions.userId, userId),
        inArray(schema.toolPermissions.toolName, toolNames),
      ),
    );
}
