# Audit Recommendation Apply — design

**Goal:** convert audit recommendations from prose ("Reduce bid on X") into tappable cards in adsagent-chat. One click → server validates → executes the corresponding MCP write tool → reports result + undo.

**Why this matters:** the Apr 25 cohort analysis showed 12/30 read-only chat users explicitly asked the assistant to apply changes ("Fill and propose", "YES FETCH NOW") and got loop-of-clarification instead. Highest D0 lever.

## Scope cut for v1 (ship this)

**Three reversible action types** — no others rendered as Apply cards:
| `actionType` | Maps to write tool | Reversibility | v1 |
|---|---|---|---|
| `pause_campaign` | `pauseCampaign({campaignId})` | enableCampaign | ✓ |
| `pause_keyword` | `pauseKeyword({adGroupId, criterionId})` | enableKeyword | ✓ |
| `add_negative` | `addNegativeKeyword({campaignId or adGroupId, text, matchType})` | removeNegativeKeyword | ✓ |
| `update_budget` | `updateCampaignBudget` | non-trivial diff | v2 |
| anything else | — | — | render as text only |

The whitelist is defense-in-depth. If a future audit emits an `actionType` we don't recognize, the card silently degrades to text.

## Architecture

### 1. Structured audit tool (re-introduce, slimmed)
- **File:** `lib/mcp/audit-tool.ts` — registers `auditAccount` MCP tool (renamed from the deleted `audit` to avoid confusion with prior 1,500-line version).
- **Returns:** `AuditResult` from `computeAuditScore`, but only the chat-relevant subset: `pulseMetrics`, `passes` (with full structured fields), `verdict`. No raw GAQL rows. Keeps response under 8KB so token usage stays sane.
- **Why re-add:** chat needs a single tool call that emits structured recommendations. `runScript` returns prose. Without structure, no cards.
- **Update agent prompt** (`lib/agents/google-ads-agent.ts:121`): replace stale `audit` reference with `auditAccount`.

### 2. Persistence — keep the structured fields
- **File to edit:** `lib/audit/persist.ts` (line 51-54).
- Drizzle column `auditSnapshots.topActions` is already `jsonb` — no migration. Just stop stripping.
- Add `audit_snapshot_id` to `operations` rows when an apply originates from a snapshot, so we can attribute conversions later (defer column add to v2; v1 just emits the link in `reasoning`).

### 3. Apply route — `app/api/chat/recommendations/apply/route.ts`
- **Input:** `{ snapshotId: number, passKey: "stopWasting" | "captureMore" | "fixFundamentals", index: number, idempotencyKey: string }`. **Never trust client-side payload** — server reads the actual recommendation from the DB snapshot, not from the request body. This is the core safety property.
- **Validation pipeline:**
  1. Snapshot belongs to `session.userId` and `session.customerId` (RLS).
  2. Snapshot is < 24h old (stale recommendations refuse).
  3. `actionType` is in the v1 whitelist.
  4. Entity referenced (`campaignId`/`adGroupId`/`targetId`) still exists in the live account (one cheap GAQL ID-only lookup).
  5. Idempotency: refuse if `(snapshotId, passKey, index)` already applied successfully (`operations` row exists with that `reasoning` tag).
- **Execution:** dispatch through the same `execWrite()` path as the MCP tools. No code duplication of write logic — call `pauseCampaign` / `pauseKeyword` / `addNegativeKeyword` from `lib/google-ads/`.
- **Response:** `{ ok: true, changeId: number, undoToolCall: {tool, args} }` — UI shows the undo button using this.

### 4. UI — recommendation card component
- **File:** `components/chat/recommendation-card.tsx`.
- Renders inside the assistant message stream when an `auditAccount` tool result is present.
- States: `idle` → (click Apply) → `applying` (button spinner, disabled, dialog stays open) → `applied` (changeId shown, Undo button) → optional `undone`.
- Conforms to CLAUDE.md UX rules: instant feedback on click, button disable, error at point of failure.
- Cards for unknown `actionType` show only "Discuss" (sends a follow-up message to the chat) — no Apply.

## Eval harness — gate before merge

**The eval is the safety mechanism, not the LLM check.** The question is *does the dispatcher map each PassItem to the correct MCP write tool with correct args?*

### `__tests__/audit-recommendations-apply.test.ts`

**Coverage matrix (failure on any = block merge):**

| Case | Input | Assert |
|---|---|---|
| pause_campaign happy path | `{actionType:"pause_campaign", campaignId:"123"}` | dispatch → `pauseCampaign({campaignId:"123"})` |
| pause_keyword happy path | `{actionType:"pause_keyword", adGroupId:"456", targetId:"789"}` | dispatch → `pauseKeyword({adGroupId:"456", criterionId:"789"})` |
| add_negative campaign-level | `{actionType:"add_negative", campaignId:"123", targetId:"phrase:foo"}` | dispatch → `addNegativeKeyword({campaignId:"123", text:"foo", matchType:"PHRASE"})` |
| add_negative ad-group-level | `{actionType:"add_negative", adGroupId:"456", targetId:"exact:bar"}` | dispatch → `addNegativeKeyword({adGroupId:"456", text:"bar", matchType:"EXACT"})` |
| unknown actionType | `{actionType:"frobnicate", ...}` | refuse with "Unsupported action type" |
| missing required field | `{actionType:"pause_campaign"}` (no campaignId) | refuse with field error, no dispatch |
| stale snapshot (>24h) | snapshot.createdAt = 25h ago | refuse with "Snapshot expired" |
| idempotency replay | apply twice with same `(snapshotId, passKey, index)` | second call returns existing changeId, no second write |
| guardrail violation | `update_budget` (not in v1 whitelist) | refuse with "Not yet supported" |
| entity vanished | `pauseCampaign`, but campaignId no longer exists | refuse with "Campaign not found" before dispatch |
| RLS — wrong user | snapshot belongs to user A, applied by user B | 403 |

**Golden fixtures:** pull 5 anonymized `AuditResult` snapshots from prod (`shared_audits` table; already anonymized) covering each `actionType`. Snapshot them into `__tests__/fixtures/audit-results/`. Each fixture exercises 3+ PassItems.

**Run pre-commit:** `npm run test -- audit-recommendations-apply` is required by `.git/hooks/pre-commit` if present, otherwise gated in CI.

## E2E test — Playwright against dev server

`__tests__/e2e/audit-apply.spec.ts`:
1. Log in as DEV_LOCAL_EMAIL.
2. Navigate `/chat/<new-thread>?auto=audit`.
3. Wait for `auditAccount` tool result to render.
4. Assert at least one Apply card visible.
5. Click first Apply.
6. Assert button shows spinner, then "Applied".
7. Assert `operations` row exists with the expected `tool_name`, `success=1`.
8. Click Undo.
9. Assert second `operations` row, `rolled_back=1` on the first.

Demo account fallback: if no recommendations on the dev account, point the test at the demo customer (`DEMO_CUSTOMER_ID`).

## Build order

1. **Types + dispatcher** (`lib/audit/recommendations.ts`) — pure functions, no DB.
2. **Eval harness** (`__tests__/audit-recommendations-apply.test.ts`) — fail loud, fix forward.
3. **Persistence patch** (`lib/audit/persist.ts`) — keep structured fields.
4. **`auditAccount` MCP tool** + agent prompt update.
5. **Apply route** (`app/api/chat/recommendations/apply/route.ts`).
6. **Recommendation card UI** + chat-shared integration.
7. **E2E test**.
8. **Manual sanity** in dev browser.

## Out of scope for v1
- `update_budget` apply (guardrails)
- Multi-account batch apply
- Scheduled apply ("apply tomorrow")
- Sharing applied changes
- Apply via Claude Code (chat-only for now; Claude Code already has direct tool calls)
- Migrating historical audit_snapshots to populate the structured fields retroactively
