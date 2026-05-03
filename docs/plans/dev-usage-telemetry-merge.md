# /dev Usage + Telemetry Merge

**Goal:** One simple `/dev` surface that answers three questions in the first viewport: how is volume trending, what's the error rate, and who is running into errors. Kill the duplication between the `usage` tab and the `/dev/telemetry` page.

**Status:** Plan reviewed via /plan-design-review. Ready for engineering implementation.

---

## Resolved decisions

| Decision | Choice |
|----------|--------|
| Merge shape | Full merge into one `/dev` tab; delete `/dev/telemetry` outright (404). |
| Default time range | 30d. Range options: 24h · 7d · 30d · 90d. |
| Click target on "Top users by errors" | Adds an Activity section to `/dev/[accountId]` (per-customer telemetry view). |
| Customers tab | Gains an "Errors (Nd)" column, sorted by error rate. |

## Approved layout (Usage tab)

```
/dev  ·  customers · USAGE · outreach · developer        [24h 7d 30d 90d] [↻]
────────────────────────────────────────────────────────────────────────────
  TOTAL CALLS         ERROR RATE          ACTIVE USERS       NEW USERS
  12,847              2.3%                23                 4
  ▲ 18% vs prev 30d   ▼ 1.1pp vs prev    ▲ 3 vs prev        this period
────────────────────────────────────────────────────────────────────────────
  Volume + errors (last 30d)        [Reads ■ Writes ■ Errors ●]
  ┌────────────────────────────────────────────────────────────────────┐
  │ stacked bars (reads green, writes orange) + errors as red dots     │
  │ overlaid on a secondary right-axis (% rate)                        │
  └────────────────────────────────────────────────────────────────────┘
────────────────────────────────────────────────────────────────────────────
  TOP USERS BY ERRORS                                  click → /dev/<acct>
  ────────────────────────────────────────────────────────────────────
   tong@x.com         18 errs / 412 calls  4.4%  │ TimeoutError, 429
   alex@y.io           9 errs / 203 calls  4.4%  │ ValidationError
   pat@biz.dev         3 errs /  98 calls  3.1%  │ TimeoutError
────────────────────────────────────────────────────────────────────────────
  TOP TOOLS                                       ▸ expand for p50, p95
   listKeywords         3,201    0.4%
   getRecommendations   1,892    1.1%
   runScript              847    8.2%  ⚠
```

**Subtraction default applied — explicitly NOT carrying over from the old telemetry page:**
- "Top arg shapes" panel — interesting but rarely actionable for the three questions.
- "Recent Calls" tab with full args/error message expansion — moves to `/dev/[accountId]` Activity section, scoped to one user.
- The "By Tool" sub-tab — collapses into a single "Top Tools" section here.

## Design system alignment (DESIGN.md)

| Element | Token |
|---------|-------|
| Reads | `#4CAF6E` (Chart 1 / accent) |
| Writes | `#D4882A` (Chart 2 / warning) |
| Errors | `#C45D4A` (Chart 3 / danger) |
| Stat tile background | `#24231F` (Surface) |
| Border | `#3D3C36` |
| Body text | `#E8E4DD` |
| Muted | `#C4C0B6` |
| Numbers | JetBrains Mono 500/600, tabular-nums |
| Headings | General Sans 600 |
| Trend deltas | DM Sans 500, paired with ▲/▼ glyph |

Trend delta colors:
- Volume up = green; volume down = muted (not red — growth dropping is signal, not error).
- Error rate up = `#C45D4A`; error rate down = `#5DBE82` (success, distinct from accent).

## Interaction states

| Section | Loading | Empty | Error | Sparse data |
|---------|---------|-------|-------|-------------|
| Stat tiles | Skeleton with same dimensions, no number flash | "—" with muted "no calls in window" caption | Red dot + "data unavailable" sub | If prior period has 0 calls or window predates the platform, show "new" instead of `▲ ∞%` |
| Volume chart | Skeleton bars at full height, 30% opacity | Centered "No API usage in this range." | Inline alert, keep header + range selector | Render whatever days we have; do not pad-zero before platform start (`2026-03-25`) |
| Top users by errors | Skeleton rows | "🟢 No errors in this range." (positive framing) | Inline alert | Show top 10 cap; if fewer, render exactly that many |
| Top tools | Skeleton bars | "No tool calls yet." | Inline alert | Cap at 20 |

## Responsive

- **≥1024px:** Stat tiles in 4 columns; chart full-width; top-users + top-tools side-by-side at 2 columns.
- **640–1023px:** Stat tiles in 2 columns; everything else stacks full-width.
- **<640px:** Stat tiles in 2 columns at smaller type (18px vs 22px); chart height 240px; top-users and top-tools stack; "vs prev" trend chip wraps below the number.
- Touch targets ≥44px on the range pills and refresh.

## Files touched (implementation map)

**Replace:**
- `app/(app)/dev/page.tsx` — replace the existing `usage` tab body with the new layout. Stats + chart consume the merged endpoint payload. Drop `cachedStats` shape and the existing `BarChart` summary cards in favor of the new structure (or extend them — implementer's call).

**Delete:**
- `app/(app)/dev/telemetry/page.tsx` — delete the directory.
- `app/api/dev/telemetry/route.ts` — fold its useful queries into `/api/dev/route.ts` (or a new `/api/dev/usage` if cleaner).

**Extend:**
- `app/(app)/dev/[accountId]/page.tsx` — add an Activity section: stats (calls, errors, error rate, p50, last call), recent errors table (errors-first), range selector. Reuse styling from the global Top Tools section.
- `app/api/dev/[accountId]/route.ts` (or wherever the per-account fetch lives — verify) — add per-user operations aggregate.
- `app/api/dev/customers/route.ts` — add `errorsCount` and `errorRate` to the customer rows for the configured window. Use the same `requestId`-dedupe trick used in `/api/dev/telemetry/route.ts` so bulk fan-out doesn't inflate counts.

**Update:**
- `app/(app)/dev/page.tsx` Customers tab — add Errors column (desktop) + an Errors row in the mobile card; sort key `errorRate`. Color-code: ≥5% red, ≥1% amber, else muted.
- Header — drop the "Telemetry →" button entirely (no more separate route).

## API shape (proposed)

`GET /api/dev/usage?days=30&tz=...` returns:

```ts
{
  days: number,
  range: { from: string, to: string },
  totals: {
    calls: number,           // request-deduped
    errors: number,
    activeUsers: number,
    newUsers: number,        // user_id first seen in this window
  },
  prevTotals: {              // null if prior window predates platform start
    calls: number | null,
    errors: number | null,
    activeUsers: number | null,
  },
  daily: Array<{ day: string; reads: number; writes: number; errors: number }>,
  topUsersByErrors: Array<{
    userId: string;
    googleEmail: string | null;
    primaryAccountId: string | null;
    calls: number;
    errors: number;
    topErrorClasses: string[]; // up to 3
  }>,
  topTools: Array<{ toolName: string; calls: number; errors: number; p50: number; p95: number }>,
}
```

All counts dedupe by `coalesce(request_id, id::text)` so bulk fan-out doesn't inflate.

## NOT in scope

| Deferred | One-line rationale |
|----------|---------------------|
| Per-tool error breakdown table | Top Tools row already shows error rate; full breakdown lives in old telemetry recent-calls — surface only if the user clicks into `/dev/[accountId]`. |
| Top arg shapes panel | Rarely actionable for "is it broken?"; can resurrect as a debug-only modal later. |
| Search/filter on Recent Calls | The global view is "what's broken now"; per-user investigation handles drill-in. |
| Real-time websocket updates | The existing 60s server cache + manual refresh is fine for dev-only volumes. |
| Light mode | DESIGN.md defers light mode; this surface stays dark-first. |

## What already exists (reuse)

- `Stat` and `Card` primitives — copy from `app/(app)/dev/telemetry/page.tsx:766-808` before deleting that file.
- `ErrorRateChart` SVG component — `app/(app)/dev/telemetry/page.tsx:326-481` — repurpose as the volume+errors chart, replacing recharts `BarChart` for visual consistency. (Or keep recharts; implementer's call.)
- `formatBytes`, `formatTime`, `errorRate` helpers — same file, lift to a shared `/lib/dev-format.ts`.
- `requestId`-dedupe SQL pattern — `app/api/dev/telemetry/route.ts:34-66` — apply to all new aggregates.
- `excludeDevOpsFilter()` — `lib/dev-ops-filter.ts` — apply consistently so internal testing doesn't pollute the dashboard.
- `DEV_EMAILS` gating + `requireDevEmail()` — every new endpoint must call this.
- Source filter (`clientSource`) is currently in the usage tab. Decision: keep it as a dropdown in the chart card header only (chart-scoped); does not filter stat tiles or top-users table.

## Open question for implementer

**Source filter scope:** does the current `clientSource` filter (Claude Code / Claude Desktop / Toolbox / Chat) apply to the whole surface or only to the volume chart? Plan recommends chart-only to keep the global stats stable, but flag if you find the user wants whole-surface filtering during build.

## Review report

| Pass | Score (before → after) |
|------|------------------------|
| 1. Information architecture | 4 → 9 (clear top-down hierarchy: stats → chart → who → what) |
| 2. Interaction states | 3 → 8 (loading/empty/error/sparse all spec'd; sparse-data trend handling is the genuine subtle case) |
| 3. User journey | 4 → 8 (visceral first-5s answer = stat tiles; behavioral 5min = drill into errored user; reflective = trend deltas) |
| 4. AI slop risk | 8 → 9 (no card grids, no centered hero, no decorative blobs; uses existing dense-data aesthetic) |
| 5. DESIGN.md alignment | 7 → 10 (every color/font/spacing pinned to a token) |
| 6. Responsive & a11y | 3 → 8 (3 breakpoints; touch targets; tabular-nums; AAA contrast preserved via DESIGN.md tokens) |
| 7. Unresolved decisions | 1 open (source filter scope — flagged for implementer) |

**Overall: 3/10 → 9/10.** The remaining 1 point is real ambiguity that should resolve during build, not in plan.
