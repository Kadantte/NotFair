import { db, schema } from "@/lib/db";
import { and, eq, desc } from "drizzle-orm";
import crypto from "crypto";

// ─── Types ──────────────────────────────────────────────────────────

export type ThreadSummary = {
  id: string;
  title: string | null;
  updatedAt: Date;
  isShared: boolean;
  shareId: string | null;
};

// ─── Threads ────────────────────────────────────────────────────────

export async function loadThreadsForUser(
  userId: string,
  accountId: string,
): Promise<ThreadSummary[]> {
  const rows = await db()
    .select({
      id: schema.chatThreads.id,
      title: schema.chatThreads.title,
      updatedAt: schema.chatThreads.updatedAt,
      isShared: schema.chatThreads.isShared,
      shareId: schema.chatThreads.shareId,
    })
    .from(schema.chatThreads)
    .where(
      and(
        eq(schema.chatThreads.userId, userId),
        eq(schema.chatThreads.accountId, accountId),
      ),
    )
    .orderBy(desc(schema.chatThreads.updatedAt))
    .limit(50);

  return rows;
}

export async function upsertThread(thread: {
  id: string;
  userId: string;
  accountId: string;
  title: string | null;
}) {
  await db()
    .insert(schema.chatThreads)
    .values({
      id: thread.id,
      userId: thread.userId,
      accountId: thread.accountId,
      title: thread.title,
    })
    .onConflictDoUpdate({
      target: schema.chatThreads.id,
      set: {
        ...(thread.title !== null && { title: thread.title }),
        updatedAt: new Date(),
      },
    });
}

export async function deleteThread(threadId: string, userId: string) {
  await db().transaction(async (tx) => {
    const deleted = await tx
      .delete(schema.chatThreads)
      .where(
        and(
          eq(schema.chatThreads.id, threadId),
          eq(schema.chatThreads.userId, userId),
        ),
      )
      .returning({ id: schema.chatThreads.id });

    if (deleted.length > 0) {
      await tx
        .delete(schema.chatMessages)
        .where(eq(schema.chatMessages.threadId, threadId));
    }
  });
}

// ─── Messages ───────────────────────────────────────────────────────

export async function loadMessages(threadId: string) {
  return db()
    .select({
      id: schema.chatMessages.id,
      threadId: schema.chatMessages.threadId,
      role: schema.chatMessages.role,
      parts: schema.chatMessages.parts,
      createdAt: schema.chatMessages.createdAt,
    })
    .from(schema.chatMessages)
    .where(eq(schema.chatMessages.threadId, threadId))
    .orderBy(schema.chatMessages.createdAt);
}

/**
 * Ownership-gated message read. Returns null when the thread doesn't exist
 * or doesn't belong to userId — callers map that to 404 / empty hydration.
 */
export async function loadMessagesIfOwned(threadId: string, userId: string) {
  const [thread] = await db()
    .select({ id: schema.chatThreads.id })
    .from(schema.chatThreads)
    .where(
      and(
        eq(schema.chatThreads.id, threadId),
        eq(schema.chatThreads.userId, userId),
      ),
    )
    .limit(1);
  if (!thread) return null;
  return loadMessages(threadId);
}

export async function saveMessage(msg: {
  id: string;
  threadId: string;
  role: string;
  parts: unknown;
}) {
  await db()
    .insert(schema.chatMessages)
    .values({
      id: msg.id,
      threadId: msg.threadId,
      role: msg.role,
      parts: msg.parts,
    })
    .onConflictDoUpdate({
      target: schema.chatMessages.id,
      set: {
        parts: msg.parts,
      },
    });
}

/** Replace all messages for a thread with the given list (atomic transaction). */
export async function saveAllMessages(
  threadId: string,
  messages: { id: string; role: string; parts: unknown }[],
) {
  await db().transaction(async (tx) => {
    await tx
      .delete(schema.chatMessages)
      .where(eq(schema.chatMessages.threadId, threadId));

    if (messages.length === 0) return;

    await tx
      .insert(schema.chatMessages)
      .values(
        messages.map(m => ({
          id: m.id,
          threadId,
          role: m.role,
          parts: m.parts,
        })),
      );
  });
}

// ─── Sharing ────────────────────────────────────────────────────────

function generateShareId(): string {
  return crypto.randomBytes(8).toString("base64url");
}

export async function enableSharing(threadId: string, userId: string) {
  // Return existing shareId if already shared
  const [existing] = await db()
    .select({ shareId: schema.chatThreads.shareId, isShared: schema.chatThreads.isShared })
    .from(schema.chatThreads)
    .where(
      and(
        eq(schema.chatThreads.id, threadId),
        eq(schema.chatThreads.userId, userId),
      ),
    )
    .limit(1);

  if (!existing) return null;
  if (existing.isShared && existing.shareId) return existing.shareId;

  const shareId = generateShareId();

  await db()
    .update(schema.chatThreads)
    .set({ shareId, isShared: true })
    .where(
      and(
        eq(schema.chatThreads.id, threadId),
        eq(schema.chatThreads.userId, userId),
      ),
    );

  return shareId;
}

export async function disableSharing(threadId: string, userId: string) {
  await db()
    .update(schema.chatThreads)
    .set({ shareId: null, isShared: false })
    .where(
      and(
        eq(schema.chatThreads.id, threadId),
        eq(schema.chatThreads.userId, userId),
      ),
    );
}

export async function loadSharedThread(shareId: string) {
  const [thread] = await db()
    .select({
      id: schema.chatThreads.id,
      title: schema.chatThreads.title,
      createdAt: schema.chatThreads.createdAt,
    })
    .from(schema.chatThreads)
    .where(
      and(
        eq(schema.chatThreads.shareId, shareId),
        eq(schema.chatThreads.isShared, true),
      ),
    )
    .limit(1);

  if (!thread) return null;

  const messages = await loadMessages(thread.id);

  return { thread, messages };
}
