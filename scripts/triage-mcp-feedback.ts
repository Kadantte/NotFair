import { asc, eq } from "drizzle-orm";
import { loadEnvLocal } from "./_load-env";
import { db, schema } from "../lib/db";
import { buildMcpFeedbackTriageReport, type McpToolFeedbackRow } from "../lib/mcp/feedback-triage";

loadEnvLocal();

type Args = {
  limit: number;
  status: string;
  sample: boolean;
};

function parseArgs(argv: string[]): Args {
  const limitFlag = argv.indexOf("--limit");
  const statusFlag = argv.indexOf("--status");
  const sample = argv.includes("--sample");
  const limit = limitFlag === -1 ? 25 : Number(argv[limitFlag + 1]);
  const status = statusFlag === -1 ? "new" : argv[statusFlag + 1];

  if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
    throw new Error("--limit must be an integer between 1 and 200");
  }
  if (!status) throw new Error("--status cannot be empty");

  return { limit, status, sample };
}

async function fetchFeedbackRows({ limit, status }: Args): Promise<McpToolFeedbackRow[]> {
  return db()
    .select({
      id: schema.mcpToolFeedback.id,
      category: schema.mcpToolFeedback.category,
      affectedTool: schema.mcpToolFeedback.affectedTool,
      observation: schema.mcpToolFeedback.observation,
      suggestion: schema.mcpToolFeedback.suggestion,
      userGoal: schema.mcpToolFeedback.userGoal,
      userEmail: schema.mcpToolFeedback.userEmail,
      clientName: schema.mcpToolFeedback.clientName,
      status: schema.mcpToolFeedback.status,
      createdAt: schema.mcpToolFeedback.createdAt,
    })
    .from(schema.mcpToolFeedback)
    .where(eq(schema.mcpToolFeedback.status, status))
    .orderBy(asc(schema.mcpToolFeedback.createdAt))
    .limit(limit);
}

const SAMPLE_ROWS: McpToolFeedbackRow[] = [
  {
    id: 1,
    category: "workflow_friction",
    affectedTool: "addNegativeKeyword",
    observation: "The tool description did not mention the bulk variant, so I called this repeatedly.",
    suggestion: "Mention addKeywordToNegativeList in the description.",
    userGoal: "Add negative keywords from a search-term audit.",
    status: "new",
    createdAt: new Date("2026-05-21T00:00:00.000Z"),
  },
];

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const rows = args.sample ? SAMPLE_ROWS.slice(0, args.limit) : await fetchFeedbackRows(args);
  const report = buildMcpFeedbackTriageReport(rows);
  console.log(JSON.stringify(report, null, 2));
  // This script is a CLI. The shared DB singleton keeps the postgres client open,
  // which can otherwise leave pnpm/tsx hanging after successful output.
  process.exit(0);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
