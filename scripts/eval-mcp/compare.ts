/**
 * Compare two eval result files side-by-side.
 *
 * Usage:
 *   npx tsx scripts/eval-mcp/compare.ts baseline my-change
 *   # reads results/baseline.jsonl and results/my-change.jsonl
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

type Scores = {
  faithfulness: number;
  specificity: number;
  actionability: number;
  insight: number;
  prioritization: number;
  honesty: number;
  overall: number;
};

type Row = {
  label: string;
  prompt_id: string;
  run_index: number;
  wall_ms: number;
  tool_call_total: number;
  input_tokens: number;
  output_tokens: number;
  scores?: Scores;
  error?: string;
};

type Agg = Scores & { wall_ms: number; tools: number; tokens: number; n: number };

function load(label: string): Row[] {
  const path = resolve(__dirname, "results", `${label}.jsonl`);
  return readFileSync(path, "utf-8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

function aggByPrompt(rows: Row[]): Map<string, Agg> {
  const ok = rows.filter((r) => !r.error && r.scores);
  const byId = new Map<string, Row[]>();
  for (const r of ok) {
    if (!byId.has(r.prompt_id)) byId.set(r.prompt_id, []);
    byId.get(r.prompt_id)!.push(r);
  }
  const agg = new Map<string, Agg>();
  for (const [id, list] of byId.entries()) {
    const avg = (f: (r: Row) => number) => list.reduce((s, r) => s + f(r), 0) / list.length;
    agg.set(id, {
      wall_ms: avg((r) => r.wall_ms),
      tools: avg((r) => r.tool_call_total),
      tokens: avg((r) => r.input_tokens + r.output_tokens),
      faithfulness: avg((r) => r.scores!.faithfulness),
      specificity: avg((r) => r.scores!.specificity),
      actionability: avg((r) => r.scores!.actionability),
      insight: avg((r) => r.scores!.insight),
      prioritization: avg((r) => r.scores!.prioritization),
      honesty: avg((r) => r.scores!.honesty),
      overall: avg((r) => r.scores!.overall),
      n: list.length,
    });
  }
  return agg;
}

function fmtDelta(a: number, b: number, fractionDigits = 2, invert = false): string {
  const delta = b - a;
  const sign = delta >= 0 ? "+" : "";
  const good = invert ? delta <= 0 : delta >= 0;
  const color = Math.abs(delta) < 0.01 * Math.max(Math.abs(a), 1) ? "\x1b[90m" : good ? "\x1b[32m" : "\x1b[31m";
  return `${color}${sign}${delta.toFixed(fractionDigits)}\x1b[0m`;
}

function main() {
  const [baselineLabel, candidateLabel] = process.argv.slice(2);
  if (!baselineLabel || !candidateLabel) {
    console.error("Usage: tsx scripts/eval-mcp/compare.ts <baseline> <candidate>");
    process.exit(1);
  }
  const base = aggByPrompt(load(baselineLabel));
  const cand = aggByPrompt(load(candidateLabel));

  const ids = Array.from(new Set([...base.keys(), ...cand.keys()])).sort();
  console.log(`\n${baselineLabel} → ${candidateLabel}\n`);
  console.log("prompt_id           overall Δ        faith Δ          spec Δ           action Δ         insight Δ        prior Δ          honest Δ         wall(s) Δ        tools Δ          tokens Δ");
  console.log("─".repeat(180));

  for (const id of ids) {
    const b = base.get(id);
    const c = cand.get(id);
    if (!b || !c) {
      console.log(`${id.padEnd(20)} (missing in ${!b ? baselineLabel : candidateLabel})`);
      continue;
    }
    console.log(
      `${id.padEnd(20)}` +
      `${c.overall.toFixed(2).padStart(5)} ${fmtDelta(b.overall, c.overall).padStart(14)}  ` +
      `${fmtDelta(b.faithfulness, c.faithfulness).padStart(14)}  ` +
      `${fmtDelta(b.specificity, c.specificity).padStart(14)}  ` +
      `${fmtDelta(b.actionability, c.actionability).padStart(14)}  ` +
      `${fmtDelta(b.insight, c.insight).padStart(14)}  ` +
      `${fmtDelta(b.prioritization, c.prioritization).padStart(14)}  ` +
      `${fmtDelta(b.honesty, c.honesty).padStart(14)}  ` +
      `${(c.wall_ms / 1000).toFixed(1).padStart(5)} ${fmtDelta(b.wall_ms / 1000, c.wall_ms / 1000, 1, true).padStart(14)}  ` +
      `${fmtDelta(b.tools, c.tools, 1, true).padStart(14)}  ` +
      `${fmtDelta(b.tokens, c.tokens, 0, true).padStart(14)}`
    );
  }

  const meanField = (m: Map<string, Agg>, f: (v: Agg) => number) => {
    const vals = Array.from(m.values()).map(f);
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  };

  console.log("─".repeat(180));
  const overallDelta = meanField(cand, (v) => v.overall) - meanField(base, (v) => v.overall);
  const faithDelta = meanField(cand, (v) => v.faithfulness) - meanField(base, (v) => v.faithfulness);
  const wallDelta = (meanField(cand, (v) => v.wall_ms) - meanField(base, (v) => v.wall_ms)) / 1000;
  const tokensDelta = meanField(cand, (v) => v.tokens) - meanField(base, (v) => v.tokens);
  console.log(
    `MEAN                 overall Δ=${overallDelta >= 0 ? "+" : ""}${overallDelta.toFixed(2)}   ` +
    `faithfulness Δ=${faithDelta >= 0 ? "+" : ""}${faithDelta.toFixed(2)}   ` +
    `wall Δ=${wallDelta >= 0 ? "+" : ""}${wallDelta.toFixed(1)}s   ` +
    `tokens Δ=${tokensDelta >= 0 ? "+" : ""}${tokensDelta.toFixed(0)}`
  );
  console.log();
}

main();
