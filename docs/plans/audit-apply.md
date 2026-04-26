# Audit Recommendation Apply — boil-the-ocean plan

**Goal:** make AdsAgent the only place where audit findings turn into changes — diagnose, decide, execute, verify, prove ROI — all in one surface.

**Why:** Apr 25 cohort analysis. 12/30 read-only chat users typed explicit apply intent ("YES FETCH NOW", "Fill and propose", "fill A TABLE WITH exact current→proposed plan"). The assistant looped on clarifying questions while users were ready to execute. adsagent-chat has 71% read-only stickiness vs 27% for claude-code. This is the highest-leverage D0 Write Users lever. Closing the apply loop also unlocks downstream features (auto-apply policies, cross-account fix-everywhere, value-loop email) that turn AdsAgent from copilot to autopilot.

---

## Premise check

Three reframes the v1 cut got wrong:

1. **"Three reversible action types is the safe minimum."** Wrong frame. The audit pipeline already produces six action types (`pause_campaign`, `pause_keyword`, `add_negative`, plus implicit budget/bid/ad guidance). Cutting half the surface means half the recommendations stay text-only — same UX problem, smaller blast radius. The right cut is by **safety class**, not arbitrary count.

2. **"update_budget is hard because of guardrails."** Backwards. Server-side guardrails (50% cap on budget, 25% on bid) are the reason update_budget is *safer* than negatives — Google's API will refuse anything dangerous regardless of what the audit recommends. Negatives have no guardrail; a typo in the negative list can mask all queries on a campaign.

3. **"Batch apply is v2."** Batch apply IS the feature. The literal pre-filled prompt is "Run an audit and apply the 3 biggest fixes." Shipping single-apply means we ship a UX that requires N clicks where users want 1. The Apr 22 1-read cohort analysis already named this.

**Right framing:** ship the full apply surface. Six action types, batch apply, attribution, value-loop. The marginal cost vs the v1 cut is ~2 days of CC time. The marginal product impact is the difference between "click Apply on each fix" and "Apply all 3 fixes."

---

## Implementation approach — locked

**No new MCP tool.** The website `/audit` page is already the home of structured recommendations: `getAuditDetails()` in `app/(app)/audit/actions.ts` calls `computeAuditScore()` and returns `AuditResult` with full structured `passes` (action types, target IDs, campaign IDs). That's the source of truth.

**Apply lives where the audit is rendered.** Two surfaces, one backend:

1. **Website `/audit` page** — primary surface. Each PassItem row in `components/audit/scorecard.tsx` gets an inline Apply button. Click → server action → apply route → write tool. This is where most users see recommendations.

2. **Audit chat drawer** (`AuditChatDrawer`, opens from the audit page) — secondary surface. The drawer already has audit context (account name, pulse metrics) prefixed to every chat message. Extend the context prefix to include `snapshotId`. When the chat assistant references a specific recommendation by index ("Want me to pause keyword X?"), the UI renders an Apply card inline that posts to the same apply route.

3. **Standalone chat** (`/chat/[threadId]`) — *no Apply cards in v1.0*. Per the Apr 23 architectural decision, audit-shaped questions in standalone chat go through `runScript` and produce prose. The agent prompt at `lib/agents/google-ads-agent.ts:121` (which still references the deleted `audit` tool) gets cleaned up to remove the stale reference. Standalone chat users who want Apply navigate to `/audit`. Acceptable because the website is the primary audit surface anyway.

This means:
- **Zero new MCP tools.** Respects the Apr 23 deletion.
- **Single source of truth:** `computeAuditScore` running server-side via the existing `getAuditDetails()` action.
- **Single apply backend:** `/api/chat/recommendations/apply` (path name kept for symmetry with chat threads, even though it serves the website too).
- **Chat agent stays clean:** runScript remains the audit pattern in standalone chat. The agent prompt is corrected to stop hallucinating a deleted tool.

**Why this is better than the rejected MCP-tool approach:**
- Doesn't undo a deliberate architectural decision from two days ago.
- Recommendations the user clicks on are the *exact same* PassItems that scored the audit — no re-derivation, no parallel pipeline.
- The audit page is already where users land after signup OAuth (`?auto=audit` redirect target). Apply on the audit page closes the activation loop directly.
- Chat drawer apply rides on the audit page's snapshot — no separate snapshot lifecycle in chat.

**Reuses:** `computeAuditScore`, `getAuditDetails()`, `saveAuditSnapshot` (with persist patch), `PassItem`, `isReversible`, `REVERSIBLE_ACTIONS`, `execWrite`, all 6 write tools (`pauseCampaign`/`pauseKeyword`/`addNegativeKeyword`/`pauseAd`/`updateCampaignBudget`/`updateBid`).

---

## Scope — what's in v1.0

### Action types (full roster)
All six types the audit pipeline produces. Every action type gets an Apply button.

| `actionType` | Maps to | Reversibility | Safety class | Notes |
|---|---|---|---|---|
| `pause_campaign` | `pauseCampaign` | enableCampaign | A: trivial | always reversible |
| `pause_keyword` | `pauseKeyword` | enableKeyword | A: trivial | always reversible |
| `add_negative` | `addNegativeKeyword` | removeNegativeKeyword | A: trivial | always reversible |
| `pause_ad` | `pauseAd` | enableAd | A: trivial | NEW |
| `update_budget` | `updateCampaignBudget` | original budget value (stored) | B: bounded | guardrail enforced server-side (50% cap); UI shows current→proposed; "Raise guardrail to N% (one-click)" affordance if proposed exceeds |
| `update_bid` | `updateBid` | original bid (stored) | B: bounded | guardrail 25%; same affordance |

Cards for any future `actionType` not in this whitelist render as text only with a "Discuss" button — no Apply. Defense-in-depth.

### Core flow features
- **Single apply** with end-to-end card lifecycle (idle → applying → applied → undone)
- **Batch apply** ("Apply all 3"). Independent per-item execution. UI shows ✅✅❌ with retry-failed affordance. NOT transactional all-or-nothing — partial-success contract is correct because rolling back a successful pause is itself a write that can fail.
- **Persistent undo bar** that survives page navigation. One-click "Undo this" or "Undo all from this audit."
- **Per-recommendation Discuss button** — sends a context-bearing follow-up to the chat agent ("Tell me more about [recommendation]") for users who want explanation before applying.
- **Apply attribution** — every apply writes `audit_snapshot_id` + `pass_key` + `index` to a new `audit_applies` table. Powers analytics, idempotency, ROI attribution.

### History migration
Backfill: existing `audit_snapshots` rows have stripped structure (the bug we're also fixing). For snapshots created after we land the persist fix, structure is automatic. For pre-fix snapshots: render as text only. Show a "Re-run this audit to enable Apply" affordance — cleaner than backfill.

### Value-loop email digest
7 days post-apply: send "Your applied changes saved $X / shifted Y conversions." Closes the loop, drives retention. Dependency: existing email infra (Resend webhooks already set up; `app/api/webhooks/resend/route.ts` exists).

### Safety boundaries
- Server reads recommendation from DB by `(snapshotId, passKey, index)`. Client payload carries lookup key only — never trusted for action specifics.
- TTL split: **6h** for `update_budget` / `update_bid` (account state moves fast); **24h** for pauses and negatives (less time-sensitive). Both expire to "Re-run audit" CTA.
- Entity validation: live entity status must match snapshot status. If user manually paused the campaign, refuse with "Already paused — nothing to do."
- Idempotency: unique index on `audit_applies(snapshot_id, pass_key, index)`. Concurrent clicks → second returns existing changeId.
- CSRF: same-origin session cookie required (matches existing chat patterns).
- No URL auto-apply (no `?autoapply=true`). Apply requires explicit click.
- Rate limit: 30 applies per user per hour. Hard cap because misconfigured automation could blow through an account.

---

## Deferred to v2 (legitimate cuts)

| Item | Why deferred |
|---|---|
| Apply via Claude Code | Different rendering surface (terminal text), different concurrency model. Tool-call result already includes structured data — Claude Code agents render as text. Native Apply UX is v2. |
| Multi-account batch ("apply this fix to all 5 of my accounts") | One-account-per-session is an MCC sanity invariant. Cross-account is a separate primitive. |
| Scheduled apply ("apply tomorrow at 9am") | Adds cron infra, time-zone handling, partial-failure-on-schedule semantics. Separate feature. |
| Recommendation editing (user tweaks $ amount before apply) | Replaceable today via Discuss button. Editing introduces a parallel state machine. |
| Auto-apply policies ("auto-apply all negatives <$20/mo") | Architectural foundation lands in v1.0; policy UI + guardrails are v2. |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Website /audit page (primary)        │  AuditChatDrawer (secondary)   │
│                                        │                                │
│  getAuditDetails() ──▶ AuditResult    │  contextPrefix carries          │
│  (server action, computeAuditScore)   │  snapshotId. When agent         │
│         │                              │  references "fix #2", UI        │
│         ▼                              │  renders <RecommendationCard    │
│  saveAuditSnapshot ──▶ snapshotId      │   snapshotId pass="..." idx={1}/>│
│         │                              │                                │
│         ▼                              │                                │
│  <Scorecard /> + <PassItemRow />      │                                │
│    each row has Apply button:         │                                │
│    <RecommendationCard                │                                │
│      snapshotId={…} pass={…} idx={…}/>│                                │
└──────────────────────┬─────────────────┴────────────────────────────────┘
                       │ POST /api/chat/recommendations/apply
                       │ { snapshotId, items: [{passKey, index}] }
                       ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                       Apply Route                                      │
│                                                                        │
│  For each item (parallel where independent):                          │
│    1. RLS:           snapshot.userId == session.userId                │
│    2. TTL:           snapshot.createdAt > NOW() - actionTypeTTL       │
│    3. Lookup:        passes[passKey][index] → PassItem                │
│    4. Whitelist:     actionType in ALLOWED_ACTIONS                    │
│    5. Idempotency:   audit_applies UNIQUE (sid, pk, idx) → existing   │
│    6. Entity check:  live status matches snapshot                     │
│    7. Guardrail:     budget/bid within cap (else "raise" affordance)  │
│    8. Dispatch:      dispatchRecommendation(item) → ToolCall          │
│    9. execWrite:     same path as MCP tools                           │
│   10. Audit log:     INSERT INTO audit_applies                        │
│   11. Response:      { changeId, undo: {tool, args}, status }         │
└────────────────────────────┬────────────────────────────────────────────┘
                             │ Streaming SSE for batch progress
                             ▼
                    UI updates per-card live: ✅ ✅ ❌
```

### State machine (single recommendation card)

```
         ┌───────┐
         │ idle  │◀──────────────────────────┐
         └───┬───┘                            │
             │ click Apply                     │
             ▼                                 │
         ┌────────┐                            │
         │applying│ (button disabled, spinner) │
         └───┬────┘                            │
             │                                 │
        ┌────┴────────┬────────┐               │
        │             │        │               │
        ▼             ▼        ▼               │
   ┌────────┐  ┌─────────┐ ┌──────┐           │
   │applied │  │ failed  │ │stale │           │
   │(undo)  │  │ (retry) │ │(rerun│            │
   └───┬────┘  └────┬────┘ │audit)│            │
       │            │      └─┬────┘            │
       │ click Undo │ retry  │                 │
       ▼            └────────┴─────────────────┘
   ┌────────┐
   │ undone │
   └────────┘
```

### Data flow shadows

```
INPUT ─▶ VALIDATE ─▶ ENTITY-CHECK ─▶ GUARDRAIL ─▶ DISPATCH ─▶ AUDIT-LOG ─▶ OUTPUT
   │         │             │              │           │            │           │
   ▼         ▼             ▼              ▼           ▼            ▼           ▼
[null?]  [whitelist?]  [vanished?]   [exceeds   [API timeout?] [DB down?] [stale UI?]
[bad     [missing      [status       cap?]      [API 429?]     [conflict] [card ←
 passKey?] field?]      changed?]    [raise     [API policy    [partial    server
                                      affordance]violation?]    write?]    state]
```

For every shadow path: rescue action and user-visible message named in §Errors below.

---

## Errors & rescue map

| Codepath | Failure mode | Rescued? | User sees |
|---|---|---|---|
| Apply route | Snapshot not found | Yes (404) | "This recommendation expired. [Run a fresh audit]" |
| Apply route | Snapshot owned by other user | Yes (403, opaque) | "Not authorized" — never leak snapshot existence |
| Apply route | TTL expired | Yes | "This recommendation is older than 6h/24h. [Re-run audit]" with one-click |
| Apply route | actionType not whitelisted | Yes (logged) | "This action type isn't supported yet. Discuss with AI?" |
| Apply route | Required field missing | Yes (logged as audit-pipeline bug) | "Recommendation incomplete. We've been notified." |
| Apply route | Entity vanished (campaign deleted) | Yes | "Campaign 'foo' no longer exists. [Re-run audit]" |
| Apply route | Entity status changed (already paused) | Yes | "Already paused — nothing to do" + show changeId of who/when |
| Apply route | Guardrail violation (budget +60%) | Yes (structured) | "+60% exceeds 50% cap. [Apply +50% instead] [Raise cap to 70%]" |
| Apply route | Idempotency replay | Yes (200) | Existing changeId, "Applied N hours ago [Undo]" |
| Apply route | Google Ads API timeout | Retry 2× w/ backoff | Spinner persists ≥3s; failure → "Try again" |
| Apply route | Google Ads API 429 | Retry w/ exponential backoff | Transparent ("applying…") |
| Apply route | Google Ads policy_violation | NO RETRY | Parsed `PolicyViolationDetails.externalPolicyName` shown |
| Apply route | Write succeeds, audit_applies INSERT fails | Surface inconsistency | "Change applied but logging failed. Undo unavailable. [Contact support]" |
| Apply route | Write succeeds, undoToolCall serialization fails | Apply succeeds; undo affordance hidden | "Applied. (Undo unavailable for this change.)" |
| Batch apply | 1 of 3 items fails | Independent per-item | ✅✅❌ with retry-failed-only affordance |
| Batch apply | All 3 fail (likely auth issue) | Detect 3× same error class → bail early | "All applies failed. Re-authenticate?" |

**Catch-all rule:** any `catch (e)` that doesn't name a specific class is a code review block.

---

## Security threat model

| Threat | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Snapshot ID enumeration | Low | Med | RLS check (`snapshot.userId == session.userId`) |
| Tampered passKey/index | Med | High | Server reads from DB, ignores client payload — only `(sid, pk, idx)` is trusted as a lookup key |
| Replay after OAuth revoke | Low | Med | Live entity check fails fast → user sees auth error, not silent write |
| CSRF | Low | High | Same-origin session cookie required (existing chat pattern) |
| Click-jack / URL auto-apply | Low | High | No `?autoapply` URL param. Apply requires explicit click. |
| Audit poisoning (cross-account) | Very low | High | Customer ID scoped via auth context — recommendation can only target the audit's own account |
| Rate-limit bypass via batch | Low | Med | Per-user per-hour cap of 30 applies enforced at apply route, not per-item |
| Recommendation tamper via DB injection | Very low | High | Recommendations are jsonb in `auditSnapshots` written by server only; no user-write path |

**Secrets:** no new secrets introduced. Reuses existing Google Ads OAuth + session token plumbing.

---

## Test coverage matrix

### Unit (`__tests__/audit-recommendations-apply.test.ts`)

`dispatchRecommendation(passItem)` — pure function, no DB, no network. Asserts the right ToolCall shape for every action type.

Dispatcher mapping — every action type:
- `pause_campaign` → `pauseCampaign({campaignId})`
- `pause_keyword` → `pauseKeyword({adGroupId, criterionId})`
- `add_negative` campaign-level → `addNegativeKeyword({campaignId, text, matchType})`
- `add_negative` ad-group-level → `addNegativeKeyword({adGroupId, text, matchType})`
- `pause_ad` → `pauseAd({adGroupId, adId})`
- `update_budget` → `updateCampaignBudget({campaignId, amountMicros})`
- `update_bid` → `updateBid({adGroupId, criterionId, cpcBidMicros})`

Edge cases:
- Unknown actionType → refuse, log
- Missing required field → refuse, no dispatch
- TTL boundary: exactly 5h59m vs 6h01m for budget/bid
- TTL boundary: exactly 23h59m vs 24h01m for pauses/negatives
- Idempotency replay returns existing changeId, no second `execWrite` call
- Whitelist refusal returns structured error with discussCallback
- Stale state: snapshot says ENABLED, live PAUSED → refuse with "already paused"
- Guardrail violation: structured response with `raiseGuardrailTo` field
- Entity vanished → refuse before dispatch
- RLS — wrong user → 403 (opaque)
- Concurrent apply race → unique-index ensures one winner

### Integration

- Full flow: `auditAccount` → server action → DB persist → render card → apply → operations + audit_applies rows present, foreign keys correct
- Batch apply 3 items, one fails → ✅✅❌ result, two operations rows, one not, retry-failed-only works
- Undo flow: apply → undo → original entity restored, second operations row with `rolled_back=1` on first
- TTL clock: snapshot 5h old → applies; advance to 6h01m → refuses (use vitest fake timers)

### E2E (Playwright)

Two surfaces × two accounts:
1. **`/audit` page on DEMO_CUSTOMER_ID** — happy path. Render scorecard, click Apply on first row, batch Apply All, undo.
2. **`/audit` page on DEV_LOCAL_EMAIL** — full flow on real data. May skip if no recommendations available.
3. **AuditChatDrawer on DEMO_CUSTOMER_ID** — open drawer from /audit, ask "what's the biggest fix", confirm Apply card renders inline, click Apply, verify drawer state syncs with parent page.

Per E2E:
- Card renders with correct action text, $ impact, current→proposed
- Click Apply → spinner ≥300ms, button disabled, dialog persists
- Apply success → "Applied" + changeId + Undo button
- Click Undo → "Undone" + changeId of undo
- Mobile viewport: cards remain interactive at 375px width
- Undo bar persists across navigation
- Re-running audit invalidates stale cards (TTL UX)
- Chat drawer card and parent page card for the same recommendation reflect the same applied state (prevents double-apply confusion)

### Eval — golden fixtures

5 anonymized fixtures from `shared_audits` covering all 6 action types. For each fixture:
- AuditResult input
- Expected ToolCall per PassItem (golden)
- Expected card render text (golden)

Run: `npm run test -- audit-recommendations-apply`. Pre-commit hook gates merge.

### Chaos

- Mid-apply network failure (cut at byte 50% of response) → UI recovers, no orphan write
- Apply succeeds, undo lookup fails → "Applied. Undo unavailable" (graceful degrade)
- DB connection lost during INSERT → 500 with retry CTA, no silent partial state

---

## Performance

- Apply latency target: p50 <800ms, p95 <2.5s. Dominated by Google Ads write (~500ms) + entity-check GAQL (~150ms).
- Entity-check uses ID-only GAQL (`SELECT campaign.id FROM campaign WHERE campaign.id = X`), single query, hits cache when warm.
- Batch apply executes items in parallel (up to 5 concurrent) — bounded to avoid Google Ads rate limit.
- No N+1: dispatcher is pure function, no loops over DB.
- DB indexes: `audit_applies(snapshot_id, pass_key, index)` UNIQUE (gives idempotency); `audit_applies(user_id, applied_at DESC)` for the 7-day digest job.

---

## Observability

### Events (PostHog)
- `recommendation_card_rendered` — userId, snapshotId, passKey, index, actionType
- `recommendation_apply_clicked` — same + clientName
- `recommendation_apply_succeeded` — same + changeId + latencyMs
- `recommendation_apply_failed` — same + errorClass + errorMessage
- `recommendation_apply_undone` — changeId + minutesSinceApply
- `recommendation_batch_initiated` — snapshotId + itemCount
- `recommendation_batch_completed` — successCount + failureCount + totalMs

### Dashboards (PostHog)
- **Apply funnel:** rendered → clicked → succeeded → no-undo (the activation funnel)
- **Apply CTR per actionType** — surfaces which recommendations users actually trust
- **Time-to-apply distribution** — proxy for hesitation
- **Undo rate within 24h** — regret signal; >15% → audit pipeline produces bad recommendations
- **Apply success rate per actionType** — surfaces broken dispatchers fast

### Alerts (PagerDuty / Slack)
- Apply success rate <90% over 1h → page on-call
- Single user >20 errors in 1h → flag (data-quality issue, e.g., bad targetIds in audits)
- Audit pipeline emits 0 PassItems for >50% of runs in 1h → audit logic broken
- audit_applies INSERT failure rate >1% → DB or schema issue

### Runbooks
- "Apply success rate dropped" → check Google Ads API status, check audit pipeline output, check whitelist drift
- "User reports apply did nothing" → query audit_applies by user, check operations.success, check rolled_back

---

## Deployment

### Migration (zero-downtime)
1. Add column `operations.audit_snapshot_id` (nullable bigint). No backfill.
2. Create `audit_applies` table with unique index `(snapshot_id, pass_key, index)`.
3. Update `lib/audit/persist.ts` to stop stripping structured fields — old rows still render as text, new rows get Apply buttons.
4. Add `applied_at_ms` column to `audit_snapshots` (nullable bigint) for fast 7-day digest queries.

### Feature flag
`feature.audit_apply` — env var. OFF in prod initially. OFF = `<RecommendationCard />` renders text-only fallback (no Apply button); API route returns 503. Allows fast rollback without revert.

### Rollout
- T+0: migrate
- T+5min: deploy code, flag OFF
- T+1d: enable for `DEV_LOCAL_EMAIL` users — dogfood 24h
- T+2d: 10% rollout (cohort: most-recently-active users)
- T+4d: 100%
- T+11d: enable email digest job (7-day delay built in)

### Rollback
Set `feature.audit_apply` → false. Cards stop rendering. In-flight applies complete. No data loss.

### Smoke tests post-deploy
- POST /api/chat/recommendations/apply with feature flag OFF → 503
- POST with valid payload, flag ON → 200 + changeId
- audit_applies INSERT visible in DB
- 7-day digest cron job picks up rows correctly

---

## Long-term trajectory

This v1.0 unlocks (all 1-PR adds, no rewrite):
- **Auto-apply policies** ("auto-apply all add_negative under $20/mo per account") — flips AdsAgent from copilot to autopilot
- **Apply marketplace** — share top-performing audit fixes as templates across customers (anonymized)
- **Cross-account fix-everywhere** — same negative wasting spend on 3 of 5 accounts → one click fixes all 3
- **Apply impact bar** — "Last week's applied changes saved $X" in chat header — turns retention into a value-loop metric
- **Auto-recommend cadence** — weekly digest "Here are 5 fixes worth $X this week" with one-click batch apply

The schema (`audit_applies` with snapshot+pass+index) supports all of these.

### Reversibility: 4/5 (easy two-way door)
Feature-flagged. Schema is additive. Rollback is `feature.audit_apply = false`. Only one-way door is the migration of `auditSnapshots.topActions` jsonb shape — but old rows still render via text fallback.

### Tech debt incurred
- TTL split (6h vs 24h) needs tuning data after launch — initial values are educated guess.
- Chat drawer Apply card detection uses a marker convention (`[apply: pass=X idx=Y]`) the assistant emits — fragile if model output drifts. Mitigation: validate marker format server-side; if no markers emitted, drawer falls back to "see /audit page for Apply." The website surface is canonical; drawer is convenience.

---

## UX intentionality (Section 11)

### Information hierarchy on the card
1. **What we're doing** — "Pause keyword 'emergency dentist'" (concrete verb + target)
2. **Why** — "Spent $147 last 30d, 0 conversions" (the data, not the AI's reasoning)
3. **Impact** — "+$147/mo back to your budget" (forward-looking, not retrospective)
4. **Action** — [Apply] [Discuss] (primary action high-contrast, secondary muted)

### State coverage map
| State | Visual | Affordance |
|---|---|---|
| idle | full card, primary Apply button | click |
| applying | spinner replaces button icon, button disabled, card slightly dimmed | nothing (locked) |
| applied | green check + "Applied 2s ago" + Undo button | undo |
| failed | red border + error message + Try Again | retry / discuss |
| stale (>TTL) | grey overlay + "Re-run audit" button | re-audit |
| undone | strike-through + "Undone" + ghost text | re-apply |

### Empty / edge states
- 0 recommendations: "Your account is in good shape. Re-run in 7 days." (not "no recommendations")
- 1 recommendation: card renders without "Apply all" button
- 7+ recommendations: collapse pass groups; "Show all 7" expander
- Recommendations on 0-spend account (the 2-of-7 empty-account problem from Apr 22): "Your account has $0 spend — no fixes to recommend. [Help me launch a campaign]"

### Mobile
- Cards stack vertically, full-width
- Apply button minimum 44pt touch target
- Undo bar bottom-fixed, swipe-to-dismiss

### Accessibility
- All cards keyboard-navigable (Tab to button, Enter to apply)
- Status announcements via `aria-live` on apply success/failure
- Color is never the only signal (✓/✗ icons + text accompany red/green)

Required follow-up: `/plan-design-review` after the build, before launch.

---

## Build order

1. **Migration** — `audit_applies` table (unique index on `snapshot_id, pass_key, index`), `operations.audit_snapshot_id` column, `audit_snapshots.applied_at_ms`. Drizzle.
2. **`lib/audit/recommendations.ts`** — types + dispatcher (pure functions, no DB). All 6 action types: `pause_campaign`, `pause_keyword`, `add_negative`, `pause_ad`, `update_budget`, `update_bid`.
3. **`__tests__/audit-recommendations-apply.test.ts`** — unit + golden fixtures. RED first.
4. **`lib/audit/persist.ts`** — stop stripping structured fields from `topActions`.
5. **`app/api/chat/recommendations/apply/route.ts`** — single + batch apply. Validation pipeline. Idempotency. Calls `dispatchRecommendation()` from step 2 then `execWrite()`.
6. **`components/audit/recommendation-card.tsx`** — single shared card component (state machine + Apply button + Undo). Used by both surfaces.
7. **Wire Apply on website audit page** — modify `components/audit/scorecard.tsx` PassItemRow to render `<RecommendationCard />` instead of plain text. Pass `snapshotId` from page context.
8. **Wire Apply in AuditChatDrawer** — extend `contextPrefix` in `audit-chat-drawer.tsx` to carry `snapshotId`. Modify the chat renderer to detect `[apply: pass=X idx=Y]` markers from assistant messages and render `<RecommendationCard />` inline.
9. **`components/audit/undo-bar.tsx`** — persistent undo affordance after apply.
10. **Apply All button on `/audit`** — bottom of scorecard, batches all stopWasting items.
11. **Clean up agent prompt** — remove the stale `audit` tool reference at `lib/agents/google-ads-agent.ts:121`. Replace with guidance to direct users to `/audit` for structured-apply or use `runScript` for inline diagnosis.
12. **Email digest cron** — `app/api/cron/audit-apply-digest/route.ts`. Resend integration. 7-day delay.
13. **E2E Playwright tests** — DEMO + DEV_LOCAL_EMAIL covering both `/audit` and drawer flows.
14. **`/plan-design-review`** before launch.
15. **Manual sanity** — full flow on real test account.

Effort: human ~5 days / CC ~5 hours (saved a day vs the MCP-tool approach: no tool registration, no agent integration, no chat-result detection).

---

## Failure modes registry

| Codepath | Failure | Rescued? | Test? | User sees | Logged? |
|---|---|---|---|---|---|
| auditAccount tool | computeAuditScore throws | Y | Y (unit) | "Audit failed — try again" | Y |
| auditAccount tool | DB persist fails | Y (don't block response) | Y | Audit returns, no Apply buttons (degrade) | Y |
| /apply | snapshot not found | Y | Y | "Expired — re-run" | Y |
| /apply | RLS violation | Y | Y | 403 opaque | Y |
| /apply | TTL expired | Y | Y | "Older than 6h" | Y |
| /apply | unknown actionType | Y | Y | "Not yet supported" | Y |
| /apply | entity vanished | Y | Y | "Campaign no longer exists" | Y |
| /apply | already-applied state | Y | Y | "Already paused" | Y |
| /apply | guardrail violation | Y | Y | "Exceeds 50% — raise?" | Y |
| /apply | API timeout | Y (retry 2×) | Y | spinner ≥3s, then "Try again" | Y |
| /apply | API 429 | Y (backoff) | Y | transparent | Y |
| /apply | policy violation | Y (no retry) | Y | parsed reason | Y |
| /apply | DB INSERT fail post-write | Y (surface) | Y | "Applied but log failed" | Y |
| Batch | 1 of N fails | Y (per-item) | Y | ✅✅❌ | Y |
| Card UI | applying state hangs | Y (timeout 30s) | Y | "Taking longer than expected" | Y |
| Email digest | Resend API down | Y (retry queue) | Y | nothing (background) | Y |

**0 CRITICAL GAPS** if every row above is implemented.

---

## NOT in scope
- Apply via Claude Code native rendering (text-only is fine)
- Multi-account batch
- Scheduled apply
- Recommendation editing pre-apply
- Auto-apply policies (architectural foundation only)
- Backfill of pre-fix audit_snapshots (use re-audit affordance instead)

## What already exists (leverage)
- `computeAuditScore` (lib/audit/scoring.ts) — produces structured `AuditPasses` with `actionType`/`targetId`/`campaignId`/`adGroupId`
- `getAuditDetails()` (app/(app)/audit/actions.ts) — server action that returns `AuditResult` ready to render. **No new entry point needed.**
- `isReversible()` + `REVERSIBLE_ACTIONS` set
- `execWrite()` (lib/tools/execute.ts) — single write path with telemetry, rate-limit, change-log
- All 6 write tools already exist as MCP tools (`pauseCampaign`, `pauseKeyword`, `addNegativeKeyword`, `pauseAd`, `updateCampaignBudget`, `updateBid`)
- Server-side guardrails (50% budget, 25% bid)
- `auditSnapshots` table with jsonb `topActions` (just stops stripping)
- `shared_audits` anonymized fixtures (eval source)
- Resend webhook infra (digest email)
- `AuditChatDrawer` already wires `contextPrefix` into chat — just extend the prefix to carry `snapshotId`

## Dream state delta
**12-month ideal:** every audit recommendation that's safe to apply auto-applies under user-defined policy ("auto-apply all negatives under $20/mo, never auto-apply campaign pauses"). Users get a weekly "Here's what AdsAgent did" digest. Manual apply exists but is the exception, not the rule.

This v1.0 is the foundation: structured recommendations + apply path + attribution. Auto-apply, marketplace, cross-account are 1-PR adds on the same schema.

---

## Three taste calls before build (genuine ambiguity)

These are the only places where reasonable people disagree. Everything else is locked.

1. **TTL split: 6h/24h or single 12h?** Split is more correct (budget moves fast, pauses don't); single is simpler to explain. **Recommendation: split**, because the user-visible message ("Older than 6h") is the same effort either way.

2. **History migration: re-run affordance or backfill?** Re-run is cleaner (no migration script, no risk of stale data), backfill makes existing snapshots immediately useful (~50 rows). **Recommendation: re-run affordance**. Backfill is 30 min of work but the UX (a stale audit suddenly showing Apply buttons) is confusing.

3. **Email digest: in v1.0 or v2?** This is the value-loop hook that drives 7-day retention. New deps: digest template, scheduling cron, unsubscribe handling. ~1 day of work standalone. **Recommendation: in v1.0** because shipping apply without proving ROI back to the user leaves the retention loop open.

If you disagree on any of these, name it and I'll revise. Otherwise I lock the plan and start building from step 1 (migration).

---

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 1 | clean | mode=SCOPE_EXPANSION, 6 action types in (was 3), batch apply in (was v2), email digest in (was deferred), history migration replaced with re-run UX |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | — | — |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 0 | — | — |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | — |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

**UNRESOLVED:** 3 taste calls (TTL split, history migration approach, email digest in/out)

**VERDICT:** CEO CLEARED — ready for `/plan-eng-review` after taste calls resolved
