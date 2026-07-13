/**
 * Server-side post-connect account/property resolution for multi-account
 * MCPs (Google Ads, Meta Ads, Search Console).
 *
 * Runs inside the OAuth callback, before the redirect back to the app:
 *
 *  - selection already set and still reachable by the new bearer → keep it;
 *  - the bearer reaches exactly one account/property → persist it (there is
 *    no real choice to offer);
 *  - otherwise → `choice_required`, and the callback appends `?mcp_key=` so
 *    the Connections page opens the picker dialog.
 *
 * Doing this server-side (rather than in a client effect after landing)
 * matters: a mount-time server-action fetch races the flash banner's
 * URL-cleanup navigation, which can strand the action's promise.
 */

import { accountPickerFor } from "@/lib/mcp-account-pickers";
import {
  getProject,
  setProjectGoogleAdsAccount,
  setProjectMetaAdsAccount,
  setProjectGscProperty,
} from "@/server/db/projects";
import type { AccountPickerPrefetch } from "@/components/mcp-account-picker-dialog";
import type { Project } from "@/types";

const SETTERS: Record<
  string,
  (slug: string, id: string | null) => Project | null
> = {
  "notfair-googleads": setProjectGoogleAdsAccount,
  "notfair-metaads": setProjectMetaAdsAccount,
  "notfair-googlesearchconsole": setProjectGscProperty,
};

export type PostConnectSelection =
  | { kind: "not_pickable" }
  | { kind: "kept_existing" }
  | { kind: "auto_selected"; id: string; name: string }
  | { kind: "choice_required" };

export async function resolvePostConnectSelection(
  project_slug: string,
  catalog_key: string,
): Promise<PostConnectSelection> {
  const picker = accountPickerFor(catalog_key);
  const setter = SETTERS[catalog_key];
  if (!picker || !setter) return { kind: "not_pickable" };
  const project = getProject(project_slug);
  if (!project) return { kind: "not_pickable" };

  const list = await picker.list(project_slug);
  // Can't reach the MCP right now — let the Connections page's picker
  // surface the problem (it retries the list on render).
  if (!list.ok) return { kind: "choice_required" };

  const selected = picker.selectedId(project);
  if (selected && list.items.some((i) => i.id === selected)) {
    return { kind: "kept_existing" };
  }
  if (list.items.length === 1) {
    const only = list.items[0]!;
    setter(project_slug, only.id);
    return { kind: "auto_selected", id: only.id, name: only.name };
  }
  // Zero or many — the user has to look at it either way.
  return { kind: "choice_required" };
}

/**
 * Server-render-time prefetch for the account picker dialog. Pages that
 * receive the post-OAuth `?mcp_key=` (Connections, onboarding connect
 * step) call this during render and hand the result to the client, so
 * the dialog opens with data instead of racing the flash banner's
 * URL-cleanup navigation with a mount-time fetch.
 *
 * Returns null when no picker should open: unknown/non-pickable key, or
 * the persisted selection is still reachable (covers stale URLs — the
 * OAuth callback normally filters that case before appending the param).
 * Read-only by design: auto-selecting a lone account is the callback's
 * job; a GET render must not write.
 */
export async function prefetchAccountChoice(
  project: Project,
  mcp_key: string,
): Promise<{ prefetch: AccountPickerPrefetch; selected_id: string | null } | null> {
  const picker = accountPickerFor(mcp_key);
  if (!picker) return null;
  const selected_id = picker.selectedId(project);
  const list = await picker.list(project.slug);
  if (!list.ok) return { prefetch: { ok: false, error: list.error }, selected_id };
  if (selected_id && list.items.some((i) => i.id === selected_id)) return null;
  return { prefetch: { ok: true, items: list.items }, selected_id };
}
