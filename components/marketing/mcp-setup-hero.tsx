"use client";

/**
 * Reusable hero block: cycling "Turn [Platform] Into Your Marketing Engine"
 * headline, AI-client tab switcher, and per-platform setup steps.
 *
 * Used by:
 *   - /mcp marketing page (full hero, with `syncUrl` so the active tab is
 *     reflected in `?tab=<id>` for deep links and back/forward).
 *   - / homepage (drop-in below the existing hero, no URL sync — the homepage
 *     URL should not pick up `?tab=...` query strings from a sub-block).
 */

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Copy, ExternalLink } from "lucide-react";
import { useTranslations } from "next-intl";
import { trackEvent } from "@/lib/analytics";
import { MCP_CONNECTOR_NAME, MCP_SERVER_URL } from "@/lib/brand";

/* ─────────────────────────── Tracking ─────────────────────────── */

/** Wire one place — every CopyField inside the PLATFORMS data table goes through here. */
function trackSetupCopied(client: string, field: string) {
    trackEvent("mcp_setup_copied", { client, field });
}

/* ─────────────────────────── Atoms ─────────────────────────── */

export function CodeInline({ children }: { children: ReactNode }) {
    return (
        <code className="rounded bg-[#1A1917] px-1.5 py-0.5 font-mono text-[12px] text-[#E8E4DD]">
            {children}
        </code>
    );
}

export function CopyField({
    value,
    label,
    className = "",
    multiline = false,
    prose = false,
    onCopy,
}: {
    value: string;
    label?: string;
    className?: string;
    multiline?: boolean;
    /** Wrap on word boundaries (good for prose prompts) instead of mid-character. */
    prose?: boolean;
    /** Optional callback fired after a successful copy — used for analytics. */
    onCopy?: () => void;
}) {
    const t = useTranslations("McpSetupHero.copyField");
    const [copied, setCopied] = useState(false);
    const [expanded, setExpanded] = useState(false);
    function copy() {
        navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
        onCopy?.();
    }

    // Long prose values get a 3-line clamp with a More/Less toggle. Short ones
    // (or non-prose code values) just render in full.
    const collapsible = prose && value.length > 120;
    const collapsed = collapsible && !expanded;

    return (
        <div
            className={`rounded-lg border border-[#3D3C36] bg-[#1A1917] px-3 py-2 ${className}`}
        >
            {label ? (
                <p className="mb-1 text-[11px] font-medium text-[#C4C0B6]/80">
                    {label}
                </p>
            ) : null}
            <div className="flex items-start justify-between gap-3">
                <code
                    className={`min-w-0 flex-1 font-mono text-[12px] leading-snug text-[#E8E4DD] ${
                        multiline
                            ? "whitespace-pre-wrap break-all"
                            : prose
                                ? "whitespace-pre-wrap break-words"
                                : "break-all"
                    } ${collapsed ? "line-clamp-3" : ""}`}
                >
                    {value}
                </code>
                <button
                    onClick={copy}
                    aria-label={t("copy")}
                    className="mt-0.5 shrink-0 rounded p-1 text-[#C4C0B6] transition-colors hover:bg-[#2E2D28] hover:text-[#E8E4DD]"
                >
                    {copied ? <Check className="h-3.5 w-3.5 text-[#4CAF6E]" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
            </div>
            {collapsible ? (
                <button
                    onClick={() => setExpanded((v) => !v)}
                    className="mt-1.5 text-[11px] font-medium text-[#4CAF6E] transition-colors hover:text-[#3D9A5C]"
                >
                    {expanded ? t("less") : t("more")}
                </button>
            ) : null}
        </div>
    );
}

/* ─────────────────────────── Platform logos ─────────────────────────── */

/**
 * Real platform logos.
 * - Claude / Cursor: SVG path data from simpleicons.org (MIT-licensed brand icon set).
 * - OpenClaw: real favicon from openclaw.ai (gradient lobster), referenced as <img>.
 * - Codex: official OpenAI hexagonal-knot SVG (lobe-icons path, well-centered).
 * - Hermes Agent: official icon.png from hermes-agent.nousresearch.com — no SVG published.
 */
function ClaudeLogo({ className = "" }: { className?: string }) {
    return (
        <svg
            viewBox="0 0 24 24"
            className={className}
            aria-hidden="true"
            xmlns="http://www.w3.org/2000/svg"
        >
            <path
                fill="#D97757"
                d="m4.7144 15.9555 4.7174-2.6471.079-.2307-.079-.1275h-.2307l-.7893-.0486-2.6956-.0729-2.3375-.0971-2.2646-.1214-.5707-.1215-.5343-.7042.0546-.3522.4797-.3218.686.0608 1.5179.1032 2.2767.1578 1.6514.0972 2.4468.255h.3886l.0546-.1579-.1336-.0971-.1032-.0972L6.973 9.8356l-2.55-1.6879-1.3356-.9714-.7225-.4918-.3643-.4614-.1578-1.0078.6557-.7225.8803.0607.2246.0607.8925.686 1.9064 1.4754 2.4893 1.8336.3643.3035.1457-.1032.0182-.0728-.164-.2733-1.3539-2.4467-1.445-2.4893-.6435-1.032-.17-.6194c-.0607-.255-.1032-.4674-.1032-.7285L6.287.1335 6.6997 0l.9957.1336.419.3642.6192 1.4147 1.0018 2.2282 1.5543 3.0296.4553.8985.2429.8318.091.255h.1579v-.1457l.1275-1.706.2368-2.0947.2307-2.6957.0789-.7589.3764-.9107.7468-.4918.5828.2793.4797.686-.0668.4433-.2853 1.8517-.5586 2.9021-.3643 1.9429h.2125l.2429-.2429.9835-1.3053 1.6514-2.0643.7286-.8196.85-.9046.5464-.4311h1.0321l.759 1.1293-.34 1.1657-1.0625 1.3478-.8804 1.1414-1.2628 1.7-.7893 1.36.0729.1093.1882-.0183 2.8535-.607 1.5421-.2794 1.8396-.3157.8318.3886.091.3946-.3278.8075-1.967.4857-2.3072.4614-3.4364.8136-.0425.0304.0486.0607 1.5482.1457.6618.0364h1.621l3.0175.2247.7892.522.4736.6376-.079.4857-1.2142.6193-1.6393-.3886-3.825-.9107-1.3113-.3279h-.1822v.1093l1.0929 1.0686 2.0035 1.8092 2.5075 2.3314.1275.5768-.3218.4554-.34-.0486-2.2039-1.6575-.85-.7468-1.9246-1.621h-.1275v.17l.4432.6496 2.3436 3.5214.1214 1.0807-.17.3521-.6071.2125-.6679-.1214-1.3721-1.9246L14.38 17.959l-1.1414-1.9428-.1397.079-.674 7.2552-.3156.3703-.7286.2793-.6071-.4614-.3218-.7468.3218-1.4753.3886-1.9246.3157-1.53.2853-1.9004.17-.6314-.0121-.0425-.1397.0182-1.4328 1.9672-2.1796 2.9446-1.7243 1.8456-.4128.164-.7164-.3704.0667-.6618.4008-.5889 2.386-3.0357 1.4389-1.882.929-1.0868-.0062-.1579h-.0546l-6.3385 4.1164-1.1293.1457-.4857-.4554.0608-.7467.2307-.2429 1.9064-1.3114Z"
            />
        </svg>
    );
}

function OpenClawLogo({ className = "" }: { className?: string }) {
    return (
        <img
            src="/platform-logos/openclaw.svg"
            alt=""
            aria-hidden="true"
            className={className}
        />
    );
}

function CodexLogo({ className = "" }: { className?: string }) {
    return (
        <span
            className={`relative inline-block rounded-md bg-white ${className}`}
        >
            <svg
                viewBox="0 0 24 24"
                className="absolute left-1/2 top-1/2 h-[78%] w-[78%] -translate-x-1/2 -translate-y-1/2"
                fill="#000000"
                fillRule="evenodd"
                aria-hidden="true"
                xmlns="http://www.w3.org/2000/svg"
            >
                <path d="M9.205 8.658v-2.26c0-.19.072-.333.238-.428l4.543-2.616c.619-.357 1.356-.523 2.117-.523 2.854 0 4.662 2.212 4.662 4.566 0 .167 0 .357-.024.547l-4.71-2.759a.797.797 0 00-.856 0l-5.97 3.473zm10.609 8.8V12.06c0-.333-.143-.57-.429-.737l-5.97-3.473 1.95-1.118a.433.433 0 01.476 0l4.543 2.617c1.309.76 2.189 2.378 2.189 3.948 0 1.808-1.07 3.473-2.76 4.163zM7.802 12.703l-1.95-1.142c-.167-.095-.239-.238-.239-.428V5.899c0-2.545 1.95-4.472 4.591-4.472 1 0 1.927.333 2.712.928L8.23 5.067c-.285.166-.428.404-.428.737v6.898zM12 15.128l-2.795-1.57v-3.33L12 8.658l2.795 1.57v3.33L12 15.128zm1.796 7.23c-1 0-1.927-.332-2.712-.927l4.686-2.712c.285-.166.428-.404.428-.737v-6.898l1.974 1.142c.167.095.238.238.238.428v5.233c0 2.545-1.974 4.472-4.614 4.472zm-5.637-5.303l-4.544-2.617c-1.308-.761-2.188-2.378-2.188-3.948A4.482 4.482 0 014.21 6.327v5.423c0 .333.143.571.428.738l5.947 3.449-1.95 1.118a.432.432 0 01-.476 0zm-.262 3.9c-2.688 0-4.662-2.021-4.662-4.519 0-.19.024-.38.047-.57l4.686 2.71c.286.167.571.167.856 0l5.97-3.448v2.26c0 .19-.07.333-.237.428l-4.543 2.616c-.619.357-1.356.523-2.117.523zm5.899 2.83a5.947 5.947 0 005.827-4.756C22.287 18.339 24 15.84 24 13.296c0-1.665-.713-3.282-1.998-4.448.119-.5.19-.999.19-1.498 0-3.401-2.759-5.947-5.946-5.947-.642 0-1.26.095-1.88.31A5.962 5.962 0 0010.205 0a5.947 5.947 0 00-5.827 4.757C1.713 5.447 0 7.945 0 10.49c0 1.666.713 3.283 1.998 4.448-.119.5-.19 1-.19 1.499 0 3.401 2.759 5.946 5.946 5.946.642 0 1.26-.095 1.88-.309a5.96 5.96 0 004.162 1.713z" />
            </svg>
        </span>
    );
}

function CursorLogo({ className = "" }: { className?: string }) {
    return (
        <svg
            viewBox="0 0 24 24"
            className={className}
            fill="currentColor"
            aria-hidden="true"
            xmlns="http://www.w3.org/2000/svg"
        >
            <path d="M11.503.131 1.891 5.678a.84.84 0 0 0-.42.726v11.188c0 .3.162.575.42.724l9.609 5.55a1 1 0 0 0 .998 0l9.61-5.55a.84.84 0 0 0 .42-.724V6.404a.84.84 0 0 0-.42-.726L12.497.131a1.01 1.01 0 0 0-.996 0M2.657 6.338h18.55c.263 0 .43.287.297.515L12.23 22.918c-.062.107-.229.064-.229-.06V12.335a.59.59 0 0 0-.295-.51l-9.11-5.257c-.109-.063-.064-.23.061-.23" />
        </svg>
    );
}

function HermesLogo({ className = "" }: { className?: string }) {
    return (
        <img
            src="/platform-logos/hermes.png"
            alt=""
            aria-hidden="true"
            className={className}
        />
    );
}

/* ─────────────────────────── Platform data ─────────────────────────── */

export type Platform = {
    id: string;
    name: string;
    Logo: (props: { className?: string }) => ReactNode;
    nameColor: string;
    ringClass: string;
    pillBgClass: string;
    steps: string[];
};

export const PLATFORMS: Platform[] = [
    {
        id: "claude",
        name: "Claude",
        Logo: ClaudeLogo,
        nameColor: "text-[#D97757]",
        ringClass: "ring-[#D97757]/40",
        pillBgClass: "bg-[#D97757]/15",
        steps: ["openSettings", "addConnector", "signIn"],
    },
    {
        id: "openclaw",
        name: "OpenClaw",
        Logo: OpenClawLogo,
        nameColor: "text-[#E8E4DD]",
        ringClass: "ring-[#5B6CFF]/40",
        pillBgClass: "bg-[#5B6CFF]/15",
        steps: ["sendPrompt", "signIn"],
    },
    {
        id: "codex",
        name: "Codex",
        Logo: CodexLogo,
        nameColor: "text-[#E8E4DD]",
        ringClass: "ring-[#10A37F]/40",
        pillBgClass: "bg-[#10A37F]/15",
        steps: ["install", "signIn"],
    },
    {
        id: "cursor",
        name: "Cursor",
        Logo: CursorLogo,
        nameColor: "text-[#E8E4DD]",
        ringClass: "ring-[#3D3C36]",
        pillBgClass: "bg-[#24231F]",
        steps: ["openTools", "pasteConfig", "signIn"],
    },
    {
        id: "hermes",
        name: "Hermes",
        Logo: HermesLogo,
        nameColor: "text-[#E8E4DD]",
        ringClass: "ring-[#A78BFA]/40",
        pillBgClass: "bg-[#A78BFA]/15",
        steps: ["sendPrompt", "signIn"],
    },
];

function agentConnectionPrompt() {
    return `Connect to ${MCP_CONNECTOR_NAME} MCP at ${MCP_SERVER_URL} — it supports OAuth flow, discover at https://notfair.co/.well-known/oauth-protected-resource/api/mcp/google_ads. Run the OAuth flow, send me the link, poll until I authorize, and confirm once it succeeds.`;
}

function cursorConfig() {
    return JSON.stringify(
        {
            [MCP_CONNECTOR_NAME]: {
                transport: "http",
                url: MCP_SERVER_URL,
            },
        },
        null,
        2,
    );
}

function PlatformStepBody({ platformId, stepId }: { platformId: string; stepId: string }) {
    const t = useTranslations("McpSetupHero");
    const tryPrompt = <CodeInline>{t("tryPrompt")}</CodeInline>;

    if (platformId === "claude" && stepId === "openSettings") {
        return (
            <>
                {t("platforms.claude.openSettings.body")}
                <a
                    href="https://claude.ai/customize/connectors?modal=add-custom-connector"
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() =>
                        trackEvent("mcp_step_clicked", {
                            client: "claude",
                            step: "open_connectors",
                        })
                    }
                    className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-[#3D3C36] bg-[#1A1917] px-3 py-2 font-mono text-[12px] text-[#E8E4DD] transition-colors hover:border-[#4CAF6E]/60 hover:text-[#4CAF6E]"
                >
                    {t("platforms.claude.openSettings.linkLabel")}
                    <ExternalLink className="h-3 w-3" />
                </a>
            </>
        );
    }

    if (platformId === "claude" && stepId === "addConnector") {
        return (
            <>
                {t("platforms.claude.addConnector.body")}
                <CopyField
                    label={t("platforms.claude.addConnector.nameLabel")}
                    value={MCP_CONNECTOR_NAME}
                    className="mt-3"
                    onCopy={() => trackSetupCopied("claude", "name")}
                />
                <CopyField
                    label={t("platforms.claude.addConnector.urlLabel")}
                    value={MCP_SERVER_URL}
                    className="mt-2"
                    onCopy={() => trackSetupCopied("claude", "server_url")}
                />
            </>
        );
    }

    if (platformId === "claude" && stepId === "signIn") {
        return t.rich("platforms.claude.signIn.body", {
            add: () => <CodeInline>Add</CodeInline>,
            tryPrompt: () => tryPrompt,
        });
    }

    if ((platformId === "openclaw" || platformId === "hermes") && stepId === "sendPrompt") {
        return (
            <>
                {t(`platforms.${platformId}.sendPrompt.body`)}
                <CopyField
                    value={agentConnectionPrompt()}
                    className="mt-3"
                    prose
                    onCopy={() => trackSetupCopied(platformId, "prompt")}
                />
            </>
        );
    }

    if ((platformId === "openclaw" || platformId === "hermes") && stepId === "signIn") {
        return t.rich(`platforms.${platformId}.signIn.body`, {
            tryPrompt: () => tryPrompt,
        });
    }

    if (platformId === "codex" && stepId === "install") {
        return (
            <>
                {t("platforms.codex.install.body")}
                <CopyField
                    value={`codex mcp add NotFair-GoogleAds --url ${MCP_SERVER_URL}`}
                    className="mt-3"
                    onCopy={() => trackSetupCopied("codex", "codex_command")}
                />
            </>
        );
    }

    if (platformId === "codex" && stepId === "signIn") {
        return t.rich("platforms.codex.signIn.body", {
            tryPrompt: () => tryPrompt,
        });
    }

    if (platformId === "cursor" && stepId === "openTools") {
        return t.rich("platforms.cursor.openTools.body", {
            settings: () => <CodeInline>Settings → Tools & MCP</CodeInline>,
            addServer: () => <CodeInline>+ Add new global MCP server</CodeInline>,
        });
    }

    if (platformId === "cursor" && stepId === "pasteConfig") {
        return (
            <>
                {t.rich("platforms.cursor.pasteConfig.body", {
                    mcpServers: () => <CodeInline>mcpServers</CodeInline>,
                })}
                <CopyField
                    value={cursorConfig()}
                    className="mt-3"
                    multiline
                    onCopy={() => trackSetupCopied("cursor", "mcp_json")}
                />
            </>
        );
    }

    if (platformId === "cursor" && stepId === "signIn") {
        return t.rich("platforms.cursor.signIn.body", {
            tryPrompt: () => tryPrompt,
        });
    }

    return null;
}

/* ─────────────────────────── Hero component ─────────────────────────── */

export type McpSetupHeroProps = {
    /**
     * Reflect the active tab in the URL via `?tab=<id>` and seed initial state
     * from the same. Use on the dedicated `/mcp` page; leave off when this hero
     * is dropped into another page (e.g. the homepage) so its query string
     * doesn't get hijacked.
     */
    syncUrl?: boolean;
    /**
     * Where the event came from — included on `mcp_client_tab_selected` so we
     * can split tab-click metrics by the page that surfaced the hero.
     */
    surface?: "mcp" | "home";
};

export function McpSetupHero({
    syncUrl = false,
    surface = "mcp",
}: McpSetupHeroProps) {
    const t = useTranslations("McpSetupHero");
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    // Seed from ?tab=<id> only when this instance owns the URL.
    const urlTab = syncUrl ? (searchParams?.get("tab") ?? null) : null;
    const urlIdx = urlTab ? PLATFORMS.findIndex((p) => p.id === urlTab) : -1;
    const hasUrlTab = urlIdx >= 0;

    const [platformId, setPlatformId] = useState(
        hasUrlTab ? PLATFORMS[urlIdx].id : PLATFORMS[0].id,
    );
    const [pillIndex, setPillIndex] = useState(hasUrlTab ? urlIdx : 0);
    const [pillPaused, setPillPaused] = useState(hasUrlTab);

    // Sync state when the URL changes externally (browser back/forward).
    useEffect(() => {
        if (!syncUrl || !urlTab) return;
        const idx = PLATFORMS.findIndex((p) => p.id === urlTab);
        if (idx < 0) return;
        const timeout = window.setTimeout(() => {
            setPlatformId(PLATFORMS[idx].id);
            setPillIndex(idx);
            setPillPaused(true);
        }, 0);
        return () => window.clearTimeout(timeout);
    }, [syncUrl, urlTab]);

    // Auto-cycle the hero pill until the user picks a tab.
    useEffect(() => {
        if (pillPaused) return;
        const id = setInterval(() => {
            setPillIndex((i) => (i + 1) % PLATFORMS.length);
        }, 2200);
        return () => clearInterval(id);
    }, [pillPaused]);

    const heroPlatform = PLATFORMS[pillIndex];
    const active = PLATFORMS.find((p) => p.id === platformId) ?? PLATFORMS[0];

    function selectTab(id: string) {
        const previous = platformId;
        setPlatformId(id);
        const idx = PLATFORMS.findIndex((p) => p.id === id);
        if (idx >= 0) setPillIndex(idx);
        setPillPaused(true);
        trackEvent("mcp_client_tab_selected", {
            client: id,
            from_client: previous,
            surface,
        });

        if (syncUrl) {
            const params = new URLSearchParams(searchParams?.toString() ?? "");
            params.set("tab", id);
            router.replace(`${pathname}?${params.toString()}`, { scroll: false });
        }
    }

    return (
        <section className="relative overflow-hidden px-4 pb-16 pt-16 md:pb-20 md:pt-20">
            {/* Dot grid background */}
            <div
                aria-hidden
                className="pointer-events-none absolute inset-0 opacity-[0.18]"
                style={{
                    backgroundImage:
                        "radial-gradient(#4CAF6E 1px, transparent 1px)",
                    backgroundSize: "22px 22px",
                    maskImage:
                        "radial-gradient(ellipse 70% 60% at 50% 35%, black 30%, transparent 80%)",
                    WebkitMaskImage:
                        "radial-gradient(ellipse 70% 60% at 50% 35%, black 30%, transparent 80%)",
                }}
            />

            <div className="relative container mx-auto max-w-6xl">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6, ease: "easeOut" }}
                    className="text-center"
                >
                    <h1 className="font-display mx-auto max-w-4xl text-3xl font-bold uppercase leading-[1.05] tracking-tight text-[#E8E4DD] sm:text-4xl md:text-[44px] lg:text-[48px]">
                        <span>{t("headlinePrefix")} </span>
                        <AnimatePresence mode="wait" initial={false}>
                            <motion.span
                                key={heroPlatform.id}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                                transition={{ duration: 0.32, ease: "easeOut" }}
                                className="whitespace-nowrap"
                            >
                                <heroPlatform.Logo className="mr-2 inline-block h-[0.72em] w-[0.72em] -translate-y-[0.11em] align-middle" />
                                <span className={heroPlatform.nameColor}>
                                    {heroPlatform.name}
                                </span>
                            </motion.span>
                        </AnimatePresence>
                        <span> {t("headlineSuffix")}</span>
                    </h1>

                    <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-[#C4C0B6]">
                        {t("intro")}
                    </p>
                </motion.div>

                {/* Tab selector */}
                <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: 0.15, ease: "easeOut" }}
                    className="mx-auto mt-10 flex w-fit max-w-full flex-wrap items-center justify-center gap-1 rounded-full border border-[#3D3C36] bg-[#24231F] p-1"
                >
                    {PLATFORMS.map((p) => (
                        <button
                            key={p.id}
                            onClick={() => selectTab(p.id)}
                            className={`flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                                p.id === platformId
                                    ? "bg-[#E8E4DD] text-[#1A1917]"
                                    : "text-[#C4C0B6] hover:text-[#E8E4DD]"
                            }`}
                        >
                            <p.Logo className="h-5 w-5" />
                            {p.name}
                        </button>
                    ))}
                </motion.div>

                {/* Step cards */}
                <motion.div
                    key={active.id}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, ease: "easeOut" }}
                    className={`mx-auto mt-8 grid grid-cols-1 gap-4 ${
                        active.steps.length === 2
                            ? "max-w-3xl md:grid-cols-2"
                            : "max-w-5xl md:grid-cols-3"
                    }`}
                >
                    {active.steps.map((step, i) => (
                        <div
                            key={step}
                            className="rounded-2xl border border-[#3D3C36] bg-[#24231F] p-6"
                        >
                            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#4CAF6E] font-mono text-[12px] font-bold text-[#1A1917]">
                                {i + 1}
                            </span>
                            <h3 className="font-display mt-4 text-lg font-semibold text-[#E8E4DD]">
                                {t(`platforms.${active.id}.${step}.title`)}
                            </h3>
                            <div className="mt-2 text-sm leading-relaxed text-[#C4C0B6]">
                                <PlatformStepBody platformId={active.id} stepId={step} />
                            </div>
                        </div>
                    ))}
                </motion.div>
            </div>
        </section>
    );
}
