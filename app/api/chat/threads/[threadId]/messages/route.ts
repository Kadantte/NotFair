import { NextResponse } from "next/server";
import { getSessionAuth } from "@/lib/session";
import { loadMessages } from "@/lib/db/chat";
import { db, schema } from "@/lib/db";
import { and, eq } from "drizzle-orm";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ threadId: string }> },
) {
  const session = await getSessionAuth().catch(() => null);
  if (!session?.userId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { threadId } = await params;

  // Verify thread belongs to this user
  const [thread] = await db()
    .select({ id: schema.chatThreads.id })
    .from(schema.chatThreads)
    .where(
      and(
        eq(schema.chatThreads.id, threadId),
        eq(schema.chatThreads.userId, session.userId),
      ),
    )
    .limit(1);

  if (!thread) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const messages = await loadMessages(threadId);
  return NextResponse.json({ messages });
}
