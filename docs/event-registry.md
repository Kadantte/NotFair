# Event Registry

> Source of truth for all analytics events. Last updated: 2026-04-10.
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
**Trigger:** Fires when an AI write operation completes successfully via MCP or the in-app chat agent. Both surfaces flow through the same `execWrite` path in `lib/tools/execute.ts`, so this event covers all agentic write traffic.
**Hypothesis:** We believe tracking this tells us core value delivery frequency, which drives all product decisions as the NSM event. The client properties (`client_name`, `client_version`, `auth_method`) let us slice usage by which surface (Claude Code plugin, Claude.ai Web connector, Claude Cowork, in-app chat, etc.) is producing real changes — useful for prioritizing surface-specific UX work.

| Property | Type | Example | Description |
|---|---|---|---|
| `tool_name` | string | `"pause_keyword"` | Which write tool was executed |
| `entity_type` | string | `"keyword"` | Entity type affected (keyword or campaign) |
| `account_id` | string | `"1301265570"` | Google Ads account ID |
| `campaign_id` | string \| null | `"20345678"` | Campaign affected (null if not campaign-scoped) |
| `before_value` | string \| null | `"ENABLED"` | State before the change |
| `after_value` | string \| null | `"PAUSED"` | State after the change |
| `client_name` | string \| null | `"adsagent-chat"` | Identifies the calling surface. For MCP this is the client's `clientInfo.name` from the MCP `initialize` handshake (e.g. `claude-code`, `claude-ai`, `mcp-remote`). For in-app chat this is the constant `adsagent-chat`. Null only for legacy MCP sessions whose handshake did not report a name. |
| `client_version` | string \| null | `"1.2.3"` | MCP client version from the handshake. Null for in-app chat (no version concept) and legacy MCP sessions. |
| `auth_method` | string \| null | `"chat"` | How the call authenticated. Values: `oauth` (Claude.ai connector / OAuth bearer), `direct` (raw MCP session token), `chat` (in-app chat agent). Always populated. Use this as the primary cut for "MCP vs chat". |
| `user_agent` | string \| null | `"node-fetch/1.0"` | Raw `User-Agent` of the inbound HTTP request. Often `mcp-remote/...` rather than the end client's UA, so prefer `client_name` / `auth_method` for client attribution. Null for in-app chat. |

```json
{ "event": "ai_change_executed", "properties": { "tool_name": "pause_keyword", "entity_type": "keyword", "account_id": "1301265570", "campaign_id": "20345678", "before_value": "ENABLED", "after_value": "PAUSED", "client_name": "claude-code", "client_version": "1.2.3", "auth_method": "oauth", "user_agent": "claude-code/1.2.3" } }
```

**Files:** `lib/tools/execute.ts`

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
**Trigger:** Fires when an AI read operation completes via MCP or the in-app chat agent. Both surfaces flow through the same `execRead` path in `lib/tools/execute.ts`, so this event covers all agentic read traffic.
**Hypothesis:** We believe tracking this tells us which read tools are most used and which surfaces are producing the read traffic, which lets us prioritize tool development and understand user intent patterns per surface.

| Property | Type | Example | Description |
|---|---|---|---|
| `tool_name` | string | `"getCampaignPerformance"` | Which read tool was executed |
| `account_id` | string | `"1301265570"` | Google Ads account ID |
| `campaign_id` | string \| null | `"20345678"` | Campaign queried (null if account-level) |
| `client_name` | string \| null | `"adsagent-chat"` | Identifies the calling surface. For MCP this is the client's `clientInfo.name` from the MCP `initialize` handshake (e.g. `claude-code`, `claude-ai`, `mcp-remote`). For in-app chat this is the constant `adsagent-chat`. Null only for legacy MCP sessions whose handshake did not report a name. |
| `client_version` | string \| null | `"1.2.3"` | MCP client version from the handshake. Null for in-app chat (no version concept) and legacy MCP sessions. |
| `auth_method` | string \| null | `"chat"` | How the call authenticated. Values: `oauth` (Claude.ai connector / OAuth bearer), `direct` (raw MCP session token), `chat` (in-app chat agent). Always populated. Use this as the primary cut for "MCP vs chat". |
| `user_agent` | string \| null | `"node-fetch/1.0"` | Raw `User-Agent` of the inbound HTTP request. Often `mcp-remote/...` rather than the end client's UA, so prefer `client_name` / `auth_method` for client attribution. Null for in-app chat. |

```json
{ "event": "ai_read_executed", "properties": { "tool_name": "getCampaignPerformance", "account_id": "1301265570", "campaign_id": "20345678", "client_name": "claude-code", "client_version": "1.2.3", "auth_method": "oauth", "user_agent": "claude-code/1.2.3" } }
```

**Files:** `lib/tools/execute.ts`

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

## connector_credential_copied

**Phase:** 1
**Category:** activation
**Platform:** PostHog (client)
**Trigger:** Fires when a user clicks the copy button on any field inside the in-app Claude Connector tab (`/connect/claude-connector`).
**Hypothesis:** We believe tracking this tells us how far users get inside the connector configuration step. The Client ID/Secret copies in particular indicate that the user has seen the generated credentials and is actively pasting them into Claude — a strong activation signal that the connector funnel will complete.

| Property | Type | Example | Description |
|---|---|---|---|
| `field` | string | `"client_secret"` | Which credential field was copied. Enum: `name`, `server_url`, `client_id`, `client_secret` |

```json
{ "event": "connector_credential_copied", "properties": { "field": "client_secret" } }
```

**Files:** `components/connect-page.tsx`

---

## connector_screenshot_expanded

**Phase:** 1
**Category:** ambient
**Platform:** PostHog (client)
**Trigger:** Fires when a user clicks one of the Claude Connector setup screenshots to open it in the lightbox. Wired in both the in-app `/connect/claude-connector` tab and the public `/google-ads-claude-connector` marketing page.
**Hypothesis:** We believe tracking this tells us which steps users find unclear enough to inspect closely, which lets us prioritize which screenshots to re-shoot, annotate, or replace with inline diagrams.

| Property | Type | Example | Description |
|---|---|---|---|
| `image` | string | `"02_configure"` | Which screenshot was opened. Derived from the file name. Enum: `01_add`, `02_configure`, `03_saved`, `04_enable_in_chat`, `05_use_in_chat` |
| `surface` | string | `"in_app"` | Where the click happened. Enum: `in_app` (logged-in `/connect/claude-connector`), `marketing` (public `/google-ads-claude-connector`) |

```json
{ "event": "connector_screenshot_expanded", "properties": { "image": "02_configure", "surface": "marketing" } }
```

**Files:** `components/connect-page.tsx`, `components/marketing/google-ads-claude-connector-page.tsx`

---

## chat_opened_from_connect

**Phase:** 1
**Category:** activation
**Platform:** PostHog (client)
**Trigger:** Fires when a user clicks the "Open Chat" button on the connect page.
**Hypothesis:** We believe tracking this tells us how many users choose built-in chat over MCP setup, which lets us prioritize chat vs MCP investment.

No properties.

```json
{ "event": "chat_opened_from_connect" }
```

**Files:** `components/connect-page.tsx`

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
**Trigger:** Fires when a user clicks the Copy button on any Claude Code setup code block on the connect page — both the auto-prompt block in the "Let Claude set it up" subtab and each individual command in the "Install manually" subtab.
**Hypothesis:** We believe tracking this with a `step` property tells us which point in the manual install flow users actually reach (marketplace add → plugin install → /ads → API key paste). It lets us pinpoint where setup falls apart and whether users prefer the auto-prompt path over manual.

| Property | Type | Example | Description |
|---|---|---|---|
| `setup_tab` | string | `"claude-code"` | Which AI client setup tab was active |
| `step` | string | `"plugin_install"` | Which command was copied. Enum: `install` (auto-prompt block), `marketplace_add`, `plugin_install`, `ads_command`, `api_key` |

```json
{ "event": "install_command_copied", "properties": { "setup_tab": "claude-code", "step": "plugin_install" } }
```

**Files:** `components/connect-page.tsx`

---

## oauth_credentials_generated

**Phase:** 1
**Category:** activation
**Platform:** PostHog (client)
**Trigger:** Fires when a user clicks "Generate Credentials" inside the in-app Claude Connector tab and the request to create an OAuth client succeeds.
**Hypothesis:** We believe tracking this tells us how many users complete the credential-generation step of the Claude.ai Web/Cowork connector setup. Combined with `account_connected`, it tells us where the connector funnel drops off — pre-credentials (auth issue) vs post-credentials (Claude UI friction).

No properties.

```json
{ "event": "oauth_credentials_generated" }
```

**Files:** `components/connect-page.tsx`

---

## user_signed_up

**Phase:** 1
**Category:** activation
**Platform:** PostHog (server)
**Trigger:** Fires once per user, the first time they complete the Google OAuth flow and create their initial Google Ads session. Detected via the `gads_new_signup` cookie set on the success response from the auth callback.
**Hypothesis:** We believe tracking this tells us first-touch sign-up volume with full UTM attribution attached, which lets us measure paid/organic acquisition channels and tie them to long-term retention.

| Property | Type | Example | Description |
|---|---|---|---|
| `signup_method` | string | `"google_oauth"` | Authentication mechanism used to sign up |
| `signup_referrer` | string \| null | `"https://google.com"` | Value of the `Referer` header on the OAuth callback request |
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
| `$current_url` | string | `"https://adsagent.org/connect"` | Full URL at capture time (PostHog reserved property) |
| `path` | string | `"/connect"` | Pathname without query/host |
| `referrer` | string | `"https://google.com"` | Document referrer |

```json
{ "event": "$pageview", "properties": { "$current_url": "https://adsagent.org/connect", "path": "/connect", "referrer": "https://google.com" } }
```

**Files:** `components/posthog-provider.tsx`, `lib/analytics.ts`

---

## pricing_cta_clicked

**Phase:** 1
**Category:** funnel_entry
**Platform:** PostHog (client)
**Trigger:** Fires when a user clicks any CTA button inside the shared `PricingSection` component — Free plan "Get started" / "Get Started" (audit), Growth plan "Get Started" / "Upgrade to Growth" / "Switch interval", or Growth "Manage subscription" portal button. The same component is rendered on the homepage, the standalone `/pricing` page, and the in-app `/upgrade` page; the `page` property attributes the click.
**Hypothesis:** We believe tracking this tells us paid-conversion funnel entry rate per surface (homepage pricing section vs standalone pricing page vs in-app upgrade page) and per interval (month vs year), which lets us decide where to invest paid-conversion effort and whether the homepage pricing section pulls its weight versus a dedicated `/pricing` page.

| Property | Type | Example | Description |
|---|---|---|---|
| `page` | string | `"homepage"` | Which surface the pricing section was rendered on. Enum: `homepage`, `pricing`, `upgrade` |
| `plan` | string | `"growth"` | Which plan the CTA belongs to. Enum: `free`, `growth` |
| `interval` | string | `"year"` | Currently selected billing interval at click time. Enum: `month`, `year` |
| `action` | string | `"upgrade"` | What the click is requesting. Enum: `signin` (free, logged out → Google OAuth), `open_audit` (free, logged in → /audit), `signin_then_upgrade` (growth, logged out → Google OAuth), `upgrade` (growth, logged in, not on growth → Stripe checkout), `switch_interval` (growth, already on growth, switching month/year), `manage` (growth, on growth → Stripe portal) |

```json
{ "event": "pricing_cta_clicked", "properties": { "page": "homepage", "plan": "growth", "interval": "year", "action": "upgrade" } }
```

**Files:** `components/marketing/pricing-cards.tsx`

---

## Phase 2 backlog

Valid candidates that don't yet meet the "what would we do differently?" bar — defer until we have a concrete hypothesis or a question we can't answer with Phase 1 events.

- **`connector_credentials_visible`** *(category: funnel_entry)* — fires once when the Client ID/Secret block first renders for a user. Useful as a denominator for `connector_credential_copied / connector_credentials_visible` (copy-through rate). Defer — `oauth_credentials_generated` is currently a close-enough proxy.
- **`connector_screenshot_lightbox_dwell`** *(category: ambient)* — fires on lightbox close with a `dwell_ms` property. Tells us *how long* users inspected each step. Defer — `connector_screenshot_expanded` counts are enough until we see one image dominating the distribution.
- **`audit_help_panel_pill_visible`** *(category: ambient)* — fires when the collapsed pill is in view via IntersectionObserver. Useful for distinguishing "pill seen but ignored" from "pill never on screen." Defer — only worth the wiring cost if dismissal rates suggest a visibility problem.
