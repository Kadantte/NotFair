import { notFound } from "next/navigation";
import { getAuthContext } from "@/lib/session";
import { DEV_EMAILS } from "@/lib/dev-emails";

export { DEV_EMAILS };

type AccessResult =
  | { ok: true; email: string }
  | { ok: false; reason: "unauthenticated" | "forbidden" | "error" };

async function checkDevAccess(): Promise<AccessResult> {
  let googleEmail: string | null = null;
  try {
    const ctx = await getAuthContext();
    googleEmail = ctx.auth.realGoogleEmail ?? ctx.session.googleEmail;
  } catch (err) {
    if (err instanceof Error && err.message === "Not authenticated") {
      return { ok: false, reason: "unauthenticated" };
    }
    return { ok: false, reason: "error" };
  }
  if (!googleEmail || !DEV_EMAILS.includes(googleEmail)) {
    return { ok: false, reason: "forbidden" };
  }
  return { ok: true, email: googleEmail };
}

/**
 * Gate an API route to `DEV_EMAILS`. Returns a 403/500 Response when access
 * is denied, `null` when the caller is an authorized dev.
 */
export async function requireDevEmail(): Promise<Response | null> {
  const result = await checkDevAccess();
  if (result.ok) return null;
  if (result.reason === "error") {
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
  return Response.json({ error: "Forbidden" }, { status: 403 });
}

/**
 * Gate a server-component page to `DEV_EMAILS`. Triggers `notFound()` for
 * unauthorized users so the route returns a 404 instead of leaking the
 * existence of `/dev`.
 */
export async function requireDevEmailForPage(): Promise<void> {
  const result = await checkDevAccess();
  if (!result.ok) notFound();
}
