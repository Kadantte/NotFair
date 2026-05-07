"use client";

import { useTranslations } from "next-intl";
import { McpSetupTabs, parseSetupSlug } from "@/components/mcp-setup-tabs";
import { MetaConnectedToast } from "@/components/meta-connected-toast";
import { MissingPlatformWarning } from "@/components/missing-platform-warning";
import { META_MCP_CONNECTOR_NAME, META_MCP_SERVER_URL } from "@/lib/brand";

/**
 * Mirror of /connect for the Meta Ads MCP. Renders the same SetupTabs
 * (Claude Connector / Claude Code / Codex / Any-MCP) but with URLs and
 * connector name pointed at /api/mcp/meta_ads. OAuth-only — direct-bearer
 * was never wired for Meta.
 */
export function ConnectMetaAdsMcpPage({
  slug,
  hasMeta,
}: {
  slug?: string[];
  hasMeta: boolean;
}) {
  const t = useTranslations("ConnectMetaAdsMcpPage");
  const { activeTab } = parseSetupSlug(slug);

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-8">
        <div className="mx-auto max-w-4xl space-y-8">
          <MetaConnectedToast />
          {!hasMeta && <MissingPlatformWarning platform="meta_ads" />}
          <header className="space-y-2">
            <h1 className="text-3xl font-bold text-[#E8E4DD]">
              {t("title")}
            </h1>
            <p className="max-w-2xl text-base leading-relaxed text-[#C4C0B6]">
              {t("bodyBeforeCode")}{" "}
              <code className="font-mono-jb text-[13px] text-[#E8E4DD]">
                /api/mcp/meta_ads
              </code>
              {t("bodyAfterCode")}
            </p>
          </header>

          <McpSetupTabs
            activeTab={activeTab}
            basePath="/connect/meta-ads"
            serverUrl={META_MCP_SERVER_URL}
            connectorName={META_MCP_CONNECTOR_NAME}
            platformLabel="Meta Ads"
            slashCommand="/meta-ads"
            examplePrompt={t("examplePrompt")}
          />
        </div>
      </div>
    </section>
  );
}
