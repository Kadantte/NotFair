# Changelog

All notable changes to AdsAgent will be documented in this file.


## [0.3.3.1] - 2026-05-01

### Added
- **Developer telemetry dashboard tabs and trend context.** `/dev/telemetry` now separates Overview, By Tool, and Recent Calls, adds current-vs-previous tool call deltas, surfaces error-rate history, includes error messages on recent calls, and expands recent-call history to 100 entries.
- **Impact Monitor maturity affordances.** `/impact-monitor` now groups interventions by attention/readiness, shows when immature interventions will have enough after-data, and supports day-level evaluation actions for items ready to review.

### Changed
- **`runScript` read-only guidance is explicit.** The MCP tool description and GAQL guard now tell agents that `ads.gaql()` / `ads.gaqlParallel()` are analytics-only and that account mutations must use dedicated write tools.
- **Bundled AdsAgent plugin docs refreshed.** The Google Ads skill is split into focused reference playbooks for session checks, analysis heuristics, change tracking, and workflow recipes, with updated GAQL truncation guidance.

## [0.3.3.0] - 2026-05-01

### Added
- **`suggestImprovement` MCP tool — agent-as-informant feedback channel.** Lets the AI agent surface tool-design feedback (unclear descriptions, missing capabilities, ergonomic friction, unhelpful errors, workflow gaps, duplicate tools) that per-event telemetry can't reconstruct. Each call fires a `mcp_improvement_suggested` PostHog event and posts a formatted message to the team's Slack channel. Per-session rate-limited to 5 calls per hour. Registered on both Google Ads (`/api/mcp`, `/api/mcp/google_ads`) and Meta Ads (`/api/mcp/meta_ads`) routes.
- **`mcp_improvement_suggested` PostHog event** documented in `docs/event-registry.md` with the full property schema (category, affected_tool, observation, suggestion, user_goal, client metadata, session_id, remaining_calls).

### Changed
- **Server-level MCP instructions** (Google + Meta) now mention `suggestImprovement` so the agent learns about the channel at handshake time. The tool description leads with the user-benefit framing ("help us make these tools better for the user you're helping right now") rather than abstract product-improvement language.
- **Slack webhook helper extracted to `lib/slack.ts`** and reused by `app/actions.ts` (`submitFeedback`, `requestSetupHelp`, `notifyHelpClicked`, `submitManagedInquiry`) plus the new `suggestImprovement` tool. Removes the inline duplicate in `app/actions.ts`.

### Security
- **Slack mention escape on agent-supplied content.** All agent-supplied strings (`observation`, `suggestion`, `user_goal`, `affected_tool`) routed to Slack are escaped (`<`, `>`, `&` → HTML entities) before interpolation, neutralizing `<!channel>`, `<@USERID>`, `<#CHANNEL>` injection vectors. Static formatting tokens are unchanged.

## [0.3.2.0] - 2026-04-30

### Added
- **8 new MCP write tools for Google Ads experiments.** Agents can now run the full experiment lifecycle from a chat: `createExperiment`, `addExperimentArms`, `scheduleExperiment`, `endExperiment`, `promoteExperiment`, `graduateExperiment`, `listExperimentAsyncErrors`, and `createAdVariationExperiment` (RSA-asset variant). Each tool ships with status-precondition checks, structured rejections, and human-readable error rewrites mapped from Google's `experiment_error` codes.
- **`createAdVariationExperiment`** — clones an existing Responsive Search Ad with patched headlines/descriptions and sets up a 50/50 control vs treatment arm in one call. Resolves the base RSA by signature (ad group + first headline + first description) with explicit ambiguous-match detection.
- **`RUN_EXPERIMENT` runScript playbook** — agents discover existing experiments via GAQL on the `experiment` and `experiment_arm` resources, with a decision rule for when to use lifecycle tools vs the RSA-asset shortcut.

### Changed
- **`eval-mcp` skill rewrite.** Makes it explicit that the model in the user's session is the runner — no spawning Task subagents, no shelling out to `claude -p` for the runner step. Subagents and subprocesses run in a different agent environment than the one real users hit, so they measure the wrong thing. Full-mode judge stays subprocess-based for blinding (rubric scoring benefits from a fresh context). Mirrors to the codex variant at `.agents/skills/eval-mcp/`.
- **`scripts/eval-mcp/eval.ts`** — removes `--bare` from runner/judge/preflight `claude -p` invocations. `--bare` requires `ANTHROPIC_API_KEY` and skips OAuth/keychain auth, which broke the eval harness for users who only auth via terminal `/login`.

### Fixed
- **Pre-existing `.Codex/` path bug in the codex eval-mcp skill mirror** — references now correctly point to `.agents/skills/eval-mcp/`.

## [0.3.1.0] - 2026-04-29

### Added
- **29 new SEO blog posts covering the full Google-Ads-via-MCP keyword landscape.** Targets every cluster from the keyword research: setup pillar, MCP-server comparison, 8 GEO-citation FAQ pages, 5 job-to-be-done workflow pages, 4 head-to-head comparison pages (Claude vs ChatGPT, vs Gemini, best-for-PPC, agent landscape), 5 persona pages (agencies, small business, ecommerce, SaaS, solopreneurs), and 5 bridge/awareness pages for top-of-funnel queries. Every post is answer-first for AI snippet citation, has its own JSON-LD FAQ schema, links into 3 sibling posts plus `/connect`, and is rendered automatically by the existing `/blog/[slug]` route.
- **`/blog/connect-google-ads-to-claude`** — pillar setup guide covering Claude Desktop, Claude Code, ChatGPT/Codex, and any MCP client.
- **`/blog/google-ads-mcp-servers-compared`** — landscape comparison covering hosted, community open-source, and roll-your-own paths.

### Fixed
- **Stale internal link in the existing `/blog/what-is-mcp` post** — `/connect-google-ads-to-claude` corrected to `/blog/connect-google-ads-to-claude` now that the target post exists.

## [0.3.0.19] - 2026-04-29

### Changed
- **Connect Claude is now a prominent CTA at the top of the in-app sidebar** instead of a small footer link. Users land in `/campaigns` or `/audit` and can immediately see how to wire up their Claude client. The header "Start now" button also routes logged-in users to `/connect` instead of `/audit`, so connection setup stays discoverable post-login.
- **Marketing `AuditCTA` now accepts `connectedDestination` / `disconnectedDestination` props** so callers can target routes other than `/audit` without forking the component.
- **Removed the broken Claude Desktop deep link from the connector setup.** The `claude://claude.ai/settings/connectors?modal=add-custom-connector` URL only opened Claude Desktop to a generic view because the `claude://` scheme has no documented route to settings/connectors ([Anthropic docs](https://support.claude.com/en/articles/14729294-open-claude-desktop-with-a-link)). The setup now offers a single web CTA that lands directly on Add custom connector, plus inline instructions for users who prefer to navigate inside Claude Desktop manually. Connector setup is account-level, so the web flow configures it for both surfaces.
- **Connector client picker now displays the "Recommended" badge above the title instead of beside it,** giving each card the full width for the title and keeping all four cards visually aligned. The Claude Desktop card title was also tightened from "Claude Desktop / Web / Cowork" to "Claude Desktop, Web & Cowork" so it no longer wraps into a narrow three-line column.
- **Claude Code setup now warns users to sign in with the same Google account they use on NotFair** before running `/ads`, preventing the common mistake of connecting Claude Code to an empty account that can't see the user's Google Ads data.

### Fixed
- **Public `/connect` no longer throws background auth errors for signed-out users.** The shared app shell was still calling `/api/subscription` and `getUsageSummaryAction()` on the unauthenticated Claude connector page, which produced noisy 401s plus a background `POST /connect/claude-connector` 500 from `getSessionAuth()` throwing inside `getUsageSummaryAction`. The app layout and user menu now gate subscription/usage fetches on an authenticated session, so signed-out onboarding traffic loads cleanly without server-action failures.

## [0.3.0.18] - 2026-04-29

### Changed
- **Claude connector onboarding now defaults back to the Claude Desktop / Cowork path.** Bare `/connect` now resolves to `/connect/claude-connector` again, while explicit setup routes (`/connect/claude-code`, `/connect/codex`, etc.) now preserve the user’s chosen tab through OAuth/account-selection instead of snapping everyone back to the connector flow. The pre-connect copy no longer implies Claude Code is the primary setup path.
- **Claude connector setup now deep-links into Claude Desktop and the add-connector modal.** Step 1 offers an explicit `claude://claude.ai/settings/connectors?modal=add-custom-connector` CTA for users with Claude Desktop installed, plus a direct web fallback to `https://claude.ai/settings/connectors?modal=add-custom-connector`.
- **The `/connect` client chooser is now much more explicit.** The old thin tab strip has been replaced with larger selection cards, short descriptions, and a recommended badge on the Claude Desktop / Cowork path so users can tell they need to choose a client before following the steps.
- **Claude connector marketing/setup copy now includes Claude Desktop.** The public setup guide, FAQ, CTA links, and support-notification labels now refer to Claude Desktop alongside Claude.ai Web and Claude Cowork, keeping the copy aligned with the actual supported surfaces.

## [0.3.0.17] - 2026-04-29

### Fixed
- **OAuth token endpoint no longer issues tokens against expired sessions.** Previously `app/api/oauth/token/route.ts` only checked that the bound `mcp_session` row existed, not that it was still valid. When a session ticked past expiry between `/api/oauth/authorize` (which filters by `expires_at >= now()`) and the token exchange, the endpoint silently issued an `oat_…` token with `expires_in: 0` — the MCP request handler would then 401 every call, the client interpreted that as a bad token, and re-ran the OAuth dance. Tight retry loop on Claude Desktop reconnects, visible as repeated `GET /api/oauth/authorize ... 307` in dev server logs with the same `state` and a fresh PKCE pair on every attempt. The endpoint now requires `mcp_sessions.expires_at >= now()` and returns `invalid_grant` (400) with a clear "reconnect at /connect" message instead, so the client surfaces a real error instead of looping silently.
- **OAuth access tokens no longer rotate-overwrite each other on concurrent exchanges.** The previous design stored one token per client in `oauth_clients.oauth_access_token`, UPDATE-rotated on every code exchange. Two concurrent exchanges for the same `client_id` (e.g. Claude Desktop reconnect spawning parallel OAuth flows, or Claude Desktop + Codex CLI sharing pre-bound credentials) would silently invalidate the earlier token. Tokens now live in a new `oauth_access_tokens` table — one row per issued token — so concurrent exchanges produce independently-valid tokens. The MCP request handler resolves `oat_…` bearer tokens via the new table joined to `mcp_sessions` for the expiry check. Migration `0028_add_oauth_access_tokens.sql` creates the table and backfills currently-set `oauth_clients.oauth_access_token` values so in-flight Claude Desktop sessions keep working across the deploy. `oauth_clients.oauth_access_token` is now deprecated and read by no code path; a follow-up migration will drop the column after one release.

### Migration required
- Run `npm run db:migrate` (or apply `drizzle/0028_add_oauth_access_tokens.sql` directly) before deploying. The new table is required by the request-handler read path; the backfill preserves currently-active tokens.

## [0.3.0.16] - 2026-04-28

### Changed
- **Marketing site repositions NotFair from "ask Claude about your ads" to "run Google Ads from Claude."** Homepage hero, examples, flow steps, capability cards, audience cards, FAQ, pricing copy, and footer all shift the value prop from analysis-and-questions toward execution-with-approval. Hero subhead becomes "Tell Claude what you want to change. NotFair drafts the campaign edits and executes them only after you approve." Use cases now show concrete operator workflows (move keywords into tighter ad groups, create ads for new service pages, clean up search terms) instead of analytic prompts. Audience cards reorder hands-on operators ahead of agencies. Pricing header reframes the free tier around finding waste and the paid tier around approval-gated execution. Site metadata, marketing-page FAQ, and footer tagline updated in lockstep so the open-graph/SEO surface matches.

## [0.3.0.13] - 2026-04-27

### Changed
- **`/connect` defaults to the Claude Code tab.** New users landing on the bare `/connect` URL (post-OAuth signup, sidebar nav, demo-banner CTA) now see the Claude Code setup path instead of the Claude.ai connector. Last-7-day analysis showed Claude Code accounts for 65.6% of first-time-user operations vs 29.0% for the Claude.ai/Claude-Desktop connector — and Claude Code first-time users write at 72% vs 53% for the connector. Defaulting to the higher-converting surface aligns onboarding with where new users actually do their work. Explicit deep links (`/connect/claude-connector`, `/connect/codex`) are unchanged. See `docs/analysis/2026-04-27_first-time-user-surface-mix.md` for the full data.
- **`AuditHelpPanel` now renders on `/connect`** to give stuck setup users the same email/book-demo escape hatches available on `/audit`. The panel's `onChatClick` prop is now optional so the chat-agent button only renders where a chat surface exists (audit drawer); on `/connect` the panel shows email and book-demo only.

## [0.3.0.12] - 2026-04-27

### Added
- **`summarizeAccountSetup` MCP tool.** One-shot, human-readable snapshot of how the account is configured: currency + time zone, every non-removed campaign with its named bidding strategy and tCPA/tROAS in major units, every conversion action with category + `primary_for_goal` flag, plus diagnostic notes when the setup is unusual (no primary conversion action, mixed value-mode/count-mode bidding). Designed to be the FIRST tool an agent calls in any strategic conversation, before reaching for `runScript` — the LLM gets the conversion hierarchy and bidding posture as named strings up front, eliminating the BiddingStrategyType integer-translation step that has historically caused misreads (10=MAXIMIZE_CONVERSIONS, 11=MAXIMIZE_CONVERSION_VALUE, 9=TARGET_SPEND, 15=TARGET_IMPRESSION_SHARE — easy to swap when reading raw integers). Replaces what would otherwise be 3+ `runScript` round-trips for the canonical setup question. Tool description and MCP server-level routing instructions both promote it as the entry point for "how is my account configured?" / "what's my bidding strategy?" / "what conversion actions am I optimizing for?" questions.

### Changed
- **`queryConversionActions()` audit query selects `id` + `category`.** The shared GAQL builder in `audit/queries.ts` now returns the conversion action ID (so agents can reference actions stably) and the category enum (PURCHASE / SUBMIT_LEAD_FORM / DEFAULT / etc.) — previously only `name`/`type`/`status`/`counting_type` were selected, so agents had to issue a follow-up GAQL to recover category. The audit engine and the new `summarizeAccountSetup` tool both consume this widened query.
- **Extracted `isManagerOwnedConversionAction(cid, ownerCustomer)` helper** in `lib/google-ads/campaign-ops.ts`. The "is this conversion action inherited from a manager account?" check (resource-name compare against `customers/<cid>`) is now reused by both `readOnlyConversionActionReason` and `summarizeAccountSetup` instead of being inlined twice.

## [0.3.0.11] - 2026-04-26

### Added
- **`removeConversionAction` MCP tool.** Permanently deletes a conversion action via the canonical `ConversionActionService.remove` operation. Replaces the old "set status to REMOVED via update" pattern, which Google rejects with `request_error=18` (UNUSABLE_ENUM_VALUE). Telemetry over the last 30 days showed 9 of 71 `updateConversionAction` errors were agents trying this exact pattern; they now have a tool that works. Read-only conversion actions (GA4/UA/Floodlight imports, Smart Campaign auto-actions, manager-owned, etc.) are pre-flight rejected with the same friendly message used by `updateConversionAction`.
- **`mutable` and `readOnlyReason` fields on `getConversionActions` response.** Each row now reports whether `updateConversionAction` / `removeConversionAction` will accept it, and if not, why ("Conversion action X has type GOOGLE_ANALYTICS_4_PURCHASE and is read-only via the API. Modify it in the Google Ads UI or its source system."). Agents can filter `mutable: true` before bulk demote/promote sweeps instead of fan-out-and-discover. The pattern showed up in telemetry as one user firing 24 distinct mutate calls in 10 hours and another firing 10 in 10 seconds, all hitting read-only conversion actions.

### Changed
- **`updateConversionAction` schema drops `status: "REMOVED"`.** Google rejects this combination, so accepting it in the schema only routed agents to a guaranteed failure. Tool description now points agents at `removeConversionAction` for deletes and tells them to filter `getConversionActions` on `mutable: true` first.
- **Catch-side rewriter for `mutate_error=9` on conversion actions.** The type-based pre-flight in `updateConversionAction` (PR #72) catches the obvious read-only types but cannot detect every case, e.g. auto-generated `WEBPAGE_ONCLICK` lead-form conversions. When Google rejects with the cryptic `Mutates are not allowed for the requested resource. (mutate_error=9)`, we now wrap it with the same actionable explanation the pre-flight uses, while preserving the underlying error code for telemetry/grep. Verified empirically with `validate_only: true` against real GA-imported, GoogleHosted, StoreVisits, and lead-form conversion actions in `scripts/test-conversion-action-mutability.ts`.

## [0.3.0.10] - 2026-04-26

### Changed
- **`/dev` page customers tab loads ~10x faster.** Production timing showed every `/api/dev/customers` call took ~2.9s because `listDraftRecipientEmails()` was inside the response `Promise.all` and ran up to 5 sequential Gmail pages × N parallel `drafts.get` round-trips per request, every request. Split out to a new `/api/dev/customers/drafts` endpoint with a 5-minute server cache; the table renders immediately and "drafted" pills patch in async. Cold customers tab drops from ~3.0s → ~250ms.
- **60s in-memory cache on `/api/dev/customers` and `/api/dev`.** Repeat refreshes in the same warm Vercel function instance are now <5ms instead of re-running DB aggregations. Refresh button passes `?fresh=1` to bypass for the active tab.
- **Lazy-load tabs on `/dev`.** Page used to fetch customers + usage + outreach data on every mount, paying 3 cold round-trips before showing anything. Now only the active tab fetches; the other heavy tab (customers ↔ usage) is idle-prefetched after the active tab renders. Outreach defers until clicked.
- **Persist last-used `/dev` tab in localStorage.** Lands you on whichever tab you used last instead of always defaulting to customers.

## [0.3.0.9] - 2026-04-26

### Changed
- **`runScript` GAQL pre-flight catches the LLM's three most common authoring mistakes before they hit Google.** Live telemetry showed `runScript` errors fell from 75.7% (2026-04-25) to 36.3% (today) after the date-literal rewrite shipped, but ~70 of today's 114 errors are still LLM-authored schema mistakes that Google round-trips before rejecting. The server now rejects three classes pre-flight: (a) `FROM change_event` without a `change_event.change_date_time` filter in WHERE — agents kept writing `segments.date DURING ...` which silently fails with `change_event_error=3`; (b) `metrics.*` selected from `FROM conversion_action` — that resource carries dimensional fields only, so the metric list is incompatible (`query_error=49`); (c) numeric enum literals in WHERE for `campaign.status`, `ad_group.status`, etc. — agents pasted proto numeric codes; Google requires the string name. Each rejection names the exact fix (which clause to add, which valid value to use) so the next attempt converges instead of guessing.
- **Auto-clamp out-of-window `change_event.change_date_time` lower bounds.** When the agent's lower bound is older than today − 29 days, the server rewrites it to today − 29 days before sending. This kills the `change_event_error=2` ("start date is too old") class outright — same strategy as the `LAST_90_DAYS → BETWEEN` rewrite shipped in 0.3.0.6.
- **`enrichGaqlError` now adds tips for query_error=16, query_error=18, query_error=53, change_event_error=2, and change_event_error=3.** Each tip names the exact next move: which field to add to SELECT (16), the valid string enum names (18), how segment/metric incompatibility resolves (53), and the change_event window/filter requirements (2, 3).
- **`runScript` tool description gains a "Common Gotchas" section.** Lists the change_event filter requirement, enum-string rule, and `metrics.*`-not-on-`conversion_action` rule, so agents avoid the mistakes the validators would otherwise have to catch.

## [0.3.0.8] - 2026-04-26

### Added
- **Audit recommendations are one-click applyable (dark-launched behind `FEATURE_AUDIT_APPLY`).** Each pass-item on `/audit` with a dispatchable `actionType` (pause campaign/keyword/ad, add negative, update budget, update bid) renders an Apply button that runs the underlying Google Ads write through the existing `execWrite` path with full guardrails and operations logging. Successful applies show a green check + Undo button; Undo replays a stored inverse `ToolCall` so every apply is a two-way door. Apply All (≥2 dispatchable items per pass) batches in parallel and uses an EventTarget pubsub so individual cards flip to their terminal state without a full re-render. A new `audit_applies` table records `(snapshot_id, pass_key, index)` with a unique index for idempotency, and an advisory-locked two-phase claim protocol guarantees concurrent applies of the same recommendation across tabs/windows can't double-write Google. Per-action TTLs (6h budget/bid, 24h pauses/negatives) prevent stale recommendations from being applied. Stale-claim recovery reclaims orphan rows after 30s if a phase-2 write process crashes mid-write. Fully unit-tested dispatcher (28 tests covering every action type, missing fields, invalid values, and round-trip undo). Feature flag is OFF by default in prod; the legacy text-only fallback continues to render until the flag flips.
- **Chat-followup eval suite (`scripts/eval-mcp/prompts-chat.json`).** Six real failure-mode prompts from production chat sessions encoded as testable single-turn scenarios with per-prompt judge criteria: apply-after-audit ("YES FETCH NOW"), forecast-then-build, zero-impressions diagnosis (English + Chinese), connection confusion, and mid-turn recovery ("retry"). Eval harness now accepts `--prompts <file>` to swap prompt sets and `EVAL_ALLOW_WRITES=1` to opt in to write-flavored prompts; per-prompt criteria thread into the judge prompt as a case-specific addendum so failure modes get caught even when the response otherwise reads fine.

### Changed
- **`/audit` page persists snapshots with full PassItem structure, not just `{action, impact}` text.** Apply cards need `actionType`, `campaignId`, `adGroupId`, `targetId`, etc. to dispatch. Old snapshots without these fields render text-only; a re-run of the audit regenerates them with the structured fields.

## [0.3.0.7] - 2026-04-26

### Added
- **Structured `nextTool` routing hint on every write rejection.** When a write tool can identify a better tool for the agent to call next (negative-keyword pause, guardrail trip, hallucinated removal plan), the response now carries a typed `nextTool: { name, reason, args? }` field on `structuredContent` alongside the prose `error`. Agents that follow the new MCP server instruction read `nextTool` and call that tool with `nextTool.args` instead of retrying the failed call. Production traces showed agents retrying the same failed call 13–52× because the old prose-only "Call X instead" message was repeatedly ignored. `nextTool.name` is constrained to a known string union so typos can't silently misroute. The bulk path (`bulkPauseKeywords`, `bulkUpdateBids`, `bulkAddKeywords`) carries the same hint per validation issue, deduplicated stably across calls.

### Changed
- **`pauseKeyword` short-circuits on negative criteria before the API call.** A single pre-query (LIMIT 5000, with a targeted fallback for larger campaigns) detects "agent tried to pause a negative" and returns a structured `removeNegativeKeyword` hint without burning an API round-trip. Saves quota and gives the agent a typed routing signal on the first try.
- **`removeNegativeKeyword` rejection now lists the campaign's actual negative keywords (top 20 + overflow count) when the requested keyword isn't found.** When an agent built a hallucinated removal plan from search-term data, it would issue 50+ `removeNegativeKeyword` calls in a row with text that didn't exist. The rejection now surfaces ground truth so the agent can abandon the bad plan after one call. Match types are formatted via `MATCH_TYPE_NAME` with an `UNKNOWN` fallback (never a misleading `PHRASE` default).
- **`updateBid` and `updateCampaignBudget` guardrail rejections now carry `nextTool: setGuardrails`** with concrete args derived from the requested change. Agents previously re-tried the same mutation 5+ times despite a clear "Call setGuardrails with X" prose message.
- **MCP server-level instructions tell agents how to handle write rejections.** Agents are now told to check `structuredContent.nextTool` before retrying, and to treat surfaced entity lists (e.g., "Campaign has these negatives: …") as ground truth that supersedes their planning data.

## [0.3.0.6] - 2026-04-25

### Fixed
- **`updateConversionAction` no longer fails silently on read-only conversion actions.** When an agent tried to demote a Google Analytics 4 import, Firebase action, Floodlight, manager-inherited, or other read-only conversion action, Google returned a cryptic `mutate_error=9: Mutates are not allowed for the requested resource` and the agent had no way to know why. We now pre-flight check `conversion_action.type` and `conversion_action.owner_customer` and return a clear, actionable error like *"Conversion action 7453416887 has type GOOGLE_ANALYTICS_4_PURCHASE and is read-only via the API. Modify it in the Google Ads UI or in its source system."* This was responsible for ~12 failed mutates per day in production.
- **`updateConversionAction` no longer issues an empty mutate when only `primaryForGoal` is being changed.** Previously the function unconditionally called `mutateResources` with a resource containing only `resource_name`, which Google rejects (the google-ads-api library doesn't strip snake_case `resource_name` from the derived field mask). Now it skips the bare mutate and goes straight to `setPrimaryForGoal`. When `primaryForGoal` is the only requested change and the underlying mutate fails, it surfaces a hard error instead of a silent warning.

### Changed
- **`runScript` GAQL queries auto-rewrite invalid `DURING` literals.** GAQL only supports a fixed set of date literals (TODAY, YESTERDAY, LAST_7/14/30_DAYS, THIS_MONTH, LAST_MONTH, LAST_BUSINESS_WEEK, LAST_WEEK_MON_SUN, LAST_WEEK_SUN_SAT, THIS_WEEK_MON_TODAY, THIS_WEEK_SUN_TODAY) — agents routinely emit `LAST_60_DAYS`, `LAST_90_DAYS`, `LAST_180_DAYS`, `THIS_YEAR`, or `LAST_YEAR`, and Google rejects them with `Invalid date literal supplied for DURING operator`. The server now translates these to a deterministic `BETWEEN 'YYYY-MM-DD' AND 'YYYY-MM-DD'` clause before sending to Google. This was responsible for ~91 failed `runScript` calls per day in production (~53% of all `runScript` errors).
- **`runScript` tool description documents the supported date literals.** Added an explicit "DATE LITERALS" section that enumerates the 12 valid `DURING` values, names the common invalid ones, and shows the `ads.helpers.getDateRange(90)` + `BETWEEN` pattern for windows >30 days.
- **GAQL error messages now include self-correcting hints.** On `query_error=32` ("Unrecognized field"), the error appends *"call `getResourceMetadata('<resource>')` for the valid field list"*. On `query_error=49` (metric/resource incompatibility), it suggests trying a different `FROM` resource. On `query_error=22` (invalid date literal), it lists the supported set and points to `BETWEEN`. Agents self-correct on retry instead of repeating the same broken query.
- **The prebuilt `ads.queries.conversionActions` query now selects `conversion_action.owner_customer`.** Lets `runScript` agents filter out manager-inherited conversion actions client-side before attempting any mutation.

## [0.3.0.5] - 2026-04-25

### Changed
- **"Need help?" click on `/connect` pings Slack again.** Restored the fire-and-forget Slack notification (`notifyHelpClicked`) so the team sees in real time when someone opens cal.com from the header pill — including which setup tab they were on (Claude Code / Claude Cowork-Web / ChatGPT-Codex), connection status, and page URL. Cal.com still opens immediately on click; the Slack ping is async and never blocks the navigation. Also restored `active_tab` and `code_sub_tab` fields on the `setup_need_help_clicked` PostHog event so help-clicks can be attributed to setup path. `notifyHelpClicked` now recognizes the `'codex'` tab.

## [0.3.0.4] - 2026-04-25

### Added
- **`/connect` now supports ChatGPT and Codex.** New "ChatGPT / Codex" tab uses bearer-token auth (instead of OAuth) and shows the MCP server URL plus your API key, with paste-ready instructions for ChatGPT custom connectors and a `~/.codex/config.toml` snippet for Codex CLI. Tab default labels updated: "Claude Connector (Web / Cowork)" → "Claude Cowork / Web". The /connect setup view now spans three clients instead of two.

### Changed
- **"Need help?" moved into the `/connect` page header.** Replaced the bottom green CTA box with a small persistent outlined pill in the page header (alongside Copy/Rotate API Key). Visible in every state — sign-in, account select, post-token setup — instead of only at the bottom of the setup view. Clicking opens cal.com directly. Removed the "Send a ping instead" secondary action and the Slack notification on click.
- **Removed the "Set up your client" heading** above the tab switcher on `/connect`. The tabs themselves serve as the framing.

### Removed
- **Server actions `requestSetupHelp` and `notifyHelpClicked` are no longer called from the UI** (functions remain in `app/actions.ts` for now). The email-ping fallback flow is gone. Use the Need help? button to book directly.

## [0.3.0.2] - 2026-04-24

### Added
- **Prominent "Need help?" CTA on `/connect` once you're set up.** A bright green card under "Set up your client" leads with a one-click **Book a 30-min call** button that opens cal.com directly. The team gets a real-time Slack ping the moment someone clicks (with which setup tab they were on, whether their account is connected, and the page URL), so we can reach out before they bounce. The existing email-ping fallback stays available as a smaller secondary action. Cal.com link is now centralized in `lib/links.ts` and shared between this page and the audit help panel.

## [0.3.0.1] - 2026-04-25

### Added
- **`listKeywords` MCP read tool for safe mutation prep.** Returns typed keyword inventory with safety defaults (`positive: true`, `enabledOnly: true`, `excludeRemovedParents: true`) plus optional campaign/ad group filters, bid fields, and quality-score fields. Keeps exploratory analytics in `runScript` while giving agents a predictable way to fetch keyword criterion IDs before bulk mutations.

## [0.3.0.0] - 2026-04-24

### Fixed
- **Monthly op quota no longer self-amplifies when a user crosses their cap.** `getUsageCount` used to include every `operations` row — including rate-limit rejections and network throws that never touched Google — so a rate-limited retry loop would write 20+ `RATE_LIMIT` log rows per `gaqlParallel` and each of those rows counted toward the next quota check. Filter now only counts real work: `errorClass IS NULL OR errorClass = 'WRITE_REJECTED'`. Cache and DB tallies now always agree.
- **`ads.gaqlParallel` now surfaces `RateLimitError` to the script instead of burying it in an `{ error }` map.** When a user was at their cap, all N parallel tasks threw `RateLimitError`, `Promise.allSettled` caught each one, and the script saw N indistinguishable error entries — then cheerfully called `gaqlParallel` again. Added a pre-check (`enforceRateLimit` before fan-out, so a user already over cap pays zero log rows) plus a post-check (any task rejected with `RateLimitError` re-throws). Non-rate-limit errors still stay soft per-task so partial results are usable.
- **`runScript` handler now gates sandbox execution on the monthly cap.** Empty scripts (`return 42;`) or infinite loops (`while(true){}`) previously charged zero ops and consumed up to 45s of QuickJS CPU per call — a user at quota could keep firing sandbox executions indefinitely. Added `enforceRateLimit` at the tool-handler boundary so the cap protects server compute, not just Google API calls.

### Added
- **Local MCP dev-auth bypass for iteration.** When `NODE_ENV=development` and `DEV_LOCAL_EMAIL` is set, `/api/[transport]` resolves unauthenticated calls to the most recent valid `mcpSession` for that email. Subagent MCP clients that can't do OAuth dynamic client registration against localhost (like `/eval-mcp` runners) now hit the dev server with real Google Ads credentials and iterate in seconds. Triple-gated: dev-only env, explicit email opt-in, and only fires when no `Authorization` header is sent. Tagged `authMethod: "dev-local"` so telemetry stays clean.
- **21 new tests for runScript op-counting fidelity** (`lib/mcp/code-mode/ads-client-quota.test.ts`). Locks down per-query charging, validation-error short-circuits (no phantom charges when a script passes a bad argument), `RateLimitError` propagation, non-rate-limit error isolation, and the "bootstrap surface is free" invariant. Plus one test in `lib/__tests__/rate-limit.test.ts` that inspects the `getUsageCount` WHERE clause and asserts `RATE_LIMIT` and `THROWN` are NOT listed as counted error classes — guards against a future filter edit silently re-breaking the self-compounding overage.

## [0.2.24.0] - 2026-04-24

### Changed
- **MCP read surface pared down to 8 tools.** `runScript` is now the single path for every analytical read against a Google Ads account — audits, dashboards, diagnostics, CPA-by-campaign, wasted-spend analysis. One call, one GAQL fan-out, full correlation across spend / search terms / change events / quality scores. The 25 prior point-query read tools (`listCampaigns`, `getKeywords`, `getTimeseries`, `getWasteFindings`, `getCampaignPerformance`, `getSearchTermReport`, `getLandingPagePerformance`, `getImpressionShare`, `getAccountChanges`, and others) are gone from the MCP wire surface because MCP clients don't reliably forward the server's `instructions` field into the model's prompt, so having parallel point-query tools quietly out-competed runScript on every analytical question.
- `MCP_INSTRUCTIONS` and the `runScript` tool description now explicitly name the non-GAQL exceptions — `searchGeoTargets`, `getRecommendations`, `getKeywordIdeas`, `getChanges`, `reviewChangeImpact`, `getResourceMetadata`, `listQueryableResources` — so the model knows when to reach for a dedicated tool vs. `runScript`.
- Playbooks (`adsagent://playbooks/audit-account`, `adsagent://playbooks/explain-regression`) replaced with runScript-centric recipes: single `ads.gaqlParallel` call with 4 queries, correlated in-script, ranked findings returned.
- Marketing page (`/google-ads-mcp-server`) now leads with `runScript` as the primary read surface.

### Fixed
- `ads.gaqlParallel` code examples in `MCP_INSTRUCTIONS` and both playbooks previously demonstrated bare string arrays, but the sandbox requires `[{name, query, limit?}]` objects — every copied pattern would have crashed the runScript sandbox. Rewrote all examples to the correct object form with `.rows` destructuring.
- 10 write-tool parameter descriptions pointed at deleted read tools ("from getKeywords", "from getConversionActions", "from listCalloutAssets", "from listNegativeKeywordLists", "from getPmaxAssetGroups"). Replaced each with the equivalent `runScript` GAQL query hint.

## [0.2.23.1] - 2026-04-22

### Added
- Developer accounts (listed in `DEV_EMAILS`) now resolve to an unlimited Growth-equivalent plan without a paid Stripe subscription, so rate limits and feature gates behave as if those accounts were on Growth. A real Stripe subscription still takes precedence when present.

## [0.2.23.0] - 2026-04-21

### Changed
- Home page hero repositioned around dual-audience value prop: "Every Google Ads campaign deserves your best work. AdsAgent gives Claude the tools to analyze and execute across Google Ads, CRM, GA4, and Search Console." Drops the defensive "no commissions, best interest at heart" framing that only spoke to self-managing operators and missed the agency execution story entirely.
- "What you get" section rewritten around cross-system analysis, execution (not just reporting), playbook-at-scale, and full transparency — the value props that resonate with both small-business operators and agency owners managing client rosters.

### Added
- New "For agencies" section (Briefcase/DollarSign/Shield cards): scale your playbook, smaller accounts become profitable, raise the quality floor. Speaks to agency owners who want consistent execution across a roster without adding headcount.
- New "For small business owners" section (Scale/Layers/UserCheck cards): work that never fit your budget, one brain across your whole stack, you stay in the driver's seat. Speaks to operators who already run their own ads but want depth no freelancer would do at their spend.
- `AudienceSection` component extracted locally in `home-page.tsx` to eliminate duplicated section scaffolding (motion wrapper, header block, 3-card grid).

## [0.2.22.3] - 2026-04-21

### Fixed
- Reddit Pixel now strips unresolved `{{RDT_CID}}` template placeholders from the URL before initializing. When a Reddit campaign's URL tracking template contains a non-macro like `?rdt_cid={{RDT_CID}}`, Reddit leaves it as literal text — the pixel would then send the string `{{RDT_CID}}` as the `click_id`, triggering Reddit's "Invalid match key 'click ID'" event-quality warning on ~18% of PageVisits. We now detect `rdt_cid` values matching `{{...}}` and remove them via `history.replaceState` so Reddit's auto-appended real click ID wins.

## [0.2.22.2] - 2026-04-20

### Fixed
- Reddit Conversions API `action_source` must be uppercase (`WEBSITE`, `APP`, etc.), not lowercase. Prior releases sent `"website"` and Reddit returned `400 invalid action_source` on every server-side fire. Caught via `test_id` probe against Reddit's Test Events endpoint.

## [0.2.22.1] - 2026-04-20

### Fixed
- Reddit Conversions API now targets the v3 endpoint (`POST /api/v3/pixels/{pixel_id}/conversion_events`) with the v3 payload shape: `data.events[]`, `event_at` as unix-ms, nested `type: { tracking_type }`, `metadata` (not `event_metadata`), and a required `action_source` defaulting to `"website"`. The v2.0 endpoint the prior release targeted no longer exists in Reddit's docs, so every CAPI call was silently 404-ing.

## [0.2.22.0] - 2026-04-20

### Added
- Reddit Ads conversion tracking: client Pixel (PageVisit on every page, SignUp echo with advanced matching for authenticated users) plus server-side Conversions API for dedup-safe event delivery. Requires `NEXT_PUBLIC_REDDIT_PIXEL_ID` and `REDDIT_CONVERSION_ACCESS_TOKEN` env vars.
- First successful write now fires a Reddit `Lead` conversion so the pixel optimizer trains on AdsAgent's activation north star (D0-Write) instead of OAuth connects. Uses a stable `first-write-${userId}` conversion_id so concurrent bulk-write races dedupe.
- `getClientIp()` helper in `lib/request-ip.ts` — shared IP extraction for PostHog and Reddit CAPI callers.

### Changed
- In-process cache on the first-write check: once a user has any prior successful write, subsequent `logChange` calls short-circuit without hitting the DB. Bulk-write ops (`bulkUpdateBids`, `bulkPauseKeywords`) no longer pay N extra SELECTs.
- Exported `REDDIT_SIGNUP_ID_COOKIE` + `RedditConversionInput` so auth routes and the client tracker share one cookie name and one input type.

## [0.2.21.0] - 2026-04-19

### Fixed
- `bulkUpdateBids` was rejecting 100% of calls with "Bid changes not supported for 3 strategy" because the bidding strategy enum was compared as a raw number (`3`) against the string list `["MANUAL_CPC", "ENHANCED_CPC"]`. Added `normalizeBiddingStrategyName` so numeric, string, and numeric-string forms all resolve correctly. Manual-CPC campaigns now work again; auto-bidding campaigns return a clear "switch to MANUAL_CPC or let the strategy handle bids" message.
- `moveKeywords` now auto-retries up to 3 attempts with jittered backoff when Google Ads returns transient `database_error=2` ("Multiple requests were attempting to modify the same resource. Retry the request."). Eliminates ~20 failures/week that required no human action.
- `pauseKeyword` and `bulkPauseKeywords` now detect "Negative ad group criteria are not updateable" and rewrite the error with a pointer to `removeNegativeKeyword`. Tool descriptions updated so agents call the right tool first try.
- Policy violations on `createCampaign`, `bulkAddKeywords`, and `updateAdAssets` now parse `PolicyViolationDetails` from the Google Ads failure and return a readable message like `"TRADEMARK on text \"Nike\""` instead of the opaque `policy_violation_error=2`.
- Budget and bid guardrail rejections (`updateCampaignBudget`, `updateBid`) now include concrete `setGuardrails` args in the error message, so agents can parse the exact threshold to request instead of guessing.
- Mutate catch blocks now recognize `context_error=3` / "operation is not allowed for removed resources" and emit an entity-specific message pointing at `listCampaigns` / `listAdGroups` / `listAds` so agents stop retrying against tombstoned entities.
- Telemetry `operations` rows with `error_class='THROWN'` or `'RATE_LIMIT'` now populate `error_message` (previously `NULL`). The bug lived in the shared `execRead` / `execWrite` wrappers, so every MCP read and write tool benefits. Closes 14 diagnostic-blind failures/week.
- `bulkUpdateBids` GAQL pre-check now filters non-integer criterion IDs before interpolation, preventing `IN (123,NaN,456)` from failing the entire batch.

### Changed
- `pauseKeyword` / `bulkPauseKeywords` tool descriptions clarify "POSITIVE keywords only" and point to `removeNegativeKeyword` for negatives.
- `removeNegativeKeyword` description now includes the word "pause" so LLM semantic search routes there.
- `addNegativeKeyword` description notes it is the re-enable path for negatives (Google Ads has no "enable" state for negatives).

## [0.2.20.1] - 2026-04-19

### Fixed
- `change_event` query in `audit` now includes an upper bound on `change_date_time` (Google Ads rejects one-sided date filters on this resource). Fixes `recentChange` and `recentChanges` coming back empty immediately after the v0.2.20.0 deploy.
- Audit error reporting now uses `extractErrorMessage` so `GoogleAdsFailure` objects produce readable messages instead of `[object Object]`. Also fixes the pre-existing `campaign_assets` and `landing_pages` log lines.

## [0.2.20.0] - 2026-04-19

### Added
- `audit` MCP tool is now change-aware. Every audit pulls Google Ads `change_event` for the last 30 days and attaches a `recentChange` pointer to every campaign and every flagged item (wasted keywords, wasted search terms, mining opportunities, brand-leakage terms, negative conflicts, budget-constrained winners). When the pointer is populated, the finding's metrics pre-date the fix — agents re-evaluate instead of recommending work that's already done. Each `recentChange` carries `{ daysAgo, changedFields, operation, clientType, resourceType, otherChangesInWindow }` so callers can see "budget raised 2 days ago, 3 other edits this week."
- Per-campaign `metricsSplit` splits spend/clicks/conversions/CPA into `before` vs `after` buckets around the campaign's most recent edit, with `cpaDelta` and `dailySpendDelta` for quick post-change judgment.
- Top-level `recentChanges` list surfaces every account edit in the window, including edits from the Google Ads UI (not just MCP writes) — `client_type` tells the agent where the change came from.
- Tool description now instructs the agent to prefer `metricsSplit.dailySpendDelta` over the aggregate `budgetLostIS` when `changedFields` includes `amount_micros` or bidding fields, since impression-share metrics reflect the full 30-day window and lag post-change reality.

## [0.2.19.3] - 2026-04-19

### Fixed
- `/dev/telemetry` dashboard now reports honest invocation counts for bulk MCP tools. Before: `bulkPauseKeywords`, `bulkAddKeywords`, `bulkUpdateBids`, `moveKeywords`, `updateCampaignSettings`, `createCampaign`, `setTrackingTemplate`, `uploadClickConversions`, and `updateCampaignLanguages` inflated call counts 5-7× because each fan-out item wrote its own row. The dashboard now dedupes by `request_id` across `topTools`, `topArgShapes`, and `dailyCounts`. Latency percentiles are computed per-invocation so one slow bulk call isn't weighted 25× in p50/p95.
- MCP bulk-tool telemetry now records real latency instead of 0 ms. The per-item `execWrite` stub path (`async () => result`) resolved in microseconds, so every fan-out row logged `latency_ms = 0` — 281/281 rows in the wild. Bulk handlers now measure the real Google API call themselves and thread the latency through a new `overrideLatencyMs` option on `execWrite`. Dashboards will start showing real write latencies for bulk tools immediately after deploy.

## [0.2.19.2] - 2026-04-16

### Changed
- MCP write operation counting now matches Google Ads API mutate-quota accounting more closely. Every returned `WriteResult` is logged and counted — including failed attempts that were previously silently dropped. Bulk tools (`bulkUpdateBids`, `bulkPauseKeywords`, `bulkAddKeywords`, `moveKeywords`) count each keyword in the batch, whether Google accepted or rejected it. Single-op writes (`pauseKeyword`, `updateBid`, etc.) now count their failures too, where they used to only count successes. The daily limit on `/usage` can no longer under-report relative to Google's mutate quota; it may over-count slightly when our pre-validation rejects an input Google never sees, which is the intended direction.
- Change history (`getChanges`), impact analysis (`getImpact`), and undo (`getUndoableChange`) filter to real changes only, so the user-facing history shows successes only as before.
- New `ai_change_failed` PostHog event fires on every failed write through `execWrite`. Pairs with `ai_change_executed` to compute per-tool failure rates.

### Fixed
- `/usage` chart hourly count now reflects true daily API pressure, not just successful changes. A misbehaving bulk call that Google rejects is now visible as usage instead of invisible.

## [0.2.19.1] - 2026-04-15

### Fixed
- MCP `client_name` telemetry now correctly attributes Claude Code plugin traffic instead of the `mcp-remote-fallback-test` sentinel. The `mcp-remote` wrapper the Claude Code install instructions use does not forward the downstream client's `clientInfo.name`, so 100% of Claude Code sessions were mis-tagged. `app/api/[transport]/route.ts` now normalizes the fallback to `claude-code` based on auth method and user-agent, both on first-initialize capture and on every subsequent request. Existing sessions in Supabase were backfilled.

## [0.2.19.0] - 2026-04-13

### Added
- Inline "Reach out" panel on every customer detail page (`/dev/[accountId]`) — for connected customers who went dormant, compose a personalized email, save it as a Gmail draft, and send via Gmail so the full thread stays in your inbox. Shows last 15 Gmail threads with that customer and the date you last contacted them
- Panel is collapsible, remembers open/closed state per customer in `localStorage`, and loads Gmail threads lazily only on expand — browsing customer detail pages triggers zero Gmail API calls until you actually reach out
- New migration `0018_add_contact_kind.sql` adds a `kind` column (`lead` | `customer`) to the `contacts` table so the `/dev` Leads tab stays cleanly scoped to cold prospects while customer re-engagement drafts live in the same schema

### Changed
- `DraftEditor` now takes `onSave` / `onSend` callbacks instead of reaching for server actions directly, so the lead profile and customer detail pages can share the same editor without coupling to a single identifier type
- `getContactsAction` filters the Leads tab to `kind='lead'`, so customer outreach drafts never pollute the cold-prospect pipeline
- `ThreadCard` extracted to `components/outreach/thread-card.tsx` and shared between the lead profile page and the new customer outreach panel

### Fixed
- Customer outreach state is now read-only on load — visiting a customer detail page never creates a contacts row. Rows are created lazily on first draft save via `upsertCustomerContactByEmail`, preserving existing `kind` if the email was already tracked as a lead

## [0.2.18.0] - 2026-04-13

### Added
- Internal mini-CRM on each contact's profile page at `/dev/contacts/[id]` — see the full Gmail thread history with a contact, edit drafts inline, and send directly via Gmail so sent mail and replies land in your own inbox
- Contact rows on `/dev` now link straight to the profile with prefetch, so opening a contact feels instant
- New migration `0017_add_gmail_draft_id.sql` adds `contacts.gmail_draft_id` so saved drafts stay in sync with Gmail Drafts across sessions

### Changed
- All outreach server actions (`getContactsAction`, `importContactsAction`, `deleteContactAction`, `scheduleContactAction`, `sendOutreachAction`, and the new Gmail actions) now require a dev session — previously unauthenticated callers could hit the RPC endpoints directly and dump/mutate contacts
- `sendDraftViaGmailAction` skips a redundant Gmail API call when a draft is already synced, shaving one round trip off every send
- Gmail thread lookup caches results for 45 seconds per contact email and invalidates on save/send, cutting ~16 Gmail API calls per profile page navigation
- `saveDraftAndSyncGmailAction` surfaces Gmail sync failures to the editor instead of silently swallowing them

### Removed
- Dead code: `saveDraftAction` (zero callers anywhere in the repo)
- Inline draft expand panel on `/dev` — replaced by the dedicated profile page

## [0.2.17.0] - 2026-04-13

### Changed
- Dev page "API Usage by Day" chart now renders in chronological order (oldest → newest) and fills missing days with zeros, so gaps in activity are visible instead of being silently collapsed
- Added summary stat cards above the chart: 30-day total (with active-day count), reads share, writes share, average per active day, and peak day

## [0.2.16.1] - 2026-04-09

### Fixed
- Campaign detail page top-line metrics (impressions, clicks, cost, conversions) now sum from the same date-filtered history data as the performance chart — previously used lifetime/all-time values from `listCampaigns` which never matched the chart

### Added
- Smart campaign support on the campaign detail page: keyword themes table, business info (name, URL, phone), and Smart badge on the Ad Copy section
- `getCampaignKeywordThemesAction` and `getSmartCampaignSettingAction` server actions for fetching Smart campaign-specific data
- `getSmartCampaignKeywordThemes` and `getSmartCampaignSetting` reads in `lib/google-ads/reads.ts`
- `smart_campaign_ad` fields in `listAds` query with RSA fallback logic (prefers RSA if populated, otherwise uses Smart ad fields)
- `metrics.conversions` in campaign history query

### Changed
- Campaign detail page uses 2-phase fetch: core data always, Smart-specific data only when campaign type is SMART (avoids 2 unnecessary API calls for non-Smart campaigns)
- `totals` now computed via single-pass `useMemo` reduce over history rows instead of 4 separate reduce passes

## [0.2.16.0] - 2026-04-08

### Added
- `searchGeoTargets` MCP tool: search for geo target locations by name (cities, counties, states, countries) and get their IDs for use with `updateCampaignSettings` location targeting and exclusions. Enables fully self-contained location targeting workflows without leaving the AI conversation.

## [0.2.15.1] - 2026-04-08

### Changed
- Split `lib/google-ads.ts` (3,703 lines) into 9 focused modules under `lib/google-ads/` for better maintainability: types, client, helpers, reads, writes, campaign-ops, bulk, settings, and barrel index

## [0.2.15.0] - 2026-04-08

### Fixed
- Impersonation now hard-fails when target session expires (prevents accidental writes to wrong account)
- `resolveAccountId` throws on invalid account IDs instead of silently falling back to default
- OAuth token endpoint enforces `redirect_uri` match per RFC 6749 S4.1.3
- Rate limit bypass in `createCampaign` and `setTrackingTemplate` (API was called before rate check)
- `findKeywordContext` uses `safeEntityId` for consistent validation instead of raw `Number()`
- Guardrail error messages now reference `setGuardrails` (previously referenced unreachable `setGoals`)

### Added
- `setGuardrails` / `getGuardrails` MCP tools for customizing bid, budget, and pause limits per account or campaign
- `DESTRUCTIVE_WRITE_ANNOTATIONS` for bulk/replacement operations (bulkPauseKeywords, bulkUpdateBids, updateAdAssets, moveKeywords)
- `resolveToolAuth` helper to reduce auth boilerplate across 33 MCP tool handlers
- Query cache max-size eviction at 500 entries (prevents unbounded memory growth)
- Parallel pre-check queries in `bulkPauseKeywords` (Promise.all instead of sequential)
- 42 new tests: undo system (23), rate limiting (12), execution layer (7)

## [0.2.14.0] - 2026-04-08

### Added
- `updateCampaignBidding` MCP tool: change a campaign's bidding strategy (TARGET_CPA, MAXIMIZE_CONVERSIONS, TARGET_ROAS, MAXIMIZE_CLICKS, MANUAL_CPC) with target CPA and ROAS support
- Full undo support for bidding strategy changes via `undoChange`
- Validation guardrails: minimum $0.10 target CPA, positive ROAS required, required params enforced per strategy
- 18 new tests covering all bidding strategies, validation paths, error handling, and protobuf wire format

## [0.2.13.0] - 2026-04-08

### Fixed
- MCP tool errors now return actual Google Ads API error messages instead of `[object Object]`
- `getResourceMetadata` and `listQueryableResources` now return results (fixed gRPC response destructuring)
- `getKeywords` Quality Score subcomponent fields (creative quality, predicted CTR, landing page quality) now work correctly

### Changed
- All 44 MCP tool handlers wrapped with error boundaries via `safeHandler` for consistent error reporting
- MCP server URL updated to canonical `www.adsagent.org` domain

## [0.2.12.0] - 2026-04-07

### Added
- Dev impersonation: select any account from the /dev page and see the app exactly as that user sees it, with full read/write access for debugging and support
- Amber "Viewing as" banner with stop button shows during impersonation
- Account switcher disabled during impersonation to prevent modifying the real user's session
- 17 tests covering impersonation session logic, API routes, and sign-out cookie clearing

## [0.2.11.0] - 2026-04-06

### Changed
- Landing page rewritten for SMB audience: pain-driven hero with mock audit preview, comparison table (Self-Manage vs Agency vs AdsAgent), vertical targeting (Legal, Home Services, Healthcare, Insurance), pricing tiers ($149/$349/$699), FAQ, and conversion-focused CTAs
- Font stack updated to match DESIGN.md: General Sans for headings, DM Sans for body, JetBrains Mono for code/data
- AI conversation demo now uses DESIGN.md's plumbing treatment (green left border + "Agent" label)
- "What you get" section restructured from 3-column icon grid to editorial divided list
- Section rhythm varied to break cookie-cutter feel (different padding per section, selective eyebrow labels)
- Final CTA left-aligned to match asymmetric layout from DESIGN.md
- Footer copy updated from developer jargon (MCP) to SMB-friendly language
- Vertical card colors corrected to on-brand palette (removed blue/violet)

### Fixed
- Touch targets on footer and pricing links now meet 44px minimum
- FAQ accordion now has proper ARIA disclosure attributes (aria-expanded, aria-controls)
- Added color-scheme: dark to html element for native dark UI controls
- CTA button now full-width on mobile to prevent overflow in pricing cards

### Added
- Scroll-triggered fade-in animations on stats bar and comparison table

## [0.2.10.0] - 2026-04-06

### Added
- Outreach metrics dashboard on the /dev page: bounce rate, reply rate, status pipeline, and per-domain bounce breakdown
- Unit tests for outreach metrics derivation covering all edge cases

### Changed
- Status colors unified into shared STATUS_CONFIG used by both pipeline bars and lead badges
- Metrics derived client-side from already-fetched contacts — no extra DB queries
- Refresh button now clears both stats and contacts cache

## [0.2.9.0] - 2026-04-06

### Added
- **Account Audit page** (`/audit`) — 7-dimension scoring engine evaluates conversion tracking, campaign structure, keyword health, search term quality, ad copy, impression share, and spend efficiency on a 0-5 scale, weighted to a 0-100 overall score
- Wasted spend analysis with dollar breakdown by category (non-converting keywords + irrelevant search terms) and annualized projection
- Impression share diagnosis using a 2x2 matrix (budget-lost vs rank-lost) with actionable recommendations
- Top 3 actions derived from the heuristics engine, sorted by estimated monthly savings
- Expandable detailed findings per dimension for any scoring 0-3
- Two-phase data loading: fast overview (4 parallel API calls) then detailed analysis (25 parallel per-campaign calls)
- Module-level client cache for instant return visits (stale-while-revalidate pattern)
- 29 unit tests for the scoring engine covering empty, well-optimized, and new account scenarios
- Audit nav item in sidebar and mobile bottom nav

## [0.2.8.0] - 2026-04-07

### Added
- Account budget overview on the dev page: total daily budget and active campaign count per connected Google Ads account
- Budget deduplication for shared campaign budgets so totals are accurate
- Proper currency formatting via `Intl.NumberFormat` with support for non-USD currencies
- Unit tests for budget summary function covering deduplication, edge cases, and empty states

### Changed
- Dev API route uses single `getAuthContext()` call instead of separate `getSession()` + `getSessionAuth()` queries
- Error handling in dev route now returns 500 for unexpected errors instead of blanket 403
- Campaign budget query filters to `ENABLED` campaigns only (was `!= REMOVED`, which included paused)

## [0.2.7.0] - 2026-04-05

### Added
- "Built for Claude" homepage positioning with Claude Code and Claude Cowork as primary AI clients
- Claude workflows section showing terminal, workspace, spend recovery, and A/B test use cases
- Conversation demo showing Claude managing Google Ads in natural language
- "Also works with" section for Cursor, Windsurf, and Claude Agent SDK
- Blog infrastructure: data store, rendering component, dynamic routes, and blog index page
- "What is MCP" blog post with FAQPage structured data
- Claude icon SVG asset for hero badge

### Changed
- Homepage hero cycles "Claude Code", "Claude", "AI agent" (previously included ChatGPT, OpenClaw)
- Homepage subtitle and 3-step onboarding rewritten for Claude-first messaging
- SEO metadata across site updated: title, description, keywords lead with Claude
- OG image updated: "Google Ads MCP built for Claude"
- Homepage FAQ rewritten with Claude-specific language and MCP explanation
- Sitemap now includes blog routes with per-post lastmod dates

## [0.2.6.1] - 2026-04-05

### Changed
- `addNegativeKeyword` now accepts a `matchType` parameter (BROAD, PHRASE, EXACT) instead of hardcoding PHRASE match
- `removeNegativeKeyword` accepts optional `matchType` to disambiguate when the same keyword text exists under multiple match types
- Undo operations for negative keywords now preserve the original match type instead of defaulting to PHRASE
- `listCampaigns` default limit increased from 20 to 100 so LLM clients see the full account
- Improved tool descriptions for `enableKeyword`, `moveKeywords`, `getImpressionShare`, `undoChange`, and `removeCampaign` to surface constraints and caveats that LLMs need

### Fixed
- `addNegativeKeyword` was sending match_type=2 (EXACT) while claiming PHRASE — now uses the correct enum mapping

## [0.2.6.0] - 2026-04-04

### Changed
- Keyword operations (pause, enable, update bid, remove) now log the keyword text alongside the criterion ID
- Operations page shows human-readable keyword names in the Entity column instead of raw IDs

### Added
- `label` column on `operations` table to store human-readable entity names
- `fetchKeywordText` helper to look up keyword text by criterion ID from Google Ads API

## [0.2.5.1] - 2026-04-04

### Changed
- Dev dashboard "Operations by Account" now shows the Google Ads account name alongside email and account ID
- Timestamps in the dev dashboard now display in the viewer's local timezone with timezone indicator

### Fixed
- Dev dashboard SQL query now handles null or empty `customerIds` without crashing

## [0.2.5] - 2026-04-04

### Added
- `removeCampaign` MCP tool for permanently removing Google Ads campaigns (sets status to REMOVED)
- `removeCampaign` tool in AI SDK agent for chat-based campaign removal
- Explicit undo handler for campaign removal with clear "permanent and cannot be undone" message

## [0.2.4] - 2026-04-03

### Added
- YouTube demo video embedded on landing page showing how to use AdsAgent MCP in Claude
- Privacy-enhanced embed (`youtube-nocookie.com`) to avoid tracking cookies before consent
- Tightened iframe permissions to minimum required for video playback

## [0.2.3] - 2026-04-03

### Added
- Dev dashboard (`/dev`) with API usage by day and operations by account, visible only to admin emails

## [0.2.2] - 2026-04-03

### Fixed
- `getCampaignSettings` now returns radius/proximity targeting (previously only fetched named locations, silently dropping PROXIMITY criteria)
- `listAds` metrics are now scoped to a configurable date range (default 30 days) instead of returning misleading lifetime totals

## [0.2.1] - 2026-04-02

### Changed
- Dashboard now loads in two phases: health score and metrics appear instantly, issues and opportunities load progressively in the background
- Non-converting search terms now show per-term intelligence explaining WHY each term isn't converting (CTR analysis, intent classification, landing page diagnosis)
- Issue descriptions are now campaign-level insights based on aggregate term patterns instead of generic text
- "Total Spend" metric renamed to "Spend (30d)" with explicit 30-day date filter on listCampaigns API
- Client-side cache keyed by account ID to prevent cross-account data leaks on account switch

### Removed
- AI Briefing component (Gemini LLM call that added latency without useful insight)

### Fixed
- Google Ads API v22 compatibility: removed deprecated `recommendation.impact.base_metrics/potential_metrics` fields
- Numeric enum returned by Google Ads API for `recommendation.type` now properly converted to string

## [0.2.0] - 2026-04-01

### Added
- Intelligence Dashboard (`/dashboard`) as the new post-login landing page
- Account Health Score (0-100) with weighted composite algorithm covering CPA efficiency, quality scores, impression share, waste ratio, and change momentum
- Money-on-Fire Detector showing daily waste from zero-conversion search terms
- Issue detection engine identifying wasted search terms, low-quality keywords, and declining campaigns
- One-click Fix actions on issue cards (add negative keywords, pause keywords) with inline confirmation
- Opportunity detection for impression share headroom and Google Ads recommendations
- One-click Apply actions on opportunity cards (increase budget) with inline confirmation
- AI Briefing card powered by Gemini 2.5 Flash generating daily account summaries
- Trend sparklines on metric cards using 7-day performance snapshot data
- Impression share visualization by campaign with progress bars
- Recent changes section with time-ago formatting and before/after values
- Week-over-week CPA comparison for declining campaign detection
- 38 unit tests covering health score algorithm, issue detection, and opportunity detection

### Changed
- Dashboard is now the first item in the sidebar navigation
- Connect page "Open AdsAgent" button now navigates to `/dashboard` instead of `/chat`
- Added `ad_group.id` to keyword GAQL query for pause-keyword support
- Added `/dashboard` to protected routes in middleware

## [0.1.0] - 2026-03-25

### Added
- Initial release with campaigns page, chat interface, operations log, and MCP server
