import { and, desc, eq, lt } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { OP_TYPE } from "@/lib/db/tracking";
import { sendRedditConversion } from "@/lib/reddit-capi";

// Process-local cache of users we've already observed writing. Once a user
// has any prior successful write, they'll have one forever — so a single
// SELECT per userId per process is sufficient. Bulk write ops (which call
// logChange N times) short-circuit after the first check.
const firstWriteChecked = new Set<string>();

export function _resetFirstWriteCacheForTests(): void {
  firstWriteChecked.clear();
}

/**
 * Fire a Reddit `Lead` conversion on the user's first-ever successful write.
 * D0-write is AdsAgent's activation north star — the primary conversion for
 * Reddit ad optimization. Uses a stable `first-write-${userId}` conversion_id
 * so concurrent bulk-write races dedupe on Reddit's side.
 */
export async function maybeFireRedditFirstWrite(params: {
  userId: string;
  justInsertedId: number;
}): Promise<void> {
  const { userId, justInsertedId } = params;

  if (firstWriteChecked.has(userId)) return;

  try {
    const [priorWrite, session] = await Promise.all([
      db()
        .select({ id: schema.operations.id })
        .from(schema.operations)
        .where(
          and(
            eq(schema.operations.userId, userId),
            eq(schema.operations.opType, OP_TYPE.WRITE),
            eq(schema.operations.success, 1),
            lt(schema.operations.id, justInsertedId),
          ),
        )
        .limit(1),
      db()
        .select({ googleEmail: schema.mcpSessions.googleEmail })
        .from(schema.mcpSessions)
        .where(eq(schema.mcpSessions.userId, userId))
        .orderBy(desc(schema.mcpSessions.createdAt))
        .limit(1),
    ]);

    firstWriteChecked.add(userId);

    if (priorWrite.length > 0) return;

    await sendRedditConversion({
      trackingType: "Lead",
      conversionId: `first-write-${userId}`,
      email: session[0]?.googleEmail ?? null,
      externalId: userId,
      valueDecimal: 1.0,
      currency: "USD",
    });
  } catch (err) {
    console.error("[reddit-first-write] Failed to fire activation event:", err);
  }
}
