import { InferAgentUIMessage, stepCountIs, ToolLoopAgent, tool, type Tool } from "ai";
import { openai } from "@ai-sdk/openai";
import { anthropic } from "@ai-sdk/anthropic";
import { z, type ZodTypeAny } from "zod";
import type { AuthContext } from "@/lib/google-ads";
import { collectAdsTools, type CollectedTool } from "@/lib/mcp/collect";
import {
  defaultModeFor,
  type ToolPermissionMode,
} from "@/lib/tool-permissions";

export type ChatModelId = "gpt-5-mini" | "gpt-5.4" | "claude-opus-4.7";

type AgentAuth = {
  refreshToken: string;
  customerId: string;
  userId?: string | null;
  authMethod?: string | null;
  /** Map of toolName -> mode overrides. Unset tools fall back to defaultModeFor(readOnly). */
  toolPermissions?: Record<string, ToolPermissionMode>;
  modelId?: ChatModelId;
};

function resolveModel(modelId: ChatModelId | undefined) {
  switch (modelId) {
    case "gpt-5.4":
      return openai("gpt-5");
    case "claude-opus-4.7":
      return anthropic("claude-opus-4-7");
    case "gpt-5-mini":
    default:
      return openai("gpt-5-mini");
  }
}

const MAX_STEPS = 8;

type McpToolResult = {
  content?: Array<{ type: string; text?: string }>;
  isError?: boolean;
};

function unwrapMcpResult(result: McpToolResult): unknown {
  const text = result.content?.find((c) => c.type === "text")?.text;
  if (text === undefined) return null;
  if (result.isError) return { error: text };
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function adaptCollectedTool(collected: CollectedTool, mode: ToolPermissionMode): Tool {
  // Strip `accountId` — chat is single-account, so the MCP handler
  // resolves to the session's default customer when accountId is undefined.
  const { accountId: _accountId, ...inputShape } = collected.inputShape as Record<
    string,
    ZodTypeAny
  >;

  return tool({
    description: collected.description,
    inputSchema: z.object(inputShape),
    needsApproval: mode === "needs_approval",
    execute: async (args) => {
      const result = await collected.handler({
        ...(args as Record<string, unknown>),
        accountId: undefined,
      });
      return unwrapMcpResult(result);
    },
  });
}

export function createGoogleAdsAgent(agentAuth: AgentAuth) {
  const authContext: AuthContext = {
    refreshToken: agentAuth.refreshToken,
    customerId: agentAuth.customerId,
    customerIds: [{ id: agentAuth.customerId, name: "" }],
    userId: agentAuth.userId ?? null,
    authMethod: agentAuth.authMethod ?? "chat",
    clientName: "adsagent-chat",
  };

  const collected = collectAdsTools(() => authContext);
  const overrides = agentAuth.toolPermissions ?? {};
  const tools: Record<string, Tool> = {};
  for (const t of collected) {
    const readOnly = Boolean((t.annotations as { readOnlyHint?: boolean } | undefined)?.readOnlyHint);
    const mode = overrides[t.name] ?? defaultModeFor(readOnly);
    // Blocked tools are omitted entirely so the model never sees or calls them.
    if (mode === "blocked") continue;
    tools[t.name] = adaptCollectedTool(t, mode);
  }

  return new ToolLoopAgent({
    model: resolveModel(agentAuth.modelId),
    stopWhen: stepCountIs(MAX_STEPS),
    prepareStep: ({ stepNumber }) => {
      // On the last step, force text-only response by disabling tool calls
      if (stepNumber >= MAX_STEPS - 1) {
        return { toolChoice: "none" as const };
      }
      return {};
    },
    instructions: `You are AdsAgent, a Google Ads copilot in a chat interface.

You are currently operating on one connected Google Ads account chosen by the user.
Be precise, commercial, and action-oriented.

Rules:
- Use tools whenever the user asks about account data, campaigns, keywords, metrics, or reporting.
- When the user asks for analysis, inspect the account first instead of making assumptions.
- Explain metrics in plain English and include exact numbers from tool results.
- Never invent campaign performance. If data is missing, say so.
- Prefer concise answers unless the user explicitly asks for a deeper audit.
- Never make write changes without explicit user confirmation. Always show what you plan to change, the current value, and the new value before executing.
- After every write, tell the user the changeId so they can undo within 7 days.
- Guardrails are server-side: bid changes >25% and budget changes >50% will be rejected.
- Onboarding: if the current thread has no prior assistant messages AND the user's first message is a generic greeting or explicitly asks for an audit, run an account audit by calling \`runScript\` with a parallel GAQL fan-out across campaigns, search terms, quality scores, and change events (the \`gaqlParallel\` example in the MCP server instructions). Summarize the top 3 proposed actions with dollar impact and tell the user they can also see and apply audit recommendations directly at /audit.
- Do NOT auto-run audit when the user's first message is a specific question (e.g., "bump budget on campaign X", "what's my CTR?") — answer that question directly.
- IMPORTANT: Always end your response with a text summary. Never stop after tool calls without explaining the results to the user.`,
    tools,
  });
}

export type GoogleAdsAgentUIMessage = InferAgentUIMessage<
  ReturnType<typeof createGoogleAdsAgent>
>;
