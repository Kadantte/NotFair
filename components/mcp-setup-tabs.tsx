"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { ClaudeCodePluginSteps } from "@/components/claude-code-plugin-steps";
import { ConnectorSetupSteps } from "@/components/connector-setup-steps";
import { CodexSetupSteps } from "@/components/codex-setup-steps";
import { AnyMcpClientSetup } from "@/components/any-mcp-client-setup";

export type SetupTab = "claude-code" | "connector" | "codex" | "any-mcp";

export type McpSetupTabsProps = {
  activeTab: SetupTab;
  /** Base path for tab hrefs (e.g. "/connect" or "/connect/meta-ads"). */
  basePath: string;
  /** Server URL to surface in copy-paste fields and snippets. */
  serverUrl: string;
  /** Connector name to surface in copy-paste fields and snippets. */
  connectorName: string;
  /** Platform label used in step copy (default "Google Ads"). */
  platformLabel?: string;
  /** Example prompt shown in the final "ask Claude/Codex" step. */
  examplePrompt?: string;
  /** Claude Code slash command (default "/google-ads"). */
  slashCommand?: string;
};

export function tabSlugFromActive(tab: SetupTab): string {
  switch (tab) {
    case "connector":
      return "claude-connector";
    case "codex":
      return "codex";
    case "any-mcp":
      return "any-mcp";
    case "claude-code":
    default:
      return "claude-code";
  }
}

export function parseSetupSlug(slug?: string[]): { activeTab: SetupTab } {
  if (!slug || slug.length === 0) return { activeTab: "connector" };
  if (slug[0] === "claude-connector") return { activeTab: "connector" };
  if (slug[0] === "chatgpt-codex" || slug[0] === "codex")
    return { activeTab: "codex" };
  if (slug[0] === "any-mcp") return { activeTab: "any-mcp" };
  return { activeTab: "claude-code" };
}

export function McpSetupTabs({
  activeTab,
  basePath,
  serverUrl,
  connectorName,
  platformLabel,
  examplePrompt,
  slashCommand,
}: McpSetupTabsProps) {
  const t = useTranslations("McpSetupTabs");
  const tabs: Array<{
    id: SetupTab;
    href: string;
    title: string;
    description: string;
    badge?: string;
  }> = [
    {
      id: "connector",
      href: `${basePath}/claude-connector`,
      title: t("tabs.connector.title"),
      description: t("tabs.connector.description"),
      badge: t("recommended"),
    },
    {
      id: "claude-code",
      href: `${basePath}/claude-code`,
      title: "Claude Code",
      description: t("tabs.claudeCode.description"),
    },
    {
      id: "codex",
      href: `${basePath}/codex`,
      title: "Codex",
      description: t("tabs.codex.description"),
    },
    {
      id: "any-mcp",
      href: `${basePath}/any-mcp`,
      title: t("tabs.anyMcp.title"),
      description: t("tabs.anyMcp.description"),
    },
  ];

  const tabBtn = (active: boolean) =>
    `group rounded-xl border p-4 text-left transition-all duration-150 ${
      active
        ? "border-[#4CAF6E]/60 bg-[#24231F] shadow-[0_0_0_1px_rgba(76,175,110,0.25)]"
        : "border-[#3D3C36] bg-[#1A1917] hover:border-[#C4C0B6]/40 hover:bg-[#24231F]"
    }`;

  return (
    <div className="flex w-full flex-col items-center space-y-8 text-center">
      <div className="w-full max-w-4xl space-y-3 text-left">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#4CAF6E]">
            {t("eyebrow")}
          </p>
          <h2 className="text-xl font-semibold text-[#E8E4DD] sm:text-2xl">
            {t("title")}
          </h2>
          <p className="text-sm text-[#C4C0B6]">
            {t("body")}
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {tabs.map((tab) => {
            const active = activeTab === tab.id;
            return (
              <Link
                key={tab.id}
                href={tab.href}
                prefetch
                className={`${tabBtn(active)} flex h-full flex-col`}
                aria-current={active ? "page" : undefined}
              >
                <div className="flex h-4 items-center">
                  {tab.badge && (
                    <span className="rounded-full border border-[#4CAF6E]/40 bg-[#4CAF6E]/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#4CAF6E]">
                      {tab.badge}
                    </span>
                  )}
                </div>
                <div
                  className={`mt-2 text-sm font-semibold ${
                    active
                      ? "text-[#E8E4DD]"
                      : "text-[#C4C0B6] group-hover:text-[#E8E4DD]"
                  }`}
                >
                  {tab.title}
                </div>
                <div
                  className={`mt-1 text-xs leading-relaxed ${
                    active
                      ? "text-[#C4C0B6]"
                      : "text-[#C4C0B6]/80 group-hover:text-[#C4C0B6]"
                  }`}
                >
                  {tab.description}
                </div>
              </Link>
            );
          })}
        </div>
      </div>

      {activeTab === "claude-code" ? (
        <div className="w-full max-w-4xl text-left">
          <ClaudeCodePluginSteps
            surface="in_app"
            slashCommand={slashCommand}
            platformLabel={platformLabel}
            examplePrompt={examplePrompt}
          />
        </div>
      ) : activeTab === "connector" ? (
        <div className="w-full max-w-4xl text-left">
          <ConnectorSetupSteps
            surface="in_app"
            serverUrl={serverUrl}
            connectorName={connectorName}
            platformLabel={platformLabel}
            examplePrompt={examplePrompt}
          />
        </div>
      ) : activeTab === "codex" ? (
        <div className="w-full max-w-4xl text-left">
          <CodexSetupSteps
            surface="in_app"
            serverUrl={serverUrl}
            connectorName={connectorName}
            examplePrompt={examplePrompt}
          />
        </div>
      ) : (
        <div className="w-full max-w-4xl text-left">
          <AnyMcpClientSetup
            surface="in_app"
            serverUrl={serverUrl}
            connectorName={connectorName}
          />
        </div>
      )}
    </div>
  );
}
