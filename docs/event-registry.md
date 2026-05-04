# Event Registry

> Source of truth for all analytics events. Last updated: 2026-05-03.
> Platform: PostHog. Check here before adding a new event.



---

## account_connected

**Phase:** 1
**Category:** activation
**Platform:** PostHog (client, fired centrally from `PostHogProvider`)
**Trigger:** Fires when a user successfully completes a Google Ads OAuth flow and a session is created. The server (auth callback or select-account route) sets a short-lived `gads_connect_event` cookie carrying `{count, first, destination}`. `PostHogProvider` reads and clears this cookie on its next mount, then captures the event with the user already identified.
**Hypothesis:** We believe tracking this tells us the true connect-funnel completion rate across **all** entry points (header CTA → /audit, marketing-page CTA → /audit, connect-page → /connect, etc.), which lets us identify and fix drop-off in onboarding regardless of which CTA the user clicked.

> **Why server-set cookie + client-read.** The previous implementation fired this event from `connect-page.tsx` only when the user landed on `/connect` after OAuth. That missed every auth flow whose `next` destination was not `/connect` — most importantly the header "Get started" button, which redirects to `/audit`. The cookie-relay pattern guarantees one fire per successful connect regardless of landing page, while still firing client-side so PostHog has the user identified before capture.

| Property | Type | Example | Description |
|---|---|---|---|
| `account_count` | number | `2` | Number of Google Ads accounts connected in this event (1 in single-account auto-connect, n in multi-account selection) |
| `auth_method` | string | `"google"` | Authentication method used |
| `is_first_connect` | boolean | `true` | Whether this is the user's first successful Google Ads connect ever (mirrors the existing `gads_new_signup` cookie semantics — `true` only for users with zero prior `mcpSessions` rows) |
| `destination` | string \| null | `"/audit"` | The path the user was redirected to after auth — useful for attributing connects back to the originating CTA |

```json
{ "event": "account_connected", "properties": { "account_count": 1, "auth_method": "google", "is_first_connect": true, "destination": "/audit" } }
```

**Files:** `app/auth/callback/route.ts` (sets cookie, single-account paths), `app/api/auth/select-account/route.ts` (sets cookie, multi-account path), `components/posthog-provider.tsx` (reads cookie, fires event)

---

## ai_change_executed

**Phase:** 1
**Category:** value_exchange (NSM event)
**Platform:** PostHog (server)
**Trigger:** Fires when an AI write operation completes successfully via MCP or the in-app chat agent. Google writes flow through `execWrite` in `lib/tools/execute.ts`; Meta MCP writes flow through `execMetaWrite` in `lib/mcp/meta-tools/exec.ts`. Both wrappers emit this event with the right `platform`.
**Hypothesis:** We believe tracking this tells us core value delivery frequency, which drives all product decisions as the NSM event. The `platform` property splits Google vs Meta NSM contribution; client properties (`client_name`, `client_version`, `auth_method`) slice by surface (Claude Code plugin, Claude.ai Web connector, Claude Cowork, in-app chat, etc.) for prioritizing surface-specific UX work.

| Property | Type | Example | Description |
|---|---|---|---|
| `platform` | string | `"google_ads"` | Which ad platform the write hit. Enum: `google_ads`, `meta_ads`. |
| `tool_name` | string | `"pause_keyword"` | Which write tool was executed |
| `entity_type` | string | `"keyword"` | Entity type affected. Google: `keyword`/`campaign`. Meta: `campaign`/`adset`/`ad`/`account`. |
| `account_id` | string | `"1301265570"` | Ad account ID. Google: customer ID. Meta: act_ ID without prefix. |
| `campaign_id` | string \| null | `"20345678"` | Campaign affected (null if not campaign-scoped) |
| `before_value` | string \| null | `"ENABLED"` | State before the change |
| `after_value` | string \| null | `"PAUSED"` | State after the change |
| `client_name` | string \| null | `"adsagent-chat"` | Identifies the calling surface. For MCP this is the client's `clientInfo.name` from the MCP `initialize` handshake (e.g. `claude-code`, `claude-ai`, `mcp-remote`). For in-app chat this is the constant `adsagent-chat`. Null only for legacy MCP sessions whose handshake did not report a name. |
| `client_version` | string \| null | `"1.2.3"` | MCP client version from the handshake. Null for in-app chat (no version concept) and legacy MCP sessions. |
| `auth_method` | string \| null | `"chat"` | How the call authenticated. Values: `oauth` (Claude.ai connector / OAuth bearer), `direct` (raw MCP session token), `chat` (in-app chat agent). Always populated. Use this as the primary cut for "MCP vs chat". |
| `user_agent` | string \| null | `"node-fetch/1.0"` | Raw `User-Agent` of the inbound HTTP request. Often `mcp-remote/...` rather than the end client's UA, so prefer `client_name` / `auth_method` for client attribution. Null for in-app chat. |

```json
{ "event": "ai_change_executed", "properties": { "platform": "google_ads", "tool_name": "pause_keyword", "entity_type": "keyword", "account_id": "1301265570", "campaign_id": "20345678", "before_value": "ENABLED", "after_value": "PAUSED", "client_name": "claude-code", "client_version": "1.2.3", "auth_method": "oauth", "user_agent": "claude-code/1.2.3" } }
```

**Files:** `lib/tools/execute.ts` (Google), `lib/mcp/meta-tools/exec.ts` (Meta)

---

## ai_change_failed

**Phase:** 1
**Category:** quality_signal
**Platform:** PostHog (server)
**Trigger:** Fires whenever a write operation returns `success: false` through the `execWrite` chokepoint (`lib/tools/execute.ts`) or `execMetaWrite` (`lib/mcp/meta-tools/exec.ts`). Covers single-op and bulk Google tools, plus every Meta write. Thrown errors (network outages, auth crashes) do NOT fire this event — they propagate unlogged so outages don't burn user quota.
**Hypothesis:** We believe tracking this tells us the real per-tool failure rate and lets us distinguish "our guardrails blocked a bad agent request" from "platform rejected a valid-looking mutate." Pairs with `ai_change_executed` for per-tool, per-platform success rates.

| Property | Type | Example | Description |
|---|---|---|---|
| `platform` | string | `"google_ads"` | Which ad platform rejected the write. Enum: `google_ads`, `meta_ads`. |
| `tool_name` | string | `"pause_keyword"` | Which write tool was attempted |
| `entity_type` | string | `"keyword"` | Entity type attempted. Google: `keyword`/`campaign`. Meta: `campaign`/`adset`/`ad`/`account`. |
| `account_id` | string | `"1301265570"` | Ad account ID |
| `campaign_id` | string \| null | `"20345678"` | Campaign scope (null if not campaign-scoped) |
| `before_value` | string \| null | `"ENABLED"` | State before the attempt (unchanged by the failure) |
| `after_value` | string \| null | `"ENABLED"` | Same as `before_value` for failures — no state change occurred |
| `error` | string \| null | `"INVALID_ARGUMENT: criterion not found"` | Google's error message, or null if absent |
| `client_name` | string \| null | `"claude-code"` | See `ai_change_executed` |
| `client_version` | string \| null | `"1.2.3"` | See `ai_change_executed` |
| `auth_method` | string \| null | `"oauth"` | See `ai_change_executed` |
| `user_agent` | string \| null | `"claude-code/1.2.3"` | See `ai_change_executed` |

```json
{ "event": "ai_change_failed", "properties": { "platform": "google_ads", "tool_name": "pause_keyword", "entity_type": "keyword", "account_id": "1301265570", "campaign_id": "20345678", "before_value": "ENABLED", "after_value": "ENABLED", "error": "INVALID_ARGUMENT: criterion not found", "client_name": "claude-code", "client_version": "1.2.3", "auth_method": "oauth", "user_agent": "claude-code/1.2.3" } }
```

**Files:** `lib/tools/execute.ts`, `lib/google-ads/bulk.ts` (Google), `lib/mcp/meta-tools/exec.ts` (Meta)

---

## ai_change_undone

**Phase:** 1
**Category:** value_exchange
**Platform:** PostHog (server)
**Trigger:** Fires when a user successfully undoes a previous AI change.
**Hypothesis:** We believe tracking this tells us AI trust/error rate, which lets us identify and fix quality problems in the agent.

| Property | Type | Example | Description |
|---|---|---|---|
| `tool_name` | string | `"pause_keyword"` | Original tool that was undone |
| `minutes_since_change` | number | `45` | Minutes between original change and undo |

```json
{ "event": "ai_change_undone", "properties": { "tool_name": "pause_keyword", "minutes_since_change": 45 } }
```

**Files:** `app/actions.ts`

---

## ai_read_executed

**Phase:** 1
**Category:** ambient
**Platform:** PostHog (server)
**Trigger:** Fires when an AI read operation completes. Google reads flow through `execRead` in `lib/tools/execute.ts`; Meta reads flow through `execMetaRead` in `lib/mcp/meta-tools/exec.ts`. Both wrappers emit this event with the right `platform`.
**Hypothesis:** We believe tracking this tells us which read tools are most used per platform and which surfaces are producing the read traffic, which lets us prioritize tool development and understand user intent patterns per surface.

| Property | Type | Example | Description |
|---|---|---|---|
| `platform` | string | `"google_ads"` | Which ad platform served the read. Enum: `google_ads`, `meta_ads`. |
| `tool_name` | string | `"getCampaignPerformance"` | Which read tool was executed |
| `account_id` | string | `"1301265570"` | Ad account ID |
| `campaign_id` | string \| null | `"20345678"` | Campaign queried (null if account-level) |
| `client_name` | string \| null | `"adsagent-chat"` | Identifies the calling surface. For MCP this is the client's `clientInfo.name` from the MCP `initialize` handshake (e.g. `claude-code`, `claude-ai`, `mcp-remote`). For in-app chat this is the constant `adsagent-chat`. Null only for legacy MCP sessions whose handshake did not report a name. |
| `client_version` | string \| null | `"1.2.3"` | MCP client version from the handshake. Null for in-app chat (no version concept) and legacy MCP sessions. |
| `auth_method` | string \| null | `"chat"` | How the call authenticated. Values: `oauth` (Claude.ai connector / OAuth bearer), `direct` (raw MCP session token), `chat` (in-app chat agent). Always populated. Use this as the primary cut for "MCP vs chat". |
| `user_agent` | string \| null | `"node-fetch/1.0"` | Raw `User-Agent` of the inbound HTTP request. Often `mcp-remote/...` rather than the end client's UA, so prefer `client_name` / `auth_method` for client attribution. Null for in-app chat. |

```json
{ "event": "ai_read_executed", "properties": { "platform": "google_ads", "tool_name": "getCampaignPerformance", "account_id": "1301265570", "campaign_id": "20345678", "client_name": "claude-code", "client_version": "1.2.3", "auth_method": "oauth", "user_agent": "claude-code/1.2.3" } }
```

**Files:** `lib/tools/execute.ts` (Google), `lib/mcp/meta-tools/exec.ts` (Meta)

---

## api_key_copied

**Phase:** 1
**Category:** activation
**Platform:** PostHog (client)
**Trigger:** Fires when a user clicks the "Copy API Key" button in the bearer-token section of the "Any MCP Client" setup. Wired in both the in-app `/connect/any-mcp` tab and the public `/google-ads-mcp-server` marketing page (both render `<AnyMcpClientSetup>`).
**Hypothesis:** We believe tracking this tells us how many users actually paste their API key into a custom MCP client. Pair with downstream `ai_read_executed` / `ai_change_executed` (`auth_method: "direct"`) to measure activation rate of the bearer-token path vs the OAuth path.

| Property | Type | Example | Description |
|---|---|---|---|
| `surface` | string | `"in_app"` | Where the click happened. Enum: `in_app`, `marketing`. |

```json
{ "event": "api_key_copied", "properties": { "surface": "in_app" } }
```

**Files:** `components/any-mcp-client-setup.tsx`

---

## api_key_cta_clicked

**Phase:** 1
**Category:** funnel_entry
**Platform:** PostHog (client)
**Trigger:** Fires when an unauthenticated user clicks the "Sign in with Google" CTA inside the bearer-token section of the "Any MCP Client" setup (when no apiKey is present). Triggers Google OAuth.
**Hypothesis:** We believe tracking this tells us how many users intend to use the bearer-token path before they even have an API key. Pair with `account_connected` to measure the bearer-token CTA's auth completion rate.

| Property | Type | Example | Description |
|---|---|---|---|
| `surface` | string | `"marketing"` | Where the click happened. Enum: `in_app`, `marketing`. |

```json
{ "event": "api_key_cta_clicked", "properties": { "surface": "marketing" } }
```

**Files:** `components/any-mcp-client-setup.tsx`

---

## api_key_revealed

**Phase:** 2
**Category:** ambient
**Platform:** PostHog (client)
**Trigger:** Fires when a user clicks the eye icon to reveal the masked API key in the bearer-token section. Fires on each transition from masked → revealed, not on hide.
**Hypothesis:** We believe tracking this tells us whether users are actively inspecting their token (intent to use) vs casually browsing the page. Low-priority signal — useful only if we're investigating bearer-token usability.

| Property | Type | Example | Description |
|---|---|---|---|
| `surface` | string | `"in_app"` | Where the click happened. Enum: `in_app`, `marketing`. (`marketing` is currently impossible — marketing surface never has an apiKey — but kept for schema consistency.) |

```json
{ "event": "api_key_revealed", "properties": { "surface": "in_app" } }
```

**Files:** `components/any-mcp-client-setup.tsx`

---

## api_key_rotate_intent

**Phase:** 1
**Category:** funnel_entry
**Platform:** PostHog (client)
**Trigger:** Fires when a user clicks the "Rotate" button in the API key panel — opens the confirm modal. Fires on intent, not on success. The downstream success event is `api_key_rotated`. Difference between the two is the cancel/abandon rate.
**Hypothesis:** We believe tracking intent-vs-success tells us whether the rotate confirm modal is doing its job (catching accidental clicks) or whether users are deliberately rotating. If `intent ≈ rotated`, the modal is friction we could trim. If `intent >> rotated`, users are exploring and bailing — fine.

| Property | Type | Example | Description |
|---|---|---|---|
| `surface` | string | `"in_app"` | Where the click happened. Enum: `in_app`, `marketing`. |

```json
{ "event": "api_key_rotate_intent", "properties": { "surface": "in_app" } }
```

**Files:** `components/any-mcp-client-setup.tsx`

---

## api_key_rotated

**Phase:** 1
**Category:** quality_signal
**Platform:** PostHog (client)
**Trigger:** Fires after a successful POST to `/api/auth/rotate-token` (the user confirmed the rotate-key modal and the new token has been issued). Does NOT fire on rotation failures.
**Hypothesis:** We believe tracking this tells us how often users rotate keys — a signal of either security hygiene or token compromise. Spike investigation: a sudden uptick implies an incident or a leaked key in public docs.

| Property | Type | Example | Description |
|---|---|---|---|
| `surface` | string | `"in_app"` | Where the rotation happened. Enum: `in_app`, `marketing`. (`marketing` is currently impossible.) |

```json
{ "event": "api_key_rotated", "properties": { "surface": "in_app" } }
```

**Files:** `components/any-mcp-client-setup.tsx`

---

## audit_help_action_clicked

**Phase:** 1
**Category:** funnel_entry
**Platform:** PostHog (client)
**Trigger:** Fires when a user clicks any of the four actions inside the "Let Claude fix it for you!" help panel on the audit page.
**Hypothesis:** We believe tracking this tells us which help channel users actually pick, which lets us decide where to invest support effort (Claude Connector self-serve vs human email vs sales demo vs in-app chat agent).

| Property | Type | Example | Description |
|---|---|---|---|
| `action` | string | `"connect_claude"` | Which help option was clicked. Enum: `connect_claude`, `email_expert`, `book_demo`, `chat_agent` |

```json
{ "event": "audit_help_action_clicked", "properties": { "action": "connect_claude" } }
```

**Files:** `components/audit/audit-help-panel.tsx`

---

## audit_help_panel_dismissed

**Phase:** 1
**Category:** funnel_entry
**Platform:** PostHog (client)
**Trigger:** Fires when a user clicks the X to collapse the audit help panel into the pill state. Does not fire on the initial collapsed state restored from `localStorage`.
**Hypothesis:** We believe tracking this tells us if the prominent bottom-right panel feels intrusive. If dismissal rate within first session exceeds ~50%, we should change the default state to collapsed and let users opt in.

No properties.

```json
{ "event": "audit_help_panel_dismissed" }
```

**Files:** `components/audit/audit-help-panel.tsx`

---

## audit_help_panel_expanded

**Phase:** 1
**Category:** funnel_entry
**Platform:** PostHog (client)
**Trigger:** Fires when a user clicks the collapsed pill to re-expand the audit help panel. Does not fire on the initial expanded state.
**Hypothesis:** We believe tracking this tells us whether dismissed users come back for help — if expand rate after dismissal is meaningful, it confirms the panel has ongoing value and we should keep it discoverable.

No properties.

```json
{ "event": "audit_help_panel_expanded" }
```

**Files:** `components/audit/audit-help-panel.tsx`

---

## audit_help_panel_shown

**Phase:** 1
**Category:** ambient
**Platform:** PostHog (client)
**Trigger:** Fires once per audit page mount, after the panel hydrates and resolves its initial state from `localStorage`.
**Hypothesis:** We believe tracking this gives us a reliable denominator for computing action conversion (`audit_help_action_clicked / audit_help_panel_shown`) and dismissal rate (`audit_help_panel_dismissed / audit_help_panel_shown`), which lets us measure panel ROI without confounding from `$pageview` filters.

| Property | Type | Example | Description |
|---|---|---|---|
| `initial_state` | string | `"expanded"` | Whether the panel rendered expanded or collapsed on mount. Enum: `expanded`, `collapsed` |

```json
{ "event": "audit_help_panel_shown", "properties": { "initial_state": "expanded" } }
```

**Files:** `components/audit/audit-help-panel.tsx`

---

## chat_model_option_clicked

**Phase:** 1
**Category:** funnel_entry
**Platform:** PostHog (client)
**Trigger:** Fires when a user clicks any row in the chat model selector dropdown — free model, locked frontier model (routes to `/upgrade`), or the Claude Connect row (routes to `/connect/claude-connector`). Rendered on the `/chat` page and inside the audit chat drawer.
**Hypothesis:** We believe tracking this tells us which models users actually want and how much upgrade intent the locked options generate per surface, which lets us decide which paid model to wire first and whether the Claude Connect row is pulling weight where it sits.

| Property | Type | Example | Description |
|---|---|---|---|
| `model_id` | string | `"gpt-5.4"` | Which row was clicked. Enum: `gpt-5-mini`, `gpt-5.4`, `claude-opus-4.7`, `connect_claude` |
| `action` | string | `"upgrade_redirect"` | What the click triggered. Enum: `selected` (free user or default model set active), `paid_switched` (paid user switched to a previously-locked model), `upgrade_redirect` (free user clicked a locked model → `/upgrade`), `connect_claude_redirect` (Claude Connect row → `/connect/claude-connector`) |
| `surface` | string | `"chat_page"` | Where the selector lives. Enum: `chat_page`, `audit_drawer` |
| `is_paid` | boolean | `false` | Whether the user's subscription plan is non-free at click time |

```json
{ "event": "chat_model_option_clicked", "properties": { "model_id": "claude-opus-4.7", "action": "upgrade_redirect", "surface": "chat_page", "is_paid": false } }
```

**Notes:** The selector currently does not wire `model_id` through to the chat API — the server still routes to `gpt-5-mini`. This event captures UI intent only. When the model is wired, pair with a server-side property on `ai_change_executed` / `ai_read_executed`.

**Files:** `components/chat/model-selector.tsx`

---

## connector_credential_copied

**Phase:** 1
**Category:** activation
**Platform:** PostHog (client)
**Trigger:** Fires when a user clicks the copy button on any field inside the Claude Connector setup steps. Wired in both the in-app `/connect/claude-connector` tab and the public `/google-ads-claude-connector-setup-guide` marketing page (both render `<ConnectorSetupSteps>`).
**Hypothesis:** We believe tracking this tells us how far users get inside the connector configuration step. The `server_url` and `plugin_marketplace_url` copies in particular indicate that the user is actively pasting values into Claude — a strong activation signal that the connector funnel will complete. The OAuth flow no longer requires Client ID/Secret, so those enum values are deprecated.

> **Schema change 2026-04-28.** The Client ID/Secret credential generation step was removed when the connector switched to in-Claude OAuth. New `surface` property added to distinguish marketing vs in-app copies. New `plugin_marketplace_url` enum value added when the toprank plugin step was merged into the connector setup.

| Property | Type | Example | Description |
|---|---|---|---|
| `field` | string | `"server_url"` | Which credential field was copied. Enum: `name`, `server_url`, `plugin_marketplace_url`. Deprecated values still in older PostHog data: `client_id`, `client_secret` (removed 2026-04-28). |
| `surface` | string | `"in_app"` | Where the click happened. Enum: `in_app`, `marketing`. |

```json
{ "event": "connector_credential_copied", "properties": { "field": "server_url", "surface": "in_app" } }
```

**Files:** `components/connector-setup-steps.tsx`

---

## connector_screenshot_expanded

**Phase:** 1
**Category:** ambient
**Platform:** PostHog (client)
**Trigger:** Fires when a user clicks one of the Claude Connector setup screenshots to open it in the lightbox. Wired in both the in-app `/connect/claude-connector` tab and the public `/google-ads-claude-connector` marketing page.
**Hypothesis:** We believe tracking this tells us which steps users find unclear enough to inspect closely, which lets us prioritize which screenshots to re-shoot, annotate, or replace with inline diagrams.

| Property | Type | Example | Description |
|---|---|---|---|
| `image` | string | `"02_configure"` | Which screenshot was opened. Derived from the file name. Enum: `01_add`, `02_configure`, `03_saved`, `04a_browse_plugins`, `04b_add_marketplace`, `04_enable_in_chat`, `05_use_in_chat`. (`04a_browse_plugins` and `04b_add_marketplace` were added 2026-04-28 when the toprank plugin step was merged into the connector setup.) |
| `surface` | string | `"in_app"` | Where the click happened. Enum: `in_app` (logged-in `/connect/claude-connector`), `marketing` (public `/google-ads-claude-connector-setup-guide`) |

```json
{ "event": "connector_screenshot_expanded", "properties": { "image": "02_configure", "surface": "marketing" } }
```

**Files:** `components/connector-setup-steps.tsx`

---

## setup_help_requested

**Phase:** 1
**Category:** activation
**Platform:** PostHog (client)
**Trigger:** Fires when a user clicks the floating "Need help?" CTA on the connect page. Also calls `notifyHelpClicked` in `app/actions.ts`, which posts a Slack notification carrying the same context.
**Hypothesis:** We believe tracking this tells us when users hit a wall during connect-page setup — a direct signal of setup friction. Volume per `active_tab` tells us which path is hardest; the ratio vs `install_command_copied` / `connector_credential_copied` tells us whether users are asking for help instead of completing setup.

> **Replaces `chat_opened_from_connect`** (retired 2026-04-22). Analysis of the Apr 21–22 cohort showed the chat fallback was catching setup-frustrated users who then bounced at 0% D0 write rate — routing them to human help via Slack is higher-leverage.
>
> **Schema change 2026-04-28.** The Claude Code sub-tab UI ("manual" vs "auto") was removed; `code_sub_tab` property is no longer fired. New `any-mcp` value added to `active_tab` enum when the "Any MCP Client" tab was introduced.

| Property | Type | Example | Description |
|---|---|---|---|
| `active_tab` | string | `"claude-code"` | Which setup tab the user was on at click time. Enum: `claude-code`, `connector`, `codex`, `any-mcp`. |
| `connected` | boolean | `true` | Whether the user already has a Google Ads session (token) at click time. Distinguishes "stuck on OAuth" from "stuck on client wiring". |
| `pathname` | string | `"/connect/any-mcp"` | Exact pathname when the button was clicked. |

```json
{ "event": "setup_help_requested", "properties": { "active_tab": "any-mcp", "connected": true, "pathname": "/connect/any-mcp" } }
```

**Files:** `components/connect-page.tsx`, `app/actions.ts`

---

## cta_clicked

**Phase:** 1
**Category:** funnel_entry
**Platform:** PostHog (client)
**Trigger:** Fires when a user clicks a primary CTA button on a marketing page (`AuditCTA` component, the homepage Connect/Audit/high-spend buttons, or the public Claude Connector page Sign in / Open setup buttons).
**Hypothesis:** We believe tracking this tells us click-through rate per landing page, per CTA variant, per placement, and **per destination**, which lets us measure copy/design effectiveness and answer "where does this CTA actually send users" without depending on the human-readable `cta` slug.

> **Note on `cta` vs `destination`.** The `cta` slug is a stable label tag for the button (handy for joining with copy A/B tests). The `destination` property is the source of truth for *where the click sends the user* — important because some labels are ambiguous (e.g. the header "Get started" button has `cta: "audit_now"` and `destination: "/audit"`; the homepage "Connect Google Ads to Claude" hero button has `cta: "connect_claude"` and `destination: "/connect"`, **not** `/connect/claude-connector`). Prefer `destination` for funnel queries and `cta` for slicing copy variants.

| Property | Type | Example | Description |
|---|---|---|---|
| `page` | string | `"homepage"` | Which marketing page the CTA is on. Enum: `homepage`, `google-ads-audit`, `google-ads-claude`, `google-ads-claude-connector`, `google-ads-mcp-server`, `header` |
| `cta` | string | `"connect_claude"` | Stable label tag for the button copy. Enum: `audit_now`, `view_audit`, `connect_claude`, `free_audit_link`, `high_spend_lead`, `sign_in_with_google`, `open_connector_setup` |
| `position` | string \| undefined | `"hero"` | Where on the page the CTA was placed (homepage only). Enum: `hero`, `final`. Omitted on pages with a single CTA placement. |
| `destination` | string | `"/connect"` | The actual URL the click sends the user to (after any auth interstitial). Enum of current values: `/audit`, `/connect`, `/connect/claude-connector`, `/google-ads-audit`, `mailto:tong@adsagent.org` |
| `requires_auth` | boolean | `true` | Whether the click triggered the Google OAuth flow before reaching `destination`. Lets us measure auth-friction drop-off per CTA. |

```json
{ "event": "cta_clicked", "properties": { "page": "homepage", "cta": "connect_claude", "position": "hero", "destination": "/connect", "requires_auth": true } }
```

**Files:** `components/marketing/audit-cta.tsx`, `components/marketing/home-page.tsx`, `components/marketing/google-ads-claude-connector-page.tsx`

---

## install_command_copied

**Phase:** 1
**Category:** activation
**Platform:** PostHog (client)
**Trigger:** Fires when a user clicks the Copy button on any setup code/command block. Covers the Claude Code plugin steps, the Codex one-liner, and the Any-MCP-Client OAuth + Bearer JSON configs. Wired in both in-app (`/connect/...` tabs) and the marketing setup-guide pages — both render the same shared step components (`ClaudeCodePluginSteps`, `CodexSetupSteps`, `AnyMcpClientSetup`).
**Hypothesis:** We believe tracking this with `setup_tab` + `step` + `surface` tells us which install path users pick and which point in the flow they actually reach. Pair with `account_connected` and downstream `ai_change_executed` (`client_name: "codex"` vs `"claude-code"`) to compute path-specific activation rates and decide where to invest onboarding effort.

> **Schema change 2026-04-28.** Surface tag added to distinguish marketing-page copies from in-app connect-page copies. New `any-mcp` setup tab added when the "Any MCP Client" tab was introduced. Claude Code plugin step now includes `/reload-plugins` (new `reload_plugins` step). Auto-prompt subtab removed — `install` and `api_key` step values are deprecated.

| Property | Type | Example | Description |
|---|---|---|---|
| `setup_tab` | string | `"any-mcp"` | Which AI client setup tab was active. Enum: `claude-code`, `codex`, `any-mcp`. (`connector` does not fire this event — it uses `connector_credential_copied` instead.) |
| `surface` | string | `"in_app"` | Where the click happened. Enum: `in_app`, `marketing`. |
| `step` | string | `"reload_plugins"` | Which command was copied. Enum varies by `setup_tab`. **`claude-code`**: `marketplace_add`, `plugin_install`, `reload_plugins`, `ads_command`. **`codex`**: `codex_oneliner`. **`any-mcp`**: `oauth_json`, `bearer_json`. Deprecated values still in older PostHog data: `install`, `api_key` (removed 2026-04-28). |

```json
{ "event": "install_command_copied", "properties": { "setup_tab": "any-mcp", "surface": "in_app", "step": "bearer_json" } }
```

**Notes:** Tab view itself is captured by `$pageview` with `path: "/connect/<tab>"` — no separate `*_viewed` event is wired, by design.

**Files:** `components/claude-code-plugin-steps.tsx`, `components/codex-setup-steps.tsx`, `components/any-mcp-client-setup.tsx`

---

## managed_inquiry_submitted

**Phase:** 1
**Category:** value_exchange
**Platform:** PostHog (client)
**Trigger:** Fires when a user successfully submits the Managed plan inquiry modal (the Slack webhook POST resolves). The modal is opened by clicking "Claim your spot" on the Managed pricing card. Signed-in users submit with only an optional message (email is pre-filled from session). Not signed-in users submit with name + email + optional message.
**Hypothesis:** We believe tracking this tells us actual Managed tier lead volume and completion rate from modal-open (`pricing_cta_clicked` with `action: "claim_spot"`) to submission, which lets us judge whether the Managed tier is producing inbound leads worth operationalizing and whether auth-gating the modal would raise or lower lead quality. Pair with `pricing_cta_clicked` to compute modal conversion rate.

| Property | Type | Example | Description |
|---|---|---|---|
| `email` | string | `"founder@acme.com"` | The submitter's email — pulled from the Supabase session for signed-in users, or from the modal form for anonymous users. Used as the join key to the Slack inquiry notification. |

```json
{ "event": "managed_inquiry_submitted", "properties": { "email": "founder@acme.com" } }
```

**Notes:** Email is PII but is intentionally captured here because the lead *is* the email — same pattern as `user_signed_up.google_email`. The inquiry is also sent to the feedback Slack webhook (`submitManagedInquiry` in `app/actions.ts`) with name + message; only email is sent to PostHog.

**Files:** `components/marketing/pricing-cards.tsx`, `app/actions.ts`

---

## user_signed_up

**Phase:** 1
**Category:** activation
**Platform:** PostHog (server)
**Trigger:** Fires once per user, the first time they complete the Google OAuth flow and create their initial Google Ads session. Detected via the `gads_new_signup` cookie set on the success response from the auth callback. Fires from two paths: single-account auto-connect in `app/auth/callback/route.ts` and multi-account selection in `app/api/auth/select-account/route.ts`. Both routes use `after(flushServerEvents)` to keep the Vercel Lambda alive until the async PostHog POST completes.
**Hypothesis:** We believe tracking this tells us first-touch sign-up volume with full UTM attribution attached, which lets us measure paid/organic acquisition channels and tie them to long-term retention.

> **Known ~15% residual miss rate vs Supabase `mcp_sessions` first-row count (post Apr 17 2026).** A larger 43-50% gap was fixed in commit `76d1d96` on 2026-04-17 (multi-account path missing + Lambda flush race). The remaining ~15% is concentrated in the "null `client_name`" cohort — users who complete OAuth but never launch an MCP client and never fire any operation. Two things this means for analysts:
> 1. **Trust Supabase `mcp_sessions` for signup counts**, not `user_signed_up`. Use PostHog for UTM / referrer attribution, not volume.
> 2. **When comparing pre/post windows around Apr 17 2026, split at 20:15 UTC (13:15 PT)** — the fix deploy time. Otherwise pre-fix and post-fix signups mix in the same bucket and the miss rate looks period-specific when it isn't.

| Property | Type | Example | Description |
|---|---|---|---|
| `signup_method` | string | `"google_oauth"` | Authentication mechanism used to sign up |
| `signup_referrer` | string \| null | `"https://github.com/..."` | The user's original cross-origin referrer captured on the first landing page, threaded through the OAuth round-trip so it survives the `accounts.google.com` bounce. Null when the user arrived via direct navigation. |
| `google_email` | string \| null | `"user@example.com"` | Email returned by Google OAuth |
| `utm_source` | string \| undefined | `"google"` | UTM source captured at the start of the OAuth flow and threaded through state |
| `utm_medium` | string \| undefined | `"cpc"` | UTM medium |
| `utm_campaign` | string \| undefined | `"brand"` | UTM campaign |
| `utm_term` | string \| undefined | `"adsagent"` | UTM term |
| `utm_content` | string \| undefined | `"hero_button"` | UTM content |

> **Note.** The UTM properties are only present when the originating click had UTM params; the spread `...utmProps` includes whichever ones existed.

```json
{ "event": "user_signed_up", "properties": { "signup_method": "google_oauth", "signup_referrer": "https://google.com", "google_email": "user@example.com", "utm_source": "google", "utm_medium": "cpc" } }
```

**Files:** `app/auth/callback/route.ts`

---

## $pageview

**Phase:** 1
**Category:** ambient
**Platform:** PostHog (client)
**Trigger:** Fires on every client-side route change via the `PostHogProvider` component. Uses PostHog's reserved `$pageview` event name (so PostHog's built-in path/session reporting works) — query for it as `$pageview` in PostHog, **not** `page_viewed`.
**Hypothesis:** We believe tracking this tells us where users spend time and where they drop off, which lets us prioritize UX improvements.

| Property | Type | Example | Description |
|---|---|---|---|
| `$current_url` | string | `"https://notfair.co/connect"` | Full URL at capture time (PostHog reserved property) |
| `path` | string | `"/connect"` | Pathname without query/host |
| `referrer` | string | `"https://google.com"` | Document referrer |

```json
{ "event": "$pageview", "properties": { "$current_url": "https://notfair.co/connect", "path": "/connect", "referrer": "https://google.com" } }
```

**Files:** `components/posthog-provider.tsx`, `lib/analytics.ts`

---

## pricing_cta_clicked

**Phase:** 1
**Category:** funnel_entry
**Platform:** PostHog (client)
**Trigger:** Fires when a user clicks any CTA button inside the shared `PricingSection` component — Free plan "Get started" / "Get Started" (audit), Growth plan "Get Started" / "Upgrade to Growth" / "Switch interval", Growth "Manage subscription" portal button, or Managed plan "Claim your spot" (opens inquiry modal). The same component is rendered on the homepage, the standalone `/pricing` page, and the in-app `/upgrade` page; the `page` property attributes the click.
**Hypothesis:** We believe tracking this tells us paid-conversion funnel entry rate per surface (homepage pricing section vs standalone pricing page vs in-app upgrade page), per plan (free / growth / managed), and per interval (month vs year), which lets us decide where to invest paid-conversion effort, whether the homepage pricing section pulls its weight versus a dedicated `/pricing` page, and whether the Managed tier scarcity framing drives interest.

| Property | Type | Example | Description |
|---|---|---|---|
| `page` | string | `"homepage"` | Which surface the pricing section was rendered on. Enum: `homepage`, `pricing`, `upgrade` |
| `plan` | string | `"growth"` | Which plan the CTA belongs to. Enum: `free`, `growth`, `managed` |
| `interval` | string | `"year"` | Currently selected billing interval at click time. Enum: `month`, `year`. For `plan: "managed"`, this is the toggle state at click time — pricing does not actually vary by interval for Managed, but the property is still captured. |
| `action` | string | `"upgrade"` | What the click is requesting. Enum: `signin` (free, logged out → Google OAuth), `open_audit` (free, logged in → /audit), `signin_then_upgrade` (growth, logged out → Google OAuth), `upgrade` (growth, logged in, not on growth → Stripe checkout), `switch_interval` (growth, already on growth, switching month/year), `manage` (growth, on growth → Stripe portal), `claim_spot` (managed, any state → opens inquiry modal) |

```json
{ "event": "pricing_cta_clicked", "properties": { "page": "homepage", "plan": "managed", "interval": "year", "action": "claim_spot" } }
```

**Files:** `components/marketing/pricing-cards.tsx`

---

## auth_error

**Phase:** 1
**Category:** activation
**Platform:** PostHog (server)
**Trigger:** Fires on every auth failure in the OAuth callback — consent denial, scope denial, missing code, state verification failure, token exchange failure, Supabase auth failure, and account loading failure. Covers both primary (`/auth/callback`) and legacy (`/api/auth/google/callback`) flows.
**Hypothesis:** We believe tracking this tells us the volume and distribution of auth failures by type, which lets us prioritize fixes to the biggest drop-off points in the signup funnel. Prior analysis (Apr 11 2026) showed ~12 auth error encounters vs 13 signups — nearly 1:1 — but we had zero server-side tracking to diagnose them.

| Property | Type | Example | Description |
|---|---|---|---|
| `reason` | string | `"scope_denied"` | Error classification. Enum: `consent_denied` (user clicked Cancel), `scope_denied` (user unchecked Ads scope after retry), `scope_denied_retry` (first scope denial, auto-retrying), `missing_code` (no code param), `missing_state`, `missing_cookie`, `nonce_mismatch` (CSRF failures), `token_exchange` (Google token endpoint error), `supabase_auth` (Supabase sign-in failed), `load_accounts_failed` (Google Ads API call failed), `google_*` (other Google errors) |
| `step` | string | `"scope_check"` | Which step in the auth flow failed. Enum: `google_consent`, `state_verification`, `code_check`, `token_exchange`, `scope_check`, `supabase_signin`, `list_accounts` |
| `is_retry` | boolean \| undefined | `true` | Only present on scope_denied events. `false` = first attempt (auto-retrying), `true` = second attempt (showing error). |
| `google_error` | string \| undefined | `"access_denied"` | Raw error param from Google's redirect, if present |
| `error` | string \| undefined | `"PERMISSION_DENIED"` | Raw error message from the failing step, if available |

```json
{ "event": "auth_error", "properties": { "reason": "scope_denied", "step": "scope_check", "is_retry": true } }
```

**Files:** `app/auth/callback/route.ts`, `app/api/auth/google/callback/route.ts`

---

## feedback_opened

**Phase:** 1
**Category:** ambient
**Platform:** PostHog (client)
**Trigger:** Fires when a user clicks the "Feedback" text button in the app header, opening the feedback modal.
**Hypothesis:** We believe tracking this tells us how many users consider giving feedback vs actually submitting, which lets us measure the feedback funnel (opened → submitted) and decide if the modal UX has friction.

No properties.

```json
{ "event": "feedback_opened" }
```

**Files:** `components/feedback-modal.tsx`

---

## feedback_submitted

**Phase:** 1
**Category:** value_exchange
**Platform:** PostHog (client)
**Trigger:** Fires when a user successfully sends feedback via the modal (Slack webhook POST completes).
**Hypothesis:** We believe tracking this tells us feedback volume and message length distribution, which lets us gauge user engagement and whether the feedback channel is being used.

| Property | Type | Example | Description |
|---|---|---|---|
| `message` | string | `"Add bulk keyword editor"` | The full feedback text submitted by the user |
| `length` | number | `142` | Character count of the submitted feedback message |

```json
{ "event": "feedback_submitted", "properties": { "message": "Add bulk keyword editor", "length": 23 } }
```

**Files:** `components/feedback-modal.tsx`

---

## upgrade_clicked

**Phase:** 1
**Category:** funnel_entry
**Platform:** PostHog (client)
**Trigger:** Fires when a user clicks either Upgrade button in the app — the green CTA in the top header bar or the nav item in the sidebar footer. Both buttons navigate to `/upgrade`; the `location` property distinguishes them.
**Hypothesis:** We believe tracking this tells us which placement (persistent header vs sidebar nav) drives more upgrade intent, which lets us decide whether to keep both or consolidate, and informs future placement of conversion CTAs.

| Property | Type | Example | Description |
|---|---|---|---|
| `location` | string | `"header"` | Where the button was clicked. Enum: `header` (top bar green CTA), `sidebar` (sidebar footer nav item) |
| `page` | string | `"/campaigns"` | Current page pathname at click time — shows which page context drives upgrade clicks |

```json
{ "event": "upgrade_clicked", "properties": { "location": "header", "page": "/campaigns" } }
```

**Files:** `app/(app)/layout.tsx`

---

## mcp_improvement_suggested

**Phase:** 1
**Category:** quality_signal
**Platform:** PostHog (server)
**Trigger:** Fires when an AI agent calls the `fileInternalNotFairToolFeedback` MCP tool to flag a tool-design issue (unclear description, missing capability, ergonomic friction, unhelpful error message, workflow gap, or duplicate tools). One event per call. Per-session rate-limited to 5 calls per hour; rate-limited calls are NOT tracked (the tool returns `recorded: false`).
**Hypothesis:** We believe tracking this tells us how AI agents — our highest-volume "users" — perceive the NotFair tool surface, which lets us prioritize tool-description fixes, missing-capability roadmap items, and ergonomic improvements that per-event telemetry (`ai_change_failed`, etc.) cannot surface. Pairs with Slack notifications for real-time triage and a weekly digest grouped by `affected_tool` + `category` for pattern detection.

| Property | Type | Example | Description |
|---|---|---|---|
| `category` | string | `"missing_capability"` | One of `description_unclear`, `missing_capability`, `ergonomic`, `error_message_unclear`, `workflow_gap`, `duplicate_tools`, `other`. |
| `affected_tool` | string | `"addNegativeKeyword"` | Tool name the suggestion is about, or `"general"` for cross-cutting. |
| `observation` | string | `"Calling addNegativeKeyword 200x for a single batch felt redundant; the description doesn't mention addKeywordToNegativeList exists."` | Truncated to 1000 chars. |
| `suggestion` | string | `"Cross-reference the bulk variant in this tool's description, or surface a hint when called >5 times consecutively."` | Truncated to 1000 chars. |
| `user_goal` | string \| null | `"Adding 12 negative keywords found in a search-term audit."` | Optional context — what the user was trying to accomplish. Truncated to 500 chars. |
| `user_email` | string \| null | `"alice@notfair.co"` | Resolved server-side from `mcp_sessions.google_email` (preferred) or `subscriptions.email` (fallback). Lets triage reach the affected user. Null when the session has no associated email (anon/seed flows). |
| `client_name` | string \| null | `"claude-code"` | MCP client name from the handshake. Same semantics as `ai_change_executed`. |
| `client_version` | string \| null | `"1.2.3"` | MCP client version. |
| `auth_method` | string \| null | `"oauth"` | `oauth`, `direct`, or `chat`. |
| `session_id` | number \| null | `4231` | `mcp_sessions.id` for correlating to the surrounding session's tool calls. |
| `remaining_calls` | number | `4` | Calls remaining in the current 1-hour rate-limit window for this session. |

```json
{ "event": "mcp_improvement_suggested", "properties": { "category": "duplicate_tools", "affected_tool": "addNegativeKeyword", "observation": "...", "suggestion": "...", "user_goal": null, "user_email": "alice@notfair.co", "client_name": "claude-code", "client_version": "1.2.3", "auth_method": "oauth", "session_id": 4231, "remaining_calls": 4 } }
```

**Files:** `lib/mcp/agent-feedback.ts`

---

## mcp_client_tab_selected

**Phase:** 1
**Category:** funnel_entry
**Platform:** PostHog (client)
**Trigger:** Fires when a user clicks one of the AI-client tabs (Claude / OpenClaw / Codex / Cursor / Hermes) on the `/mcp` marketing page. Does **not** fire on the auto-cycling hero pill, on URL-driven deep-link landings (`/mcp?tab=hermes`), or on first paint — only on a deliberate click.
**Hypothesis:** We believe tracking which MCP client tab users open tells us where to invest docs and integration polish — does Codex pull share from Claude after we ship the one-liner? Is Hermes adoption real or curiosity? `from_client` lets us see hopping patterns (e.g. "Codex viewers also try Cursor") which informs cross-linking. Pair with `mcp_setup_copied` (same `client` enum) to compute view → copy conversion per platform.

| Property | Type | Example | Description |
|---|---|---|---|
| `client` | string | `"openclaw"` | The tab the user just opened. Enum: `claude`, `openclaw`, `codex`, `cursor`, `hermes`. |
| `from_client` | string | `"claude"` | The tab that was active before this click — same enum as `client`. Use to analyze tab-hopping. |

```json
{ "event": "mcp_client_tab_selected", "properties": { "client": "openclaw", "from_client": "claude" } }
```

**Notes:** The `/mcp` URL also reflects the active tab (`?tab=<id>`) so external traffic can be attributed to a specific platform via standard `$pageview` filtering — no separate event is fired on URL-init by design (deep links would otherwise inflate counts without representing user intent on this page).

**Files:** `components/marketing/mcp-page.tsx`

---

## mcp_setup_copied

**Phase:** 1
**Category:** activation
**Platform:** PostHog (client)
**Trigger:** Fires when a user clicks the copy button on any field inside the `/mcp` setup-step cards. The `/mcp` page is the unified, multi-platform setup hub — distinct from the older single-platform setup pages (`connector_credential_copied`, `install_command_copied`) which remain in place for `/connect/*` and per-client guides.
**Hypothesis:** Copying the URL/JSON/prompt is the last user action before they leave `/mcp` to paste it into their AI client — a strong activation signal. Pair with `account_connected` to compute /mcp → activation rate per platform, and identify clients where users get to the copy step but never come back (likely a paste/auth-flow problem on that client's side).

| Property | Type | Example | Description |
|---|---|---|---|
| `client` | string | `"cursor"` | Which platform tab the copy happened on. Enum: `claude`, `openclaw`, `codex`, `cursor`, `hermes`. |
| `field` | string | `"mcp_json"` | What was copied. Enum varies by `client`. **`claude`**: `name`, `server_url`. **`openclaw`**: `prompt`. **`codex`**: `codex_command`. **`cursor`**: `mcp_json`. **`hermes`**: `prompt`. |

```json
{ "event": "mcp_setup_copied", "properties": { "client": "cursor", "field": "mcp_json" } }
```

**Notes:** Distinct from `connector_credential_copied` (Claude-only `/connect/claude-connector` and `/google-ads-claude-connector-setup-guide`) and `install_command_copied` (`/connect/{claude-code,codex,any-mcp}` and matching marketing pages). Those events stay; this one is scoped to the `/mcp` hub specifically. If the older setup pages eventually migrate to use the `/mcp` UX, the older events should be deprecated in favor of this one.

**Files:** `components/marketing/mcp-page.tsx`

---

## demo_connect_cta_clicked

**Phase:** 1
**Category:** funnel_entry
**Platform:** PostHog (client)
**Trigger:** Fires when a user in demo mode clicks the "Connect your account" CTA in the demo banner.
**Hypothesis:** Tells us demo→signup conversion intent — pairs with `user_signed_up` to compute the demo conversion rate.

No properties.

```json
{ "event": "demo_connect_cta_clicked" }
```

**Files:** `components/demo-banner.tsx`

---

## demo_mode_exited

**Phase:** 1
**Category:** activation
**Platform:** PostHog (client)
**Trigger:** Fires when a user explicitly exits demo mode (e.g. dismissing the demo banner).
**Hypothesis:** Tells us how many demo users abandon vs convert. Pairs with `demo_mode_started` and `demo_connect_cta_clicked` for funnel attribution.

No properties.

```json
{ "event": "demo_mode_exited" }
```

**Files:** `components/demo-banner.tsx`

---

## demo_mode_started

**Phase:** 1
**Category:** funnel_entry
**Platform:** PostHog (client)
**Trigger:** Fires when a visitor enters demo mode from `/connect`.
**Hypothesis:** Tells us how many top-of-funnel visitors take the "try without committing" path. Top-of-funnel signal for the demo experience.

No properties.

```json
{ "event": "demo_mode_started" }
```

**Files:** `components/connect-page.tsx`

---

## discord_link_clicked

**Phase:** 1
**Category:** ambient
**Platform:** PostHog (client)
**Trigger:** Fires when a user clicks the "Join Discord" link from any surface.
**Hypothesis:** Tells us which surfaces drive community engagement. Use to prioritize Discord placement (sidebar vs marketing pages).

| Property | Type | Example | Description |
|---|---|---|---|
| `location` | string | `"sidebar"` | Where the click happened. Free-form caller-supplied string (`sidebar`, `marketing_footer`, etc.). |

```json
{ "event": "discord_link_clicked", "properties": { "location": "sidebar" } }
```

**Files:** `components/discord-link.tsx`

---

## first_tool_call_attempted

**Phase:** 1
**Category:** activation (aha-moment input)
**Platform:** PostHog (server)
**Trigger:** Fires from `logChange` / `logRead` (`lib/db/tracking.ts`) on a user's very first row in the `operations` table. Detected via a `count(*) = 0` precheck before insert. Both Google and Meta paths trigger it.
**Hypothesis:** First tool call is the activation event for our MCP product — predicts long-term retention. Tracking attempt (vs successful completion) lets us isolate "tried but errored" users for outreach.

| Property | Type | Example | Description |
|---|---|---|---|
| `tool_name` | string | `"listCampaigns"` | Raw camelCase tool name from the call |
| `client_source` | string \| null | `"claude-code"` | MCP client name from `clientInfo.name`, or null for chat / legacy sessions |
| `success` | number | `1` | 1 if the call succeeded, 0 if it threw or was rejected |
| `error_class` | string \| null | `"WRITE_REJECTED"` | Coarse failure bucket. Null on success. Enum: `THROWN`, `RATE_LIMIT`, `WRITE_REJECTED`, `LOGGING`. |

```json
{ "event": "first_tool_call_attempted", "properties": { "tool_name": "listCampaigns", "client_source": "claude-code", "success": 1, "error_class": null } }
```

**Files:** `lib/db/tracking.ts`

---

## first_tool_call_error

**Phase:** 1
**Category:** errors
**Platform:** PostHog (server)
**Trigger:** Fires alongside `first_tool_call_attempted` *only* when that first call failed (`success: 0`). Lets us alert/triage on first-call regressions specifically.
**Hypothesis:** A user whose very first MCP call errors is highly at risk of dropping off — surfacing this as a separate event makes it filterable and alertable.

| Property | Type | Example | Description |
|---|---|---|---|
| `tool_name` | string | `"listCampaigns"` | Tool that errored |
| `client_source` | string \| null | `"claude-code"` | MCP client name (or null) |
| `error_class` | string \| null | `"THROWN"` | Coarse failure bucket; same enum as `first_tool_call_attempted.error_class` |

```json
{ "event": "first_tool_call_error", "properties": { "tool_name": "listCampaigns", "client_source": "claude-code", "error_class": "THROWN" } }
```

**Files:** `lib/db/tracking.ts`

---

## meta_mcp_setup_cta_clicked

**Phase:** 1
**Category:** funnel_entry
**Platform:** PostHog (client)
**Trigger:** Fires when a user clicks the "Set up Meta Ads MCP" CTA inside the Meta-unsupported modal (sidebar gate for Campaigns/Audit/Impact Monitor/Chat when Meta is the active platform). Operations is no longer gated — Meta accounts now have their own change history feed on `/operations`.
**Hypothesis:** Pairs with `meta_unsupported_modal_shown` to compute "shown→clicked" conversion. A high rate validates that users blocked from in-app surfaces willingly route to MCP setup; a low rate signals the in-app feature gap is more painful than the MCP path is appealing.

| Property | Type | Example | Description |
|---|---|---|---|
| `feature` | string | `"Campaigns"` | Which gated feature triggered the modal. Enum: `Campaigns`, `Audit`, `Impact Monitor`, `Chat`. |
| `location` | string | `"meta_unsupported_modal"` | Constant — distinguishes from any future MCP CTAs. |

```json
{ "event": "meta_mcp_setup_cta_clicked", "properties": { "feature": "Campaigns", "location": "meta_unsupported_modal" } }
```

**Files:** `components/meta-unsupported-modal.tsx`

---

## meta_unsupported_modal_shown

**Phase:** 1
**Category:** funnel_entry
**Platform:** PostHog (client)
**Trigger:** Fires when the Meta-unsupported modal opens — i.e. a user with Meta as the active platform clicks one of the disabled sidebar items (Campaigns, Audit, Impact Monitor, Chat). Operations was removed from this gate in v0.3.4.3 once Meta change history shipped.
**Hypothesis:** Concrete demand signal for which Google in-app surface to port to Meta first. The `feature` property ranks user intent (e.g. if Audit is shown 3× as often as Campaigns, prioritize Meta Audit).

| Property | Type | Example | Description |
|---|---|---|---|
| `feature` | string | `"Campaigns"` | Which gated feature the user tried to open. Enum: `Campaigns`, `Audit`, `Impact Monitor`, `Chat`. |

```json
{ "event": "meta_unsupported_modal_shown", "properties": { "feature": "Campaigns" } }
```

**Files:** `components/meta-unsupported-modal.tsx`

---

## platform_switched

**Phase:** 1
**Category:** value_exchange
**Platform:** PostHog (client)
**Trigger:** Fires when the user picks an account in the navbar account switcher. Captures both within-platform account changes and cross-platform switches (Google ↔ Meta). Fires only on a real change — no event if the chosen account already matches the active one.
**Hypothesis:** Tells us which platform users actually engage with after connecting. Cross-platform switches (`cross_platform: true`) are a strong signal that a user is actively running both — guides whether to keep investing in Meta in-app surfaces vs MCP-only.

| Property | Type | Example | Description |
|---|---|---|---|
| `to_platform` | string | `"meta_ads"` | Platform of the newly selected account. Enum: `google_ads`, `meta_ads`. |
| `from_platform` | string | `"google_ads"` | Platform that was active before the switch. Same enum. |
| `cross_platform` | boolean | `true` | True iff `to_platform !== from_platform`. |
| `google_accounts_count` | number | `5` | How many Google Ads accounts the user has linked. |
| `meta_accounts_count` | number | `2` | How many Meta Ads accounts the user has linked. |

```json
{ "event": "platform_switched", "properties": { "to_platform": "meta_ads", "from_platform": "google_ads", "cross_platform": true, "google_accounts_count": 5, "meta_accounts_count": 2 } }
```

**Files:** `components/account-switcher.tsx`

---

## post_audit_claude_cta_clicked

**Phase:** 1
**Category:** funnel_entry
**Platform:** PostHog (client)
**Trigger:** Fires when a user finishes an audit and clicks the "Continue in Claude" CTA on the audit results page.
**Hypothesis:** Audit→connect conversion intent. Properties carry audit severity so we can correlate "bad audit results → high CTA click rate" (which would validate the audit-as-acquisition-funnel hypothesis).

| Property | Type | Example | Description |
|---|---|---|---|
| `destination` | string | `"/connect"` | Where the link points (constant for now). |
| `overall_score` | number | `62` | Audit overall score (0–100). |
| `wasted_spend_monthly` | number \| null | `1240.5` | Monthly wasted spend total in account currency, if computed. |

```json
{ "event": "post_audit_claude_cta_clicked", "properties": { "destination": "/connect", "overall_score": 62, "wasted_spend_monthly": 1240.5 } }
```

**Files:** `app/(app)/audit/audit-content.tsx`

---

## welcome_connect_clicked

**Phase:** 1
**Category:** funnel_entry
**Platform:** PostHog (client)
**Trigger:** Fires when an ads-less user on `/welcome` clicks the "Connect Google Ads" platform card to start OAuth.
**Hypothesis:** Tells us how many ads-less Google sessions actually attempt to connect a real Ads account vs sitting idle. Pairs with `account_connected` to compute connect-attempt → connect-success rate per platform.

| Property | Type | Example | Description |
|---|---|---|---|
| `platform` | string | `"google-ads"` | Which platform card was clicked. |

```json
{ "event": "welcome_connect_clicked", "properties": { "platform": "google-ads" } }
```

**Files:** `components/welcome-page.tsx`

---

## Phase 2 backlog

Valid candidates that don't yet meet the "what would we do differently?" bar — defer until we have a concrete hypothesis or a question we can't answer with Phase 1 events.

- **`connector_credentials_visible`** *(category: funnel_entry)* — fires once when the Client ID/Secret block first renders for a user. Useful as a denominator for `connector_credential_copied / connector_credentials_visible` (copy-through rate). Defer — `oauth_credentials_generated` is currently a close-enough proxy.
- **`connector_screenshot_lightbox_dwell`** *(category: ambient)* — fires on lightbox close with a `dwell_ms` property. Tells us *how long* users inspected each step. Defer — `connector_screenshot_expanded` counts are enough until we see one image dominating the distribution.
- **`audit_help_panel_pill_visible`** *(category: ambient)* — fires when the collapsed pill is in view via IntersectionObserver. Useful for distinguishing "pill seen but ignored" from "pill never on screen." Defer — only worth the wiring cost if dismissal rates suggest a visibility problem.
