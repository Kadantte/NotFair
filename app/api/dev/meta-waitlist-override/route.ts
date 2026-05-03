import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requireDevEmail } from "@/lib/dev-access";
import { META_WAITLIST_OVERRIDE_COOKIE } from "@/lib/meta-waitlist";

/**
 * Toggle the dev-only Meta waitlist wall override.
 *
 * "on"  — show the join-waitlist wall (same as a customer sees)
 * "off" — hide the wall, render the underlying connect/manage UX
 *
 * The gate in `isMetaWaitlistWallEnabled` only honors this cookie for
 * accounts in `DEV_EMAILS`. Customers can set the cookie manually but
 * will still see the wall.
 */
type State = "on" | "off";

export async function GET() {
  const gate = await requireDevEmail();
  if (gate) return gate;

  const store = await cookies();
  const value = store.get(META_WAITLIST_OVERRIDE_COOKIE)?.value;
  // Default for devs is "off" (wall hidden). The dev only sees "on" when
  // they've explicitly opted in to preview the customer-facing wall.
  const state: State = value === "on" ? "on" : "off";
  return NextResponse.json({ state });
}

export async function POST(request: Request) {
  const gate = await requireDevEmail();
  if (gate) return gate;

  let body: { enabled?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (typeof body.enabled !== "boolean") {
    return NextResponse.json({ error: "Missing 'enabled' boolean" }, { status: 400 });
  }

  const state: State = body.enabled ? "on" : "off";
  const response = NextResponse.json({ state });
  response.cookies.set(META_WAITLIST_OVERRIDE_COOKIE, state, {
    httpOnly: false,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 90,
  });
  return response;
}
