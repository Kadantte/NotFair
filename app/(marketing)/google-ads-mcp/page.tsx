import { GoogleAdsMcpPage } from "@/components/marketing/google-ads-mcp-page";
import { buildMetadata, buildFaqJsonLd, SITE_URL } from "@/lib/seo";

export const metadata = buildMetadata({
  title: "Google Ads MCP Server — Configurations for Claude, Codex, Cursor & More",
  description:
    "Hosted Google Ads MCP server for AI clients. Copy-paste OAuth and Bearer-token configs for Claude.ai, Claude Code, OpenAI Codex CLI, Cursor, Cline, and any MCP-compatible client.",
  path: "/google-ads-mcp",
  keywords: [
    "google ads mcp",
    "google ads mcp server",
    "mcp google ads",
    "claude google ads mcp",
    "codex google ads mcp",
    "cursor google ads mcp",
    "google ads mcp config",
    "model context protocol google ads",
  ],
});

const faqItems = [
  {
    question: "What is the NotFair Google Ads MCP server?",
    answer:
      "It's a hosted Model Context Protocol server that exposes your Google Ads account to MCP-compatible AI clients. Read tools provide live campaign context; write tools propose changes that you approve in chat.",
  },
  {
    question: "Which MCP clients are supported?",
    answer:
      "Any client that speaks the MCP Streamable HTTP transport — Claude.ai (Web, Desktop, Cowork), Claude Code, OpenAI Codex CLI, Cursor, Cline, and custom MCP clients. The server URL is the same; only the client-side config differs.",
  },
  {
    question: "Do I need to self-host anything?",
    answer:
      "No. The server is hosted at https://notfair.co/api/mcp. You just point your client at it and authenticate.",
  },
  {
    question: "How does authentication work?",
    answer:
      "OAuth 2.0 with PKCE is the recommended flow — Claude.ai and Codex run it automatically. For clients that don't support OAuth, you can use a Bearer token via the Authorization header. Generate either at notfair.co/connect.",
  },
  {
    question: "Is the MCP server free?",
    answer:
      "Yes. Connecting and running a free Google Ads audit is free with no credit card. Paid plans unlock higher usage limits and team features.",
  },
  {
    question: "Can the AI write to my account through this server?",
    answer:
      "Only with your explicit approval. Write tools propose changes, the client surfaces them, and you confirm before anything hits the Google Ads API. Read access is unrestricted; write access is gated.",
  },
];

const jsonLd = [
  buildFaqJsonLd(faqItems),
  {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "NotFair — Google Ads MCP Server",
    applicationCategory: "DeveloperApplication",
    applicationSubCategory: "Model Context Protocol Server",
    operatingSystem: "Web",
    description:
      "Hosted Google Ads MCP server for Claude.ai, Claude Code, OpenAI Codex, Cursor, Cline, and any MCP-compatible AI client. OAuth 2.0 + Bearer token auth.",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
    },
    url: new URL("/google-ads-mcp", SITE_URL).toString(),
    featureList: [
      "Hosted MCP server at https://notfair.co/api/mcp",
      "Streamable HTTP transport (MCP 2025-03-26)",
      "OAuth 2.0 with PKCE",
      "Bearer token authentication",
      "Live Google Ads account access",
      "Read-only by default; writes require human approval",
    ],
  },
  {
    "@context": "https://schema.org",
    "@type": "WebAPI",
    name: "NotFair Google Ads MCP API",
    description:
      "Model Context Protocol API for Google Ads. Compatible with Claude, Codex, Cursor, and any MCP-compatible client.",
    documentation: new URL("/google-ads-mcp", SITE_URL).toString(),
    termsOfService: new URL("/terms", SITE_URL).toString(),
    provider: {
      "@type": "Organization",
      name: "NotFair",
      url: SITE_URL,
    },
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
      <GoogleAdsMcpPage />
    </>
  );
}
