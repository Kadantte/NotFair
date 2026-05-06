"use client";

import { useCallback, useState } from "react";
import { useTranslations } from "next-intl";
import { Check, Copy } from "lucide-react";
import { trackEvent } from "@/lib/analytics";
import { MCP_CONNECTOR_NAME, MCP_SERVER_URL } from "@/lib/brand";

type Surface = "marketing" | "in_app";

export function CodexSetupSteps({
  surface,
  serverUrl = MCP_SERVER_URL,
  connectorName = MCP_CONNECTOR_NAME,
  examplePrompt,
}: {
  surface: Surface;
  serverUrl?: string;
  connectorName?: string;
  examplePrompt?: string;
}) {
  const t = useTranslations("CodexSetupSteps");
  const prompt = examplePrompt ?? t("defaultPrompt");
  const oneLiner = `codex mcp add ${connectorName} --url ${serverUrl}`;
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
            {t("step1.beforeLink")}{" "}
            <a
              href="https://github.com/openai/codex"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#4CAF6E] underline underline-offset-2 hover:text-[#3D9A5C]"
            >
              OpenAI Codex
            </a>{" "}
            {t("step1.afterLink")}
          </p>
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
        <div className="ml-11 space-y-3">
          <p className="text-base leading-relaxed text-[#C4C0B6]">
            {t("step2.body")}
          </p>
          <CommandBlock
            command={oneLiner}
            trackingStep="codex_oneliner"
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
            {t("step3.beforePrompt")}
          </p>
          <div className="rounded-lg border border-[#3D3C36] bg-[#1A1917] px-4 py-3">
            <p className="text-sm italic leading-relaxed text-[#E8E4DD]">
              &ldquo;{prompt}&rdquo;
            </p>
          </div>
          <p className="text-base leading-relaxed text-[#C4C0B6]">
            {t("step3.afterPrompt")}
          </p>
        </div>
      </div>
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

function CommandBlock({
  command,
  trackingStep,
  surface,
}: {
  command: string;
  trackingStep: string;
  surface: Surface;
}) {
  const t = useTranslations("CodexSetupSteps.copy");
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(command);
    setCopied(true);
    trackEvent("install_command_copied", {
      setup_tab: "codex",
      surface,
      step: trackingStep,
    });
    setTimeout(() => setCopied(false), 2000);
  }, [command, trackingStep, surface]);

  return (
    <div className="flex items-center gap-2">
      <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-[#3D3C36] bg-[#1A1917] px-3 py-2.5">
        <code className="truncate font-mono text-sm text-[#E8E4DD]">
          {command}
        </code>
      </div>
      <button
        type="button"
        onClick={handleCopy}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-[#3D3C36] bg-[#24231F] px-3 py-2.5 text-sm text-[#C4C0B6] transition-colors hover:border-[#C4C0B6]/40 hover:text-[#E8E4DD]"
        aria-label={t("aria", { command })}
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
  );
}
