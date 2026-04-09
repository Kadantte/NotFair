import { NextResponse } from "next/server";
import { getSessionAuth } from "@/lib/session";
import { enableSharing, disableSharing } from "@/lib/db/chat";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ threadId: string }> },
) {
  const session = await getSessionAuth().catch(() => null);
  if (!session?.userId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { threadId } = await params;
  const shareId = await enableSharing(threadId, session.userId);
  if (!shareId) {
    return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  }

  return NextResponse.json({ shareId, shareUrl: `/chat/share/${shareId}` });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ threadId: string }> },
) {
  const session = await getSessionAuth().catch(() => null);
  if (!session?.userId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { threadId } = await params;
  await disableSharing(threadId, session.userId);
  return NextResponse.json({ ok: true });
}
