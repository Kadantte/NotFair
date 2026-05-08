"use client";

import { useTranslations } from "next-intl";
import { McpSetupTabs, parseSetupSlug } from "@/components/mcp-setup-tabs";
import { DESIGN_MCP_CONNECTOR_NAME, DESIGN_MCP_SERVER_URL } from "@/lib/brand";

/**
 * Setup page for the hosted Design MCP at /api/mcp/design.
 *
 * Unlike the local stdio Design MCP (npx @notfair/design-mcp), this hosted
 * server requires no API keys from the user — authentication is handled via
 * NotFair's OAuth flow. The user connects once; all image generation is
 * server-side using NotFair's Gemini quota.
 *
 * Mirrors ConnectMetaAdsMcpPage in structure: McpSetupTabs handles the four
 * client tabs (Claude Connector, Claude Code, Codex, Any-MCP), and the OAuth
 * dance is handled by /api/oauth/authorize?resource=/api/mcp/design.
 */
export function ConnectDesignMcpPage({ slug }: { slug?: string[] }) {
  const t = useTranslations("ConnectDesignMcpPage");
  const { activeTab } = parseSetupSlug(slug);

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-8">
        <div className="mx-auto max-w-4xl space-y-8">
          <header className="space-y-2">
            <h1 className="text-3xl font-bold text-[#E8E4DD]">
              {t("title")}
            </h1>
            <p className="max-w-2xl text-base leading-relaxed text-[#C4C0B6]">
              {t("bodyBeforeCode")}{" "}
              <code className="font-mono-jb text-[13px] text-[#E8E4DD]">
                /api/mcp/design
              </code>
              {t("bodyAfterCode")}
            </p>
          </header>

          <McpSetupTabs
            activeTab={activeTab}
            basePath="/connect/design"
            serverUrl={DESIGN_MCP_SERVER_URL}
            connectorName={DESIGN_MCP_CONNECTOR_NAME}
            platformLabel="Design"
            slashCommand="/design"
            examplePrompt={t("examplePrompt")}
          />
        </div>
      </div>
    </section>
  );
}
