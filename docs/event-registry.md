# Event Registry

> Source of truth for all analytics events. Last updated: 2026-04-04.
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

## install_command_copied

**Phase:** 1
**Category:** activation
**Platform:** PostHog (client)
**Trigger:** Fires when a user clicks the Copy button on any setup code block on the connect page.
**Hypothesis:** We believe tracking this tells us setup funnel completion, which lets us know if users are actually getting to the install step and which AI clients are most popular.

| Property | Type | Example | Description |
|---|---|---|---|
| `setup_tab` | string | `"claude-code"` | Which AI client setup tab was active |
| `step` | string | `"install"` | Which step's code was copied |

```json
{ "event": "install_command_copied", "properties": { "setup_tab": "claude-code", "step": "install" } }
```

**Files:** `components/connect-page.tsx`

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

## setup_tab_selected

**Phase:** 1
**Category:** activation
**Platform:** PostHog (client)
**Trigger:** Fires when a user clicks a setup method tab (Claude Code, Codex, OpenClaw, Claude Cowork) on the connect page.
**Hypothesis:** We believe tracking this tells us AI client preference distribution, which lets us prioritize integration investment.

| Property | Type | Example | Description |
|---|---|---|---|
| `tab` | string | `"claude-code"` | Which setup tab was selected |

```json
{ "event": "setup_tab_selected", "properties": { "tab": "claude-code" } }
```

**Files:** `components/connect-page.tsx`

---

## Phase 2 Backlog

| Event | Hypothesis |
|---|---|
| `dashboard_action_taken` | Do dashboard recommendations drive action? Validates dashboard feature ROI. |
| `chat_message_sent` | Built-in chat engagement frequency — informs chat vs MCP investment. |
| `campaign_action_taken` | Do users manage campaigns via UI? Informs direct management UX investment. |
| `mcp_tool_invoked` | Which MCP read tools are most used? Informs tool development priority. |
| `campaign_summary_viewed` | AI summary engagement — validates the feature. |
