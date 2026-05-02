import { NextResponse } from "next/server";
import { isWaitlistKey, joinWaitlist } from "@/lib/waitlist";

/**
 * Generic waitlist signup endpoint. Body: `{ key, metadata? }`. Authenticates
 * via the session cookie inside `joinWaitlist`. Idempotent per (key, userId).
 */
export async function POST(request: Request) {
  let body: { key?: unknown; metadata?: unknown };
  try {
    body = (await request.json()) as { key?: unknown; metadata?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!isWaitlistKey(body.key)) {
    return NextResponse.json({ error: "Invalid waitlist key" }, { status: 400 });
  }

  const metadata =
    typeof body.metadata === "object" && body.metadata !== null && !Array.isArray(body.metadata)
      ? (body.metadata as Record<string, unknown>)
      : {};

  try {
    const result = await joinWaitlist(body.key, metadata);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof Error && err.message === "Not authenticated") {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    return NextResponse.json({ error: "Failed to join waitlist" }, { status: 500 });
  }
}
