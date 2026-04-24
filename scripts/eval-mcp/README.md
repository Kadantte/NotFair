# MCP eval harness

Measures the quality and speed of your MCP server's output when driven by a real LLM agent. Use it to A/B changes to tool descriptions, tool responses, playbooks, or system prompts.

## How it works

```
prompts.json → claude -p (with local MCP) → stream-json trace → LLM judge → results/<label>.jsonl
```

For each prompt, the harness:
1. Spawns `claude -p` with your local MCP wired in (strict config, only `mcp__adsagent-local__*` tools allowed).
2. Parses `stream-json` output to capture tool calls, token usage, wall time, and final assistant text.
3. Feeds the final text + the original prompt to Claude Opus (temp 0) with a rubric that scores on 4 dimensions.
4. Appends one row per run to `results/<label>.jsonl`.

Baseline vs candidate = two labels; `compare.ts` diffs them.

## Setup

**1. Start the Next.js dev server** so `http://localhost:3000/api/mcp` is live:
```bash
npm run dev
```

**2. Get an MCP bearer token.** Sign in at `http://localhost:3000/connect` and copy your direct token, or pull one from the `mcp_sessions` table in Supabase for a test user.

**3. Export env vars:**
```bash
export MCP_BEARER_TOKEN=<your token>
export ANTHROPIC_API_KEY=<your Anthropic key>  # needed for the judge
```

## Running

```bash
# Baseline: snapshot current behavior
npx tsx scripts/eval-mcp/eval.ts --label baseline

# Make MCP changes (edit tool descriptions, response shapes, etc.)

# Candidate: measure after
npx tsx scripts/eval-mcp/eval.ts --label my-change

# Diff
npx tsx scripts/eval-mcp/compare.ts baseline my-change
```

### Flags
- `--label <name>` — required. Output file is `results/<name>.jsonl`.
- `--runs <n>` — runs per prompt (default 1). Use 3+ when measuring variance.
- `--only <id>` — run a single prompt by id (e.g. `--only audit-full`).
- `--url <url>` — MCP endpoint (default `http://localhost:3000/api/mcp`).
- `--model <alias>` — agent model (default `sonnet`; try `opus` or `haiku`).

## Interpreting results

Each row in `results/<label>.jsonl`:
```jsonc
{
  "label": "baseline",
  "prompt_id": "audit-full",
  "wall_ms": 42130,
  "tool_call_total": 12,
  "tool_calls": [{"name": "mcp__adsagent-local__audit", "count": 1}, ...],
  "input_tokens": 18542,
  "output_tokens": 2104,
  "final_text": "...",
  "scores": { "specificity": 7, "actionability": 8, "coverage": 7, "prioritization": 6, "overall": 7 },
  "judge_notes": "Would be a 10 if it ranked waste by dollar amount..."
}
```

**`compare.ts`** prints a per-prompt table of deltas (green = improvement, red = regression). Mean line at the bottom shows overall score delta, wall time delta, and token delta.

## What it tests

Signal it catches that manual testing misses:
- **Regressions on prompts you're not currently testing** — e.g. the "audit" prompt still works but you broke "find wasted keywords".
- **Silent quality drops** — fewer tool calls may mean thinner output, not efficiency gains.
- **Token/latency bloat** — new verbose tool responses show up as token increase without quality gain.
- **Variance** — `--runs 3` reveals if your change increased flakiness.

## Editing the rubric

The rubric lives inline in `eval.ts` (`RUBRIC` constant). Change it to match what *you* care about — e.g. add a "correctness" dimension that penalizes hallucinated numbers, or a "conciseness" dimension if outputs are too long.

## Editing prompts

`prompts.json` is the eval set. Add prompts that represent real user asks you care about. Keep the id stable so historical results compare cleanly.
