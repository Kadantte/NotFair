"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { Check, Copy } from "lucide-react";
import { trackEvent } from "@/lib/analytics";
import { MCP_CONNECTOR_NAME, MCP_SERVER_URL } from "@/lib/brand";

type Surface = "marketing" | "in_app";

const CLAUDE_CONNECTORS_WEB_URL = "https://claude.ai/settings/connectors?modal=add-custom-connector";

export function ConnectorSetupSteps({
  surface,
  serverUrl = MCP_SERVER_URL,
  connectorName = MCP_CONNECTOR_NAME,
  platformLabel = "Google Ads",
  examplePrompt,
}: {
  surface: Surface;
  serverUrl?: string;
  connectorName?: string;
  platformLabel?: string;
  examplePrompt?: string;
}) {
  const t = useTranslations("ConnectorSetupSteps");
  const prompt = examplePrompt ?? t("defaultPrompt", { platform: platformLabel });

  return (
    <div className="space-y-10">
      {/* Step 1 */}
      <div id="step-1" className="space-y-3 scroll-mt-24">
        <div className="flex items-baseline gap-3">
          <StepNumber n={1} />
          <h3 className="text-lg font-semibold text-[#E8E4DD]">
            {t("step1.title")}
          </h3>
        </div>
        <div className="ml-11 space-y-3">
          <p className="text-base leading-relaxed text-[#C4C0B6]">
            {t.rich("step1.body", {
              strong: (chunks) => <strong className="text-[#E8E4DD]">{chunks}</strong>,
            })}
          </p>
          <OpenClaudeConnectorsCtas />
          <SetupScreenshot
            src="/connector-setup/01-add.png"
            alt={t("step1.imageAlt")}
            surface={surface}
          />
        </div>
      </div>

      {/* Step 2 */}
      <div id="step-2" className="space-y-3 scroll-mt-24">
        <div className="flex items-baseline gap-3">
          <StepNumber n={2} />
          <h3 className="text-lg font-semibold text-[#E8E4DD]">
            {t("step2.title")}
          </h3>
        </div>
        <div className="ml-11 space-y-4">
          <p className="text-base leading-relaxed text-[#C4C0B6]">
            {t("step2.body")}
          </p>
          <CopyableField
            label={t("fields.name")}
            value={connectorName}
            trackingField="name"
            surface={surface}
          />
          <CopyableField
            label={t("fields.remoteUrl")}
            value={serverUrl}
            trackingField="server_url"
            surface={surface}
          />

          <p className="text-base leading-relaxed text-[#C4C0B6]">
            {t.rich("step2.clickAdd", {
              strong: (chunks) => <strong className="text-[#E8E4DD]">{chunks}</strong>,
            })}
          </p>

          <SetupScreenshot
            src="/connector-setup/02-configure.png"
            alt={t("step2.configureAlt")}
            surface={surface}
          />

          <p className="text-base leading-relaxed text-[#C4C0B6]">
            {t.rich("step2.verify", {
              connectorName,
              strong: (chunks) => <strong className="text-[#E8E4DD]">{chunks}</strong>,
            })}
          </p>
          <SetupScreenshot
            src="/connector-setup/03-saved.png"
            alt={t("step2.savedAlt")}
            surface={surface}
          />
        </div>
      </div>

      {/* Step 3 */}
      <div id="step-3" className="space-y-3 scroll-mt-24">
        <div className="flex items-baseline gap-3">
          <StepNumber n={3} />
          <h3 className="text-lg font-semibold text-[#E8E4DD]">
            {t("step3.title")}
          </h3>
        </div>
        <div className="ml-11 space-y-3">
          <p className="text-base leading-relaxed text-[#C4C0B6]">
            {t("step3.beforePrompt")}{" "}
            <em className="text-[#E8E4DD]">
              &ldquo;{prompt}&rdquo;
            </em>{" "}
            {t("step3.afterPrompt")}
          </p>
          <SetupScreenshot
            src="/connector-setup/05-use-in-chat.png"
            alt={t("step3.imageAlt", { platform: platformLabel })}
            surface={surface}
          />
        </div>
      </div>
    </div>
  );
}

function OpenClaudeConnectorsCtas() {
  const t = useTranslations("ConnectorSetupSteps.open");

  return (
    <div className="space-y-2">
      <a
        href={CLAUDE_CONNECTORS_WEB_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center justify-center rounded-lg bg-[#4CAF6E] px-4 py-2.5 text-sm font-semibold text-[#1A1917] transition hover:bg-[#3D9A5C]"
      >
        {t("cta")}
      </a>
      <p className="text-xs text-[#C4C0B6]/70">
        {t.rich("desktop", {
          strong: (chunks) => <strong className="text-[#C4C0B6]">{chunks}</strong>,
        })}
      </p>
    </div>
  );
}

function StepNumber({ n }: { n: number }) {
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#4CAF6E]/12 text-sm font-semibold text-[#4CAF6E]">
      {n}
    </span>
  );
}

function CopyableField({
  label,
  value,
  trackingField,
  surface,
}: {
  label: string;
  value: string;
  trackingField: string;
  surface: Surface;
}) {
  const t = useTranslations("ConnectorSetupSteps.copy");
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    trackEvent("connector_credential_copied", {
      field: trackingField,
      surface,
    });
    setTimeout(() => setCopied(false), 2000);
  }, [value, trackingField, surface]);

  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium uppercase tracking-wide text-[#C4C0B6]/80">
        {label}
      </p>
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1 truncate rounded-lg border border-[#3D3C36] bg-[#1A1917] px-3 py-2.5 font-mono text-sm text-[#E8E4DD]/90">
          {value}
        </div>
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-[#3D3C36] bg-[#24231F] px-3 py-2.5 text-sm text-[#C4C0B6] transition-colors hover:border-[#C4C0B6]/40 hover:text-[#E8E4DD]"
          aria-label={t("aria", { label })}
        >
          {copied ? (
            <>
              <Check className="h-4 w-4 text-[#4CAF6E]" />
              <span className="text-[#4CAF6E]">{t("copied")}</span>
            </>
          ) : (
            <>
              <Copy className="h-4 w-4" />
              <span>{t("copy")}</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}

function imageKeyFromSrc(src: string): string {
  const file = src.split("/").pop() ?? src;
  return file.replace(/\.[^.]+$/, "").replace(/-/g, "_");
}

function SetupScreenshot({
  src,
  alt,
  surface,
}: {
  src: string;
  alt: string;
  surface: Surface;
}) {
  const t = useTranslations("ConnectorSetupSteps.screenshot");
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setExpanded(false);
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [expanded]);

  function handleExpand() {
    setExpanded(true);
    trackEvent("connector_screenshot_expanded", {
      image: imageKeyFromSrc(src),
      surface,
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={handleExpand}
        className="group block w-full overflow-hidden rounded-lg border border-[#3D3C36] bg-[#1A1917] transition hover:border-[#4CAF6E]/60"
        aria-label={t("expandAria", { alt })}
      >
        <Image
          src={src}
          alt={alt}
          width={1200}
          height={750}
          className="h-auto w-full transition-transform duration-200 group-hover:scale-[1.01]"
          unoptimized
        />
      </button>
      {expanded && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 sm:p-8"
          onClick={() => setExpanded(false)}
          role="dialog"
          aria-modal="true"
          aria-label={alt}
        >
          <button
            type="button"
            onClick={() => setExpanded(false)}
            className="absolute right-4 top-4 rounded-full bg-[#24231F] px-3 py-1.5 text-sm text-[#E8E4DD] shadow-md hover:bg-[#2E2D28]"
          >
            {t("close")}
          </button>
          <Image
            src={src}
            alt={alt}
            width={2400}
            height={1500}
            className="max-h-[90vh] w-auto max-w-[95vw] rounded-lg object-contain shadow-2xl"
            onClick={(e) => e.stopPropagation()}
            unoptimized
          />
        </div>
      )}
    </>
  );
}
