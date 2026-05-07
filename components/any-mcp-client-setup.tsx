"use client";

import { useCallback, useState } from "react";
import { useTranslations } from "next-intl";
import { Check, Copy } from "lucide-react";
import { trackEvent } from "@/lib/analytics";
import { MCP_CONNECTOR_NAME, MCP_SERVER_URL } from "@/lib/brand";

type Surface = "marketing" | "in_app";

function oauthConfigFor(connectorName: string, serverUrl: string) {
  return `{
  "mcpServers": {
    "${connectorName}": {
      "url": "${serverUrl}"
    }
  }
}`;
}

export function AnyMcpClientSetup({
  surface,
  serverUrl = MCP_SERVER_URL,
  connectorName = MCP_CONNECTOR_NAME,
}: {
  surface: Surface;
  serverUrl?: string;
  connectorName?: string;
}) {
  const t = useTranslations("AnyMcpClientSetup");
  return (
    <div className="space-y-10">
      <ConfigBlock
        id="oauth"
        title={t("oauth.title")}
        subtitle={t("oauth.subtitle")}
      >
        <CodeBlock
          code={oauthConfigFor(connectorName, serverUrl)}
          language="json"
          trackingStep="oauth_json"
          surface={surface}
        />
      </ConfigBlock>
    </div>
  );
}

function ConfigBlock({
  id,
  title,
  subtitle,
  children,
  footer,
}: {
  id: string;
  title: string;
  subtitle: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div id={id} className="scroll-mt-24 rounded-xl border border-[#3D3C36] bg-[#24231F]">
      <div className="border-b border-[#3D3C36] px-5 py-4 text-left">
        <h3 className="text-base font-semibold text-[#E8E4DD]">{title}</h3>
        <p className="mt-1 text-sm leading-relaxed text-[#C4C0B6]">{subtitle}</p>
      </div>
      <div className="p-5 text-left">{children}</div>
      {footer && (
        <div className="border-t border-[#3D3C36] px-5 py-3 text-left text-xs leading-relaxed text-[#C4C0B6]">
          {footer}
        </div>
      )}
    </div>
  );
}

function CodeBlock({
  code,
  language,
  trackingStep,
  surface,
}: {
  code: string;
  language: string;
  trackingStep: string;
  surface: Surface;
}) {
  const t = useTranslations("AnyMcpClientSetup.copy");
  const [copied, setCopied] = useState(false);
  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    trackEvent("install_command_copied", {
      setup_tab: "any-mcp",
      surface,
      step: trackingStep,
    });
    setTimeout(() => setCopied(false), 2000);
  }, [code, trackingStep, surface]);

  return (
    <div className="relative overflow-hidden rounded-lg border border-[#3D3C36] bg-[#1A1917]">
      <div className="flex items-center justify-between border-b border-[#3D3C36] px-4 py-2">
        <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-[#C4C0B6]/80">
          {language}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center gap-1.5 rounded-md border border-[#3D3C36] bg-[#24231F] px-2.5 py-1 text-xs text-[#C4C0B6] transition-colors hover:border-[#C4C0B6]/40 hover:text-[#E8E4DD]"
        >
          {copied ? (
            <>
              <Check className="h-3.5 w-3.5 text-[#4CAF6E]" />
              <span className="text-[#4CAF6E]">{t("copied")}</span>
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5" />
              <span>{t("copy")}</span>
            </>
          )}
        </button>
      </div>
      <pre className="overflow-x-auto p-4 font-mono text-sm leading-relaxed text-[#E8E4DD]">
        <code>{code}</code>
      </pre>
    </div>
  );
}
