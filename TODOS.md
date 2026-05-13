# TODOs

Living list of deferred work. Each item names why it was deferred and what unblocks it.

## Activation / audit pivot (follow-ups to PRs #52/#53/#54)

> **Note (2026-04-23):** The `audit` MCP tool was removed — it returned >60KB responses that exceeded MCP token limits and forced agents to fall back to narrow-view tools anyway. The insights and evals below that key on `tool_name = 'audit'` need to be re-framed around the narrow views (`getWasteFindings`, `getAccountChanges`, `getLandingPagePerformance`, `getImpressionShare`) or around the *user-facing prompt* ("Run an audit...") rather than a specific tool name.


### P1 — PostHog insight: "web-chat first-audit rate"
**What:** Create a PostHog insight that reports, for each week, the % of new web-chat threads (`client_source = 'adsagent-chat'`, `thread_messages = 0` at time of event) whose first tool call is `audit`.
**Why:** This is the real eval for PR #53. Before the prompt change, this rate is ~10%; after, we expect >60%. If it moves, the pivot worked; if not, the system prompt isn't being followed and we need a different hook.
**Context:** PRs #53 and #54 are prerequisites. #54 adds the `first_tool_call_attempted` event with `tool_name` + `client_source` properties — query that event filtered by `client_source = 'adsagent-chat'` and group by `tool_name = 'audit'`.
**Effort:** S (CC: 15 min, human: 30 min).
**Depends on:** #54 deployed; 48h of event data.

### P2 — Agent-behavior eval harness
**What:** Scripted test harness under `evals/` that fires real LLM calls against the chat agent with seeded thread states, asserts the first tool call matches expectation.
**Why:** Catches prompt regressions in CI. Mock-based vitest can't catch the "does the real model obey the instructions" question.
**Context:** Start from `toprank/google-ads/ads-audit/evals` as a reference. Two scenarios minimum: fresh thread + generic greeting → assert `audit` called; fresh thread + specific question ("bump budget on campaign X") → assert `audit` NOT auto-called.
**Effort:** L (CC: ~1 day, human: ~1 week). Non-trivial because it needs API key plumbing in CI + cost controls.
**Depends on:** nothing; can run anytime.

### P2 — Popup OAuth branch redirect parity
**What:** Mirror PR #53's non-popup-branch behavior (first-signup → `/chat/{uuid}?auto=audit`) for users who complete auth via popup.
**Why:** PR #53 only handled the non-popup branch. Popup users still land on `/connect` with no onboarding, missing the activation boost.
**Context:** Requires coordinated change in `components/google-ads-auth.tsx` to consume a new `customRedirect` field on the `GOOGLE_ADS_AUTH_SUCCESS` postMessage. Adds one type field + one `router.push` branch client-side.
**Effort:** S (CC: ~1 hr, human: ~2 hrs).
**Depends on:** #53 merged.

### P3 — Investigate parallel OAuth callback `app/api/auth/google/callback/route.ts`
**What:** The repo has two OAuth callback routes (`app/auth/callback/route.ts` and `app/api/auth/google/callback/route.ts`). Unclear which is live; #53 only modified the first. Needs archaeology to confirm one can be deleted OR both need the redirect applied.
**Why:** If the second route is live for any client, those users aren't getting the activation redirect.
**Context:** Check git blame + route usage (search for matching OAuth redirect_uri values in `.env` examples and auth client code).
**Effort:** S (CC: ~30 min of investigation + small fix).

### P3 — Add `typecheck` script to `package.json`
**What:** `package.json.scripts.typecheck = "tsc --noEmit"`.
**Why:** Developers (and agents) keep running `npx tsc --noEmit` manually. One-line fix, significant muscle-memory improvement.
**Effort:** XS (2 min).

## Marketing pages — codex landing follow-ups (v0.3.10.0)

### P2 — MCP tools table on `/google-ads-codex` and `/google-ads-claude` lists tool names that don't exist
**What:** The `tools.items` arrays in `messages/*.json` for both `GoogleAdsCodexPage` and `GoogleAdsClaudePage` advertise `listCampaigns`, `getKeywords`, `getSearchTermReport`, `getCampaignPerformance`, etc. The actual MCP surface is `runScript`/`listKeywords`/`summarizeAccountSetup`/`pauseCampaign`/`updateBid`/`addNegativeKeyword`/`createAd`.
**Why:** A developer who reads either page, tries those tool names in Claude/Codex, and gets "method not found" loses trust at the highest-intent point of the funnel. Pre-existing on `/google-ads-claude`; carried over verbatim into `/google-ads-codex` by design (same backend = same table).
**Fix:** Replace the rows with real tool names sourced from the MCP server, OR reframe the table as capability rows and drop the function-name column.
**Effort:** S (CC: ~30 min — touches 6 locale files).

### P3 — Dead `GoogleAdsCodexPage.auditCta.*` i18n keys
**What:** The `auditCta` subblock (eyebrow, title, body, disconnectedLabel, connectedLabel, secondary) was added to all 6 locales speculatively but is never rendered by `components/marketing/google-ads-codex-page.tsx`. 36 dead strings.
**Why:** Translation work that doesn't ship to users; bloats the i18n bundle.
**Fix:** Remove the `auditCta` subkey from `GoogleAdsCodexPage` in all 6 message files.
**Effort:** XS (5 min).

## Test suite failures (pre-existing, noticed on v0.5.5.7)

### P0 — lib/__tests__/resolve-auth.test.ts failing
**What:** `resolve-auth` test suite has pre-existing failures unrelated to the impersonate-fix branch. Exact error not captured — run `npx vitest run lib/__tests__/resolve-auth.test.ts` to reproduce.
**Why:** Noticed during /ship workflow on 2026-05-12. Not caused by the impersonate route fix.
**Effort:** S — investigate root cause and fix.

### P0 — __tests__/proxy-i18n.test.ts failing
**What:** `proxy-i18n routing` — "still applies auth protection to protected app routes after setting a locale cookie" fails. Pre-existing.
**Why:** Noticed during /ship workflow on 2026-05-12.
**Effort:** S — investigate locale+auth interaction in middleware.

### P0 — lib/mcp/__tests__/protocol.test.ts failing (2 tests)
**What:** "MCP protocol — tools/list: returns every registered tool" and "attaches annotation hints" fail. Pre-existing.
**Why:** Noticed during /ship workflow on 2026-05-12.
**Effort:** S — likely a tool registration mismatch in test fixture.

### P0 — lib/mcp/__tests__/tool-registration.test.ts failing (5 tests)
**What:** `getRecommendations` tool not found in registered tools. All handler-execution tests fail. Pre-existing.
**Why:** Tool may have been removed or renamed but tests not updated. Noticed 2026-05-12.
**Effort:** S — check if getRecommendations was removed from tool-registration.ts.

### P3 — `navigator.clipboard.writeText` has no error handling on the codex setup-guide page
**What:** `CommandCard` in `components/marketing/google-ads-codex-mcp-setup-page.tsx` calls `navigator.clipboard.writeText(...)` without a `.catch()`. Same pattern as `components/codex-setup-steps.tsx` `CommandBlock`.
**Why:** Silent failure in non-secure contexts or when permission is denied — copy button appears to do nothing.
**Fix:** Wrap in try/catch with a user-visible error state, OR fall back to `document.execCommand('copy')`.
**Effort:** S (15 min, refactor both call sites).
