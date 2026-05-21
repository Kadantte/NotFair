import { GoogleAdsMcpPage } from "@/components/marketing/google-ads-mcp-page";
import { buildMetadata, buildFaqJsonLd, SITE_URL } from "@/lib/seo";
import { MCP_SERVER_URL } from "@/lib/brand";

export const metadata = buildMetadata({
  title: "Google Ads MCP Server for Claude, Codex, Hermes & OpenClaw | NotFair",
  description:
    "Hosted Google Ads MCP server for AI agents. Connect Claude, Codex, Hermes, OpenClaw, and other MCP clients to live Google Ads data and approved actions.",
  path: "/google-ads-mcp",
  keywords: [
    "google ads mcp",
    "google ads mcp server",
    "mcp google ads",
    "claude google ads mcp",
    "codex google ads mcp",
    "hermes google ads mcp",
    "openclaw google ads mcp",
    "google ads mcp config",
    "model context protocol google ads",
  ],
});

const faqItems = [
  {
    question: "What is the NotFair Google Ads MCP server?",
    answer:
      "It's a hosted Model Context Protocol server that exposes your Google Ads account to MCP-compatible AI clients. Read tools provide live campaign context for diagnosis; write tools propose fixes that you approve in chat.",
  },
  {
    question: "Which MCP clients are supported?",
    answer:
      "Any client that speaks the MCP Streamable HTTP transport — Claude.ai (Web, Desktop, Cowork), Claude Code, OpenAI Codex CLI, Hermes Agent, OpenClaw, Cursor, Cline, and custom MCP clients. The server URL is the same; only the client-side config differs.",
  },
  {
    question: "Do I need to self-host anything?",
    answer:
      `No. The server is hosted at ${MCP_SERVER_URL}. You just point your client at it and authenticate.`,
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
      "Hosted Google Ads MCP server for Claude.ai, Claude Code, OpenAI Codex, Hermes Agent, OpenClaw, Cursor, Cline, and any MCP-compatible AI client. Diagnose issues, draft fixes, and approve writes. OAuth 2.0 + Bearer token auth.",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
    },
    url: new URL("/google-ads-mcp", SITE_URL).toString(),
    featureList: [
      `Hosted MCP server at ${MCP_SERVER_URL}`,
      "Streamable HTTP transport (MCP 2025-03-26)",
      "OAuth 2.0 with PKCE",
      "Bearer token authentication",
      "Live Google Ads account access",
      "Diagnosis and recommendation workflows",
      "Read-only by default; writes require human approval",
    ],
  },
  {
    "@context": "https://schema.org",
    "@type": "WebAPI",
    name: "NotFair Google Ads MCP API",
    description:
      "Model Context Protocol API for Google Ads diagnosis, recommendations, and approved execution. Compatible with Claude, Codex, Hermes Agent, OpenClaw, and any MCP-compatible client.",
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
