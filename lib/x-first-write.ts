import { and, eq, lt } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { OP_TYPE } from "@/lib/db/tracking";
import { sendXConversion } from "@/lib/x-capi";
import { getUserEmail } from "@/lib/auth/get-user-email";

// Process-local cache of users we've already checked. The database remains the
// source of truth; this just avoids repeated first-write lookups in bulk writes.
const firstWriteChecked = new Set<string>();

export function _resetXFirstWriteCacheForTests(): void {
  firstWriteChecked.clear();
}

/**
 * Fire the X Ads lead-generation conversion on the user's first-ever
 * successful write. D0 write users are NotFair's activation north star, so this
 * is the acquisition conversion X should optimize toward.
 */
export async function maybeFireXFirstWrite(params: {
  userId: string;
  justInsertedId: number;
}): Promise<void> {
  const { userId, justInsertedId } = params;

  if (firstWriteChecked.has(userId)) return;

  try {
    const [priorWrite, email] = await Promise.all([
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
      // Phase-4 step 2: pull email from auth.users instead of mcp_sessions
      // (which is empty for Supabase-only users).
      getUserEmail(userId),
    ]);

    firstWriteChecked.add(userId);

    if (priorWrite.length > 0) return;

    await sendXConversion({
      conversionId: `first-write-${userId}`,
      email,
      valueDecimal: 1.0,
      currency: "USD",
    });
  } catch (err) {
    console.error("[x-first-write] Failed to fire activation event:", err);
  }
}
