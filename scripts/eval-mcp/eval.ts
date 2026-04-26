/**
 * MCP eval harness.
 *
 * For each prompt in prompts.json:
 *   1. Spawn `claude -p` wired to a local MCP server (http://localhost:3000/api/mcp)
 *   2. Capture tool calls, tokens, wall time, final assistant text
 *   3. Score the final text with a second `claude -p` call using --json-schema (judge)
 *   4. Append one row per run to results/<label>.jsonl
 *
 * Both the agent and the judge use the local Claude Code install — no ANTHROPIC_API_KEY needed.
 *
 * Usage:
 *   MCP_BEARER_TOKEN=... npx tsx scripts/eval-mcp/eval.ts --label baseline
 *   MCP_BEARER_TOKEN=... npx tsx scripts/eval-mcp/eval.ts --label my-change --runs 3
 *
 * Flags:
 *   --label <name>    Output file label. Required.
 *   --runs <n>        Runs per prompt (default 1). Use >1 to measure variance.
 *   --only <id>       Run only the prompt with this id.
 *   --url <url>       MCP URL (default http://localhost:3000/api/mcp).
 *   --model <alias>   Claude model for the agent (default "sonnet"). Judge always uses opus.
 */
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, existsSync, appendFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnvLocal } from "../_load-env";

loadEnvLocal();

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── CLI args ──────────────────────────────────────────────────────────
type Args = { label: string; runs: number; only?: string; url: string; model: string };

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const get = (flag: string) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const label = get("--label");
  if (!label) {
    console.error("Missing --label <name>");
    process.exit(1);
  }
  return {
    label,
    runs: Number(get("--runs") ?? 1),
    only: get("--only"),
    url: get("--url") ?? "http://localhost:3000/api/mcp",
    model: get("--model") ?? "sonnet",
  };
}

// ─── Types ─────────────────────────────────────────────────────────────
type Prompt = { id: string; prompt: string };

type RunMetrics = {
  label: string;
  prompt_id: string;
  prompt: string;
  run_index: number;
  wall_ms: number;
  tool_calls: { name: string; count: number }[];
  tool_call_total: number;
  input_tokens: number;
  output_tokens: number;
  final_text: string;
  scores?: {
    faithfulness: number;
    specificity: number;
    actionability: number;
    insight: number;
    prioritization: number;
    honesty: number;
    overall: number;
  };
  judge_notes?: string;
  error?: string;
  ts: string;
  git_sha?: string;
};

// ─── Rubric (judge prompt) ─────────────────────────────────────────────
// Loaded from .claude/skills/eval-mcp/rubric.md so the headless runner and the
// /eval-mcp skill grade against the same bar. If the file is missing, the
// fallback below is the abbreviated 7-dim rubric.
function loadRubric(): string {
  const rubricPath = resolve(__dirname, "../../.claude/skills/eval-mcp/rubric.md");
  if (existsSync(rubricPath)) {
    return readFileSync(rubricPath, "utf-8");
  }
  return FALLBACK_RUBRIC;
}

const FALLBACK_RUBRIC = `You are evaluating the quality of a Google Ads audit produced by an AI agent using MCP tools.

Rate the response 1-10 on each dimension. Be strict — 10 means "could not be improved", not "decent".

- **faithfulness** (1-10): Are the cited numbers and resource names real, or fabricated? Tells of fabrication: suspiciously round numbers, generic names ("Campaign A"), internal contradictions, claims with no number. Faithfulness is a quality floor — if ≤4, overall cannot exceed faithfulness+1.
- **specificity** (1-10): Does every claim have a number AND a named resource, or is it generic boilerplate?
- **actionability** (1-10): Are next steps concrete enough to execute today (named resource + operation + value), or vague?
- **insight** (1-10): Does it surface a non-obvious pattern / connect surfaces / find root cause, or just describe what's on the screen?
- **prioritization** (1-10): Does it lead with the single biggest lever (and explain why), or is it a flat list?
- **honesty** (1-10): Does it acknowledge data gaps and refuse to invent recommendations when data is thin, or paper over uncertainty?
- **overall** (1-10): Holistic judgment. Not an average — accounts for tradeoffs. Faithfulness floor applies.

Notes: 2-4 sentences on the 1-2 concrete things that would push this to a 10.`;

const RUBRIC = loadRubric();

// ─── Run claude -p and parse stream-json ────────────────────────────────
type ParsedRun = {
  wall_ms: number;
  tool_calls: Map<string, number>;
  input_tokens: number;
  output_tokens: number;
  final_text: string;
  error?: string;
};

async function runPrompt(prompt: string, url: string, model: string, bearerToken: string | null): Promise<ParsedRun> {
  // When no bearer token is provided, omit the Authorization header so the dev
  // server's DEV_LOCAL_EMAIL bypass kicks in (see app/api/[transport]/route.ts).
  // Real prod evals or sessions where DEV_LOCAL_EMAIL is unset must pass a token.
  const mcpConfig = {
    mcpServers: {
      "adsagent-local": {
        type: "http",
        url,
        ...(bearerToken ? { headers: { Authorization: `Bearer ${bearerToken}` } } : {}),
      },
    },
  };

  const args = [
    "-p",
    prompt,
    "--output-format",
    "stream-json",
    "--verbose",
    "--mcp-config",
    JSON.stringify(mcpConfig),
    "--strict-mcp-config",
    "--allowedTools",
    "mcp__adsagent-local__*",
    "--permission-mode",
    "bypassPermissions",
    "--model",
    model,
    "--no-session-persistence",
    "--bare",
  ];

  const start = Date.now();
  const tool_calls = new Map<string, number>();
  let input_tokens = 0;
  let output_tokens = 0;
  let final_text = "";
  let error: string | undefined;

  return new Promise((resolveRun) => {
    const child = spawn("claude", args, { stdio: ["ignore", "pipe", "pipe"] });

    let buffer = "";
    child.stdout.on("data", (chunk: Buffer) => {
      buffer += chunk.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const msg = JSON.parse(line);
          handleMessage(msg);
        } catch {
          /* non-JSON line */
        }
      }
    });

    let stderrBuf = "";
    child.stderr.on("data", (chunk: Buffer) => {
      stderrBuf += chunk.toString();
    });

    child.on("close", (code) => {
      if (code !== 0 && !final_text) {
        error = `claude exited ${code}: ${stderrBuf.slice(0, 500)}`;
      }
      resolveRun({
        wall_ms: Date.now() - start,
        tool_calls,
        input_tokens,
        output_tokens,
        final_text,
        error,
      });
    });

    function handleMessage(msg: { type: string; message?: { content?: Array<{ type: string; name?: string; text?: string }>; usage?: { input_tokens?: number; output_tokens?: number } }; result?: string; usage?: { input_tokens?: number; output_tokens?: number }; subtype?: string }) {
      if (msg.type === "assistant" && msg.message?.content) {
        for (const block of msg.message.content) {
          if (block.type === "tool_use" && block.name) {
            tool_calls.set(block.name, (tool_calls.get(block.name) ?? 0) + 1);
          }
          if (block.type === "text" && block.text) {
            final_text += block.text;
          }
        }
        if (msg.message.usage) {
          input_tokens += msg.message.usage.input_tokens ?? 0;
          output_tokens += msg.message.usage.output_tokens ?? 0;
        }
      }
      if (msg.type === "result") {
        if (msg.subtype === "error_max_turns" || msg.subtype === "error_during_execution") {
          error = `claude result error: ${msg.subtype}`;
        }
        if (msg.result && !final_text) final_text = msg.result;
      }
    }
  });
}

// ─── Judge ─────────────────────────────────────────────────────────────
type Score = {
  faithfulness: number;
  specificity: number;
  actionability: number;
  insight: number;
  prioritization: number;
  honesty: number;
  overall: number;
  notes: string;
};

const SCORE_SCHEMA = {
  type: "object",
  properties: {
    faithfulness: { type: "integer", minimum: 1, maximum: 10 },
    specificity: { type: "integer", minimum: 1, maximum: 10 },
    actionability: { type: "integer", minimum: 1, maximum: 10 },
    insight: { type: "integer", minimum: 1, maximum: 10 },
    prioritization: { type: "integer", minimum: 1, maximum: 10 },
    honesty: { type: "integer", minimum: 1, maximum: 10 },
    overall: { type: "integer", minimum: 1, maximum: 10 },
    notes: { type: "string" },
  },
  required: ["faithfulness", "specificity", "actionability", "insight", "prioritization", "honesty", "overall", "notes"],
  additionalProperties: false,
} as const;

function judge(prompt: string, output: string): Promise<Score> {
  const judgePrompt = `## User prompt\n${prompt}\n\n## Agent response\n${output}\n\nScore this response per the rubric. Return only the JSON object.`;

  const args = [
    "-p",
    judgePrompt,
    "--append-system-prompt",
    RUBRIC,
    "--json-schema",
    JSON.stringify(SCORE_SCHEMA),
    "--output-format",
    "json",
    "--model",
    "opus",
    "--tools",
    "",
    "--no-session-persistence",
    "--bare",
  ];

  return new Promise((resolveJudge, rejectJudge) => {
    const child = spawn("claude", args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (c: Buffer) => (stdout += c.toString()));
    child.stderr.on("data", (c: Buffer) => (stderr += c.toString()));
    child.on("close", (code) => {
      if (code !== 0) {
        return rejectJudge(new Error(`judge exited ${code}: ${stderr.slice(0, 300)}`));
      }
      try {
        const envelope = JSON.parse(stdout);
        // --output-format json wraps the model's response in { type: "result", result: "..." }
        const resultStr = typeof envelope.result === "string" ? envelope.result : stdout;
        const parsed: Score = JSON.parse(resultStr);
        resolveJudge(parsed);
      } catch (e) {
        rejectJudge(new Error(`judge parse error: ${e instanceof Error ? e.message : String(e)} — raw: ${stdout.slice(0, 300)}`));
      }
    });
  });
}

// ─── Main ──────────────────────────────────────────────────────────────
async function main() {
  const args = parseArgs();
  const bearer = process.env.MCP_BEARER_TOKEN ?? null;
  const devLocalEmail = process.env.DEV_LOCAL_EMAIL;

  if (!bearer && !devLocalEmail) {
    console.error(
      "Need either MCP_BEARER_TOKEN or DEV_LOCAL_EMAIL.\n" +
      "  · Set DEV_LOCAL_EMAIL=<your-google-email> in .env.local for the dev bypass (recommended for local iteration).\n" +
      "  · Or set MCP_BEARER_TOKEN=<token> for explicit auth (required for --url pointing at prod).",
    );
    process.exit(1);
  }
  if (bearer) {
    console.log("Auth: bearer token (explicit)");
  } else {
    console.log(`Auth: dev bypass via DEV_LOCAL_EMAIL=${devLocalEmail}`);
  }

  // Pre-flight: confirm `claude` CLI itself is logged in. Both the runner and
  // the judge spawn `claude -p` subprocesses, and an unauthenticated CLI fails
  // silently (the subprocess just returns "Not logged in" as its output).
  // Catch it here so the user gets one clear error instead of 8 mystifying
  // judge errors.
  await preflightClaudeLogin();

  const promptsPath = resolve(__dirname, "prompts.json");
  const allPrompts: Prompt[] = JSON.parse(readFileSync(promptsPath, "utf-8"));
  const prompts = args.only ? allPrompts.filter((p) => p.id === args.only) : allPrompts;

  if (prompts.length === 0) {
    console.error(`No prompts matched --only ${args.only}`);
    process.exit(1);
  }

  const resultsDir = resolve(__dirname, "results");
  if (!existsSync(resultsDir)) mkdirSync(resultsDir, { recursive: true });
  const outPath = resolve(resultsDir, `${args.label}.jsonl`);
  writeFileSync(outPath, ""); // truncate

  const gitSha = await getGitSha();
  const rows: RunMetrics[] = [];

  for (const p of prompts) {
    for (let i = 0; i < args.runs; i++) {
      process.stdout.write(`▶ ${p.id} (run ${i + 1}/${args.runs})... `);
      const run = await runPrompt(p.prompt, args.url, args.model, bearer);
      let scores: Score | undefined;
      if (!run.error && run.final_text) {
        try {
          scores = await judge(p.prompt, run.final_text);
        } catch (e) {
          run.error = `judge error: ${e instanceof Error ? e.message : String(e)}`;
        }
      }
      const row: RunMetrics = {
        label: args.label,
        prompt_id: p.id,
        prompt: p.prompt,
        run_index: i,
        wall_ms: run.wall_ms,
        tool_calls: Array.from(run.tool_calls.entries()).map(([name, count]) => ({ name, count })),
        tool_call_total: Array.from(run.tool_calls.values()).reduce((a, b) => a + b, 0),
        input_tokens: run.input_tokens,
        output_tokens: run.output_tokens,
        final_text: run.final_text,
        scores: scores
          ? {
              faithfulness: scores.faithfulness,
              specificity: scores.specificity,
              actionability: scores.actionability,
              insight: scores.insight,
              prioritization: scores.prioritization,
              honesty: scores.honesty,
              overall: scores.overall,
            }
          : undefined,
        judge_notes: scores?.notes,
        error: run.error,
        ts: new Date().toISOString(),
        git_sha: gitSha,
      };
      appendFileSync(outPath, JSON.stringify(row) + "\n");
      rows.push(row);
      const flag = run.error ? `ERR(${run.error})` : `${(run.wall_ms / 1000).toFixed(1)}s · ${row.tool_call_total} tools · overall=${scores?.overall ?? "?"}`;
      console.log(flag);
    }
  }

  printSummary(rows);
  console.log(`\nResults: ${outPath}`);
}

function printSummary(rows: RunMetrics[]) {
  const ok = rows.filter((r) => !r.error && r.scores);
  if (ok.length === 0) {
    console.log("\nNo successful runs.");
    return;
  }
  const avg = (f: (r: RunMetrics) => number) => ok.reduce((s, r) => s + f(r), 0) / ok.length;
  console.log("\n─── Summary ───");
  console.log(`Runs:           ${ok.length}/${rows.length} succeeded`);
  console.log(`Wall time avg:  ${(avg((r) => r.wall_ms) / 1000).toFixed(1)}s`);
  console.log(`Tool calls avg: ${avg((r) => r.tool_call_total).toFixed(1)}`);
  console.log(`Input tokens:   ${avg((r) => r.input_tokens).toFixed(0)}`);
  console.log(`Output tokens:  ${avg((r) => r.output_tokens).toFixed(0)}`);
  console.log(`Scores (avg):`);
  console.log(`  faithfulness:   ${avg((r) => r.scores!.faithfulness).toFixed(2)}  ← anti-hallucination floor`);
  console.log(`  specificity:    ${avg((r) => r.scores!.specificity).toFixed(2)}`);
  console.log(`  actionability:  ${avg((r) => r.scores!.actionability).toFixed(2)}`);
  console.log(`  insight:        ${avg((r) => r.scores!.insight).toFixed(2)}`);
  console.log(`  prioritization: ${avg((r) => r.scores!.prioritization).toFixed(2)}`);
  console.log(`  honesty:        ${avg((r) => r.scores!.honesty).toFixed(2)}`);
  console.log(`  overall:        ${avg((r) => r.scores!.overall).toFixed(2)}`);

  const fabricationFails = ok.filter((r) => r.scores!.faithfulness <= 4);
  if (fabricationFails.length > 0) {
    console.log(`\n⚠ FABRICATION FAILURES (faithfulness ≤ 4) — fix these first:`);
    for (const r of fabricationFails) {
      console.log(`  · ${r.prompt_id} (faithfulness=${r.scores!.faithfulness}, overall=${r.scores!.overall})`);
      if (r.judge_notes) console.log(`    notes: ${r.judge_notes.slice(0, 200)}`);
    }
  }
}

async function preflightClaudeLogin(): Promise<void> {
  const out = await new Promise<string>((resolveProbe) => {
    const child = spawn(
      "claude",
      ["-p", "say ok", "--output-format", "text", "--no-session-persistence", "--bare"],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    let stdout = "";
    child.stdout.on("data", (c: Buffer) => (stdout += c.toString()));
    child.on("close", () => resolveProbe(stdout));
  });
  if (/not logged in|please run \/login/i.test(out)) {
    console.error(
      "\nclaude CLI is not authenticated. The eval spawns `claude -p` for runners and judges,\n" +
      "and they need their own auth (interactive Claude Code sessions don't share auth with subprocesses).\n\n" +
      "Fix: run `claude` in a terminal, then `/login`. After that, every `npm run eval:mcp` works.\n",
    );
    process.exit(1);
  }
}

async function getGitSha(): Promise<string | undefined> {
  return new Promise((r) => {
    const child = spawn("git", ["rev-parse", "--short", "HEAD"], { stdio: ["ignore", "pipe", "ignore"] });
    let out = "";
    child.stdout.on("data", (c) => (out += c.toString()));
    child.on("close", () => r(out.trim() || undefined));
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
