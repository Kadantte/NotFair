import "server-only";

import { cookies } from "next/headers";
import { getSession } from "@/lib/session";
import { isWaitlistApproved } from "@/lib/waitlist";

/**
 * Cookie that lets a developer toggle the Meta waitlist wall on/off so they
 * can preview both UX states. Default for devs (cookie absent) = wall OFF
 * so DEV_EMAILS users can use Meta features end-to-end without bouncing
 * through the join-waitlist flow on every fresh session. Devs who want to
 * preview the customer-facing wall can flip the toggle on in /dev. Non-dev
 * customers always see the wall regardless of cookie state.
 */
export const META_WAITLIST_OVERRIDE_COOKIE = "dev_meta_waitlist_override";

type WallOverrideState = "on" | "off";

/**
 * Should the Meta waitlist wall be shown for the current session?
 *
 * Approved users: false (manual approval from /dev/waitlist bypasses the
 * wall regardless of dev status).
 *
 * Non-dev unapproved users: true (everyone outside DEV_EMAILS sees the wall
 * until they are approved or Meta App Review is complete).
 *
 * Devs: false by default. Returns true only when a dev has explicitly set
 * the override cookie to "on" to preview the customer-facing wall.
 */
export async function isMetaWaitlistWallEnabled(): Promise<boolean> {
  if (await isWaitlistApproved("meta_ads")) return false;

  const session = await getSession();
  const isDev = session.connected && session.isDev;
  if (!isDev) return true;

  const store = await cookies();
  const value = store.get(META_WAITLIST_OVERRIDE_COOKIE)?.value;
  // For devs only: cookie absent (or "off") → wall hidden; "on" → wall shown.
  return value === "on";
}

export function readMetaWaitlistOverrideValue(value: string | undefined): WallOverrideState {
  // Mirrors the dev gate: explicit "on" means show the wall; everything else
  // (absent, "off", malformed) means hide it.
  return value === "on" ? "on" : "off";
}
