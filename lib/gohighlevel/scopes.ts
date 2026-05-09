/**
 * Canonical list of HighLevel OAuth scopes the NotFair MCP requests.
 *
 * Lives in its own module so both server code (`lib/gohighlevel/oauth.ts`,
 * which imports the DB) and client components (the connect surface, which
 * displays the scope list to the user) can pull from a single source. Server
 * imports of `oauth.ts` would bleed `db` into the client bundle.
 */

export const GOHIGHLEVEL_READONLY_SCOPES = [
  "locations.readonly",
  "contacts.readonly",
  "conversations.readonly",
  "conversations/message.readonly",
  "opportunities.readonly",
  "calendars.readonly",
  "calendars/events.readonly",
] as const;

export type GoHighLevelScope = (typeof GOHIGHLEVEL_READONLY_SCOPES)[number];
