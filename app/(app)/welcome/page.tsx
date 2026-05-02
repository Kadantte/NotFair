import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE_NAMES } from "@/lib/auth-cookies";
import { getCurrentRefreshToken, getSession } from "@/lib/session";
import { listConnectableAccounts } from "@/lib/google-ads";
import { WelcomePage } from "@/components/welcome-page";

/**
 * FTUE landing for users in a "logged in but not productive yet" state.
 *
 * Two distinct cases land here, and they need different UX:
 *   1. The Google identity has zero Ads accounts — show the empty-state
 *      warning ("No ad platform connected", switch-account CTA).
 *   2. The Google identity HAS connectable Ads accounts but the user
 *      hasn't selected any yet — bounce them straight to the picker so
 *      they don't see a misleading "no accounts found" message.
 *
 * We disambiguate by re-running listConnectableAccounts here. The auth
 * callback already does this on first sign-in, but a user can also reach
 * /welcome by navigating away from the picker without saving — at which
 * point we need to look up the candidates ourselves.
 *
 * Routing logic lives here so any page that finds itself with an ads-less
 * session can simply `redirect("/welcome")` and let this page sort it.
 */
export default async function WelcomeRoute() {
  const session = await getSession();

  if (!session.connected) {
    redirect("/connect");
  }

  // Already fully connected — nothing for this page to do. Send them to the
  // app's default landing.
  if (!session.pendingSetup) {
    redirect("/campaigns");
  }

  // Pending session — figure out whether they actually have any ads
  // accounts available to pick. If yes, send them to the picker; the empty
  // state below is only correct when listConnectableAccounts returns empty.
  //
  // Important: redirect() throws an internal NEXT_REDIRECT error that Next
  // catches at the route boundary, so it MUST live outside any try/catch
  // that swallows it. We compute the redirect target inside try, then
  // redirect after.
  const refreshToken = await getCurrentRefreshToken();
  let pickerRedirect: string | null = null;
  if (refreshToken) {
    try {
      const { accounts } = await listConnectableAccounts(refreshToken);
      if (accounts.length > 0) {
        const accountsForUi = accounts.map((a) => ({
          id: a.id,
          name: a.name,
          ...(a.loginCustomerId
            ? { loginCustomerId: a.loginCustomerId, loginCustomerName: a.loginCustomerName }
            : {}),
        }));
        const accountsParam = encodeURIComponent(JSON.stringify(accountsForUi));
        pickerRedirect = `/welcome/google-ads/select?mode=update&accounts=${accountsParam}`;
      }
    } catch {
      // Falling through to the empty-state UI is the safe default — the
      // user can still re-trigger Google sign-in from there.
    }
  }
  if (pickerRedirect) {
    redirect(pickerRedirect);
  }

  // Surface the email of the Google identity that just failed an account
  // lookup, so the user immediately sees "I signed in with the wrong account."
  const cookieStore = await cookies();
  const lastAttemptEmail = cookieStore.get(COOKIE_NAMES.lastAttemptEmail)?.value ?? null;

  return (
    <WelcomePage
      googleEmail={lastAttemptEmail ?? session.googleEmail}
    />
  );
}
