import type { ZodRawShape, ZodTypeAny } from "zod";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AuthContext } from "@/lib/google-ads";
import { registerMetaReadTools } from "@/lib/mcp/meta-tools/read-tools";
import { registerMetaWriteTools } from "@/lib/mcp/meta-tools/write-tools";
import { registerMetaCodeModeTools } from "@/lib/mcp/code-mode-meta";
import { withMcpTelemetry } from "@/lib/mcp/telemetry";
import type { CollectedTool } from "@/lib/mcp/collect";

/**
 * Mirrors `lib/mcp/collect.ts` but for the Meta Ads MCP. The chat agent uses
 * this to derive its tool surface from the same registrars that back
 * `/api/mcp/meta_ads`, so chat and the OAuth-connected MCP stay in lockstep.
 */

type RegisterToolConfig = {
  description?: string;
  inputSchema?: ZodRawShape;
  annotations?: Record<string, unknown>;
};

class ToolCollector {
  readonly tools: CollectedTool[] = [];

  registerTool(
    name: string,
    config: RegisterToolConfig,
    handler: (args: Record<string, unknown>) => Promise<CallToolResult>,
  ): unknown {
    this.tools.push({
      name,
      description: config.description ?? "",
      inputShape: (config.inputSchema ?? {}) as Record<string, ZodTypeAny>,
      annotations: config.annotations,
      handler,
    });
    return undefined;
  }
}

export function collectMetaAdsTools(currentAuth: () => AuthContext): CollectedTool[] {
  const collector = new ToolCollector();
  withMcpTelemetry(collector);
  registerMetaReadTools(collector as unknown as McpServer, currentAuth);
  registerMetaWriteTools(collector as unknown as McpServer, currentAuth);
  registerMetaCodeModeTools(collector as unknown as McpServer, currentAuth);
  return collector.tools;
}
