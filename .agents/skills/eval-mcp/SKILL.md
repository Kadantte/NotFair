---
name: eval-mcp
description: Eval the adsagent MCP server. CRITICAL — YOU, the model reading this in the user's current session, ARE the runner. Read each prompt and call the MCP tools yourself. Do NOT spawn `general-purpose` Task subagents. Do NOT shell out to `claude -p`. Do NOT delegate to `npm run eval:mcp` for the runner step. Subagents and subprocesses run in a different agent environment and measure the wrong thing. Defaults to local dev (`mcp__adsagent-local__*`); pass `--prod` for production. Three prompt sets: `prompts-fast.json` (3 quick checks), `prompts.json` (8 full audits), `prompts-chat.json` (write/multi-turn cases). Invoke when the user says "run eval", "eval the mcp", "test mcp changes", "did my changes help", "/eval-mcp", "benchmark mcp", "check mcp quality".
---

# eval-mcp

Measure whether the adsagent MCP server pushes the agent toward the right tool-selection decisions, end-to-end through real Google Ads API calls.

## CRITICAL: YOU are the runner

When this skill runs, **you** — the model reading this skill in the user's current session — execute every prompt directly. For each prompt:

1. Read it as if it were the user's first message
2. Pick a tool, call it, observe the result
3. Decide whether to call more, or synthesize a final answer
4. Score the result yourself

**Forbidden runner paths:**
- ❌ Spawning a `general-purpose` Task subagent to run the prompts
- ❌ Running `npm run eval:mcp` (it shells out to `claude -p` per prompt)
- ❌ Any subprocess wrapper that invokes a different model context

**Why this matters.** The eval measures how a real agent (the Codex CLI session the user is in right now) behaves with this MCP server. Subagents and `claude -p` subprocesses run in a *different* agent environment: different system prompt, different default tool-selection priors, different MCP tool surfacing, sometimes a different model. A description change that helps the real user can look like a regression in subagent-land, and vice versa. The user invoked this skill in their actual agent environment. **That** is the environment under test.

The only exception is the **judge** step in full mode (rubric scoring) — see "Full mode" below. The judge benefits from blinding, so it stays subprocess-based.

## Target server: dev by default, prod opt-in

Iteration loop: edit code → restart `npm run dev` → run eval → see if behavior moved. Default target is **local dev** (`mcp__adsagent-local__*`, backed by `http://localhost:3000/api/mcp`). Uncommitted edits take effect immediately.

- Default (no flag): `NAMESPACE = mcp__adsagent-local__`
- `--prod`: `NAMESPACE = mcp__adsagent__` — confirm the deployed server matches

Resolve `NAMESPACE` once at the top of the run. Store `server_mode` (`"dev"` | `"prod"`) in `meta.json` and the history row.

## Surface check (do this first)

Before any eval call, verify the `{NAMESPACE}*` tools are reachable from your session:

1. **Try `ToolSearch`** with `"select:{NAMESPACE}runScript"` first — that surfaces the deferred MCP tools so you can call them like any other tool. If it works, you're done — call them via the tool name.
2. **If ToolSearch returns no match**, the MCP surface isn't auto-loaded in this session. Fall back to direct HTTP against the local server:
   ```bash
   curl -s -X POST http://localhost:3000/api/mcp \
     -H "Content-Type: application/json" \
     -H "Accept: application/json, text/event-stream" \
     -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"<TOOL>","arguments":{...}}}' \
     | grep '^data: ' | sed 's/^data: //' | jq -r '.result.content[0].text // .error.message // .'
   ```
   In this case, set `transport=http` in `meta.json` (vs `transport=mcp-tool`). Both produce valid eval data; flag the transport so you can diff results across runs if something looks weird.
3. **Dev mode**, if neither path works: stop. Tell the user "The local MCP isn't reachable. Start `npm run dev` and confirm `.mcp.json` has `adsagent-local` → `http://localhost:3000/api/mcp`." Do not silently fall back to prod — that measures the wrong code.
4. **Prod mode**, if `mcp__adsagent__*` is missing: tell the user to call `mcp__adsagent__authenticate` (you'll get an OAuth URL), then re-invoke the skill once auth completes.
5. **Surface reachable but tools return Google Ads auth errors** (e.g. `User not connected`, `OAuth required`, 401/403 in tool responses): the MCP server is up but the user hasn't completed the Google Ads OAuth flow yet. Stop and tell the user to visit `http://localhost:3000` (or `https://www.notfair.co` for `--prod`), connect a Google Ads account, then re-invoke. Do not retry — every prompt will fail the same way until auth is in place.

## Modes

### Fast mode (default)

Three prompts from `scripts/eval-mcp/prompts-fast.json`. Each entry has `id`, `prompt`, `expected` (tool name), `reason`. The question fast mode answers: **"does my change flip which tool the model picks?"**

Pass/fail is empirical (did the expected tool fire? did call count stay ≤ 3?), so **no judge** — you score yourself directly.

#### Procedure

1. Parse flags:
   - `--prod` → production namespace
   - `--label <name>` → run label (default: git short SHA + `-dev`/`-prod`)
   - `--only <id>` → run a single prompt
   - `--full` → switch to full mode
   - `--runs <n>` → repeat each prompt N times (do these as N separate in-session passes; do NOT spawn N subagents)

2. For each prompt, **enter agent mode yourself**:
   - Read the prompt as if it were the user's first message
   - Decide which `{NAMESPACE}*` tool to call first — let your normal tool-selection priors drive this; do not look at the `expected` field until after you've answered
   - Call it. Observe the result.
   - **Cap yourself at 3 tool calls per prompt.** The budget is what makes selection visible — a model that picks `runScript` answers most analytical prompts in 1 call.
   - Synthesize a brief final answer (under 400 words)
   - Then look at `expected` and score

3. Per prompt, capture:
   - `prompt_id`, `prompt`
   - `tools_called`: ordered list of (normalized) tool names you actually called — strip the `{NAMESPACE}` prefix so `mcp__adsagent-local__runScript` and `mcp__adsagent__runScript` both normalize to `runScript`
   - `first_tool`: first element of `tools_called`
   - `tool_uses`: length of `tools_called`
   - `picked_expected`: did `expected` appear in `tools_called`?
   - `picked_runscript`: did `runScript` appear?
   - `response`: your final ≤400-word answer

4. Write each prompt's record to `scripts/eval-mcp/results/<ts>-<label>-fast-<server_mode>/<prompt_id>/runner.json`.

5. Print a tight table — surface `runner=in-session` so future rows can be compared against the same baseline:

   ```
   Fast eval · label=cd23a44 · server=dev · runner=in-session · 3 prompts

   prompt          first_tool          tool_uses  expected      match  runScript
   ──────────────────────────────────────────────────────────────────────────────
   casual-7d       runScript            1          runScript     ✓      ✓
   full-audit      runScript            2          runScript     ✓      ✓
   targeted-cpa    getTimeseries        1          getTimeseries  ✓      ✗

   runScript picks: 2/3 · expected matches: 3/3
   ```

6. Append one line to `scripts/eval-mcp/results/history-fast.jsonl`:
   ```json
   {"label":"cd23a44","git_sha":"cd23a44","ts":"2026-04-30T18:00:00Z","mode":"fast","server_mode":"dev","runner":"in-session","transport":"mcp-tool","runscript_picks":2,"expected_matches":3,"total_prompts":3}
   ```
   The `runner` field is a schema add — old rows from before this skill rewrite are implicitly `runner=subagent`. **Only compare against history rows with the same `runner` AND `server_mode`** — mixing baselines produces false regressions.

7. Suggest the next step based on the deltas vs the previous same-`runner`/`server_mode` row:
   - `runScript picks` dropped on analytical prompts → description change regressed selection. Restart `npm run dev`, verify the `instructions` field reaches the model (`app/api/[transport]/route.ts`), iterate.
   - `expected matches` dropped on a targeted prompt (e.g. `targeted-cpa`) → `runScript` is over-rotating. Soften the WHEN-TO-USE block.
   - 3/3 on dev → ship, then re-run with `--prod` to confirm the deployed server matches, then `--full` for response-quality validation.
   - dev and prod disagree → local change is live in dev but not yet deployed. Ship and wait for deploy.

### Full mode (`--full`)

Eight prompts from `scripts/eval-mcp/prompts.json`, no tool-call cap. **Runner is still you, in-session**, but now there's a judge step that scores your responses on the 7-dim rubric in `.agents/skills/eval-mcp/rubric.md` (faithfulness, specificity, actionability, insight, prioritization, honesty, overall).

#### Why the judge stays subprocess-based

The runner directive ("YOU make the calls") exists because tool-selection should be measured in the agent environment that real users hit. Judging is a different task — it's a critique of an existing response, not a tool-selection decision — and it benefits from blinding. A model judging its own response on faithfulness has obvious bias. So the judge step uses a fresh `claude -p` subprocess that sees only `{prompt, response, rubric}` with no conversation context.

#### Procedure

1. Read `scripts/eval-mcp/prompts.json` and `.agents/skills/eval-mcp/rubric.md`.
2. For each prompt, run the in-session pass (same shape as fast mode but uncapped):
   - Read the prompt
   - Call MCP tools as needed, no call cap
   - Produce a final response (≤800 words) that meets the quality bars in `rubric.md`:
     - Lead with the single biggest finding
     - Every claim has a number AND a name
     - 3-5 concrete actions naming resource + operation
     - Be honest about what you don't know
     - Find the non-obvious thing
   - End with a `## Data sources` appendix listing each cited number → tool that returned it (≤8 entries)
3. Write `runner.json` per prompt with `{prompt, response, tools_called, transport, duration_ms_est}`.
4. **Judge step (subprocess):** for each `runner.json`, spawn a `claude -p` judge that gets only `{prompt, response, rubric}` and returns the JSON shape from `rubric.md`. Invoke directly — do not depend on `eval.ts`, which couples runner+judge:
   ```bash
   RUBRIC=$(cat .agents/skills/eval-mcp/rubric.md)
   PROMPT=$(jq -r '.prompt' "$RUNNER_JSON")
   RESPONSE=$(jq -r '.response' "$RUNNER_JSON")
   CRITERIA=$(jq -r '.criteria // ""' "$RUNNER_JSON")  # chat-followup only
   printf "## User prompt\n%s\n\n## Agent response\n%s\n\n## Per-prompt criteria\n%s\n\n## Rubric\n%s\n\nScore the response per the rubric (and any per-prompt criteria above). Return only the JSON object — no fences, no preamble." \
     "$PROMPT" "$RESPONSE" "$CRITERIA" "$RUBRIC" \
     | claude -p --output-format json > "$JUDGE_JSON"
   ```
   Write `judge.json` per prompt. If parsing fails (e.g., the judge wrapped JSON in a fence), retry once with a stricter "JSON only" reminder.
5. Compute means across the 7 dims. Write `meta.json` with `server_mode`, `runner=in-session`, `judge=subprocess`, and per-dim means.
6. Append to `scripts/eval-mcp/results/history.jsonl`. Filter by `runner` AND `server_mode` when reading trends.
7. Print the 7-dim table with `↑/↓/=` deltas vs the previous same-`runner`/`server_mode` row. After the table, list the bottom-2 dims with one sentence on what to fix, then list every prompt where `faithfulness ≤ 4` — those are the fabrication failures.

### Chat-followup (multi-turn / write prompts)

Prompts in `prompts-chat.json` test multi-turn behaviors (forecast→build, apply-after-audit, language-handling, eligible-zero-impressions). Some are gated by `EVAL_ALLOW_WRITES=1` because they execute real mutations.

**These also run in-session, by you.** The whole point of chat-followup is testing that, after the agent surfaces a recommendation, the apply-intent → write-tool routing fires correctly on turn 2. A subagent doesn't model this — each runner is single-turn with no shared agent state.

For each chat prompt:
1. **Turn 1** (the `prompt` field): you call read tools, surface findings, propose actions
2. **Turn 2** (the `followup` field, e.g. "yes, apply that"): verify you call the correct write tool with sensible args
3. **Write-gating:** if the prompt has `writes:true` and `EVAL_ALLOW_WRITES` is unset, surface the planned write-tool call WITHOUT executing — log it as `would_call` instead of `called`. The judge applies the prompt's `criteria` field on top of the standard rubric.

## Storage layout

```
scripts/eval-mcp/
├── prompts.json                          ← full-mode test set (8 prompts, uncapped)
├── prompts-fast.json                     ← fast-mode test set (3 prompts, capped at 3 calls)
├── prompts-chat.json                     ← multi-turn / write test set
├── eval.ts                               ← headless harness (now used only for the judge step in full mode)
└── results/
    ├── history.jsonl                     ← full-mode history (includes runner, server_mode, all 7 dim means)
    ├── history-fast.jsonl                ← fast-mode history (includes runner, server_mode)
    ├── 2026-04-30T18-00-cd23a44-fast-dev/        ← fast-mode in-session run
    │   └── <prompt_id>/runner.json
    ├── 2026-04-30T19-15-cd23a44-dev/             ← full-mode in-session run + subprocess judge
    │   ├── meta.json
    │   └── <prompt_id>/{runner,judge}.json
    └── ...
```

Directory naming: `<ts>-<label>[-fast]-<server_mode>`. The `runner` field lives in `meta.json` and history rows so you can filter trends.

## Schema migration note

The `runner` field on history rows is new. Pre-rewrite rows have two different implicit values depending on their source:
- `history-fast.jsonl` rows from before this rewrite were produced by spawned subagents → treat as `runner=subagent`
- `history.jsonl` (full-mode) rows from before this rewrite were produced by the headless `eval.ts` harness shelling out to `claude -p` → treat as `runner=subprocess`

When reading either file for "did quality move", filter to `runner=in-session` rows only. If you need to graph the long-term trend through the rewrite, plot separate series per `runner` value — never average across runner types, the baselines aren't comparable.

## When to use which

| Situation | Mode | Runner |
|---|---|---|
| Just changed a tool description, want signal in 2-3 min | fast | in-session (you) |
| Just changed server `instructions` | fast | in-session (you) |
| About to ship MCP changes | full (after fast passes) | in-session runner + subprocess judge |
| Multi-turn or write behavior changed | chat | in-session (you) |
| "Has quality moved over time?" | full + read history.jsonl | filter `runner=in-session` |
| Unattended CI run on a schedule | headless harness — see appendix | subprocess (acknowledged divergence) |

## Editing prompts / rubric

- `scripts/eval-mcp/prompts-fast.json` — fast set. Three targeted prompts. Each entry has `id`, `prompt`, `expected`, `reason`. Keep ~3 prompts; if you add one, remove one. Include at least one **negative test** (a prompt that should NOT pick `runScript`) to guard against over-rotation.
- `scripts/eval-mcp/prompts.json` — full set. Edit when adding a new user-ask shape to the quality benchmark. Keep `id` stable across edits.
- `scripts/eval-mcp/prompts-chat.json` — chat set. `writes:true` prompts are gated behind `EVAL_ALLOW_WRITES=1`. Each carries a `criteria` field the judge applies on top of the standard rubric.
- `.agents/skills/eval-mcp/rubric.md` — only affects `--full` runs. Substantive edits cause a level shift in scores; if you change the rubric materially, start a new history file (`history-v2.jsonl`).

## Appendix: subagent / headless paths (secondary)

These exist for unattended use cases. **Don't use them as the primary runner** — they measure a different agent environment than the one the user actually uses.

### Headless harness (`scripts/eval-mcp/eval.ts`)

`npm run eval:mcp` shells out to `claude -p` per prompt. Acceptable for:
- CRON-scheduled unattended runs (no human in the loop)
- Comparing in-session results against the headless baseline (env-divergence detection — if these two diverge, your tool descriptions read differently across agent environments and that's signal worth chasing)

**Mark the run** with `runner=subprocess` so its rows in `history*.jsonl` don't pollute the in-session trend.

### `general-purpose` Task subagents

Don't. The tool-selection priors of a fresh subagent differ from your in-session priors, and that difference IS the bias the eval is trying to avoid. If you find yourself reaching for `Agent({subagent_type: "general-purpose"})` to "speed things up" — stop. Run the prompts in-session, sequentially, and accept the wall-clock cost (3 prompts × ~30s ≈ 2 min for fast mode, comparable to the prior subagent path once you account for its ~5s spawn overhead).

The only time a subagent run is the right answer is **env-divergence detection**: occasionally run fast mode both in-session and via subagents, and look for prompts where they disagree. Those are the prompts where your tool descriptions are environment-sensitive. Mark these runs `runner=subagent` and keep them out of the trend.
