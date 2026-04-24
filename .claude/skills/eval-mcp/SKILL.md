---
name: eval-mcp
description: Run a fast MCP eval to measure tool-selection behavior on the adsagent MCP server. Default mode is a tight 3-prompt loop (~45s wall clock) that spawns runner subagents capped at 3 tool calls per run, captures which tools they picked, and flags runScript adoption. Use `--full` to run the 6-prompt + judge eval (~8 min) when you need quality scores before shipping. Invoke this skill whenever the user says "run eval", "eval the mcp", "test mcp changes", "did my mcp changes help", "run /eval-mcp", "benchmark mcp", "check mcp quality", "measure mcp", or anything about evaluating/scoring/measuring MCP output speed or quality.
---

# eval-mcp

Measure whether the adsagent MCP server pushes agents toward the right tool-selection decisions, end-to-end through real Google Ads API calls.

There are two modes. **Default is fast mode** for tight iteration on tool descriptions and server instructions. Use `--full` before shipping to get response-quality scores.

---

## Fast mode (default, ~45s)

Three prompts, runners capped at 3 tool calls each, no judge. The question fast mode answers is: **"does my description/instructions change flip which tool the model picks?"**

### Step 1: Read inputs

1. Read `scripts/eval-mcp/prompts-fast.json` — the fast prompt set. Each entry has `id`, `prompt`, `expected` (tool name or `runScript`), and `reason` (why we expect that tool).
2. Parse flags:
   - `--label <name>` → label for this run (default: git short SHA)
   - `--only <id>` → run a single prompt
   - `--full` → switch to full mode (see below)
   - `--runs <n>` → runs per prompt (default 1)

### Step 2: Check the MCP surface

Verify `mcp__adsagent__*` tools are loaded in the session. If not, stop and tell the user to check `.mcp.json` (same guidance as before — production tools auto-load; local dev needs an entry pointing at `http://localhost:3000/api/mcp`).

### Step 3: Spawn runner subagents in parallel

One `general-purpose` Task subagent per prompt in a single tool call block. The runner prompt template is:

> You are a Google Ads account user. Use the `mcp__adsagent__*` tools to accomplish this task — no other tools (no Read, Bash, Grep, Write).
>
> **Task:** {{prompt}}
>
> **CONSTRAINT:** You have a budget of at most 3 tool calls. Use them wisely — pick tools that give you the most information per call. If one tool can answer the whole question, use only that one.
>
> **If any tool returns a "not found" / -32602 error, treat it as unavailable and immediately pick a different tool. Do not retry the same tool under a different namespace prefix — you'll burn your budget on a ghost.**
>
> Produce a final written response under 400 words that answers the user's question with specific numbers and named resources. No preamble. At the very end, after two newlines, add a single line: `---METADATA--- tools_called=<comma-separated unique MCP tool names you called>`.

The 3-call cap is what makes fast mode fast (~25-30s per runner vs 90s+ uncapped) AND what makes tool selection visible — a model that picks `runScript` trivially satisfies the cap in 1 call.

### Step 4: Capture runner results

Write each runner's output to `scripts/eval-mcp/results/<ts>-<label>-fast/<eval-id>/runner.json` with the same shape as full mode. Grab `duration_ms`, `total_tokens`, `tool_uses` from the subagent notification — capture immediately on arrival, don't batch.

Parse `tools_called` from the `---METADATA---` line. Compute:
- `first_tool`: the first element of `tools_called` (proxy for which tool the model reached for first)
- `picked_expected`: whether `expected` from the prompt entry appears anywhere in `tools_called`
- `picked_runscript`: whether `runScript` appears anywhere in `tools_called`

### Step 5: Report

Print a tight table. No judge, no rubric scores, no history comparison — just tool-selection signal:

```
Fast eval · label=cd23a44 · 3 prompts · 42s total

prompt          first_tool          tool_uses  expected      match  runScript
──────────────────────────────────────────────────────────────────────────────
casual-7d       getTimeseries        3          runScript     ✗      ✗
full-audit      getWasteFindings     3          runScript     ✗      ✗
targeted-cpa    getTimeseries        1          getTimeseries  ✓      ✗

runScript picks: 0/3 · expected matches: 1/3
```

Then one line of interpretation:
- If `runScript picks` is **lower than the last run** → description/instructions regressed for analytical prompts.
- If `expected matches` dropped on `targeted-cpa` → runScript is over-rotating and broke targeted asks. **This is the regression to watch.**
- If `expected matches == 3/3` → ship it, then run `--full` for response-quality validation.

Append one line to `scripts/eval-mcp/results/history-fast.jsonl` (separate from full-mode history):

```json
{"label": "...", "git_sha": "...", "ts": "...", "mode": "fast", "runscript_picks": 0, "expected_matches": 1, "total_prompts": 3, "mean_duration_ms": ..., "mean_tool_uses": ...}
```

Keeping fast history separate prevents polluting the quality trend line in `history.jsonl`.

### Step 6: Next-step suggestion

- If `runScript picks == 0` across analytical prompts → "Your description/instructions change didn't move selection. Probe with one of: (a) shorter runScript description, (b) verify MCP `instructions` is forwarded to subagents, (c) try a different phrasing in the WHEN TO USE block."
- If `targeted-cpa` regressed (`picked runScript` = ✓) → "getTimeseries is no longer getting picked for targeted asks — your runScript push is too aggressive. Soften the WHEN TO USE block."
- If all 3 match expected → "Looks good. Run `/eval-mcp --full` to measure response-quality before shipping."

---

## Full mode (`--full`, ~6-8 min)

Six prompts, no tool-call cap, judge subagent per runner scoring on a 5-dim rubric. Use this before committing a description change that passed fast mode, so the history.jsonl has a quality data point.

### Procedure

1. Read `scripts/eval-mcp/prompts.json` (the original 6 prompts).
2. Read `.claude/skills/eval-mcp/rubric.md`.
3. Spawn 6 runners in parallel using the original (uncapped) template:

> You are a Google Ads account user. Use the `mcp__adsagent__*` tools to accomplish this task — no other tools.
>
> **Task:** {{prompt}}
>
> Gather evidence with MCP tools, then produce a final written response that:
> 1. Leads with the most important finding.
> 2. Cites specific numbers from the account (spend, CPA, CTR, conversion rate, names).
> 3. Gives 3–5 concrete actions the user can take today.
> 4. Covers the relevant surface area from the data.
>
> Keep the response under ~800 words. No preamble. At the end, after two newlines: `---METADATA--- tools_called=<comma-separated>`.

4. Write `runner.json` per prompt (same shape as fast mode + full response).
5. Spawn 6 judges in parallel. Each judge gets no MCP tools, just the prompt + response + rubric. Parse the judge's JSON response into `judge.json`.
6. Compute means, write `meta.json`, append to `scripts/eval-mcp/results/history.jsonl`.
7. Print the full 5-dim table with `↑/↓/=` deltas vs the previous full-mode run (same `git_sha` on main = baseline).

### When to use which

| Situation | Mode |
|---|---|
| Just changed a tool description and want to see if selection moved | **fast** |
| Just changed the server `instructions` | **fast** |
| About to commit/ship an MCP change | **full** (after fast passes) |
| "Has quality gone up this month?" | **full** (read history.jsonl) |
| Debugging why a specific prompt scores low | fast first, then open `runner.json` directly |

---

## Flags reference

| Flag | Default | Purpose |
|---|---|---|
| (none) | fast mode | 3 prompts, capped calls, no judge, ~45s |
| `--full` | — | 6 prompts + judge, ~6-8 min |
| `--only <id>` | all | Run a single prompt |
| `--label <name>` | git short SHA | Label for the run directory + history row |
| `--runs <n>` | 1 | Runs per prompt (use 3 for variance bands) |

## Storage layout

```
scripts/eval-mcp/
├── prompts.json                   ← full-mode test set (6 prompts, uncapped)
├── prompts-fast.json              ← fast-mode test set (3 prompts, capped)
├── eval.ts                        ← headless runner (npm run eval:mcp)
└── results/
    ├── history.jsonl              ← full-mode history (quality over time)
    ├── history-fast.jsonl         ← fast-mode history (tool-selection over time)
    ├── 2026-04-23T17-30-abc123/           ← full-mode run
    │   ├── meta.json
    │   └── <eval-id>/{runner,judge}.json
    ├── 2026-04-23T18-05-abc123-fast/      ← fast-mode run (suffix -fast on dir)
    │   └── <eval-id>/runner.json
    └── ...
```

## Editing the prompts

- `scripts/eval-mcp/prompts-fast.json` — fast set. Three targeted prompts. Each entry has `id`, `prompt`, `expected` (tool name), and `reason`. Keep it to ~3 prompts — the point is speed. If you add one, remove one. Include at least one **negative test** (a prompt that should NOT pick runScript) to guard against over-rotation.
- `scripts/eval-mcp/prompts.json` — full set. Edit when you want to add a new user-ask shape to the quality benchmark. Keep `id` stable across edits.

## Editing the rubric

`.claude/skills/eval-mcp/rubric.md` — only affects `--full` runs. Edits cause a level shift in historical scores; if you make a substantive change, start a new history file (`history-v2.jsonl`).
