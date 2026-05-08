import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requireDevEmail } from "@/lib/dev-access";

/**
 * Toggle the per-session "growth override" for dev users.
 *
 * By default, accounts in `DEV_EMAILS` get a synthetic Growth plan via
 * `maybeDevOverride` in `lib/subscription.ts`. Setting the cookie to "off"
 * suppresses that override so the dev experiences the Free plan UX
 * (paywalls, rate limits, upgrade nags). "on" or absent = default behavior.
 */
const COOKIE_NAME = "dev_growth_override";

type State = "on" | "off";

export async function GET() {
  const gate = await requireDevEmail();
  if (gate) return gate;

  const store = await cookies();
  const value = store.get(COOKIE_NAME)?.value;
  const state: State = value === "off" ? "off" : "on";
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
  response.cookies.set(COOKIE_NAME, state, {
    httpOnly: false,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 90,
  });
  return response;
}
