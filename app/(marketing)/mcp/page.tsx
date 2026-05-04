import { Suspense } from "react";
import { McpPage } from "@/components/marketing/mcp-page";
import { buildMetadata, buildFaqJsonLd, SITE_URL } from "@/lib/seo";
import {
  MCP_CONNECTOR_NAME,
  MCP_SERVER_URL,
  META_MCP_CONNECTOR_NAME,
  META_MCP_SERVER_URL,
} from "@/lib/brand";

export const metadata = buildMetadata({
  title: "NotFair MCP — Google Ads & Meta Ads MCP Servers for Claude, Codex, Cursor",
  description:
    "Hosted MCP servers for Google Ads and Meta Ads. Drop the config into Claude, Codex, Cursor, Cline, or any MCP-compatible client and let your AI agent diagnose, fix, and operate your ad accounts in chat.",
  path: "/mcp",
  keywords: [
    "ads mcp",
    "ads mcp server",
    "notfair mcp",
    "google ads mcp",
    "meta ads mcp",
    "facebook ads mcp",
    "mcp server for ads",
    "claude ads mcp",
    "codex ads mcp",
    "cursor ads mcp",
    "model context protocol ads",
  ],
});

const faqItems = [
  {
    question: "What is NotFair MCP?",
    answer:
      "Two hosted Model Context Protocol servers — one for Google Ads, one for Meta Ads — that expose your accounts to MCP-compatible AI clients. Reads stream live campaign data; writes are proposed in chat and require your explicit approval before they hit the ad platform.",
  },
  {
    question: "Which AI clients can I use?",
    answer:
      "Anything that speaks the MCP Streamable HTTP transport: Claude.ai (Web, Desktop, Cowork), Claude Code, OpenAI Codex CLI, Cursor, Cline, and custom MCP clients. The server URL stays the same — only the client-side config differs.",
  },
  {
    question: "Do I need to self-host anything?",
    answer:
      `No. Both servers are hosted by NotFair at ${MCP_SERVER_URL} and ${META_MCP_SERVER_URL}. You connect the underlying ad account once via OAuth and point your client at the URL.`,
  },
  {
    question: "How does authentication work?",
    answer:
      "OAuth 2.0 with PKCE is the default — Claude.ai and Codex run it automatically. For clients that don't support OAuth, you can use a Bearer token via the Authorization header. Generate either at notfair.co/connect or notfair.co/connect/meta-ads.",
  },
  {
    question: "Can the AI write to my ad accounts?",
    answer:
      "Only with explicit approval. Write tools propose changes, the client surfaces the diff, and you confirm before anything hits the Google Ads or Meta Marketing API. Read access is unrestricted; every write is gated.",
  },
  {
    question: "What does it cost?",
    answer:
      "Connecting and running audits is free with no credit card. Paid plans unlock higher usage limits and team features.",
  },
];

const jsonLd = [
  buildFaqJsonLd(faqItems),
  {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "NotFair MCP — Google Ads & Meta Ads",
    applicationCategory: "DeveloperApplication",
    applicationSubCategory: "Model Context Protocol Server",
    operatingSystem: "Web",
    description:
      "Hosted MCP servers for Google Ads and Meta Ads. Compatible with Claude.ai, Claude Code, OpenAI Codex, Cursor, Cline, and any MCP-compatible AI client. Diagnose issues, draft fixes, and approve writes. OAuth 2.0 + Bearer token auth.",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
    },
    url: new URL("/mcp", SITE_URL).toString(),
    featureList: [
      `Hosted Google Ads MCP server (${MCP_CONNECTOR_NAME}) at ${MCP_SERVER_URL}`,
      `Hosted Meta Ads MCP server (${META_MCP_CONNECTOR_NAME}) at ${META_MCP_SERVER_URL}`,
      "Streamable HTTP transport (MCP 2025-03-26)",
      "OAuth 2.0 with PKCE",
      "Bearer token authentication",
      "Live Google Ads and Meta Marketing API access",
      "Diagnosis and recommendation workflows",
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
      <Suspense fallback={null}>
        <McpPage />
      </Suspense>
    </>
  );
}
