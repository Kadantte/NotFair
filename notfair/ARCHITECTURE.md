# Architecture

> Single-user local app. No auth, no multi-tenancy, no hosted backend.
> One idea: **agent = goal**, and a disciplined loop moves the number.

## The model

```
project ──▶ agents (user mints as many as they have goals)
              │  1:1
              ▼
            goal ──▶ metric (executable MCP query, server-verified)
              │
              ▼ heartbeat (cron cadence)
            tick: measure → review past moves → ≤1 new move → diary row
```

- **Goal lifecycle**: `intake → proposed → active ⇄ paused → achieved | failed | killed`.
  Defined conversationally in the agent's chat via MCP tools:
  `define_goal` (record the ambition) → `propose_goal_metric` (agent authors +
  tests a query; the platform re-runs it server-side and stores the baseline)
  → `activate_goal` (only after the user explicitly confirms the target).
- **Measurement discipline**: every mutation is logged *before* execution
  (`log_goal_action`) with a falsifiable expected effect and an observation
  window (`review_after`); its resources are untouchable until the window
  closes, and expired actions must be scored (`review_goal_action`) before
  any new move. The platform measures the metric mechanically each tick —
  the agent never self-reports the number it is judged on.
- **Autonomy**: no approvals. Controls are the spend envelope on the goal,
  the observation-window gate, and the user's pause/close buttons. Every
  move is on the record (actions log + tick diary + full transcripts).
- **Context**: shared workspace context (`PROJECT.md`, synced into every
  agent identity, writable via `set_shared_context`) + per-agent memory
  (the `goal_learnings` ledger + the agent's own workspace files). All
  connected MCPs are registered to every agent.

## Process layout

```
USER'S MACHINE
┌────────────────────────────────────────────────────────────────────┐
│  NotFair (Next.js, `npx notfair` → localhost:3327)                 │
│                                                                    │
│  UI: goals index (project root) · per-agent goal dashboard + chat  │
│      + files/skills/cron/settings tabs · crons · connections       │
│                                                                    │
│  Runtime services (SQLite + Node, no external daemon):             │
│    · goals/actions/snapshots/learnings/ticks tables                │
│    · 30s scheduler interval → due goal ticks + cron jobs           │
│    · sessions + transcript_events (chat + tick transcripts)        │
│    · MCP token vault (AES-256-GCM, OS-keychain master key)         │
│    · MCP servers served as Next routes:                            │
│        /api/mcp/orchestration  (goal tools, shared context, cron)  │
│        /api/mcp/browser        (shared workspace Chrome)           │
│                                                                    │
│  Harness adapters spawn a turn as a subprocess:                    │
│    claude-code-local (claude CLI) · codex-local (codex CLI)        │
│    per-agent workspace at ~/.notfair/agents/<id>/ with IDENTITY.md │
│    mirrored to the harness's native files                          │
└────────────────────────────────────────────────────────────────────┘
```

## A tick, end to end

1. `src/server/scheduler/tick.ts` (30s interval, started from
   `src/instrumentation.ts`) calls `runDueGoalTicks()`.
2. `src/server/goals/tick.ts` claims the tick (advances `next_tick_at`
   first — double-fire guard), executes the goal's stored metric query
   against the catalog MCP via `src/server/mcp/rpc.ts` (token refresh +
   SSE/JSON parsing handled there), and snapshots the value.
3. `buildTickMessage` composes the brief purely from DB state: fresh
   metric, stop-condition flags, actions due for review vs. still gated,
   recent learnings, last tick summary. The agent's context window is
   disposable; the DB is the loop's memory.
4. One adapter turn runs on a `tick-<n>` session; every event persists to
   `transcript_events`; the result lands as a `goal_ticks` diary row the
   dashboard renders. Opening that row resumes the same chat session, so a
   completed check remains available for follow-up turns in its original context.

Chat turns hit the same agent through `/api/chat` — same identity, same
rules; anything decided in chat that future ticks must know is written to
the learnings ledger by the agent.

## Distribution

- npm package (`notfair` bin); Next.js standalone build started by
  `bin/cli.mjs`. Runtime requires Node 20+ and at least one harness CLI
  (`claude` or `codex`) installed + authenticated.
- Data at `~/.notfair/` (override `NOTFAIR_DATA_DIR`): `db.sqlite`,
  `agents/<id>/`, `projects/<slug>/PROJECT.md`, `mcp-server-secret`.

## Module map (orientation, not exhaustive)

```
src/server/goals/        the loop: identity.ts (prompt), tick.ts (runner),
                         metric.ts (server-side MCP measurement),
                         handlers.ts (MCP tool handlers), provision.ts
src/server/db/goals.ts   goal state machine + actions/snapshots/learnings/ticks
src/server/mcp-server/   orchestration + browser MCP servers (Next routes)
src/server/adapters/     HarnessAdapter contract + claude/codex implementations
src/server/scheduler/    scheduled_jobs + the shared 30s interval
src/server/mcp/          catalog MCP tokens, OAuth refresh, JSON-RPC client
src/app/(app)/[project]/ goals index (root), agents/[agent]/ (dashboard,
                         chat, files, skills, cron, settings), crons,
                         connections, settings
```

## Why this shape

- **Loop state lives in SQLite, not context windows.** Contexts rotate;
  `get_goal` re-anchors an agent from the DB in one call.
- **The metric is executable, not descriptive.** Storing the exact tool
  call lets the platform measure before the agent wakes and verify
  metrics at intake — trust comes from reproducibility.
- **No org chart.** There is exactly one kind of agent. Coordination
  across agents happens through the shared workspace context, not
  through delegation machinery.
- **Don't rebuild the wheels.** Harness CLIs bring the LLM runtime and
  login; NotFair adds the loop, the bookkeeping, and the UI.
