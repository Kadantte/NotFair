# TODOs

Living list of deferred work. Each item names why it was deferred and what unblocks it.

## Activation / audit pivot (follow-ups to PRs #52/#53/#54)

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
