"use client";

import { useCallback, useState } from "react";
import { useTranslations } from "next-intl";
import { Check, Copy } from "lucide-react";
import { trackEvent } from "@/lib/analytics";

const MARKETPLACE_CMD = "/plugin marketplace add nowork-studio/toprank";
const INSTALL_CMD = "/plugin install toprank@nowork-studio";
const RELOAD_CMD = "/reload-plugins";
const DEFAULT_ADS_CMD = "/google-ads";
type Surface = "marketing" | "in_app";

export function ClaudeCodePluginSteps({
  surface,
  slashCommand = DEFAULT_ADS_CMD,
  platformLabel = "Google Ads",
  examplePrompt,
}: {
  surface: Surface;
  slashCommand?: string;
  platformLabel?: string;
  examplePrompt?: string;
}) {
  const t = useTranslations("ClaudeCodePluginSteps");
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
            {t("step1.beforeLink")}{" "}
            <a
              href="https://docs.claude.com/en/docs/claude-code"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#4CAF6E] underline underline-offset-2 hover:text-[#3D9A5C]"
            >
              Claude Code
            </a>
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
            {t("step2.beforeLink")}{" "}
            <a
              href="https://github.com/nowork-studio/toprank"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#4CAF6E] underline underline-offset-2 hover:text-[#3D9A5C]"
            >
              toprank
            </a>{" "}
            {t("step2.afterLink")}
          </p>
          <CommandBlock
            command={MARKETPLACE_CMD}
            trackingStep="marketplace_add"
            surface={surface}
          />
          <CommandBlock
            command={INSTALL_CMD}
            trackingStep="plugin_install"
            surface={surface}
          />
          <CommandBlock
            command={RELOAD_CMD}
            trackingStep="reload_plugins"
            surface={surface}
          />
        </div>
      </div>

      {/* Step 3 */}
      <div id="step-3" className="space-y-3 scroll-mt-24">
        <div className="flex items-baseline gap-3">
          <StepNumber n={3} />
          <h3 className="text-lg font-semibold text-[#E8E4DD]">{t("step3.title", { slashCommand })}</h3>
        </div>
        <div className="ml-11 space-y-3">
          <p className="text-base leading-relaxed text-[#C4C0B6]">
            {t("step3.beforeCommand")}{" "}
            <code className="rounded bg-[#2E2D28] px-1.5 py-0.5 font-mono text-sm text-[#4CAF6E]">
              {slashCommand}
            </code>{" "}
            {t("step3.afterCommand")}
          </p>
          <CommandBlock
            command={slashCommand}
            trackingStep="ads_command"
            surface={surface}
          />
          <div className="rounded-lg border border-[#4CAF6E]/30 bg-[#4CAF6E]/8 px-4 py-3">
            <p className="text-sm leading-relaxed text-[#E8E4DD]">
              {t.rich("step3.important", {
                platform: platformLabel,
                green: (chunks) => <strong className="text-[#4CAF6E]">{chunks}</strong>,
                strong: (chunks) => <strong className="text-[#E8E4DD]">{chunks}</strong>,
              })}
            </p>
          </div>
        </div>
      </div>

      {/* Step 4 */}
      <div id="step-4" className="space-y-3 scroll-mt-24">
        <div className="flex items-baseline gap-3">
          <StepNumber n={4} />
          <h3 className="text-lg font-semibold text-[#E8E4DD]">
            {t("step4.title")}
          </h3>
        </div>
        <div className="ml-11 space-y-3">
          <p className="text-base leading-relaxed text-[#C4C0B6]">
            {t("step4.beforePrompt")}{" "}
            <em className="text-[#E8E4DD]">
              &ldquo;{prompt}&rdquo;
            </em>{" "}
            {t("step4.afterPrompt")}
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
  const t = useTranslations("ClaudeCodePluginSteps.copy");
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(command);
    setCopied(true);
    trackEvent("install_command_copied", {
      setup_tab: "claude-code",
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
