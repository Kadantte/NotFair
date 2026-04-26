# MCP eval harness

Measures the quality and speed of your MCP server's output when driven by a real LLM agent. Use it to A/B changes to tool descriptions, tool responses, playbooks, or system prompts — without going through Claude Code's interactive OAuth flow.

## How it works

```
prompts.json → claude -p (with local MCP via bearer token) → stream-json trace → LLM judge → results/<label>.jsonl
```

For each prompt, the harness:
1. Spawns `claude -p` with your local MCP wired in (strict config, only `mcp__adsagent-local__*` tools allowed). Auth is a long-lived **bearer token**, not interactive OAuth.
2. Parses `stream-json` output to capture tool calls, token usage, wall time, and final assistant text.
3. Spawns a second `claude -p` (always Opus) as the judge, scoring on the 7-dim rubric in `.claude/skills/eval-mcp/rubric.md`. The judge has no MCP tools — it only sees the prompt + response + rubric.
4. Appends one row per run to `results/<label>.jsonl`.

Baseline vs candidate = two labels; `compare.ts` diffs them across all 7 dimensions.

## One-time setup (do this once, then never again)

**1. Start the Next.js dev server** so `http://localhost:3000/api/mcp` is live:
```bash
npm run dev
```

**2. Set `DEV_LOCAL_EMAIL` in `.env.local`** to your Google email (the one you used to sign in at `/connect` at least once):
```bash
echo "DEV_LOCAL_EMAIL=you@example.com" >> .env.local
```

That's it. The MCP route (`app/api/[transport]/route.ts`) has a triple-gated dev bypass: when `NODE_ENV=development`, `DEV_LOCAL_EMAIL` is set, and the request has no `Authorization` header, it auto-resolves to your most recent valid `mcp_sessions` row for that email. No token-fishing, no OAuth dance, no DCR.

Pre-condition: there must be at least one valid `mcp_sessions` row for that email — sign in at `http://localhost:3000/connect` once with Google to create it. The session lasts a year+, so this is genuinely a one-time thing.

**Need explicit auth instead?** (e.g., for `--url` pointing at prod) Set `MCP_BEARER_TOKEN`:
```bash
# Pull from Supabase
psql ... -c "SELECT access_token FROM mcp_sessions WHERE google_email = 'you@example.com' ORDER BY created_at DESC LIMIT 1;"
echo "MCP_BEARER_TOKEN=<token>" >> .env.local
```
When both are set, the explicit bearer token wins.

> No `ANTHROPIC_API_KEY` needed. Both the agent and the judge use your local `claude` CLI install.

## Running

```bash
# Baseline: snapshot current behavior
npm run eval:mcp -- --label baseline

# Make MCP changes (edit tool descriptions, response shapes, etc.)
# Restart npm run dev to pick up the changes.

# Candidate: measure after
npm run eval:mcp -- --label my-change

# Diff
npm run eval:mcp:compare -- baseline my-change
```

### Flags
- `--label <name>` — required. Output file is `results/<name>.jsonl`.
- `--runs <n>` — runs per prompt (default 1). Use 3+ when measuring variance.
- `--only <id>` — run a single prompt by id (e.g. `--only audit-full`).
- `--url <url>` — MCP endpoint (default `http://localhost:3000/api/mcp`).
- `--model <alias>` — agent model (default `sonnet`; try `opus` or `haiku`).
- `--prompts <file>` — prompt set file (default `prompts.json`). Use `prompts-chat.json` for the
  real-user chat-followup set (encoded from the 6 stuck-chat prompts in the new-customer-intent
  analysis). Each prompt in `prompts-chat.json` carries an optional `criteria` field that the
  judge applies on top of the standard 7-dim rubric — case-specific bars and AUTOMATIC FAILURES
  per prompt (e.g. "agent must call write tools, not stall in clarifying questions").

### Chat-followup eval (`--prompts prompts-chat.json`)

Six prompts modelled on real chat sessions where the assistant left value on the table:

| id | Tests |
|---|---|
| `apply-after-audit` | Apply intent — "YES FETCH NOW" / "Fill and propose". Must execute writes, not just recommend. |
| `forecast-then-build` | Pre-flight forecast → decision → campaign build (GK Dental flow). |
| `eligible-zero-impressions` | Multi-surface diagnostic: budget / bid / keyword status / geo / approval. |
| `eligible-zero-impressions-zh` | Same diagnostic in Chinese — must respond in Chinese without translating real campaign names. |
| `connection-confusion` | "can you connect to my adsagent" — agent must verify connection works, not redirect to /connect. |
| `stuck-recovery` | "retry" recovery — must call getChanges, identify failures, retry safely. |

Three of these (`apply-after-audit`, `forecast-then-build`, `stuck-recovery`) are marked
`writes: true` and **execute real Google Ads mutations** against whatever account
`DEV_LOCAL_EMAIL` or `MCP_BEARER_TOKEN` resolves to. They are **skipped by default**. To run
them, point your dev session at a test account and pass `EVAL_ALLOW_WRITES=1`:

```bash
EVAL_ALLOW_WRITES=1 npm run eval:mcp -- --label chat-baseline --prompts prompts-chat.json
```

Run the read-only subset with no flag — safe by default:

```bash
npm run eval:mcp -- --label chat-readonly --prompts prompts-chat.json
```

## Interpreting results

Each row in `results/<label>.jsonl`:
```jsonc
{
  "label": "baseline",
  "prompt_id": "audit-full",
  "wall_ms": 42130,
  "tool_call_total": 12,
  "tool_calls": [{"name": "mcp__adsagent-local__runScript", "count": 1}, ...],
  "input_tokens": 18542,
  "output_tokens": 2104,
  "final_text": "...",
  "scores": {
    "faithfulness": 8,    // anti-hallucination — quality floor
    "specificity": 7,     // numbers + named resources
    "actionability": 8,   // can the user execute today
    "insight": 6,         // beyond surface read
    "prioritization": 7,  // led with biggest lever
    "honesty": 9,         // acknowledged data gaps
    "overall": 7          // holistic, with faithfulness floor
  },
  "judge_notes": "Would be a 10 if it ranked waste by dollar amount..."
}
```

**Watch faithfulness first.** If `faithfulness ≤ 4` on any prompt, that's a fabrication failure — the model invented numbers the MCP didn't return. The summary surfaces these explicitly. Fix these before chasing other dimensions.

**`compare.ts`** prints a per-prompt table of 7-dim deltas (green = improvement, red = regression). Mean line at the bottom shows overall and faithfulness deltas, wall time, and tokens.

## What it tests

Signal it catches that manual testing misses:
- **Hallucinated numbers** — faithfulness scoring catches confident-sounding fabrication that ad-hoc inspection misses.
- **Regressions on prompts you're not currently testing** — e.g. the "audit" prompt still works but you broke "find wasted keywords".
- **Silent quality drops** — fewer tool calls may mean thinner output, not efficiency gains.
- **Token/latency bloat** — new verbose tool responses show up as token increase without quality gain.
- **Variance** — `--runs 3` reveals if your change increased flakiness.

## Editing the rubric

The rubric is at `.claude/skills/eval-mcp/rubric.md` — single source of truth. Both this headless harness and the `/eval-mcp` skill load from there. Substantive rubric changes shift historical scores; if you make one, start a new history file.

## Editing prompts

`prompts.json` is the eval set. Add prompts that represent real user asks you care about. Keep the `id` stable so historical results compare cleanly.

`prompts-fast.json` is for the `/eval-mcp` skill's fast mode (tool-selection only, no judge) — not used by this headless runner.
