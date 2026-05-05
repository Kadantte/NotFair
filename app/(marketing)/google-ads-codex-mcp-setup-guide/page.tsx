import { GoogleAdsCodexMcpSetupPage } from "@/components/marketing/google-ads-codex-mcp-setup-page";
import { buildMetadata, buildFaqJsonLd, SITE_URL } from "@/lib/seo";
import { MCP_CONNECTOR_NAME, MCP_SERVER_URL } from "@/lib/brand";

export const metadata = buildMetadata({
  title: "Google Ads Codex MCP — Setup Guide for NotFair in OpenAI Codex",
  description:
    "Step-by-step guide to add NotFair to OpenAI's Codex CLI as an MCP server. One terminal command wires up Google Ads access in under a minute — diagnose issues and manage approved changes through Codex chat.",
  path: "/google-ads-codex-mcp-setup-guide",
  keywords: [
    "google ads codex mcp",
    "openai codex google ads",
    "codex cli google ads",
    "codex mcp setup",
    "adsagent codex",
    "openai codex mcp server",
    "google ads codex integration",
  ],
});

const faqItems = [
  {
    question: "What is the NotFair Codex MCP integration?",
    answer:
      "It's an MCP (Model Context Protocol) integration for OpenAI's Codex CLI. Once added, Codex can read your Google Ads campaigns, keywords, search terms, spend, and ad copy in real time — then diagnose issues, recommend fixes, and propose changes you approve in chat.",
  },
  {
    question: "How is this different from the Claude setup guides?",
    answer:
      "Same backend, different client. The Codex CLI calls the NotFair MCP server using OpenAI's MCP support. The Claude Connector and Claude Code plugin call the same server from Anthropic's clients. Capabilities are identical.",
  },
  {
    question: "How long does setup take?",
    answer:
      `Under a minute. Run a single \`codex mcp add ${MCP_CONNECTOR_NAME} --url ${MCP_SERVER_URL}\` command in your terminal — Codex walks you through the OAuth flow and registers the MCP automatically.`,
  },
  {
    question: "Do I need to write any code?",
    answer:
      "No. One terminal command sets everything up. There are no JSON config edits, no environment variables, and no scripts to run.",
  },
  {
    question: "Is the integration free?",
    answer:
      "Yes. Adding NotFair to Codex and running a free Google Ads audit is free with no credit card. Paid plans unlock higher usage limits and team features.",
  },
  {
    question: "Can Codex actually change my Google Ads account?",
    answer:
      "Only with your explicit approval. Codex can propose pausing campaigns, adjusting bids, adding negative keywords, or writing new ads — but every write action is shown to you first and requires confirmation. Read access is unrestricted; write access is gated.",
  },
];

const jsonLd = [
  buildFaqJsonLd(faqItems),
  {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: "How to add the NotFair MCP to OpenAI Codex CLI",
    description:
      "Add NotFair to OpenAI's Codex CLI as an MCP server with a single terminal command — Codex walks you through OAuth and registers the integration automatically.",
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
        text: "Try a prompt like 'Audit my connected Google Ads account and prioritize the 3 changes most likely to improve performance. For each one, show the evidence, expected upside, and exact change you recommend I approve, and create a live dashboard for me for ongoing monitoring.' Codex calls NotFair tools and answers with live data.",
        url: new URL("/google-ads-codex-mcp-setup-guide#step-3", SITE_URL).toString(),
      },
    ],
  },
  {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "NotFair — Google Ads Codex MCP",
    applicationCategory: "BusinessApplication",
    applicationSubCategory: "Google Ads Management Software",
    operatingSystem: "macOS, Linux, Windows",
    description:
      "MCP server that gives OpenAI's Codex CLI live access to diagnose and manage your Google Ads account through NotFair.",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
    },
    url: new URL("/google-ads-codex-mcp-setup-guide", SITE_URL).toString(),
    featureList: [
      "MCP integration for OpenAI Codex CLI",
      "One-line terminal install",
      "Live Google Ads account access",
      "Diagnose, optimize, and manage approved campaign changes through chat",
      "Read-only by default; writes require human approval",
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
