# Event Registry

> Source of truth for all analytics events. Last updated: 2026-04-22.
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

## ai_change_failed

**Phase:** 1
**Category:** quality_signal
**Platform:** PostHog (server)
**Trigger:** Fires whenever a write operation returns `success: false` through the `execWrite` chokepoint in `lib/tools/execute.ts`. Covers single-op and bulk tools, whether the failure came from our pre-validation (guardrail violation, malformed input) or from Google's API (partial_failure, rejected mutate). Thrown errors (network outages, auth crashes) do NOT fire this event — they propagate unlogged so outages don't burn user quota.
**Hypothesis:** We believe tracking this tells us the real per-tool failure rate and lets us distinguish "our guardrails blocked a bad agent request" from "Google rejected a valid-looking mutate." Pairs with `ai_change_executed` to compute per-tool success rates and with `error` string patterns to classify failure mode.

| Property | Type | Example | Description |
|---|---|---|---|
| `tool_name` | string | `"pause_keyword"` | Which write tool was attempted |
| `entity_type` | string | `"keyword"` | Entity type attempted (keyword or campaign) |
| `account_id` | string | `"1301265570"` | Google Ads account ID |
| `campaign_id` | string \| null | `"20345678"` | Campaign scope (null if not campaign-scoped) |
| `before_value` | string \| null | `"ENABLED"` | State before the attempt (unchanged by the failure) |
| `after_value` | string \| null | `"ENABLED"` | Same as `before_value` for failures — no state change occurred |
| `error` | string \| null | `"INVALID_ARGUMENT: criterion not found"` | Google's error message, or null if absent |
| `client_name` | string \| null | `"claude-code"` | See `ai_change_executed` |
| `client_version` | string \| null | `"1.2.3"` | See `ai_change_executed` |
| `auth_method` | string \| null | `"oauth"` | See `ai_change_executed` |
| `user_agent` | string \| null | `"claude-code/1.2.3"` | See `ai_change_executed` |

```json
{ "event": "ai_change_failed", "properties": { "tool_name": "pause_keyword", "entity_type": "keyword", "account_id": "1301265570", "campaign_id": "20345678", "before_value": "ENABLED", "after_value": "ENABLED", "error": "INVALID_ARGUMENT: criterion not found", "client_name": "claude-code", "client_version": "1.2.3", "auth_method": "oauth", "user_agent": "claude-code/1.2.3" } }
```

**Files:** `lib/tools/execute.ts`, `lib/google-ads/bulk.ts`

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

## setup_help_requested

**Phase:** 1
**Category:** activation
**Platform:** PostHog (client)
**Trigger:** Fires when a user clicks the "Need help with setup?" button on the connect page. Also triggers a Slack notification to the team (`requestSetupHelp` in `app/actions.ts`) carrying the same context.
**Hypothesis:** We believe tracking this tells us when users hit a wall during Claude Code / Claude Connector setup — a direct signal of setup friction. Volume per `active_tab` / `code_sub_tab` tells us which path is hardest; the ratio vs `install_command_copied` / `connector_credential_copied` tells us whether users are asking for help instead of completing setup.

> **Replaces `chat_opened_from_connect`** (retired 2026-04-22). Analysis of the Apr 21–22 cohort showed the chat fallback was catching setup-frustrated users who then bounced at 0% D0 write rate — routing them to human help via Slack is higher-leverage.

| Property | Type | Example | Description |
|---|---|---|---|
| `active_tab` | string | `"claude-code"` | Which setup path the user was on at click time. Enum: `claude-code`, `connector` |
| `code_sub_tab` | string | `"auto"` | Claude Code sub-tab at click time. Enum: `manual`, `auto`. Always populated; ignore when `active_tab="connector"`. |
| `connected` | boolean | `true` | Whether the user already has a Google Ads session (token) at click time. Distinguishes "stuck on OAuth" from "stuck on client wiring". |
| `pathname` | string | `"/connect/claude-code/auto"` | Exact pathname when the button was clicked. |

```json
{ "event": "setup_help_requested", "properties": { "active_tab": "claude-code", "code_sub_tab": "auto", "connected": true, "pathname": "/connect/claude-code/auto" } }
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

## product_hunt_banner_clicked

**Phase:** 1
**Category:** funnel_entry
**Platform:** PostHog (client)
**Trigger:** Fires when a user clicks anywhere on the `ProductHuntBanner`. The banner is a single `<a>` element that opens `producthunt.com` in a new tab, so the whole countdown + badge + CTA cluster resolves to one click target. The banner is mounted in both the marketing layout and the app layout, so the same event fires across signed-out and signed-in sessions.
**Hypothesis:** We believe tracking this tells us CTR on the PH launch banner sliced by surface (marketing vs app) and by signed-in state, which lets us decide (a) whether the banner is worth keeping after launch week, (b) whether paid users click on promo banners at a rate that justifies future campaigns inside the app, and (c) which pages/surfaces drive PH engagement. Time-bound event — retire or repurpose after the Product Hunt launch cycle ends.

> **Why a dedicated event, not an extension of `cta_clicked`.** `cta_clicked` is scoped to marketing-page CTAs with a stable `page` enum. The PH banner also renders inside the authenticated app, so mixing it into `cta_clicked` would fracture the existing `page` enum and muddy the marketing-funnel queries. Keeping it separate also makes it trivial to mute/delete after the campaign.

| Property | Type | Example | Description |
|---|---|---|---|
| `surface` | string | `"marketing"` | Which layout rendered the banner. Enum: `marketing` (public marketing pages), `app` (authenticated app layout). |
| `page` | string | `"/campaigns"` | Pathname at click time — use for finding which pages drive the most PH clicks. |
| `is_authenticated` | boolean | `true` | Whether the clicker has a Google session. Always `true` for `surface: "app"`; mixed for `surface: "marketing"`. |

```json
{ "event": "product_hunt_banner_clicked", "properties": { "surface": "app", "page": "/campaigns", "is_authenticated": true } }
```

**Files:** `components/product-hunt-banner.tsx`, `app/(marketing)/layout.tsx`, `app/(app)/layout.tsx`

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

## Phase 2 backlog

Valid candidates that don't yet meet the "what would we do differently?" bar — defer until we have a concrete hypothesis or a question we can't answer with Phase 1 events.

- **`connector_credentials_visible`** *(category: funnel_entry)* — fires once when the Client ID/Secret block first renders for a user. Useful as a denominator for `connector_credential_copied / connector_credentials_visible` (copy-through rate). Defer — `oauth_credentials_generated` is currently a close-enough proxy.
- **`connector_screenshot_lightbox_dwell`** *(category: ambient)* — fires on lightbox close with a `dwell_ms` property. Tells us *how long* users inspected each step. Defer — `connector_screenshot_expanded` counts are enough until we see one image dominating the distribution.
- **`audit_help_panel_pill_visible`** *(category: ambient)* — fires when the collapsed pill is in view via IntersectionObserver. Useful for distinguishing "pill seen but ignored" from "pill never on screen." Defer — only worth the wiring cost if dismissal rates suggest a visibility problem.
- **`product_hunt_banner_shown`** *(category: ambient)* — fires once per page when the PH banner renders. Would give us a precise CTR denominator. Defer — `$pageview` filtered to paths where the banner renders is good enough for a one-week promo. Revisit if we run a second PH-style time-bound campaign.
