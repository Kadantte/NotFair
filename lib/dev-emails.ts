/**
 * Accounts that get developer-level entitlements (unlimited plan, admin gates).
 * Kept in a standalone module so both the route guard (`lib/dev-access.ts`)
 * and the subscription resolver (`lib/subscription.ts`) can read it without
 * pulling the other's dependencies.
 */
export const DEV_EMAILS: string[] = ["tongchen92@gmail.com", "izhongyuting@gmail.com"];
