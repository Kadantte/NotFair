# NotFair MCP — 10x Dashboard Redesign (Execution Prompt)

You are a senior TypeScript engineer implementing a comprehensive redesign of the NotFair MCP server. Your goal is to make Claude 10x better and faster at building live Google Ads dashboards by removing friction at the MCP contract layer.

This document is self-contained. Read it end-to-end before writing code. Do **not** ask clarifying questions until you have completed Section 2 (orientation).

---

## 1. Ground rules

**Repository:** `/Users/tongchen/Documents/Projects/ads-agent` — Next.js 16 App Router, TypeScript strict, Drizzle ORM, Vercel deploy, `@modelcontextprotocol/sdk` via `mcp-handler`.

**Primary deploy target:** `https://www.notfair.co` — auto-deploy on push to `main`. Health check at `/api/health`.

**Read-first files (mandatory before any code change):**
- `CLAUDE.md` — project conventions, frontend perf patterns, deploy config
- `DESIGN.md` — visual system (dark-first, warm neutrals, `#4CAF6E` accent). No UI work here but understand the aesthetic.
- `app/api/[transport]/route.ts` — MCP server entry, AsyncLocalStorage auth pattern
- `lib/mcp/types.ts` — `jsonResult`, `safeHandler`, `accountIdParam`, `READ_ANNOTATIONS`
- `lib/mcp/helpers.ts` — `resolveToolAuth`
- `lib/mcp/collect.ts` — `ToolCollector` dual-surface pattern (MCP + chat agent)
- `lib/mcp/telemetry.ts` — `withMcpTelemetry` wrapping
- `lib/mcp/rate-limit.ts` — usage billing (NOT response caching)
- `lib/mcp/read-tools.ts` — 30 read tools (638 lines)
- `lib/mcp/write-tools.ts` — 50 write tools (1555 lines) — skim registration patterns only
- `lib/google-ads/audit.ts` — 1496 lines, the existing audit engine. This is the crown jewel. Do not rewrite it — decompose it.
- `lib/google-ads/types.ts`, `lib/google-ads/client.ts`, `lib/google-ads/helpers.ts`, `lib/google-ads/reads.ts`

After reading, confirm you understand these patterns before proceeding:
- `FindingList<T>` envelope (`shown / total / totalSpend / items`)
- `RecentChange` change-aware attribution
- `MetricsSplit` before/after windowing
- `execRead` / `safeHandler` / `jsonResult` wrapping
- Dual-surface tool registration via `ToolCollector`

**Non-negotiables:**
1. **Backward compat is NOT a goal.** Rename tools, restructure response shapes, drop dead fields, collapse redundant tools. The old `audit` monolith can be replaced outright by the new view tools. Break the wire contract where it makes the architecture cleaner — this is a deliberate rewrite, not an evolutionary refactor. (The only consumer we must not break is the auth/session flow in `resolveAuth` and `/connect` — see Section 15.)
2. **DRY.** Every GAQL query exists in exactly one place. Every response shape is defined once in `lib/mcp/response-types.ts` and imported everywhere. No copy-pasted index-building logic across view tools.
3. **Type-safe wire format.** Every tool's response is a declared TypeScript interface. No `any`. No `Record<string, unknown>` on the response boundary.
4. **Change-aware by default.** Any finding that attributes spend or conversions to an entity must carry a `recentChange: RecentChange | null` field. Callers must be able to tell "this problem is already being fixed."
5. **Observable.** Every new tool emits telemetry via the existing `withMcpTelemetry` wrap. Every cache hit/miss is counted. Every view that skips GAQL queries logs which it skipped.
6. **Tested at three layers.** Unit (pure functions), contract (response shapes against published schemas), integration (mock Google Ads client). See Section 11.
7. **Delete aggressively.** When you replace a tool or response shape, remove the old one in the same commit. No deprecation period. No "v2" suffixes. Rename in place. Grep callers and update them.

**Style:**
- 2-space indent, TypeScript strict, `import type` when importing types only.
- JSDoc on every exported function that isn't self-explanatory from its name.
- No `console.log` in committed code — use the existing `extractErrorMessage({ log: true })` pattern in `lib/google-ads/helpers.ts` for error logging.
- File header comments only when the file does something non-obvious.
- Match existing code style — when in doubt, grep for a similar file and mirror it.

**Tooling:**
- `pnpm typecheck` — zero errors
- `pnpm lint` — zero warnings
- `pnpm test` — all green, plus new tests you add
- `pnpm build` — completes without error
- Run these four after every phase. Do not proceed to the next phase until all four pass.

---

## 2. Orientation (mandatory first step)

Before writing any code:

1. Read every file in the "Read-first" list above. Budget ~30 minutes.
2. Run `pnpm test` and record the current passing-test count as your **baseline green**. Your final test suite must have ≥ baseline green + every new test you add, all passing.
3. Run `pnpm typecheck` and confirm it's clean. Any preexisting type errors should be noted but not fixed as part of this work.
4. Look at the existing dashboard that consumes `audit`: find any `fetch` calls in `app/(app)/dashboard/` and `components/dashboard/` and note what they do. This is your consumer — protect its contract.
5. In `lib/google-ads/audit.ts`, identify the 19 GAQL queries by their `// N.` comments (numbered 0–18). You will reference these by number when factoring the engine.
6. Write a short ORIENTATION.md to `/Users/tongchen/Documents/Projects/ads-agent/docs/mcp-10x/ORIENTATION.md` (~200 lines) capturing:
   - Baseline test count
   - The 19 queries grouped by concern (scorecard / campaigns / waste / opportunities / conflicts / changes / timeseries / metadata)
   - Every public export from `lib/mcp/*` and `lib/google-ads/*` with a one-line description
   - Every consumer of `audit` and what fields they read
   - Any inconsistencies you find (dead code, duplicated logic, `any` casts)

Do not skip this step. Every subsequent phase assumes you did it.

---

## 3. Phase 1 — Structured output (highest leverage, ~20 LOC diff)

**Problem:** `jsonResult` in `lib/mcp/types.ts` stringifies every response into `content[0].text`. Consumers must `JSON.parse` and walk wrapped objects. Modern MCP clients (Claude, Cursor) support `structuredContent` as a first-class typed channel but we never populate it.

**Change:** Replace `jsonResult` with a typed wrapper that makes `structuredContent` the primary channel. Keep a minimal `content[0].text` fallback only for clients that strictly require it — but the text should be a short human summary, not the full JSON dump.

```ts
// lib/mcp/types.ts
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

export function typedResult<T>(
  value: T,
  summary?: string, // optional one-line human summary for text-only clients
): CallToolResult {
  return {
    content: [{ type: "text", text: summary ?? defaultSummary(value) }],
    structuredContent: (value ?? null) as Record<string, unknown> | null,
  };
}

function defaultSummary(value: unknown): string {
  if (value == null) return "null";
  if (Array.isArray(value)) return `${value.length} items`;
  if (typeof value === "object") return `${Object.keys(value as object).length} fields`;
  return String(value);
}
```

Rename `jsonResult` → `typedResult` across every call site. Delete the old `jsonResult` export. Every tool handler now passes a typed value and optionally a summary. Since backward compat is not a goal, this is a simple find-and-replace plus type-tightening pass.

**Tests to add** (`lib/mcp/types.test.ts`):
- `typedResult({ a: 1 })` returns a short text summary AND `structuredContent === { a: 1 }`.
- `typedResult(null)` returns `structuredContent === null`.
- `typedResult([1, 2, 3])` default summary is `"3 items"`.
- Explicit summary: `typedResult({...}, "5 campaigns loaded")` uses the provided summary.
- Type-level test: `typedResult<AuditResult>(x)` forces `x: AuditResult` — no implicit `any`.

**Verification:**
- `pnpm test lib/mcp/types.test.ts` — all green.
- `pnpm typecheck` — clean.
- Grep for `jsonResult(` across the repo — zero hits remain.
- Write a throwaway script `scripts/verify-structured-output.ts` that boots the MCP server in-process (use the `ToolCollector` pattern), calls a read tool, and asserts `structuredContent` is the typed object. Delete after verifying.

**Success criterion:** Every tool call returns typed `structuredContent`. Dashboards read `result.structuredContent` directly with zero parsing.

---

## 4. Phase 2 — Response type registry (DRY foundation)

**Problem:** Response shapes are inferred from handler return types and scattered across 2600+ lines. There's no central place where the wire contract is declared. You cannot publish schemas you don't have.

**Change:** Create `lib/mcp/response-types.ts` as the single source of truth for every tool's response shape.

**Requirements:**
- For every existing read tool in `lib/mcp/read-tools.ts`, declare and export a `<ToolName>Response` interface in `response-types.ts`. Example: `GetAccountInfoResponse`, `ListCampaignsResponse`, `AuditResponse` (reuse the existing `AuditResult` type from `lib/google-ads/audit.ts` — re-export).
- Every shared sub-type (`FindingList<T>`, `RecentChange`, `MetricsSplit`, `ChangeEventSummary`) lives in `lib/mcp/response-types.ts` and is re-exported from `lib/google-ads/audit.ts` for internal use. Move the definitions; import everywhere else.
- Update every handler return type annotation to the declared interface. TypeScript must enforce the contract at every handler.
- Add a `safeTypedHandler<TIn, TOut>(fn: (args: TIn) => Promise<TOut>)` helper in `lib/mcp/types.ts` that wraps `safeHandler` with typed return. Use it in every new tool.

**DRY enforcement:**
- No inline `type` declarations inside handler bodies.
- No `Promise<any>`, `Promise<unknown>`, or `Promise<Record<string, unknown>>` on handler return types.
- If two tools share a sub-shape (e.g. `Money`, `Timeseries`, `Rate`), extract it.

**Tests to add** (`lib/mcp/response-types.test.ts`):
- Compile-only tests (type-level) using `expectType` from `tsd` or a custom `Equals<A, B>` helper:
  - `Equals<GetAccountInfoResponse, Awaited<ReturnType<typeof handler>>>` is `true`.
  - Every `*Response` type is exported.
  - Every `FindingList<T>` has the four required fields.
- Runtime snapshot tests: run each read tool against a frozen mock Google Ads client (see Phase 9) and snapshot the response shape. Any future change that alters the wire contract fails the snapshot.

**Verification:**
- `pnpm typecheck` — clean.
- `pnpm test lib/mcp/response-types.test.ts` — all green.
- Grep for `Promise<any>` and `Promise<unknown>` inside `lib/mcp/` — zero hits.

---

## 5. Phase 3 — Audit decomposition (factor the monolith)

**Problem:** `runAudit` in `lib/google-ads/audit.ts` fires 19 queries and returns one mega-result. Every consumer pays for all 19 queries even if they need a slice.

**Change:** Factor `lib/google-ads/audit.ts` into `lib/google-ads/audit/`:

```
lib/google-ads/audit/
├── index.ts                      # public barrel — re-exports runAudit and every view
├── queries.ts                    # all GAQL strings as typed functions returning rows
├── indexes.ts                    # change_event indexes, negatives-by-campaign, QS map
├── scorecard.ts                  # account + summary + pulse
├── campaigns.ts                  # campaign view with IS matrix, device, network, assets
├── findings/
│   ├── waste.ts                  # wastedKeywords + wastedSearchTerms
│   ├── opportunities.ts          # miningOpportunities + budgetConstrainedWinners + brand
│   ├── conflicts.ts              # negativeConflicts
│   └── landing-pages.ts
├── changes.ts                    # change_event feed + resolveRecentChange
├── timeseries.ts                 # daily per-campaign metrics → canonical series
└── orchestrator.ts               # runAudit — composes the above
```

**Requirements:**
- Each module exports pure functions that take typed input (auth + already-fetched rows, or auth + narrow queries) and return typed output. No module re-issues a query another module already ran.
- `queries.ts` is the **only** place GAQL strings live. Each query is a named exported function like `queryCampaignsForAudit(start, end)` that returns `string`. These strings are covered by snapshot tests.
- `indexes.ts` builds every cross-query index once — `changesByResource`, `changesByCampaign`, `changesByAdGroup`, `negativesByCampaign`, `qsMap`, `dailyByCampaign`. These are consumed by every finding module.
- `orchestrator.ts` preserves the **behavior** of `runAudit` (resilient parallel queries, same finding semantics, same thresholds) but is free to restructure the response shape. If the new shape is cleaner — e.g. flattening nested `findings.wastedKeywords` to top-level `waste`, or dropping redundant fields — do it. Update consumers in the same PR.
- Every module's public function has a JSDoc describing its inputs, outputs, and the queries it requires.

**DRY enforcement:**
- Zero GAQL strings outside `queries.ts`.
- Zero duplicate index-building logic.
- Zero copy-pasted `micros()` conversions — use `lib/google-ads/helpers.ts`.
- Zero inline enum mappings — `DEVICE_NAME`, `CHANGE_RESOURCE_TYPE`, etc. move to `lib/google-ads/enums.ts`.

**Tests to add:**
- `lib/google-ads/audit/queries.test.ts`: snapshot every GAQL string. Any future change is explicit.
- `lib/google-ads/audit/indexes.test.ts`: given a fixture of raw rows, the index builders produce the expected maps. Include edge cases (missing resource names, malformed dates, zero changes in window).
- `lib/google-ads/audit/findings/*.test.ts`: each finding module tested against a fixture. For waste: test the 2x-CPA threshold, test that zero-CPA falls back to Infinity. For opportunities: test the 2+ conversion threshold for mining, the 15% budget-lost threshold for winners.
- `lib/google-ads/audit/orchestrator.test.ts`: **behavioral regression test**. Load a frozen fixture of Google Ads responses from `lib/google-ads/audit/__fixtures__/pawsvip-2026-04-22.json` (create this from a real audit run). Run the orchestrator with a mock that returns those fixtures. Assert the output matches a golden file `lib/google-ads/audit/__fixtures__/pawsvip-2026-04-22.result.json` — which you author fresh after the restructure. The point isn't preserving the old shape, it's locking in the new one so future changes are explicit. Commit both fixture and golden file. Every subsequent refactor must update the golden intentionally.

**Verification:**
- `pnpm test lib/google-ads/audit/` — all green.
- `pnpm typecheck` — clean.
- `wc -l lib/google-ads/audit.ts` → file becomes a thin re-export barrel (< 30 lines). Original logic now lives in the `audit/` subdirectory.
- Golden fixture test is green. Any intended shape change after this point requires an explicit golden-file update in the same PR.

---

## 6. Phase 4 — Composable view tools (and retire the monolith)

**Problem:** Even after decomposition, `audit` is still a mega-tool. Dashboards should subscribe to narrow slices. The old `audit` tool should be **removed** and replaced by this view set.

**Change:** Add these tools to `lib/mcp/read-tools.ts`, each a thin adapter over the Phase 3 modules. After all seven are shipped and wired, **delete the `audit` tool registration** and remove any consumers that depended on its exact shape (update them to the new views). If callers genuinely need "everything at once," they can call the view tools in parallel — the cache layer (Phase 5) makes repeated subqueries free.

| Tool | Input | Output | Queries it runs |
|------|-------|--------|-----------------|
| `getAccountScorecard` | `accountId?, days?` | account + summary + pulse | Q0, Q1, Q17 (for changes) |
| `getCampaignPulse` | `accountId?, days?` | campaigns[] with IS matrix, device, network, metricsSplit | Q1, Q9, Q12, Q14, Q17, Q18 |
| `getWasteFindings` | `accountId?, days?, limit?` | wastedKeywords + wastedSearchTerms | Q5, Q7, Q17 |
| `getOpportunityFindings` | `accountId?, days?, limit?` | miningOpportunities + budgetConstrainedWinners + brandLeakage | Q1, Q5, Q6, Q17 |
| `getNegativeConflicts` | `accountId?, days?, limit?` | negativeConflicts | Q6, Q13, Q17 |
| `getLandingPagePerformance` | `accountId?, days?, limit?` | landingPages | Q16 |
| `getAccountChanges` | `accountId?, days?, limit?` | recentChanges + summary (count by user, by resource type) | Q17 |

**Requirements:**
- Every view tool calls only the queries it actually needs. Measure this — assert in tests that `getWasteFindings` fires ≤ 3 queries, never 19.
- Every view tool reuses the same index-building and finding-module code as `audit` via Phase 3. No logic duplication.
- Every view tool accepts `accountId?` via `accountIdParam` (existing pattern) and uses `resolveToolAuth`.
- Every view tool has `READ_ANNOTATIONS`.
- Every view tool's description is ≥ 100 words, written for Claude: what it returns, when to call it, what it does **not** include (so Claude doesn't over-call). Mirror the existing `audit` description style.
- Every view tool's handler uses `safeTypedHandler<InputType, ResponseType>` and returns `typedResult<ResponseType>`.
- After this phase: `audit` is deleted from `lib/mcp/read-tools.ts`. Any existing `app/(app)/dashboard/` consumers are migrated to the new view tools in the same PR.

**Acceptance criterion:** The dashboard previously built on `audit` is rebuilt to call `getAccountScorecard` + `getWasteFindings` + `getRecentChanges` (or similar narrow set) and refreshes each slice independently. Total query count across the three calls is ≤ what `audit` ran. Measure this.

**Tests to add** (`lib/mcp/view-tools.test.ts`):
- For each new tool: mock the Google Ads client, invoke the tool via `collectAdsTools`, assert the response matches the declared `*Response` type (use the response-types snapshots from Phase 2).
- Query-count assertion: spy on the mock client and assert exact query count per tool.
- Shared-index assertion: when two view tools are called in the same request, neither runs a query it already ran (once caching is in place in Phase 5 — add TODO for now, flip to hard assertion after Phase 5).

**Verification:**
- `pnpm test lib/mcp/view-tools.test.ts` — all green.
- Manual smoke: run `pnpm dev`, connect with Claude Code via `mcp-remote`, call `tools/list`, confirm all seven new tools appear with descriptions. Call each against your PawsVIP account, confirm it returns structured data.

---

## 7. Phase 5 — Cache layer

**Problem:** Every artifact reload re-hits Google Ads. No cache at the MCP layer.

**Change:** Add `lib/mcp/cache.ts`:

```ts
type CacheBucket = "read" | "detection" | "timeseries";
const TTL_MS: Record<CacheBucket, number> = {
  read: 30_000,
  detection: 60_000,
  timeseries: 45_000,
};

interface CacheEntry { at: number; value: unknown }
const CACHE = new Map<string, CacheEntry>();
const METRICS = { hits: 0, misses: 0, evictions: 0 };

export function cacheKey(
  userId: string | null,
  customerId: string,
  toolName: string,
  args: Record<string, unknown>,
): string {
  // Canonicalize args (sort keys, drop undefineds) before hashing
  ...
}

export async function cached<T>(
  bucket: CacheBucket,
  key: string,
  fn: () => Promise<T>,
): Promise<T> { ... }

export function invalidateCustomer(customerId: string): number { ... }
export function getCacheMetrics() { return { ...METRICS, size: CACHE.size }; }
```

**Requirements:**
- Integrate at the `safeHandler` layer — every read tool becomes cache-aware automatically via a new `cachedSafeHandler` variant. Do not touch 30 call sites individually.
- Every write tool calls `invalidateCustomer(targetId)` after a successful mutation. Do this in `lib/mcp/write-tools.ts` at the existing `execWrite` layer.
- Cache keys include `userId`, `customerId`, `toolName`, canonicalized args. Do not key on `sessionId` (cache should survive reconnects).
- Expose `getCacheMetrics` via a debug endpoint `/api/debug/cache-metrics` (gated by an env-var token).
- LRU eviction at 10,000 entries to prevent memory growth.

**Tests to add** (`lib/mcp/cache.test.ts`):
- Hit / miss / eviction counters.
- TTL respected (use `vi.useFakeTimers()`).
- `invalidateCustomer("123")` removes only keys containing `":123:"`, leaves others.
- Canonicalization: `{ a: 1, b: 2 }` and `{ b: 2, a: 1 }` produce identical keys.
- LRU eviction at cap.
- Concurrent `cached()` calls with the same key only invoke `fn()` once (request coalescing).

**Verification:**
- `pnpm test lib/mcp/cache.test.ts` — all green.
- Integration test: call `getAccountScorecard` twice in succession, assert the second call issues zero Google Ads queries.
- Manual smoke: call a read tool, immediately call a write tool that mutates the same customer, then re-call the read tool. Second read must fetch fresh data.

---

## 8. Phase 6 — Chart-ready timeseries tool

**Problem:** Every dashboard reshapes raw GAQL rows into chart-ready format. Ship a canonical shape.

**Change:** Add `getTimeseries` to `lib/mcp/read-tools.ts` with this response shape (in `response-types.ts`):

```ts
export type Metric =
  | "spend" | "clicks" | "conversions" | "cpa" | "ctr"
  | "impressions" | "conversion_rate" | "roas" | "conversion_value";

export type Granularity = "day" | "week" | "month";

export interface TimeseriesPoint {
  date: string; // ISO date for day; ISO week-start for week; YYYY-MM for month
  [metric: string]: number | string;
}

export interface TimeseriesSegment {
  dimensions: Record<string, string>; // e.g. { campaign_id, campaign_name }
  points: TimeseriesPoint[];
}

export interface TimeseriesResponse {
  meta: {
    currency: string;
    timezone: string;
    granularity: Granularity;
    startDate: string;
    endDate: string;
    metrics: Metric[];
  };
  series: TimeseriesSegment[];
  comparison?: {
    periodLabel: string;
    startDate: string;
    endDate: string;
    series: TimeseriesSegment[];
  };
}
```

**Requirements:**
- Tool input: `accountId?, startDate, endDate, granularity, metrics[], groupBy?: "campaign" | "ad_group" | "device" | "network" | "account", comparePreviousPeriod?: boolean, campaignIds?: string[]`.
- GAQL generation handles every valid `groupBy` dimension.
- Derived metrics (`cpa`, `ctr`, `conversion_rate`, `roas`) computed per point, not aggregated across groups.
- `comparePreviousPeriod` adds a shifted overlay of the same length.
- Weekly granularity aggregates by ISO week start (Monday).
- Monthly granularity aggregates by calendar month.
- All zero-division cases return `null`, never `0` or `NaN`.

**Tests to add** (`lib/mcp/timeseries.test.ts`):
- Each metric computed correctly from fixture rows.
- Each granularity buckets correctly.
- `comparePreviousPeriod` returns the correct shifted window.
- `groupBy: "campaign"` returns one segment per active campaign.
- Empty date range returns `{ series: [] }` with meta intact.
- Date range > 730 days is rejected with a clear error.

**Verification:**
- `pnpm test lib/mcp/timeseries.test.ts` — all green.
- Manual smoke: a dashboard artifact drops `TimeseriesResponse` directly into Recharts with zero reshape code.

---

## 9. Phase 7 — MCP resources (schema + playbook publishing)

**Problem:** Claude has to guess your tool contract and re-derive the "how to build a dashboard" playbook every conversation. Both should be published artifacts Claude fetches.

**Change:** Extend `lib/mcp/collect.ts` and `app/api/[transport]/route.ts` to register MCP resources.

**Resources to ship:**

| URI | Content |
|-----|---------|
| `adsagent://schemas/index.json` | List of every tool with its input & output JSON Schemas |
| `adsagent://schemas/audit-result.json` | JSON Schema for `AuditResult` |
| `adsagent://schemas/timeseries.json` | JSON Schema for `TimeseriesResponse` |
| `adsagent://schemas/finding-list.json` | JSON Schema for `FindingList<T>` |
| `adsagent://prompts/build-daily-dashboard.md` | The "good default molecule" playbook: what tools to call, what sections to render, what to highlight |
| `adsagent://prompts/customize-dashboard.md` | How to accept user feedback ("show only active campaigns") and translate to tool calls + artifact updates |
| `adsagent://prompts/drill-down.md` | How to drill from a finding to supporting detail via narrow tool calls |
| `adsagent://prompts/explain-regression.md` | How to investigate a CPA regression using `getCampaignPulse`, `getAccountChanges`, and `metricsSplit` |

**Requirements:**
- Auto-generate JSON Schemas from TypeScript types at build time. Use `ts-json-schema-generator` or `zod-to-json-schema`. Pick one, commit the config, run in `pnpm build`.
- Playbooks are markdown files committed at `docs/mcp-playbooks/` — the resource server reads them from disk (or bundles them via `import.meta`).
- `ToolCollector` is extended with a `resources: CollectedResource[]` field. The chat agent (in `lib/agent/`) can consume published playbooks too.
- Every playbook includes:
  - When to use it
  - Exact tool calls in sequence
  - How to render (sections, order, visual emphasis)
  - Common user follow-ups and how to handle them

**Tests to add** (`lib/mcp/resources.test.ts`):
- Every `*Response` type has a generated JSON Schema.
- Every playbook file exists and is non-empty.
- JSON Schema validates a sample response for every tool. Use `ajv`.
- Contract test: run each read tool against fixtures, validate the response against its published schema. Any wire drift fails CI.

**Verification:**
- `pnpm test lib/mcp/resources.test.ts` — all green.
- Manual smoke: connect with Claude, call `resources/list`, confirm all resources appear. Fetch the dashboard playbook, ask Claude to build a dashboard, observe it follows the playbook.

---

## 10. Phase 8 — Dashboard mutation tools

**Problem:** "Show me last 14 days instead" currently forces Claude to regenerate the entire artifact. There's no typed way to update a parameter.

**Change:** Introduce a small set of mutation tools that operate on a dashboard state object (the "typed spine" from our earlier design). These do not mutate Google Ads — they mutate the dashboard's own parameters, which the artifact then re-reads.

**Tools to add:**

| Tool | Purpose |
|------|---------|
| `updateDashboardDateRange` | `{ artifactId, startDate, endDate }` → emits a structured update |
| `updateDashboardAccount` | `{ artifactId, accountId }` |
| `addDashboardChart` | `{ artifactId, chartType, groupBy, metrics, position }` |
| `removeDashboardChart` | `{ artifactId, chartId }` |
| `updateDashboardFilter` | `{ artifactId, field, operator, value }` |
| `setDashboardLayout` | `{ artifactId, layout: "single" \| "two-col" \| "grid" }` |

**Requirements:**
- Define a typed `DashboardSpec` interface in `lib/dashboard/spec-types.ts` — the JSON shape the artifact reads on mount.
- Every mutation tool validates its input against a Zod schema and returns the new `DashboardSpec` (typed, idempotent).
- Artifact stores the spec in a Cowork artifact data channel. Mutations update the spec; artifact re-reads.
- Publish a playbook `adsagent://prompts/customize-dashboard.md` that walks Claude through: user says X → call mutation tool Y → tell user what changed.

**Tests to add** (`lib/dashboard/mutations.test.ts`):
- Each mutation produces a valid `DashboardSpec`.
- Invalid input is rejected with a typed error including `retryable: false` and `suggestedFix`.
- Idempotency: calling the same mutation twice with the same args produces the same spec.

**Verification:**
- `pnpm test lib/dashboard/mutations.test.ts` — all green.
- End-to-end: open a dashboard artifact, ask Claude "show me last 14 days", confirm Claude calls `updateDashboardDateRange`, the artifact re-reads, and the charts update without regeneration.

---

## 11. Testing strategy (applies to every phase)

We test at four layers. Every phase must add tests at layers 1, 2, and 3. Layer 4 is per-major-milestone.

**Layer 1 — Unit tests (pure functions).**
- Every module in `lib/google-ads/audit/` has a `.test.ts` sibling.
- Every helper in `lib/mcp/` has a `.test.ts` sibling.
- Mock nothing — pure input/output.
- Aim for ≥ 90% line coverage on pure modules. Measure via `pnpm test --coverage`.

**Layer 2 — Contract tests (response shapes).**
- For every tool, a fixture of mock Google Ads rows → expected response.
- Snapshot-tested via `expect(response).toMatchSnapshot()`.
- Response validated against its published JSON Schema via `ajv`.
- Any wire-format change requires updating the snapshot — explicit and reviewable.

**Layer 3 — Integration tests (mock client).**
- Build a `MockGoogleAdsClient` in `lib/google-ads/__mocks__/client.ts` that accepts a fixture file and replays it.
- For each tool, run it through `collectAdsTools` end-to-end with the mock client.
- Assert: response structure, query count, telemetry events emitted, cache interactions.

**Layer 4 — End-to-end smoke (real data, manual gate).**
- A `scripts/smoke-test.ts` that connects to a real test Google Ads account (credentials in `.env.test.local`, never committed).
- Runs every read tool, asserts non-error responses.
- Measures p50/p95 latency per tool.
- Run before every deploy to production. Attach the output to the PR description.

**Coverage gates:**
- `lib/mcp/` and `lib/google-ads/audit/` must have ≥ 85% line coverage. CI fails otherwise.
- Every exported function in those directories must have at least one test.
- No skipped tests (`it.skip`, `describe.skip`) in committed code.

**Performance gates:**
- `audit` completes in ≤ 10s p95 against a medium-sized account (50 campaigns, 30-day window). Measured by the smoke test.
- `getAccountScorecard` completes in ≤ 2s p95.
- `getTimeseries` with 90-day range, 10 campaigns, day granularity completes in ≤ 3s p95.
- Cache hit path completes in ≤ 50ms p95.

**Regression gates:**
- Every tool (new or renamed) must produce output that matches its golden fixture in `__fixtures__/`. Changing output requires updating the golden in the same PR with a written justification in the commit message. This locks in intentional change and catches accidental drift.

**CI wiring:**
- Add `pnpm test:coverage`, `pnpm test:contract`, `pnpm test:integration` scripts to `package.json`.
- GitHub Actions or Vercel Checks: run all three on every PR. Block merge on failure.
- Add a `.github/workflows/mcp-checks.yml` if one doesn't exist.

---

## 12. Execution order & phase gates

Do the phases in order. Each phase gate is pass/fail — do not proceed if any check fails.

1. **Orientation** (Section 2). Gate: `ORIENTATION.md` written, baseline green test count recorded.
2. **Phase 1 — Structured output.** Gate: types tests pass, typecheck clean, manual smoke confirms `structuredContent` present.
3. **Phase 2 — Response type registry.** Gate: zero `Promise<any>` in `lib/mcp/`, every tool has a declared response type, type-level tests pass.
4. **Phase 3 — Audit decomposition.** Gate: regression test green (byte-identical `runAudit` output), `lib/google-ads/audit.ts` is a thin re-export, every submodule has ≥ 90% coverage.
5. **Phase 4 — View tools.** Gate: seven new tools shipped, each fires only the queries it needs, integration tests green, manual smoke against real account succeeds.
6. **Phase 5 — Cache.** Gate: cache tests pass, integration test confirms second call avoids GAQL, write tools invalidate, metrics endpoint works.
7. **Phase 6 — Timeseries.** Gate: every metric/granularity/groupBy combination tested, manual smoke confirms dashboard chart renders without reshape.
8. **Phase 7 — Resources.** Gate: every schema published, playbooks committed, contract tests green.
9. **Phase 8 — Mutations.** Gate: mutations tested, end-to-end dashboard update works.

**Between phases:**
- Commit. Write a commit message that says what changed, what's tested, what's still TODO.
- Run `pnpm typecheck && pnpm lint && pnpm test && pnpm build` — all four green.
- If touching deploy-critical paths, ping the user before pushing to `main`. Otherwise auto-deploy is fine.

---

## 13. Common pitfalls (read before starting)

- **Rename and delete freely.** Backward compat is not a goal. If a tool name is ambiguous, rename it. If a field is dead, drop it. Update every caller in the same PR. Commit the grep-and-replace explicitly so the diff reads as a deliberate rewrite.
- **But don't drop fields by accident.** Changes to wire shape should be captured in a golden fixture update. Unintentional drift must fail CI.
- **AsyncLocalStorage is per-request.** Every new tool uses `currentAuth` through the existing pattern. Never read auth from a closure or module-level variable.
- **Google Ads rate limits.** Don't add tools that issue unbounded query loops. Every new query has a `LIMIT`.
- **change_event API is capped at 30 days.** Respect `changeEventDays` bounding as `runAudit` does.
- **Impression share is capped at 90 days.** Same bounding applies.
- **Vercel lambda cold start.** Cache is in-memory, so it's per-instance. This is fine for our scale but document the limitation.
- **Node 20+ IPv6 metadata bug.** See the `GCLOUD_PROJECT` workaround at the top of `route.ts`. Don't remove it.
- **`mcp-remote-fallback-test` normalization.** Don't remove the `normalizeClientName` logic — it's load-bearing for analytics.
- **Do not touch the auth path.** The `/connect` flow, `resolveAuth`, `captureClientInfo`, bearer token resolution, OAuth access token (`oat_`) handling, and session lifecycle are out of scope. Even with "no backward compat" freedom, these stay untouched. Users currently connected must stay connected.
- **Next.js 16 specifics.** Check for breaking changes in route handlers, `after()`, and caching behavior vs. 15. The `maxDuration: 60` in `createMcpHandler` config is still correct. Async `params`/`searchParams` APIs are default in 16 — don't regress back to sync patterns if touching any route handler.

---

## 14. Deliverables

At the end of this work, the following must be true:

- [ ] Every tool returns typed `structuredContent` via `typedResult`. `jsonResult` is deleted.
- [ ] Every tool has a declared TypeScript response type in `lib/mcp/response-types.ts`. Zero `Promise<any>` in `lib/mcp/`.
- [ ] `lib/google-ads/audit.ts` is decomposed into `lib/google-ads/audit/` with pure composable modules. The original file is a thin re-export barrel (< 30 lines) or removed entirely in favor of `lib/google-ads/audit/index.ts`.
- [ ] Seven new view tools are registered and documented: `getAccountScorecard`, `getCampaignPulse`, `getWasteFindings`, `getOpportunityFindings`, `getNegativeConflicts`, `getLandingPagePerformance`, `getAccountChanges`.
- [ ] The old `audit` tool is removed. Every consumer migrated.
- [ ] `getTimeseries` is registered with full dimension and granularity support.
- [ ] `lib/mcp/cache.ts` caches reads, invalidates on writes, exposes metrics.
- [ ] MCP resources publish JSON Schemas and four playbooks.
- [ ] Six dashboard mutation tools work with a typed `DashboardSpec`.
- [ ] Test suite: baseline green + ≥ 200 new tests, all passing.
- [ ] Coverage ≥ 85% in `lib/mcp/` and `lib/google-ads/audit/`.
- [ ] `pnpm typecheck && pnpm lint && pnpm test && pnpm build` all green on Next.js 16.
- [ ] `scripts/smoke-test.ts` runs green against a real test account.
- [ ] A new live dashboard artifact is built using only the new tools. It renders faster and refreshes slices independently.
- [ ] `docs/mcp-10x/CHANGELOG.md` documents every new tool, every removed tool, every renamed field, every new resource, and every behavior change per phase. This is the written justification trail for the rewrite.

---

## 15. When to escalate

Pause and ask the user (Tong) before:
- Introducing a new dependency that isn't already in `package.json`.
- Touching `app/api/[transport]/route.ts` beyond adding resource registration in the `createMcpHandler` callback.
- Any change to `resolveAuth`, `captureClientInfo`, `normalizeClientName`, OAuth token handling, or session lifecycle. These are explicitly out of scope.
- Any migration of the Postgres schema (`schema.mcpSessions`, `schema.oauthClients`, `schema.operations`).
- Deploying to production (push to `main`).

Renaming tools, restructuring responses, deleting dead fields, collapsing redundant shapes — **do not escalate**, just do it and commit with a clear changelog entry.

Otherwise, execute. Commit frequently. Test rigorously. Boil the lake.

---

## 16. Starting command

```
Read Section 2 (Orientation). Write docs/mcp-10x/ORIENTATION.md. Then proceed to Phase 1.
```

Good luck.
