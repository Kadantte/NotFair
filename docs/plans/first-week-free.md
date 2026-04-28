# First-Week-Free Trial — Implementation Plan

**Status:** approved
**Date:** 2026-04-26
**Driver analysis:** `docs/analysis/2026-04-26_13-11_pricing-quota-vs-trial.md`
**North stars affected:** WAW (positive), D0 Write Users (neutral — reads stay unlimited, writes stay free for 7 days)

---

## Goal

Replace the 300-op monthly cap with a write-gated reverse trial:

- **Reads**: unlimited forever for everyone (free + Growth).
- **Writes**: free for first 7 days from a user's first MCP session. After day 7, writes require Growth plan.
- **Existing users**: fresh 7-day window from deploy date, regardless of how old their first session is.
- **Expiry UX**: hard 403 with structured `nextTool` routing to `/upgrade` (same pattern as PR #73).

## Decisions locked in

| # | Decision | Choice |
|---|---|---|
| 1 | Mechanic | Pure 7-day time gate. No write counter. |
| 2 | Trial anchor | `MIN(mcp_sessions.created_at)` per user |
| 3 | Grandfathering | `trial_ends_at = MAX(first_session + 7d, deploy_date + 7d)` for everyone |
| 4 | Expiry behavior | Hard 403 with structured nextTool routing |

---

## Architecture

### Data flow (after change)

```
                       ┌──────────────────────────────┐
                       │  enforceWriteTrial(userId)   │
                       │     called from execWrite     │
                       └──────────────┬───────────────┘
                                      │
                                      ▼
                          ┌───────────────────────┐
                          │  resolveTrialState()   │
                          │  60s in-memory cache   │
                          └───────────┬───────────┘
                                      │ cache miss
                                      ▼
                ┌─────────────────────────────────────┐
                │ getUserSubscription(userId)         │
                │  ├─ if Growth/active → unlimited    │
                │  └─ if free → compute trial_ends_at │
                │     = MAX(first_session + 7d,        │
                │           DEPLOY_DATE + 7d)          │
                └─────────────────────────────────────┘
                                      │
                                      ▼
              ┌────────────────────────────────────────┐
              │ Decision tree                           │
              │  • Growth plan → allow                  │
              │  • DEV email → allow                    │
              │  • now < trial_ends_at → allow          │
              │  • now ≥ trial_ends_at → throw          │
              │       TrialExpiredError (nextTool)      │
              └────────────────────────────────────────┘

reads: enforceWriteTrial NOT called. always allowed.
```

### Files touched

```
NEW
  lib/mcp/trial.ts                  # trial-state resolver + cache + error
  lib/mcp/__tests__/trial.test.ts   # unit tests
  drizzle/0028_trial_started_at.sql # (optional) — see "Migration?" below

MODIFIED
  lib/tools/execute.ts              # remove enforceRateLimit from execRead;
                                    # call enforceWriteTrial in execWrite
  lib/mcp/code-mode/index.ts        # remove enforceRateLimit (gaqlParallel = read)
  lib/mcp/code-mode/ads-client.ts   # remove enforceRateLimit (gaqlParallel = read)
  lib/mcp/rate-limit.ts             # delete or keep as deprecated stub for tests
  lib/subscription.ts               # add `trial` interval-style fields to UserSubscription
  app/api/stripe/webhook/route.ts   # fire subscription_started analytics event
  lib/stripe/sync.ts                # return enough context for webhook to fire event
  app/(app)/usage/page.tsx          # rebuild as "Trial status" page
  app/(app)/layout.tsx              # banner near-end-of-trial / expired
  components/marketing/pricing-cards.tsx  # update copy: "Free: first 7 days"
  app/actions.ts                    # getUsageAction → getTrialStatusAction

DELETED
  (rate-limit-related copy in error messages, /usage page text about monthly limits)

TESTS UPDATED
  lib/__tests__/rate-limit.test.ts          # repurpose or replace with trial.test.ts
  lib/__tests__/rate-limit-subscription.test.ts  # same
  lib/mcp/code-mode/ads-client-quota.test.ts     # update: gaqlParallel no longer rate-limited
```

### Migration?

**Decision: no migration needed for v1.** Trial state is computed on the fly from `MIN(mcp_sessions.created_at)` per user, capped to deploy date. Index `mcp_sessions(user_id)` already exists; query is cheap and 60s cache absorbs hot path. Add migration only if v2 needs explicit per-user overrides (manual extensions, support comps).

`DEPLOY_DATE` is a const in `lib/mcp/trial.ts` — set once at deploy time, never recomputed. Hardcoding is intentional: it's a one-shot grandfathering anchor, not config.

### Trial-state cache shape

The existing `usageCache: Map<userId, {count, fetchedAt, periodStartMs}>` is the wrong shape — it's count-based. Replace with:

```ts
// lib/mcp/trial.ts
type TrialEntry = { trialEndsAt: number | null; plan: PlanKey; fetchedAt: number };
const trialCache = new Map<string, TrialEntry>();
const TRIAL_CACHE_TTL_MS = 60_000;
```

`trialEndsAt: null` = unlimited (Growth or dev). Otherwise a millisecond timestamp.

---

## Implementation steps

### Step 1 — `lib/mcp/trial.ts` (new file)

Single source of truth for trial logic. Exports:

```ts
export class TrialExpiredError extends Error {
  constructor(public readonly trialEndedAt: Date) { ... }
}

/** DEPLOY_DATE — set on the day this code lands in prod. Grandfathering anchor. */
export const DEPLOY_DATE = new Date("2026-04-28T00:00:00Z");
export const TRIAL_DAYS = 7;

export interface TrialState {
  plan: PlanKey;
  /** null = unlimited (Growth, dev). Otherwise UTC timestamp. */
  trialEndsAt: Date | null;
  /** True if write attempts should be blocked right now. */
  isExpired: boolean;
}

/** Resolve trial state for a user. 60s cache. */
export async function getTrialState(userId: string | null | undefined): Promise<TrialState>;

/** Throw TrialExpiredError if user is past their trial. Reads never call this. */
export async function enforceWriteTrial(userId: string | null | undefined): Promise<void>;
```

Resolver logic:

1. If `userId` falsy → return `{plan: "free", trialEndsAt: null, isExpired: false}` (anonymous, other guards apply).
2. Cache hit fresh < 60s → return cached.
3. `getUserSubscription(userId)` — if entitled (Growth/dev) → `{plan, trialEndsAt: null, isExpired: false}`.
4. Free plan: query `MIN(mcp_sessions.created_at) WHERE user_id = $1`. If no row → trial hasn't started; `trialEndsAt = DEPLOY_DATE + 7d` (covers users created via Stripe portal who haven't connected). If row → `trialEndsAt = MAX(first_session + 7d, DEPLOY_DATE + 7d)`.
5. `isExpired = now >= trialEndsAt`.
6. Cache and return.

`TrialExpiredError` follows the structured nextTool routing pattern from PR #73. The error message format:

```
Free trial ended {N} days ago. Upgrade to Growth ($79/mo or $950/yr) to keep writing:
https://notfair.co/upgrade. Reads still work — only writes require Growth.
```

### Step 2 — Wire up enforcement

```diff
// lib/tools/execute.ts
- import { enforceRateLimit, recordOperation, RateLimitError } from "@/lib/mcp/rate-limit";
+ import { enforceWriteTrial, TrialExpiredError } from "@/lib/mcp/trial";

  export async function execWrite(...) {
-   await enforceRateLimit(auth.userId);
+   await enforceWriteTrial(auth.userId);
    ...
-   recordOperation(auth.userId);  // delete — no count to track
  }

  export async function execRead<T>(...) {
-   try {
-     await enforceRateLimit(auth.userId);
-   } catch (error) {
-     if (error instanceof RateLimitError) { ... }
-     throw error;
-   }
+   // Reads are unlimited.
    ...
-   recordOperation(auth.userId);  // delete
  }
```

Same surgery in `lib/mcp/code-mode/index.ts:119` and `lib/mcp/code-mode/ads-client.ts:134`.

### Step 3 — Plan registry update (`lib/subscription.ts`)

```diff
  export const PLANS: Record<PlanKey, Plan> = {
    free: {
      ...
-     limits: { monthlyOpLimit: 300 },
+     limits: { monthlyOpLimit: null },  // unlimited reads; writes gated by trial
+     trialDays: 7,
    },
    growth: { ... unchanged ... },
  };
```

`monthlyOpLimit` removed from gating but kept in the type so old callers (tests, dashboards) don't break. Actually — delete it cleanly since the Boil-the-Lake principle says clean break > backwards-compat shim.

### Step 4 — `subscription_started` analytics event

```ts
// lib/stripe/sync.ts — extend SyncResult
export type SyncResult =
  | { action: "synced"; userId: string; customerId: string;
      eventTriggeredSubscriptionStart: boolean }  // NEW
  | ...

// In syncStripeSubscription, return eventTriggeredSubscriptionStart: true when
// the row had no prior `data` (first-time subscription). False on updates.
```

```ts
// app/api/stripe/webhook/route.ts
const result = await handleStripeEvent(event);
if (
  result.action === "synced" &&
  result.eventTriggeredSubscriptionStart &&
  event.type === "customer.subscription.created"
) {
  trackServerEvent(result.userId, "subscription_started", {
    plan: ..., interval: ..., amount: ...,
    stripe_event_id: event.id,
  });
}
```

The `eventTriggeredSubscriptionStart` flag prevents double-firing on Stripe replays + non-creation events that also funnel through `customer.subscription.created` (initial trial → paid conversion, etc.).

### Step 5 — UI surfacing

**Rebuild `/usage` → `/trial`:**

```
┌─────────────────────────────────────────────┐
│  Free trial                                  │
│                                              │
│  ┌─ Trial ends in ──────────────────┐        │
│  │   3d 14h                          │        │
│  │   Apr 30, 2026 (UTC)              │        │
│  └───────────────────────────────────┘        │
│                                              │
│  ┌─ What's free forever ─────────────┐       │
│  │   ✓ Unlimited reads & audits      │       │
│  │   ✓ All MCP tools (read-only)     │       │
│  └────────────────────────────────────┘      │
│                                              │
│  ┌─ What needs Growth after trial ───┐       │
│  │   • Apply audit recommendations   │       │
│  │   • Pause/enable campaigns         │       │
│  │   • Bulk bid/keyword updates       │       │
│  └────────────────────────────────────┘      │
│                                              │
│  [ Upgrade to Growth — $79/mo or $950/yr ]   │
└──────────────────────────────────────────────┘
```

States:
- **Active trial (>3 days left)**: green countdown, no banner on app shell.
- **Active trial (≤3 days left)**: orange countdown, soft banner on app shell.
- **Expired**: red status card, persistent banner: "Trial ended — upgrade to Growth to write."
- **Growth plan**: "You're on Growth — unlimited everything." No countdown.

**App-shell banner** (`app/(app)/layout.tsx`):

```tsx
{trial.isExpired && <ExpiredBanner />}
{trial.plan === "free" && !trial.isExpired && trial.daysLeft <= 3 && <SoftWarningBanner />}
```

### Step 6 — Marketing copy update

`components/marketing/pricing-cards.tsx`:

```diff
  Free
  $0
- "300 operations / month"
+ "First 7 days free — unlimited writes"
+ "Unlimited reads forever"

  Growth
  $79/mo
- "Unlimited operations"
+ "Unlimited writes after day 7"
```

---

## Tests (Step 7)

### Test diagram

```
[+] lib/mcp/trial.ts
  ├── getTrialState()
  │   ├── [TEST] anonymous (no userId) → unlimited
  │   ├── [TEST] Growth user → trialEndsAt: null, isExpired: false
  │   ├── [TEST] DEV email → trialEndsAt: null, isExpired: false
  │   ├── [TEST] free user, first session today → trialEndsAt = today + 7d
  │   ├── [TEST] free user, first session 5 days ago, deploy 6 days ago →
  │   │           trialEndsAt = deploy + 7d (1d remaining, deploy floor wins)
  │   ├── [TEST] free user, first session 30 days ago, deploy 30 days ago →
  │   │           trialEndsAt = first_session + 7d (expired)
  │   ├── [TEST] free user, no session row → trialEndsAt = DEPLOY + 7d
  │   ├── [TEST] cache hit returns cached value (no DB query)
  │   └── [TEST] cache expires after 60s (DB queried again)
  │
  ├── enforceWriteTrial()
  │   ├── [TEST] active trial → resolves
  │   ├── [TEST] expired trial → throws TrialExpiredError
  │   ├── [TEST] Growth → resolves
  │   ├── [TEST] anonymous → resolves (no-op)
  │   └── [TEST] error includes upgrade URL + days-since-expiry
  │
  └── DEPLOY_DATE constant
      └── [TEST] DEPLOY_DATE is in the past (sanity)

[+] lib/tools/execute.ts (modified)
  ├── execWrite
  │   ├── [TEST] free user in trial → write succeeds
  │   ├── [TEST] free user past trial → throws TrialExpiredError
  │   ├── [TEST] Growth user → write succeeds (regression — unchanged)
  │   └── [REGRESSION-TEST] Trial error logs as TRIAL_EXPIRED in operations row
  │       (parallel to existing RATE_LIMIT error class)
  ├── execRead
  │   ├── [TEST] free user past trial → read succeeds (NEW BEHAVIOR)
  │   ├── [TEST] anonymous → read succeeds (regression)
  │   └── [REGRESSION-TEST] No rate-limit code path called for reads

[+] lib/mcp/code-mode/ads-client.ts (modified)
  └── [TEST] gaqlParallel for free expired user → read succeeds (NEW)

[+] app/api/stripe/webhook/route.ts (modified)
  └── subscription_started event
      ├── [TEST] customer.subscription.created → fires event
      ├── [TEST] customer.subscription.updated → does NOT fire event
      ├── [TEST] duplicate webhook (Stripe replay) → does NOT fire event
      └── [TEST] event payload contains plan, interval, amount, stripe_event_id

[+] app/(app)/trial/page.tsx (NEW)
  └── [E2E] free user with active trial → shows countdown
      → [→E2E] using /qa skill once UI lands

[+] User flows
  ├── New signup → first MCP write within 7d → succeeds
  ├── New signup → first MCP write at day 8 → blocked, agent gets nextTool routing
  ├── New signup → first read at day 8 → succeeds
  └── Existing free user (first_session 60d ago) → fresh 7d from deploy date

COVERAGE: 26/26 paths planned (100%)
GAPS: 0 (E2E for trial/page added in step 8 via /qa)
```

### Regression test (mandatory)

The existing `rate-limit.test.ts` and `rate-limit-subscription.test.ts` lock in the OLD behavior (300/mo cap on all ops). They will fail post-change. They are NOT deleted — they are rewritten as `trial.test.ts` with equivalent coverage of the new mechanic. The "300 cap" test cases are preserved with a comment explaining the historical behavior, then asserting the new behavior. This prevents accidental cap reintroduction.

### E2E

After UI lands, run `/qa` against:
- `/trial` — verify countdown renders
- App shell — verify banner appears at <3d remaining (mock state)
- `/upgrade` — verify CTA still works

---

## Rollout plan

1. **Day -1 — Email power users.** The 3 users with >300 ops/30d (e6dbbd0f, 49a434fa, 513d46bb) get a heads-up email: "Pricing change tomorrow. You'll have a fresh 7-day trial starting on deploy. Want to upgrade now to skip the clock? [link]". One-off DM, not a drip campaign.

2. **Day 0 — Deploy.** Set `DEPLOY_DATE` const to deploy day. All free users get fresh 7d from this date.

3. **Day +1 — Monitor.** Check operations table for `error_class = 'TRIAL_EXPIRED'` to size the cohort hitting the wall. Compare to forecast (~5 users in first week).

4. **Day +7 — First grandfather cohort hits expiry.** Watch for support tickets, refund requests, churn signals. Have an "I want to keep using free" email response ready: "We're keeping reads unlimited. For writes, here's a 50% off code for your first month."

5. **Day +14 — Measure paid conversion.** Compare new `subscription_started` event count to baseline (1/week historic). Target: 3-5/week.

---

## NOT in scope

| Item | Why deferred |
|------|--------------|
| Per-user trial extensions / manual comps | No support tooling needed for v1 — Stripe portal lets us comp directly. Add admin UI when we have >5 manual cases/month. |
| Hybrid time + write-count mechanic | Decision #1 is pure time. If conversion underperforms, add write count as a Phase 2 lever. |
| Trial reset on plan downgrade | If a Growth user cancels, they go to free permanently expired. No second trial. Avoids gaming. Document in upgrade flow copy. |
| In-app upgrade flow improvements | Existing `/upgrade` page is fine for now. The ghost-funnel work (`2026-04-22_17-00_new-user-1read-cohort.md`) is separately tracked and higher leverage. |
| Trial extension via referral code | Future growth lever. Don't bundle. |
| Email reminders at 24h / 1h before expiry | Useful but adds Resend orchestration. Phase 2. |
| Migration for `trial_started_at` column | Computed on the fly is sufficient. Add column only when v2 needs overrides. |
| `nextTool` routing implementation itself | Already shipped in PR #73. Trial just produces a structured error that flows through the same path. |
| Audit-apply meter unit decisions | Time-only mechanic doesn't need a meter. Moot. |

---

## What already exists

| Existing | Status |
|---|---|
| `lib/mcp/rate-limit.ts` | Replaced. The cache shape inspires the new trial cache; the `formatResetHint` helper can be reused for the countdown formatter. |
| `lib/subscription.ts` | Reused. Already has `getUserSubscription`, dev-email override, plan resolver. Trial logic plugs in at the same level. |
| `app/(app)/usage/page.tsx` | Rebuilt as `/trial`. Layout, header chrome, refresh button, color helpers all reused. |
| Stripe webhook → sync pattern (`lib/stripe/sync.ts`) | Reused. Adding event firing to the webhook route is a 5-line diff, no architectural change. |
| `trackServerEvent` from `lib/analytics-server.ts` | Reused for `subscription_started` event. |
| Structured nextTool routing (PR #73) | Reused for `TrialExpiredError`. No new infra. |
| DEV_EMAILS bypass | Reused. Dev users keep unlimited writes. |
| `mcp_sessions(user_id)` index | Reused for first-session lookup. No new index needed. |

---

## Failure modes

| Scenario | Test? | Handled? | User-visible? |
|---|---|---|---|
| User on Growth plan, write fails at Google API | yes (existing) | yes (existing WriteResult.success=false) | yes (error message) |
| User in trial, Stripe webhook lag — local row says "free" but Stripe says "active" | partial | **GAP** — sync runs at most every webhook; a user clicking "Upgrade Now" then writing within 5s of checkout could hit the trial check before the webhook lands | yes — they'd see "trial expired" ~5s after paying. Mitigation: post-checkout success page calls `getTrialState(userId)` with cache-bust to force-resync. Add to plan as **CRITICAL**. |
| `mcp_sessions` row missing for paid customer (e.g. paid before connecting) | yes | yes — `MIN(...)` returns null → trial uses DEPLOY_DATE + 7d | no — they're Growth, trial check is bypassed |
| Cache poisoning across users (two users share a cache key) | yes | yes — cache keyed by userId; type-checked | no |
| DEPLOY_DATE in future (deployed early) | yes | yes — sanity test ensures it's in the past at deploy time | no |
| Database query for first session times out | partial | **GAP** — no fallback. A 5s+ DB lag would block all writes for free users. Mitigation: catch query errors in `getTrialState`, default to "trial active" (fail open) — same pattern as existing `resolveMonthlyLimit` catch block. Add to plan. |
| Concurrent writes during the millisecond trial expires | yes | yes — boundary test in trial.test.ts |  |

**Critical gaps to address in implementation:**

1. **Post-checkout cache-bust** — when Stripe webhook lands, invalidate `trialCache.delete(userId)`. Add to `syncStripeSubscription` happy path.
2. **Fail-open on DB error** — wrap the `MIN(mcp_sessions.created_at)` query in try/catch, return `isExpired: false` on failure. Comment explaining this is intentional fail-open like the existing rate-limit fallback.

---

## Worktree parallelization

Three independent workstreams, all touch different modules:

| Lane | Steps | Modules |
|------|-------|---------|
| A | Steps 1-2-3 (trial.ts + execute wiring + plan registry) | `lib/mcp/`, `lib/tools/`, `lib/subscription.ts` |
| B | Step 4 (subscription_started event) | `lib/stripe/`, `app/api/stripe/webhook/` |
| C | Step 5-6 (UI + marketing copy) | `app/(app)/`, `components/marketing/` |

A blocks C (UI calls trial state via server action). B is fully independent. Recommended: launch A and B in parallel worktrees, merge both, then C.

Conflict flags: none. Lanes touch fully disjoint module trees.

---

## Open follow-ups

- After 30 days post-launch, re-run the pricing analysis to size paid conversion lift. Target: 3x baseline (3/week vs 1/week).
- If conversion is underperforming at day 30, evaluate hybrid (write count) as Phase 2.
- Consider expanding trial to 14d if early data shows 7d is too short (the 5/87 late-writer cohort would benefit).

---

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | not run |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | — | not run |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | CLEAR (PLAN) | 0 unresolved, 2 critical gaps flagged with mitigations |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | not run |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | not run |

**UNRESOLVED:** 0 (all 4 decisions locked in)
**CRITICAL GAPS:** 2 (post-checkout cache-bust, DB fail-open) — both with documented mitigations in plan
**VERDICT:** ENG CLEARED — ready to implement
