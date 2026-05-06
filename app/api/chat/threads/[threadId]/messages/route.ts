import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { loadMessagesIfOwned } from "@/lib/db/chat";

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
  const messages = await loadMessagesIfOwned(threadId, userId);
  if (messages === null) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ messages });
}
