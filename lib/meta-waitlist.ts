import "server-only";

import { cookies } from "next/headers";
import { getSession } from "@/lib/session";

/**
 * Cookie that lets a developer toggle the Meta waitlist wall on/off so they
 * can preview both UX states. Default (cookie absent or "on") = wall on.
 * "off" = wall hidden — but **only honored** when the session belongs to a
 * dev. Non-dev customers can set this cookie all day; the gate ignores it.
 */
export const META_WAITLIST_OVERRIDE_COOKIE = "dev_meta_waitlist_override";

type WallOverrideState = "on" | "off";

/**
 * Should the Meta waitlist wall be shown for the current session?
 *
 * Returns true for:
 *   - non-dev users (always)
 *   - devs who haven't toggled the override off
 *
 * Returns false only when a dev has explicitly set the override cookie to
 * "off" — letting them preview the underlying connect/manage UX.
 */
export async function isMetaWaitlistWallEnabled(): Promise<boolean> {
  const session = await getSession();
  const isDev = session.connected && session.isDev;
  if (!isDev) return true;

  const store = await cookies();
  const value = store.get(META_WAITLIST_OVERRIDE_COOKIE)?.value;
  // For devs only: "off" disables the wall; anything else (or absent)
  // keeps it on — same default as a customer.
  return value !== "off";
}

export function readMetaWaitlistOverrideValue(value: string | undefined): WallOverrideState {
  return value === "off" ? "off" : "on";
}
