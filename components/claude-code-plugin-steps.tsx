"use client";

import { useCallback, useState } from "react";
import { Check, Copy } from "lucide-react";
import { trackEvent } from "@/lib/analytics";

const MARKETPLACE_CMD = "/plugin marketplace add nowork-studio/toprank";
const INSTALL_CMD = "/plugin install toprank@nowork-studio";
const RELOAD_CMD = "/reload-plugins";
const DEFAULT_ADS_CMD = "/google-ads";
const DEFAULT_AUDIT_PROMPT =
  "Audit my connected Google Ads account and tell me the 3 biggest optimization opportunities.";

type Surface = "marketing" | "in_app";

export function ClaudeCodePluginSteps({
  surface,
  slashCommand = DEFAULT_ADS_CMD,
  platformLabel = "Google Ads",
  examplePrompt = DEFAULT_AUDIT_PROMPT,
}: {
  surface: Surface;
  slashCommand?: string;
  platformLabel?: string;
  examplePrompt?: string;
}) {
  return (
    <div className="space-y-10">
      {/* Step 1 */}
      <div id="step-1" className="space-y-3 scroll-mt-24">
        <div className="flex items-baseline gap-3">
          <StepNumber n={1} />
          <h3 className="text-lg font-semibold text-[#E8E4DD]">
            Open Claude Code
          </h3>
        </div>
        <div className="ml-11 space-y-3">
          <p className="text-base leading-relaxed text-[#C4C0B6]">
            Open a terminal and start{" "}
            <a
              href="https://docs.claude.com/en/docs/claude-code"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#4CAF6E] underline underline-offset-2 hover:text-[#3D9A5C]"
            >
              Claude Code
            </a>
            . If you don&apos;t have it installed, follow Anthropic&apos;s
            install guide first.
          </p>
        </div>
      </div>

      {/* Step 2 */}
      <div id="step-2" className="space-y-3 scroll-mt-24">
        <div className="flex items-baseline gap-3">
          <StepNumber n={2} />
          <h3 className="text-lg font-semibold text-[#E8E4DD]">
            Install the toprank plugin
          </h3>
        </div>
        <div className="ml-11 space-y-3">
          <p className="text-base leading-relaxed text-[#C4C0B6]">
            In Claude Code, run these slash commands to register the{" "}
            <a
              href="https://github.com/nowork-studio/toprank"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#4CAF6E] underline underline-offset-2 hover:text-[#3D9A5C]"
            >
              toprank
            </a>{" "}
            marketplace, install the NotFair plugin, and reload plugins.
            Toprank ships with pre-made paid-ads and SEO skills that
            teach Claude how to audit and optimize your campaigns.
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
          <h3 className="text-lg font-semibold text-[#E8E4DD]">Run {slashCommand}</h3>
        </div>
        <div className="ml-11 space-y-3">
          <p className="text-base leading-relaxed text-[#C4C0B6]">
            Run{" "}
            <code className="rounded bg-[#2E2D28] px-1.5 py-0.5 font-mono text-sm text-[#4CAF6E]">
              {slashCommand}
            </code>{" "}
            in Claude Code. It will open your browser to sign in and connect
            NotFair. If the command doesn&apos;t appear, restart Claude Code
            first.
          </p>
          <CommandBlock
            command={slashCommand}
            trackingStep="ads_command"
            surface={surface}
          />
          <div className="rounded-lg border border-[#4CAF6E]/30 bg-[#4CAF6E]/8 px-4 py-3">
            <p className="text-sm leading-relaxed text-[#E8E4DD]">
              <strong className="text-[#4CAF6E]">Important:</strong> sign in
              with the{" "}
              <strong className="text-[#E8E4DD]">same Google account</strong>{" "}
              you use on NotFair. Otherwise Claude Code will connect to an
              empty account and won&apos;t see your {platformLabel} data.
            </p>
          </div>
        </div>
      </div>

      {/* Step 4 */}
      <div id="step-4" className="space-y-3 scroll-mt-24">
        <div className="flex items-baseline gap-3">
          <StepNumber n={4} />
          <h3 className="text-lg font-semibold text-[#E8E4DD]">
            Ask Claude about your ads
          </h3>
        </div>
        <div className="ml-11 space-y-3">
          <p className="text-base leading-relaxed text-[#C4C0B6]">
            Try a prompt like{" "}
            <em className="text-[#E8E4DD]">
              &ldquo;{examplePrompt}&rdquo;
            </em>{" "}
            Claude will call NotFair tools to read your account and respond
            with specific, data-backed insights.
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
        aria-label={`Copy ${command}`}
      >
        {copied ? (
          <>
            <Check className="h-4 w-4 text-[#4CAF6E]" />
            <span className="text-[#4CAF6E]">Copied</span>
          </>
        ) : (
          <>
            <Copy className="h-4 w-4" />
            <span>Copy</span>
          </>
        )}
      </button>
    </div>
  );
}
