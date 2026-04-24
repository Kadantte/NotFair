---
name: eval-mcp
description: Run an MCP eval to measure the speed and quality of the local adsagent MCP server. Spawns a runner subagent to audit a Google Ads account using the `mcp__adsagent__*` tools, then a judge subagent that scores the output against a rubric. Saves each run to `scripts/eval-mcp/results/` and appends a summary to `history.jsonl` so you can track improvement over time. Invoke this skill whenever the user says "run eval", "eval the mcp", "test mcp changes", "did my mcp changes help", "run /eval-mcp", "benchmark mcp", "check mcp quality", "measure mcp", or anything about evaluating/scoring/measuring MCP output speed or quality. Always prefer this skill over ad-hoc Task-tool invocations when the user wants to measure MCP quality — the deterministic structure matters.
---

# eval-mcp

Measure the speed and quality of the adsagent MCP server end-to-end. For each test prompt, one subagent uses the MCP to accomplish a real user task, and a second subagent judges the output against a rubric. Results are saved with enough metadata to track improvement across commits.

This skill is the fast, in-session iteration path. For reproducible headless runs (CI, nightly), the equivalent lives at `scripts/eval-mcp/eval.ts` (run via `npm run eval:mcp`). Both paths write to the same `scripts/eval-mcp/results/` directory.

## Why two agents

One agent can't reliably evaluate its own work — it doesn't know what "good" looks like in a way that's decoupled from what it chose to do. Splitting into a **runner** (uses MCP tools, produces an audit) and a **judge** (reads the audit, scores against a rubric with no MCP access) gives us a cleaner signal. The judge never sees the tools used — it only sees what the user would see.

## The procedure

When the user invokes this skill, follow these steps in order. Don't skip or reorder — the quantitative history is only useful if every run captures the same data.

### Step 1: Read the inputs

1. Read `scripts/eval-mcp/prompts.json` — the list of test prompts. Each entry has `id` and `prompt`.
2. Read `.claude/skills/eval-mcp/rubric.md` — the judging rubric.
3. Parse any user-provided flags:
   - `--only <id>` → run just that prompt (quick iteration)
   - `--label <name>` → label this run (defaults to a git-SHA-derived label)
   - `--runs <n>` → runs per prompt (default 1)
4. Resolve a label. If the user didn't pass `--label`, use `git rev-parse --short HEAD`. Then timestamp it: `<ISO>-<label>`. This becomes the per-run directory name.

### Step 2: Check the MCP surface is actually loaded

Before spawning anything, verify the `mcp__adsagent__*` tool family is available in this session (check the tool list). If not, tell the user:

> "The `mcp__adsagent__*` tools aren't loaded in this session. The eval needs them to run. If you're testing **production** MCP, the tools should be auto-loaded — re-check your `.mcp.json`. If you're testing **local dev server**, add an entry to `.mcp.json` pointing at `http://localhost:3000/api/mcp` with a bearer token, then reload Claude Code."

Don't fall through — stop and wait for the user to fix it. A run with no MCP access produces garbage data that pollutes the history.

### Step 3: Spawn runner subagents in parallel

For each prompt (×`--runs`), spawn one `general-purpose` Task subagent **in the same tool call block**, not sequentially. The parallel dispatch matters — evals are the common case and sequential waiting here is the single biggest source of friction.

The runner subagent's prompt should be exactly this template (no preamble, no chain-of-thought instructions that would bias the judge):

> You are a Google Ads account user. Use the `mcp__adsagent__*` tools to accomplish this task — no other tools (no Read, Bash, Grep, Write).
>
> **Task:** {{prompt}}
>
> Gather evidence with MCP tools, then produce a final written response that:
> 1. Leads with the most important finding.
> 2. Cites specific numbers from the account (spend, CPA, CTR, conversion rate, names).
> 3. Gives 3–5 concrete actions the user can take today.
> 4. Covers the relevant surface area from the data.
>
> Keep the response under ~800 words. Do not include any preamble — start directly with the substantive answer. At the very end, after two newlines, add a single line: `---METADATA--- tools_called=<comma-separated unique MCP tool names you called>`.

That trailing metadata line gives us the list of tool names the runner chose, which is interesting signal (did a tool-description change affect selection?). The subagent's notification already gives total_tokens, duration_ms, and tool_uses — don't ask the runner to tell you those, capture them from the notification.

### Step 4: Capture the notification metadata

When each runner notification arrives, **immediately** write it to the per-eval directory — don't try to batch. You only get these numbers once, in the notification. Save:

```
scripts/eval-mcp/results/<ts>-<label>/<eval-id>/runner.json
```

Shape:
```json
{
  "eval_id": "audit-full",
  "run_index": 0,
  "prompt": "...",
  "response": "<the final text, stripped of the ---METADATA--- line>",
  "tools_called": ["mcp__adsagent__audit", "mcp__adsagent__listCampaigns"],
  "duration_ms": 122793,
  "total_tokens": 76929,
  "tool_uses": 18,
  "ts": "<ISO>"
}
```

### Step 5: Spawn judge subagents in parallel

Once all runners are done, spawn one `general-purpose` judge subagent per runner — again, all in the same tool call block. The judge gets NO MCP tools (don't pass any), just the original prompt + the runner's response + the rubric.

Judge subagent prompt template:

> You are judging the quality of a Google Ads MCP agent's response. Read the rubric, then score the response on each dimension (1–10 integers). Be a strict but fair grader — a score of 10 means "genuinely could not be improved", not "this is decent".
>
> **Rubric:**
>
> {{contents of .claude/skills/eval-mcp/rubric.md}}
>
> **User's prompt:**
>
> {{prompt}}
>
> **Agent's response:**
>
> {{response}}
>
> Return exactly this JSON object and nothing else — no preamble, no trailing commentary:
>
> ```json
> {"specificity": <1-10>, "actionability": <1-10>, "coverage": <1-10>, "prioritization": <1-10>, "overall": <1-10>, "notes": "<1-2 sentences: what would push this to a 10>"}
> ```

Parse the JSON from the judge's response. If it fails to parse (judge added preamble, included markdown fence), do one retry with the same inputs. If still fails, record the run with `scores: null` and `error: "judge parse failed"` — don't fake a score.

Save to:
```
scripts/eval-mcp/results/<ts>-<label>/<eval-id>/judge.json
```

### Step 6: Write the per-run meta and append to history

Write per-run summary:
```
scripts/eval-mcp/results/<ts>-<label>/meta.json
```
Containing: `label`, `git_sha`, `ts`, `prompts_count`, `runs_per_prompt`, mean scores, mean `duration_ms`, mean `tool_uses`, mean `total_tokens`.

Append one line to `scripts/eval-mcp/results/history.jsonl` with the same summary plus the run directory path. This is the file the user will grep/read when asking "has quality gone up this month?"

### Step 7: Report back

Print a concise summary — don't dump all the JSON. Shape it like:

```
Ran 5 prompts · label=abc123 · 62s total

prompt            overall  specif.  action.  cov.   prior.  tools  wall(s)  tokens
─────────────────────────────────────────────────────────────────────────────────
audit-full        8.0 ↑1.0  8 ↑1   9 ↑2   7 =   8 ↑1   18    41.2    76k
wasted-spend      7.5 ↓0.5  8 =   7 ↓1   7 =   8 =    12    32.1    54k
...
Mean              7.7 ↑0.3  ...                                   45.2    62k

Saved to scripts/eval-mcp/results/2026-04-23T17-30-abc123/
History: 14 runs tracked (scripts/eval-mcp/results/history.jsonl)
```

The ↑/↓/= deltas compare against the previous run in history.jsonl (same git_sha on main treated as the baseline; if this is the first run ever, skip the arrows). Use green for improvements, red for regressions, dim for no change — or just use arrows + numbers in plain text if color isn't available.

### Step 8: Offer the natural follow-up

After the report, suggest the obvious next action — don't leave them hanging:
- If this was run right after an MCP change and scores went up → "Consider committing."
- If scores went down → "Want me to dig into which prompts got worse? The per-eval files are in `<path>` — I can read `runner.json` and `judge.json` to see what changed."
- If variance is high (scores jumpy between runs of the same prompt) → "Consider `--runs 3` for the prompts that moved — single runs may be noise."

## Flags reference

| Flag | Default | Purpose |
|---|---|---|
| `--only <id>` | all | Run a single prompt (fast iteration on one finding) |
| `--label <name>` | git short SHA | Label for the run directory + history row |
| `--runs <n>` | 1 | Runs per prompt (use 3 when you care about variance) |

## Storage layout

```
scripts/eval-mcp/
├── prompts.json                                  ← test prompts (edit to add)
├── eval.ts                                       ← headless runner (npm run eval:mcp)
└── results/
    ├── history.jsonl                             ← append-only summary log
    ├── 2026-04-23T17-30-abc123/                  ← per-run directory
    │   ├── meta.json                             ← summary
    │   ├── audit-full/
    │   │   ├── runner.json                       ← agent's output + usage
    │   │   └── judge.json                        ← judge's scores
    │   ├── wasted-spend/
    │   │   ├── runner.json
    │   │   └── judge.json
    │   └── ...
    └── ...
```

## Editing the prompts

`scripts/eval-mcp/prompts.json` is the eval set. Keep `id` stable across edits — it's the key for tracking a specific prompt's score over time. Add prompts that represent real user asks; remove prompts only when they're no longer useful (doing so breaks historical comparisons for that id).

## Editing the rubric

`.claude/skills/eval-mcp/rubric.md` defines the dimensions the judge scores on. Editing it changes what "quality" means, so expect a level shift in historical scores when you do. If you make a substantive rubric change, consider starting a new history file (`history-v2.jsonl`) so old and new scores aren't averaged together.
