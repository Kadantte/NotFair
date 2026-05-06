"use client";

import { useCallback, useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowRight, Check, Copy, Eye, EyeOff, Key, Lock, RotateCw } from "lucide-react";
import { trackEvent } from "@/lib/analytics";
import { MCP_CONNECTOR_NAME, MCP_SERVER_URL } from "@/lib/brand";

type Surface = "marketing" | "in_app";

const TOKEN_PLACEHOLDER = "YOUR_ADSAGENT_API_KEY";

function oauthConfigFor(connectorName: string, serverUrl: string) {
  return `{
  "mcpServers": {
    "${connectorName}": {
      "url": "${serverUrl}"
    }
  }
}`;
}

function bearerConfigFor(connectorName: string, serverUrl: string, token: string) {
  return `{
  "mcpServers": {
    "${connectorName}": {
      "url": "${serverUrl}",
      "headers": {
        "Authorization": "Bearer ${token}"
      }
    }
  }
}`;
}

export function AnyMcpClientSetup({
  apiKey,
  onSignIn,
  onRotated,
  surface,
  serverUrl = MCP_SERVER_URL,
  connectorName = MCP_CONNECTOR_NAME,
}: {
  apiKey: string | null;
  onSignIn?: () => void;
  onRotated?: () => Promise<void> | void;
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

      <ConfigBlock
        id="bearer"
        title={t("bearer.title")}
        subtitle={t("bearer.subtitle")}
        footer={
          <span className="inline-flex items-center gap-1.5">
            <Lock className="h-3.5 w-3.5 text-[#C4C0B6]" />
            {t("bearer.footer")}
          </span>
        }
      >
        <div className="space-y-4">
          {apiKey ? (
            <ApiKeyDisplay apiKey={apiKey} onRotated={onRotated} surface={surface} />
          ) : (
            <ApiKeyCta onSignIn={onSignIn} surface={surface} />
          )}
          <CodeBlock
            code={
              apiKey
                ? bearerConfigFor(connectorName, serverUrl, apiKey)
                : bearerConfigFor(connectorName, serverUrl, TOKEN_PLACEHOLDER)
            }
            language="json"
            trackingStep="bearer_json"
            surface={surface}
          />
        </div>
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

function ApiKeyDisplay({
  apiKey,
  onRotated,
  surface,
}: {
  apiKey: string;
  onRotated?: () => Promise<void> | void;
  surface: Surface;
}) {
  const t = useTranslations("AnyMcpClientSetup.apiKey");
  const [copied, setCopied] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(apiKey);
    setCopied(true);
    trackEvent("api_key_copied", { surface });
    setTimeout(() => setCopied(false), 2000);
  }, [apiKey, surface]);

  async function rotate() {
    setRotating(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/rotate-token", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) {
        setError(data.error || t("rotateFailed"));
        return;
      }
      trackEvent("api_key_rotated", { surface });
      await onRotated?.();
    } catch {
      setError(t("rotateFailed"));
    } finally {
      setRotating(false);
      setShowConfirm(false);
    }
  }

  const masked = revealed ? apiKey : `${apiKey.slice(0, 8)}${"•".repeat(Math.max(apiKey.length - 12, 16))}${apiKey.slice(-4)}`;

  return (
    <div className="rounded-lg border border-[#4CAF6E]/30 bg-[#4CAF6E]/[0.06] p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[#4CAF6E]/30 bg-[#4CAF6E]/10">
          <Key className="h-4 w-4 text-[#4CAF6E]" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-[#E8E4DD]">{t("title")}</p>
          <p className="mt-1 text-xs text-[#C4C0B6]">
            {t("body")}
          </p>

          <div className="mt-3 flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-md border border-[#3D3C36] bg-[#1A1917] px-3 py-2 font-mono text-sm text-[#E8E4DD]">
              {masked}
            </code>
            <button
              type="button"
              onClick={() => {
                setRevealed(v => {
                  const next = !v;
                  if (next) trackEvent("api_key_revealed", { surface });
                  return next;
                });
              }}
              className="shrink-0 rounded-md border border-[#3D3C36] bg-[#24231F] p-2 text-[#C4C0B6] transition hover:border-[#C4C0B6]/40 hover:text-[#E8E4DD]"
              aria-label={revealed ? t("hideAria") : t("revealAria")}
            >
              {revealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex items-center gap-1.5 rounded-md bg-[#4CAF6E] px-3 py-1.5 text-sm font-semibold text-[#1A1917] transition hover:bg-[#3D9A5C]"
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? t("copied") : t("copyKey")}
            </button>
            <button
              type="button"
              onClick={() => {
                trackEvent("api_key_rotate_intent", { surface });
                setShowConfirm(true);
              }}
              disabled={rotating}
              className="inline-flex items-center gap-1.5 rounded-md border border-[#3D3C36] bg-[#24231F] px-3 py-1.5 text-sm text-[#C4C0B6] transition hover:border-[#C4C0B6]/40 hover:text-[#E8E4DD] disabled:opacity-50"
            >
              <RotateCw className={`h-4 w-4 ${rotating ? "animate-spin" : ""}`} />
              {rotating ? t("rotating") : t("rotate")}
            </button>
          </div>

          {error && (
            <p className="mt-2 text-xs text-[#C45D4A]">{error}</p>
          )}
        </div>
      </div>

      {showConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={() => !rotating && setShowConfirm(false)}
        >
          <div
            className="mx-4 w-full max-w-md rounded-xl border border-[#3D3C36] bg-[#24231F] p-6 shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-[#E8E4DD]">{t("confirmTitle")}</h3>
            <p className="mt-2 text-sm text-[#C4C0B6]">
              {t("confirmBody")}
            </p>
            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                onClick={() => setShowConfirm(false)}
                disabled={rotating}
                className="rounded-lg border border-[#3D3C36] px-4 py-2 text-sm text-[#C4C0B6] transition hover:border-[#C4C0B6]/40 hover:text-[#E8E4DD] disabled:opacity-50"
              >
                {t("cancel")}
              </button>
              <button
                onClick={rotate}
                disabled={rotating}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#C45D4A] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#B04E3D] disabled:opacity-50"
              >
                <RotateCw className={`h-4 w-4 ${rotating ? "animate-spin" : ""}`} />
                {rotating ? t("rotating") : t("rotateKey")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ApiKeyCta({
  onSignIn,
  surface,
}: {
  onSignIn?: () => void;
  surface: Surface;
}) {
  const t = useTranslations("AnyMcpClientSetup.apiKeyCta");
  const handleClick = useCallback(() => {
    trackEvent("api_key_cta_clicked", { surface });
    onSignIn?.();
  }, [onSignIn, surface]);

  return (
    <div className="rounded-lg border border-[#4CAF6E]/30 bg-[#4CAF6E]/[0.06] p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[#4CAF6E]/30 bg-[#4CAF6E]/10">
          <Key className="h-4 w-4 text-[#4CAF6E]" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-[#E8E4DD]">{t("title")}</p>
          <p className="mt-1 text-sm leading-relaxed text-[#C4C0B6]">
            {t("body")}
          </p>
          <button
            type="button"
            onClick={handleClick}
            className="mt-3 inline-flex h-10 items-center gap-1.5 rounded-lg bg-[#4CAF6E] px-4 text-sm font-semibold text-[#1A1917] transition hover:bg-[#3D9A5C]"
          >
            {t("button")}
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
