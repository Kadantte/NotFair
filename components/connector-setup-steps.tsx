"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { Check, Copy } from "lucide-react";
import { trackEvent } from "@/lib/analytics";
import { BRAND_NAME, MCP_SERVER_URL } from "@/lib/brand";

type Surface = "marketing" | "in_app";

const TOPRANK_REPO = "https://github.com/nowork-studio/toprank";

export function ConnectorSetupSteps({ surface }: { surface: Surface }) {
  return (
    <div className="space-y-10">
      {/* Step 1 */}
      <div id="step-1" className="space-y-3 scroll-mt-24">
        <div className="flex items-baseline gap-3">
          <StepNumber n={1} />
          <h3 className="text-lg font-semibold text-[#E8E4DD]">
            Open Claude Connectors
          </h3>
        </div>
        <div className="ml-11 space-y-3">
          <p className="text-base leading-relaxed text-[#C4C0B6]">
            Go to{" "}
            <a
              href="https://claude.ai/customize/connectors"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#4CAF6E] underline underline-offset-2 hover:text-[#3D9A5C]"
            >
              claude.ai/customize/connectors
            </a>{" "}
            and click the <strong className="text-[#E8E4DD]">+</strong> icon,
            then choose{" "}
            <strong className="text-[#E8E4DD]">Add custom connector</strong>.
          </p>
          <SetupScreenshot
            src="/connector-setup/01-add.png"
            alt="Click the plus icon in Connectors and choose Add custom connector"
            surface={surface}
          />
        </div>
      </div>

      {/* Step 2 */}
      <div id="step-2" className="space-y-3 scroll-mt-24">
        <div className="flex items-baseline gap-3">
          <StepNumber n={2} />
          <h3 className="text-lg font-semibold text-[#E8E4DD]">
            Configure the connector
          </h3>
        </div>
        <div className="ml-11 space-y-4">
          <p className="text-base leading-relaxed text-[#C4C0B6]">
            Fill in the connector form:
          </p>
          <CopyableField
            label="Name"
            value={BRAND_NAME}
            trackingField="name"
            surface={surface}
          />
          <CopyableField
            label="Remote MCP Server URL"
            value={MCP_SERVER_URL}
            trackingField="server_url"
            surface={surface}
          />

          <p className="text-base leading-relaxed text-[#C4C0B6]">
            Click <strong className="text-[#E8E4DD]">Add</strong>.
          </p>

          <SetupScreenshot
            src="/connector-setup/02-configure.png"
            alt="Add custom connector dialog with Name and Remote MCP Server URL filled in"
            surface={surface}
          />

          <p className="text-base leading-relaxed text-[#C4C0B6]">
            Verify <strong className="text-[#E8E4DD]">NotFair</strong> appears
            in your Connectors list with all available tools.
          </p>
          <SetupScreenshot
            src="/connector-setup/03-saved.png"
            alt="NotFair connector saved and listed under Connectors with its tool permissions"
            surface={surface}
          />
        </div>
      </div>

      {/* Step 3 */}
      <div id="step-3" className="space-y-3 scroll-mt-24">
        <div className="flex items-baseline gap-3">
          <StepNumber n={3} />
          <h3 className="text-lg font-semibold text-[#E8E4DD]">
            Install the toprank plugin on Claude Desktop App{" "}
            <span className="font-normal text-[#C4C0B6]/70">
              (not available on Claude web)
            </span>
          </h3>
        </div>
        <div className="ml-11 space-y-3">
          <p className="text-base leading-relaxed text-[#C4C0B6]">
            In the same <strong className="text-[#E8E4DD]">Customize</strong>{" "}
            panel of the Claude Desktop App, find{" "}
            <strong className="text-[#E8E4DD]">Personal plugins</strong>, click{" "}
            <strong className="text-[#E8E4DD]">+</strong>, then choose{" "}
            <strong className="text-[#E8E4DD]">Browse plugins</strong>. Paste the{" "}
            <a
              href={TOPRANK_REPO}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#4CAF6E] underline underline-offset-2 hover:text-[#3D9A5C]"
            >
              toprank
            </a>{" "}
            repo URL into the{" "}
            <strong className="text-[#E8E4DD]">Add marketplace</strong> dialog
            and click <strong className="text-[#E8E4DD]">Sync</strong>. Toprank
            ships with pre-made Google Ads and SEO skills that teach Claude how
            to diagnose, optimize, and manage your campaigns alongside the NotFair
            connector.
          </p>
          <CopyableField
            label="Marketplace URL"
            value={TOPRANK_REPO}
            trackingField="plugin_marketplace_url"
            surface={surface}
          />
          <SetupScreenshot
            src="/connector-setup/04a-browse-plugins.png"
            alt="Customize panel with Personal plugins, click the plus icon and choose Browse plugins"
            surface={surface}
          />
          <SetupScreenshot
            src="/connector-setup/04b-add-marketplace.png"
            alt="Add marketplace dialog with the toprank GitHub URL pasted, then click Sync"
            surface={surface}
          />
        </div>
      </div>

      {/* Step 4 */}
      <div id="step-4" className="space-y-3 scroll-mt-24">
        <div className="flex items-baseline gap-3">
          <StepNumber n={4} />
          <h3 className="text-lg font-semibold text-[#E8E4DD]">
            Enable NotFair in a chat
          </h3>
        </div>
        <div className="ml-11 space-y-3">
          <p className="text-base leading-relaxed text-[#C4C0B6]">
            Open a new chat on{" "}
            <strong className="text-[#E8E4DD]">claude.ai</strong>, click the{" "}
            <strong className="text-[#E8E4DD]">+</strong> button, go to{" "}
            <strong className="text-[#E8E4DD]">Connectors</strong>, and toggle{" "}
            <strong className="text-[#E8E4DD]">NotFair</strong> on.
          </p>
          <SetupScreenshot
            src="/connector-setup/04-enable-in-chat.png"
            alt="In a Claude chat, open the + menu and toggle the NotFair connector on"
            surface={surface}
          />
        </div>
      </div>

      {/* Step 5 */}
      <div id="step-5" className="space-y-3 scroll-mt-24">
        <div className="flex items-baseline gap-3">
          <StepNumber n={5} />
          <h3 className="text-lg font-semibold text-[#E8E4DD]">
            Ask Claude about your ads
          </h3>
        </div>
        <div className="ml-11 space-y-3">
          <p className="text-base leading-relaxed text-[#C4C0B6]">
            Try a prompt like{" "}
            <em className="text-[#E8E4DD]">
              &ldquo;Audit my connected Google Ads account and tell me the 3
              biggest optimization opportunities.&rdquo;
            </em>{" "}
            Claude will call NotFair tools to read your account and respond
            with specific, data-backed insights.
          </p>
          <SetupScreenshot
            src="/connector-setup/05-use-in-chat.png"
            alt="Claude using the NotFair connector to audit a Google Ads account in a chat"
            surface={surface}
          />
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
          aria-label={`Copy ${label}`}
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
        aria-label={`Expand image: ${alt}`}
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
            Close
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
