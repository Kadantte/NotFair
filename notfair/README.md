# NotFair

> Goal-driven, loop-powered marketing on your machine, on top of Claude Code or Codex. State an ambition — "cut CAC to $30", "keep wasted spend at $0" — and a dedicated agent turns it into a measured metric and runs a disciplined loop against it. Goals are the only thing you name, see, and manage; the agents behind them are invisible plumbing.

Open source. Runs entirely on your machine. Bring your own LLM credentials (via the harness CLI you already authenticate to) and your own ad-platform OAuth.

## What it gives you

- **Goals are the identity.** Type the ambition, and you land in a chat where the goal's agent is already working: it sharpens the ask, labels the goal ("Wasted X spend → $0"), authors + tests a metric query against your connected platforms, and the platform *re-runs the query server-side* — only a reproducible number with a measured baseline goes on the books. You agree the target in chat; the loop starts only when you press **START** (and the first tick runs immediately). Two modes: **achieve** (reach the number, done) and **maintain** (hold it there forever — a watchdog).
- **The tick loop.** On the cadence you agree, the platform measures the metric mechanically (the agent never self-reports the number it's judged on) and wakes the agent: it scores past moves against their predicted effects, then makes at most **one** new move — every mutation logged with a falsifiable expected effect and an observation window that gates its resources until review. The agent's page is the diary: sparkline vs. target, tick-by-tick log, open actions, accumulated memory.
- **Fully autonomous, visibly so.** No approval inbox — agents act inside a spend envelope you set, with the observation-window discipline and your pause button as the controls, and every move on the record.
- **Shared context + private memory.** `PROJECT.md` is the workspace brief every agent carries (any agent can update it via `set_shared_context`); each agent also keeps its own learnings ledger and workspace files. All connected MCPs are shared by every agent.
- **One screen per goal.** The conversation and the loop's state live together: chat on the left (where the goal is defined and steered), a status rail on the right — the progress chart, the plan, every check with its full log, open actions with review dates, and the agent's memory. No tabs, no thread management, nothing else to learn.
- **Progress you can see.** A time-true chart with the target line, every agent action as a marker on the moment it happened (hover: what it did, what it predicted, what actually happened), observation windows shaded, and history backfilled at setup from the platform's own date-segmented stats — context from day one. Maintain goals get a streak ("held at target for 12 days") with a per-check strip; the workspace index shows a mini sparkline + 7-day delta per goal.
- **Project-scoped MCP connections** — one-click PKCE OAuth to bring third-party tools (Google Ads via NotFair's hosted MCP) into the agents' toolbox. Tokens stored in SQLite, never in env vars, and wired into the chosen harness automatically.

## Pick your harness

At onboarding you pick which local AI coding agent runs the work:

| Harness | Status | Notes |
|---|---|---|
| **Claude Code** | Recommended | Uses your existing `claude` login. Per-agent `.mcp.json` for isolation. |
| **Codex** | Supported | Uses your existing `codex` login. Per-server env-var bearers. Requires `--dangerously-bypass-approvals-and-sandbox` (set by the adapter) so tool calls and loopback reach your local orchestration MCP. |

Different projects can run on different harnesses; the choice persists on the project row.

## Prerequisites

- **Node 20+** (Node 24 recommended for native-module prebuilds).
- **At least one harness installed and authenticated**:
  - [Claude Code](https://docs.claude.com/en/docs/agents-and-tools/claude-code/overview), or
  - [Codex CLI](https://github.com/openai/codex)

Run `NotFair doctor` to verify Node, both harnesses, data dir, and port.

## Install + run

```bash
# One-shot, no install:
npx notfair@latest doctor      # verify env
npx notfair@latest             # launch UI on http://127.0.0.1:3327

# Or install globally:
npm install -g notfair
NotFair
```

The UI opens in your browser. Sidebar is project-scoped; create one to start.

## CLI

```
NotFair                 Launch local server + open UI (default)
NotFair start           Same as above
NotFair doctor          Run preflight checks (see below)
NotFair --version
NotFair --help
```

Options on `start`: `--port <n>` (default 3327), `--no-open`, `--data-dir <path>`.
Options on `doctor`: `--port <n>`, `--data-dir <path>`.

`doctor` runs five checks: Node ≥ 20 (24 recommended), Claude Code on PATH, Codex on PATH, at least one harness ready, data dir writable, and the preferred port free. Exits 0 if every check is passing, 1 otherwise, with a `Fix:` line under each failure naming the exact command to run.

## What happens when you create a goal

1. You name an agent on the workspace page — a goal row (status `intake`) and the agent's workspace at `~/.notfair/agents/<slug>-goal-<name>/` are created together, with an `IDENTITY.md` carrying the goal spec + the loop protocol, mirrored into the harness's native config (`CLAUDE.md` / `AGENTS.md`, `.mcp.json` for Claude Code, sections in `~/.codex/config.toml` for Codex). Every connected MCP is wired in.
2. You chat: the agent records the ambition (`define_goal`), authors + tests a metric query, submits it (`propose_goal_metric` — the platform re-runs it server-side and stores the measured baseline), and, once you explicitly confirm the target, starts the loop (`activate_goal`).
3. The heartbeat rides a `setInterval` in the Next.js process polling every 30 s; due goals get a tick — metric measured, brief composed from the DB, one adapter turn, diary row written.

## Scheduling recurring work

Beyond goal heartbeats, agents can call the `schedule_recurring_work` MCP tool for auxiliary cron jobs, and you can schedule manually via the **+ New cron** button on the Crons tab. Same 30 s tick loop, same per-project harness dispatch.

## Connecting MCP servers (for live ad-platform data)

The Connections page lists the MCP servers in our catalog (NotFair Google Ads, Meta Ads, Google Search Console, Google Analytics, X Ads — plus browseable extras like Stripe and Supabase, or any custom MCP URL). Click **Connect** to start a one-click PKCE OAuth flow — no environment variables to set, no Google Cloud project of your own to register.

The token is persisted into `mcp_tokens` (SQLite) and the catalog MCP is automatically registered with every agent in the project via the chosen harness's config. New agents provisioned later get the same wiring.

OAuth refresh tokens are AES-256-GCM encrypted with a master key stored in your OS keychain (via `keytar`) and persisted to your local SQLite.

## Live transcript

Chat events (deltas, tool calls, lifecycle) are persisted to `transcript_events` and **also** pushed through an in-process `EventEmitter` keyed by session id. Open tabs subscribe via SSE; new events land in milliseconds. Re-attach to a streaming thread (open the URL in a second tab while the agent is mid-turn) is race-free: the server backfills from cursor=0 before attaching the live subscription, with dedup-by-seq.

## Data location

- App state: `~/.notfair/db.sqlite` (override with `--data-dir` or `NOTFAIR_DATA_DIR`)
- Agent workspaces: `~/.notfair/agents/<agent-id>/`
- Harness configs: `~/.claude/` for Claude Code; `~/.codex/config.toml` for Codex (managed by the respective CLI)
- Orchestration MCP secret: `~/.notfair/mcp-server-secret` (0600 perms)

## What V1 is and isn't

**Is:** the goal loop — conversational goal intake with server-verified metrics, heartbeat ticks with measurement discipline, per-agent memory, shared workspace context — plus per-agent chat, a native cron scheduler, and an MCP connection hub. Runs on Claude Code or Codex, no proprietary agent runtime.

**Isn't (yet):** cross-goal coordination (resource leases between agents touching the same campaigns), per-LLM-call cost tracking, or a hosted mode. Those land as the loop earns trust in the field.

See `ARCHITECTURE.md` for the design and `CONTRIBUTING.md` for development setup.

## License

MIT — see LICENSE.
