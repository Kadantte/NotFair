import { NextResponse } from "next/server";
import { getSessionAuth } from "@/lib/session";
import { loadThreadsForUser, deleteThread } from "@/lib/db/chat";

export async function GET() {
  const session = await getSessionAuth().catch(() => null);
  if (!session?.userId) {
    return NextResponse.json({ threads: [] });
  }

  const threads = await loadThreadsForUser(session.userId, session.customerId);
  return NextResponse.json({ threads });
}

export async function DELETE(request: Request) {
  const session = await getSessionAuth().catch(() => null);
  if (!session?.userId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { threadId } = await request.json();
  if (!threadId) {
    return NextResponse.json({ error: "Missing threadId" }, { status: 400 });
  }

  await deleteThread(threadId, session.userId);
  return NextResponse.json({ ok: true });
}
