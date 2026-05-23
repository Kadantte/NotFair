import { NextResponse } from "next/server";
import { setGoogleConnectionActiveAccount } from "@/lib/connections/google";
import { loadGoogleConnection } from "@/lib/connections/google-read";
import { setActivePlatformCookie } from "@/lib/auth-cookies";
import { identifyUser } from "@/lib/auth/identify-user";

export async function POST(request: Request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { customerId } = body;
  if (!customerId || typeof customerId !== "string") {
    return NextResponse.json({ error: "Missing customerId" }, { status: 400 });
  }

  const identity = await identifyUser();
  if (!identity) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const conn = await loadGoogleConnection(identity.userId);
  if (!conn) {
    return NextResponse.json(
      { error: "No Google Ads connection found" },
      { status: 404 },
    );
  }

  if (!conn.customerIds.some((a) => a.id === customerId)) {
    return NextResponse.json({ error: "Account not connected" }, { status: 403 });
  }

  await setGoogleConnectionActiveAccount({
    userId: identity.userId,
    activeAccountId: customerId,
  });

  const response = NextResponse.json({ ok: true });
  setActivePlatformCookie(response, "google_ads");
  return response;
}
