---
name: eval-mcp
description: Run a fast MCP eval to measure tool-selection behavior on the adsagent MCP server. Default mode is a tight 3-prompt loop (~45s wall clock) that spawns runner subagents capped at 3 tool calls per run, captures which tools they picked, and flags runScript adoption. Use `--full` to run the 6-prompt + judge eval (~8 min) when you need quality scores before shipping. By default hits the **local dev server** (`mcp__adsagent-local__*`) so you measure your uncommitted changes; pass `--prod` to hit production. Invoke this skill whenever the user says "run eval", "eval the mcp", "test mcp changes", "did my mcp changes help", "run /eval-mcp", "benchmark mcp", "check mcp quality", "measure mcp", or anything about evaluating/scoring/measuring MCP output speed or quality.
---

# eval-mcp

Measure whether the adsagent MCP server pushes agents toward the right tool-selection decisions, end-to-end through real Google Ads API calls.

There are two modes. **Default is fast mode** for tight iteration on tool descriptions and server instructions. Use `--full` before shipping to get response-quality scores.

## Target server: dev by default, prod opt-in

The iteration loop is: edit code → restart local dev server → run eval → see if selection moved. So this skill **defaults to the local dev MCP server** exposed as the `mcp__adsagent-local__*` tool family (backed by `http://localhost:3000/api/mcp`). Your uncommitted edits to `MCP_INSTRUCTIONS` or tool descriptions take effect immediately on restart — no deploy needed.

- Default (no flag): `NAMESPACE = mcp__adsagent-local__` — hits dev. Requires `npm run dev` to be running.
- `--prod`: `NAMESPACE = mcp__adsagent__` — hits the deployed server at `adsagent.org`. Use this to confirm a change landed and production matches.

Resolve `NAMESPACE` once at the top of the run and thread it through every prompt template and the surface check below. Store `server_mode` (`"dev"` or `"prod"`) in `meta.json` and in the history line so trend comparisons don't silently mix environments.

---

## Fast mode (default, ~45s)

Three prompts, runners capped at 3 tool calls each, no judge. The question fast mode answers is: **"does my description/instructions change flip which tool the model picks?"**

### Step 1: Read inputs

1. Read `scripts/eval-mcp/prompts-fast.json` — the fast prompt set. Each entry has `id`, `prompt`, `expected` (tool name or `runScript`), and `reason` (why we expect that tool).
2. Parse flags:
   - `--prod` → target production MCP (`mcp__adsagent__*`). Default is dev (`mcp__adsagent-local__*`).
   - `--label <name>` → label for this run (default: git short SHA, suffixed with `-dev` or `-prod`)
   - `--only <id>` → run a single prompt
   - `--full` → switch to full mode (see below)
   - `--runs <n>` → runs per prompt (default 1)
3. Resolve `NAMESPACE`:
   - Dev (default): `NAMESPACE = mcp__adsagent-local__`
   - Prod (`--prod`): `NAMESPACE = mcp__adsagent__`

### Step 2: Check the MCP surface

Verify the selected `{NAMESPACE}*` tool family is loaded in the session.

- **Dev mode**: if `mcp__adsagent-local__*` is missing, stop and tell the user: "The local MCP surface isn't loaded. Start the dev server with `npm run dev` and ensure your `.mcp.json` (or user-level MCP config) has an entry named `adsagent-local` pointing at `http://localhost:3000/api/mcp`. Reload Claude Code after editing." Do NOT silently fall back to prod — that would measure the wrong code.
- **Prod mode**: if `mcp__adsagent__*` is missing, stop and tell the user to check their MCP config for the production `adsagent` entry.

A run against the wrong namespace produces history data that lies about which code was tested.

### Step 3: Spawn runner subagents in parallel

One `general-purpose` Task subagent per prompt in a single tool call block. The runner prompt template is (substitute `{NAMESPACE}` with the resolved value):

> You are a Google Ads account user. Use the `{NAMESPACE}*` tools to accomplish this task — no other tools (no Read, Bash, Grep, Write). Do NOT call the other namespace; if you see tools under a different `mcp__adsagent*` prefix, ignore them.
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

Write each runner's output to `scripts/eval-mcp/results/<ts>-<label>-fast-<server_mode>/<eval-id>/runner.json` with the same shape as full mode. `<server_mode>` is `dev` or `prod` — put it in the directory name so you can eyeball which runs tested which environment. Grab `duration_ms`, `total_tokens`, `tool_uses` from the subagent notification — capture immediately on arrival, don't batch.

Parse `tools_called` from the `---METADATA---` line. **Strip the `{NAMESPACE}` prefix from every tool name** before comparison — so `mcp__adsagent-local__runScript` and `mcp__adsagent__runScript` both normalize to `runScript`. This lets the same `expected` field (bare name, e.g. `"runScript"`) match regardless of server mode.

Then compute:
- `first_tool`: the first (normalized) element of `tools_called` — proxy for what the model reached for first
- `picked_expected`: whether `expected` from the prompt entry appears anywhere in normalized `tools_called`
- `picked_runscript`: whether `runScript` appears anywhere in normalized `tools_called`

### Step 5: Report

Print a tight table. Surface `server_mode` in the header so you know at a glance whether you measured dev or prod. No judge, no rubric scores, no history comparison — just tool-selection signal:

```
Fast eval · label=cd23a44 · server=dev · 3 prompts · 42s total

prompt          first_tool          tool_uses  expected      match  runScript
──────────────────────────────────────────────────────────────────────────────
casual-7d       getTimeseries        3          runScript     ✗      ✗
full-audit      getWasteFindings     3          runScript     ✗      ✗
targeted-cpa    getTimeseries        1          getTimeseries  ✓      ✗

runScript picks: 0/3 · expected matches: 1/3
```

Then one line of interpretation. **Only compare against previous runs with the same `server_mode`** — dev vs prod can legitimately diverge (uncommitted changes), so mixing them produces false regressions.
- If `runScript picks` is **lower than the last same-mode run** → description/instructions regressed for analytical prompts.
- If `expected matches` dropped on `targeted-cpa` → runScript is over-rotating and broke targeted asks. **This is the regression to watch.**
- If `expected matches == 3/3` on dev → ship it, then run `--prod` to confirm deployed behavior matches, then `--full` for response-quality validation.

Append one line to `scripts/eval-mcp/results/history-fast.jsonl` (separate from full-mode history):

```json
{"label": "...", "git_sha": "...", "ts": "...", "mode": "fast", "server_mode": "dev", "runscript_picks": 0, "expected_matches": 1, "total_prompts": 3, "mean_duration_ms": ..., "mean_tool_uses": ...}
```

Keeping fast history separate prevents polluting the quality trend line in `history.jsonl`. Filter by `server_mode` when graphing trends.

### Step 6: Next-step suggestion

- If `runScript picks == 0` across analytical prompts → "Your description/instructions change didn't move selection. Probe with one of: (a) shorter runScript description, (b) verify MCP `instructions` is forwarded to subagents (check `app/api/[transport]/route.ts` — the `instructions` field passed to `createMcpHandler`), (c) try a different phrasing in the WHEN TO USE block. Then restart `npm run dev` and re-run."
- If `targeted-cpa` regressed (`picked runScript` = ✓) → "getTimeseries is no longer getting picked for targeted asks — your runScript push is too aggressive. Soften the WHEN TO USE block."
- If all 3 match expected on `--server dev` → "Looks good locally. Ship, then run `/eval-mcp --prod` to verify the deployed code matches, then `--full` for response-quality validation."
- If dev and prod disagree → "Your local change is live in dev but not yet in prod. Ship it, wait for deploy, re-run `--prod`."

---

## Full mode (`--full`, ~6-8 min)

Six prompts, no tool-call cap, judge subagent per runner scoring on a 5-dim rubric. Use this before committing a description change that passed fast mode, so the history.jsonl has a quality data point.

### Procedure

1. Read `scripts/eval-mcp/prompts.json` (the original 6 prompts).
2. Read `.claude/skills/eval-mcp/rubric.md`.
3. Spawn 6 runners in parallel using the original (uncapped) template (substitute `{NAMESPACE}`):

> You are a Google Ads account user. Use the `{NAMESPACE}*` tools to accomplish this task — no other tools.
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
6. Compute means, write `meta.json` (include `server_mode`), append to `scripts/eval-mcp/results/history.jsonl` (include `server_mode`).
7. Print the full 5-dim table with `↑/↓/=` deltas vs the previous full-mode run **with the same `server_mode`** (same `git_sha` on main + same mode = baseline). Mixing dev vs prod baselines would show noise, not real quality drift.

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
| (none) | fast mode against dev | 3 prompts, capped calls, no judge, ~45s, hits local `npm run dev` |
| `--prod` | — | Target the deployed production MCP (`mcp__adsagent__*`) instead of dev |
| `--full` | — | 6 prompts + judge, ~6-8 min |
| `--only <id>` | all | Run a single prompt |
| `--label <name>` | git short SHA | Label for the run directory + history row |
| `--runs <n>` | 1 | Runs per prompt (use 3 for variance bands) |

## Storage layout

```
scripts/eval-mcp/
├── prompts.json                          ← full-mode test set (6 prompts, uncapped)
├── prompts-fast.json                     ← fast-mode test set (3 prompts, capped)
├── eval.ts                               ← headless runner (npm run eval:mcp)
└── results/
    ├── history.jsonl                     ← full-mode history (includes server_mode)
    ├── history-fast.jsonl                ← fast-mode history (includes server_mode)
    ├── 2026-04-23T17-30-abc123-dev/              ← full-mode run against dev
    │   ├── meta.json                     ← includes "server_mode": "dev"
    │   └── <eval-id>/{runner,judge}.json
    ├── 2026-04-23T18-05-abc123-fast-dev/         ← fast-mode run against dev
    │   └── <eval-id>/runner.json
    ├── 2026-04-23T18-12-abc123-fast-prod/        ← fast-mode run against prod
    │   └── <eval-id>/runner.json
    └── ...
```

Directory naming is `<ts>-<label>[-fast]-<server_mode>` so `ls results/` at a glance shows what was tested where.

## Editing the prompts

- `scripts/eval-mcp/prompts-fast.json` — fast set. Three targeted prompts. Each entry has `id`, `prompt`, `expected` (tool name), and `reason`. Keep it to ~3 prompts — the point is speed. If you add one, remove one. Include at least one **negative test** (a prompt that should NOT pick runScript) to guard against over-rotation.
- `scripts/eval-mcp/prompts.json` — full set. Edit when you want to add a new user-ask shape to the quality benchmark. Keep `id` stable across edits.

## Editing the rubric

`.claude/skills/eval-mcp/rubric.md` — only affects `--full` runs. Edits cause a level shift in historical scores; if you make a substantive change, start a new history file (`history-v2.jsonl`).
