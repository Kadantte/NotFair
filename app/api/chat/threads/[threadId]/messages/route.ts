import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { loadMessages } from "@/lib/db/chat";
import { db, schema } from "@/lib/db";
import { and, eq } from "drizzle-orm";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ threadId: string }> },
) {
  // Use getSession (not getSessionAuth) so ads-less users can read their
  // chat history. Auth here is by userId — there's no Google Ads call in
  // this handler, so a missing customerId shouldn't block it.
  const session = await getSession();
  const userId = session.connected ? session.userId : null;
  if (!userId) {
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
        eq(schema.chatThreads.userId, userId),
      ),
    )
    .limit(1);

  if (!thread) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const messages = await loadMessages(threadId);
  return NextResponse.json({ messages });
}
