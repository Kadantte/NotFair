# Event Registry

> Source of truth for all analytics events. Last updated: 2026-04-10.
> Platform: PostHog. Check here before adding a new event.

---

## account_connected

**Phase:** 1
**Category:** activation
**Platform:** PostHog (client)
**Trigger:** Fires when a user successfully connects Google Ads account(s) — either via single-account auto-connect or multi-account selection.
**Hypothesis:** We believe tracking this tells us connect funnel completion rate, which lets us identify and fix drop-off in onboarding.

| Property | Type | Example | Description |
|---|---|---|---|
| `account_count` | number | `2` | Number of Google Ads accounts connected |
| `auth_method` | string | `"google"` | Authentication method used |

```json
{ "event": "account_connected", "properties": { "account_count": 2, "auth_method": "google" } }
```

**Files:** `components/connect-page.tsx`

---

## ai_change_executed

**Phase:** 1
**Category:** value_exchange (NSM event)
**Platform:** PostHog (server)
**Trigger:** Fires when an AI write operation completes successfully via MCP or chat agent.
**Hypothesis:** We believe tracking this tells us core value delivery frequency, which drives all product decisions as the NSM event.

| Property | Type | Example | Description |
|---|---|---|---|
| `tool_name` | string | `"pause_keyword"` | Which write tool was executed |
| `entity_type` | string | `"keyword"` | Entity type affected (keyword or campaign) |
| `account_id` | string | `"1301265570"` | Google Ads account ID |
| `campaign_id` | string \| null | `"20345678"` | Campaign affected (null if not campaign-scoped) |
| `before_value` | string \| null | `"ENABLED"` | State before the change |
| `after_value` | string \| null | `"PAUSED"` | State after the change |

```json
{ "event": "ai_change_executed", "properties": { "tool_name": "pause_keyword", "entity_type": "keyword", "account_id": "1301265570", "campaign_id": "20345678", "before_value": "ENABLED", "after_value": "PAUSED" } }
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
**Trigger:** Fires when an AI read operation completes via MCP or chat agent.
**Hypothesis:** We believe tracking this tells us which read tools are most used, which lets us prioritize tool development and understand user intent patterns.

| Property | Type | Example | Description |
|---|---|---|---|
| `tool_name` | string | `"getCampaignPerformance"` | Which read tool was executed |
| `account_id` | string | `"1301265570"` | Google Ads account ID |
| `campaign_id` | string \| null | `"20345678"` | Campaign queried (null if account-level) |

```json
{ "event": "ai_read_executed", "properties": { "tool_name": "getCampaignPerformance", "account_id": "1301265570", "campaign_id": "20345678" } }
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
**Trigger:** Fires when a user clicks a primary CTA button on a marketing page (`AuditCTA` component, the homepage Connect Claude button, or the public Claude Connector page Sign in / Open setup buttons).
**Hypothesis:** We believe tracking this tells us click-through rate per landing page and per CTA variant, which lets us measure copy/design effectiveness and run A/B tests.

| Property | Type | Example | Description |
|---|---|---|---|
| `page` | string | `"homepage"` | Which marketing page the CTA is on. Enum: `homepage`, `google-ads-audit`, `google-ads-claude`, `google-ads-claude-connector`, `google-ads-mcp-server`, `header` |
| `cta` | string | `"audit_now"` | Which CTA variant was shown. Enum: `audit_now`, `view_audit`, `connect_claude`, `sign_in_with_google`, `open_connector_setup` |

```json
{ "event": "cta_clicked", "properties": { "page": "google-ads-claude-connector", "cta": "sign_in_with_google" } }
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

## page_viewed

**Phase:** 1
**Category:** ambient
**Platform:** PostHog (client)
**Trigger:** Fires on every client-side route change via the PostHogProvider component. Uses PostHog's `$pageview` event.
**Hypothesis:** We believe tracking this tells us where users spend time and where they drop off, which lets us prioritize UX improvements.

| Property | Type | Example | Description |
|---|---|---|---|
| `path` | string | `"/connect"` | The route path |
| `referrer` | string | `"https://google.com"` | Document referrer |

```json
{ "event": "$pageview", "properties": { "path": "/connect", "referrer": "https://google.com" } }
```

**Files:** `components/posthog-provider.tsx`

---

## Phase 2 backlog

Valid candidates that don't yet meet the "what would we do differently?" bar — defer until we have a concrete hypothesis or a question we can't answer with Phase 1 events.

- **`connector_credentials_visible`** *(category: funnel_entry)* — fires once when the Client ID/Secret block first renders for a user. Useful as a denominator for `connector_credential_copied / connector_credentials_visible` (copy-through rate). Defer — `oauth_credentials_generated` is currently a close-enough proxy.
- **`connector_screenshot_lightbox_dwell`** *(category: ambient)* — fires on lightbox close with a `dwell_ms` property. Tells us *how long* users inspected each step. Defer — `connector_screenshot_expanded` counts are enough until we see one image dominating the distribution.
- **`audit_help_panel_pill_visible`** *(category: ambient)* — fires when the collapsed pill is in view via IntersectionObserver. Useful for distinguishing "pill seen but ignored" from "pill never on screen." Defer — only worth the wiring cost if dismissal rates suggest a visibility problem.
