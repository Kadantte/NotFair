import { MetaAdsCodexMcpSetupPage } from "@/components/marketing/meta-ads-codex-mcp-setup-page";
import { buildMetadata, buildFaqJsonLd, SITE_URL } from "@/lib/seo";
import { META_MCP_CONNECTOR_NAME, META_MCP_SERVER_URL } from "@/lib/brand";

export const metadata = buildMetadata({
  title: "Meta Ads Codex MCP — Setup Guide for NotFair in OpenAI Codex",
  description:
    "Step-by-step guide to add NotFair to OpenAI's Codex CLI as an MCP server for Meta Ads. One terminal command wires up Facebook + Instagram ad-account access — diagnose issues and approve changes through Codex.",
  path: "/meta-ads-codex-mcp-setup-guide",
  keywords: [
    "meta ads codex mcp",
    "facebook ads codex",
    "instagram ads codex",
    "openai codex meta ads",
    "codex cli meta ads",
    "codex mcp setup meta",
    "notfair codex meta",
    "openai codex mcp server meta",
  ],
});

const faqItems = [
  {
    question: "What is the NotFair Meta Ads Codex MCP integration?",
    answer:
      "It's an MCP (Model Context Protocol) integration for OpenAI's Codex CLI. Once added, Codex can read your Meta ad accounts — Facebook and Instagram — in real time, then diagnose issues, recommend fixes, and propose changes you approve in chat.",
  },
  {
    question: "How is this different from the Claude setup guides?",
    answer:
      "Same backend, different client. The Codex CLI calls the NotFair Meta MCP server using OpenAI's MCP support. The Claude Connector and Claude Code plugin call it from Anthropic's clients. Capabilities are identical.",
  },
  {
    question: "How long does setup take?",
    answer:
      `Under a minute. Run a single \`codex mcp add ${META_MCP_CONNECTOR_NAME} --url ${META_MCP_SERVER_URL}\` command in your terminal — Codex walks you through the OAuth flow and registers the MCP automatically.`,
  },
  {
    question: "Do I need to write any code?",
    answer:
      "No. One terminal command sets everything up. There are no JSON config edits, no environment variables, and no scripts to run.",
  },
  {
    question: "Is the integration free?",
    answer:
      "Yes. Adding NotFair Meta to Codex is free with no credit card. Paid plans unlock higher usage limits and team features.",
  },
  {
    question: "Can Codex actually change my Meta ad accounts?",
    answer:
      "Only with your explicit approval. Codex can propose pausing campaigns/ad sets/ads, adjusting budgets, or renaming entities — but every write action is shown to you first and requires confirmation.",
  },
];

const jsonLd = [
  buildFaqJsonLd(faqItems),
  {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: "How to add the NotFair Meta MCP to OpenAI Codex CLI",
    description:
      "Add NotFair's Meta Ads MCP server to OpenAI's Codex CLI with a single terminal command — Codex walks you through OAuth and registers the integration automatically.",
    totalTime: "PT1M",
    step: [
      {
        "@type": "HowToStep",
        position: 1,
        name: "Install the Codex CLI",
        text: "Open a terminal and install OpenAI Codex if you don't have it. Follow the official install guide for your platform.",
        url: new URL("/meta-ads-codex-mcp-setup-guide#step-1", SITE_URL).toString(),
      },
      {
        "@type": "HowToStep",
        position: 2,
        name: "Add the NotFair Meta MCP",
        text: `Run codex mcp add ${META_MCP_CONNECTOR_NAME} --url ${META_MCP_SERVER_URL} in your terminal. Codex walks you through the OAuth flow and registers the NotFair Meta MCP server automatically.`,
        url: new URL("/meta-ads-codex-mcp-setup-guide#step-2", SITE_URL).toString(),
      },
      {
        "@type": "HowToStep",
        position: 3,
        name: "Ask Codex about your Meta ads",
        text: "Try a prompt like 'List my top-spending Meta campaigns over the last 30 days.' Codex calls NotFair tools and answers with live data.",
        url: new URL("/meta-ads-codex-mcp-setup-guide#step-3", SITE_URL).toString(),
      },
    ],
  },
  {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "NotFair — Meta Ads Codex MCP",
    applicationCategory: "BusinessApplication",
    applicationSubCategory: "Meta Ads Management Software",
    operatingSystem: "macOS, Linux, Windows",
    description:
      "MCP server that gives OpenAI's Codex CLI live access to diagnose and manage your Meta (Facebook + Instagram) ad accounts through NotFair.",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
    },
    url: new URL("/meta-ads-codex-mcp-setup-guide", SITE_URL).toString(),
    featureList: [
      "MCP integration for OpenAI Codex CLI",
      "One-line terminal install",
      "Live Meta Ads account access (Facebook + Instagram)",
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
      <MetaAdsCodexMcpSetupPage />
    </>
  );
}
