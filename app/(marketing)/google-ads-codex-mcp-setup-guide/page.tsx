import { GoogleAdsCodexMcpSetupPage } from "@/components/marketing/google-ads-codex-mcp-setup-page";
import { buildMetadata, buildFaqJsonLd, SITE_URL } from "@/lib/seo";
import { MCP_CONNECTOR_NAME, MCP_SERVER_URL } from "@/lib/brand";
import { GOOGLE_ADS_AUDIT_PROMPT } from "@/lib/prompts";

export const metadata = buildMetadata({
  title: "Google Ads Codex MCP Setup Guide | NotFair",
  description:
    "Set up the Google Ads Codex MCP with NotFair in under a minute. One terminal command gives Codex live Google Ads access for diagnosis, approved edits, and search-term cleanup.",
  path: "/google-ads-codex-mcp-setup-guide",
  keywords: [
    "google ads codex mcp",
    "codex mcp setup",
    "adsagent codex",
    "openai codex mcp server",
    "google ads codex integration",
    "install codex mcp",
    "codex mcp install guide",
  ],
});

const faqItems = [
  {
    question: "What does the NotFair Codex MCP do once installed?",
    answer:
      "It exposes a set of MCP tools to Codex that let it read your Google Ads campaigns, search terms, and spend, then propose write actions you approve in chat. For the full commercial overview, see /google-ads-codex.",
  },
  {
    question: "How long does setup take?",
    answer:
      `Under a minute. Run a single \`codex mcp add ${MCP_CONNECTOR_NAME} --url ${MCP_SERVER_URL}\` command in your terminal — Codex walks you through the OAuth flow and registers the MCP automatically.`,
  },
  {
    question: "What should I ask Codex first after setup?",
    answer:
      "Start with a data-grounded audit, then move to a reviewable write: ask Codex to rank fixes by impact, find search terms to add as negatives while showing the diff first, or draft a new RSA for an ad group and wait for approval.",
  },
  {
    question: "Do I need to write any code?",
    answer:
      "No. One terminal command sets everything up. There are no JSON config edits, no environment variables, and no scripts to run.",
  },
  {
    question: "Which terminals and shells does it work in?",
    answer:
      "Any shell that can run Node.js — bash, zsh, fish, PowerShell, and others. The Codex CLI itself is a Node.js process, so the NotFair MCP inherits full shell compatibility. If Codex runs, NotFair runs.",
  },
  {
    question: "Does it work with WSL on Windows?",
    answer:
      "Yes. Install the Codex CLI inside your WSL environment and run the same one-liner. The MCP server and OAuth flow work identically on WSL 1 and WSL 2. Native Windows (outside WSL) depends on Codex CLI's Windows support status.",
  },
  {
    question: "Can I use it inside an IDE like VS Code?",
    answer:
      "Codex is a terminal-first tool, but you can run it in any integrated terminal — VS Code's built-in terminal, JetBrains terminals, or any other IDE that embeds a shell. The NotFair MCP works wherever the Codex CLI runs.",
  },
];

const jsonLd = [
  buildFaqJsonLd(faqItems),
  {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: "How to add the NotFair MCP to OpenAI Codex CLI",
    description:
      "Add the NotFair Google Ads MCP to OpenAI's Codex CLI with a single terminal command — Codex walks you through OAuth and registers the integration automatically.",
    totalTime: "PT1M",
    step: [
      {
        "@type": "HowToStep",
        position: 1,
        name: "Install the Codex CLI",
        text: "Open a terminal and install OpenAI Codex if you don't have it. Follow the official install guide for your platform.",
        url: new URL("/google-ads-codex-mcp-setup-guide#step-1", SITE_URL).toString(),
      },
      {
        "@type": "HowToStep",
        position: 2,
        name: "Add the NotFair MCP",
        text: `Run codex mcp add ${MCP_CONNECTOR_NAME} --url ${MCP_SERVER_URL} in your terminal. Codex walks you through the OAuth flow and registers the NotFair MCP server automatically.`,
        url: new URL("/google-ads-codex-mcp-setup-guide#step-2", SITE_URL).toString(),
      },
      {
        "@type": "HowToStep",
        position: 3,
        name: "Ask Codex about your ads",
        text: `Try a prompt like '${GOOGLE_ADS_AUDIT_PROMPT}' Codex calls NotFair tools and answers with live data. For an action-oriented first write, ask Codex to find search terms worth adding as negatives and show the diff before writing.`,
        url: new URL("/google-ads-codex-mcp-setup-guide#step-3", SITE_URL).toString(),
      },
    ],
  },
];

export default function Page() {
  return (
    <>
      {jsonLd.map((schema, i) => (
        <script
          key={i}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
        />
      ))}
      <GoogleAdsCodexMcpSetupPage />
    </>
  );
}
