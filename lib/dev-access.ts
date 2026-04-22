import { getAuthContext } from "@/lib/session";
import { DEV_EMAILS } from "@/lib/dev-emails";

export { DEV_EMAILS };

/**
 * Gate a route to `DEV_EMAILS`. Returns a 403/500 Response when access is
 * denied, `null` when the caller is an authorized dev and execution should
 * continue. The email is resolved from the impersonation-aware auth context
 * so a dev viewing another user's session is still admitted.
 */
export async function requireDevEmail(): Promise<Response | null> {
  let googleEmail: string | null = null;
  try {
    const ctx = await getAuthContext();
    googleEmail = ctx.auth.realGoogleEmail ?? ctx.session.googleEmail;
  } catch (err) {
    if (err instanceof Error && err.message === "Not authenticated") {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
  if (!googleEmail || !DEV_EMAILS.includes(googleEmail)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}
