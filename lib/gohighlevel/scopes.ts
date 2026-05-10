/**
 * Canonical list of HighLevel OAuth scopes the NotFair MCP requests.
 *
 * Lives in its own module so both server code (`lib/gohighlevel/oauth.ts`,
 * which imports the DB) and client components (the connect surface, which
 * displays the scope list to the user) can pull from a single source. Server
 * imports of `oauth.ts` would bleed `db` into the client bundle.
 */

export const GOHIGHLEVEL_READONLY_SCOPES = [
  "businesses.readonly",
  "locations.readonly",
  "locations/customValues.readonly",
  "locations/customFields.readonly",
  "locations/tags.readonly",
  "locations/templates.readonly",
  "locations/tasks.readonly",
  "contacts.readonly",
  "conversations.readonly",
  "conversations/message.readonly",
  "opportunities.readonly",
  "calendars.readonly",
  "calendars/groups.readonly",
  "calendars/resources.readonly",
  "calendars/events.readonly",
  "forms.readonly",
  "surveys.readonly",
  "users.readonly",
  "workflows.readonly",
  "invoices.readonly",
  "invoices/schedule.readonly",
  "invoices/template.readonly",
  "invoices/estimate.readonly",
  "payments/orders.readonly",
  "payments/transactions.readonly",
  "payments/subscriptions.readonly",
  "payments/coupons.readonly",
  "products.readonly",
  "products/prices.readonly",
  "products/collection.readonly",
  "objects/schema.readonly",
  "objects/record.readonly",
  "associations.readonly",
  "associations/relation.readonly",
  "medias.readonly",
  "links.readonly",
  "campaigns.readonly",
  "oauth.readonly",
  "emails/builder.readonly",
  "emails/schedule.readonly",
  "documents_contracts/list.readonly",
  "documents_contracts_templates/list.readonly",
] as const;

export type GoHighLevelScope = (typeof GOHIGHLEVEL_READONLY_SCOPES)[number];

export function hasAllGoHighLevelReadonlyScopes(grantedScopes: unknown): boolean {
  if (!Array.isArray(grantedScopes)) return false;
  const granted = new Set(grantedScopes.filter((scope): scope is string => typeof scope === "string"));
  return GOHIGHLEVEL_READONLY_SCOPES.every((scope) => granted.has(scope));
}
