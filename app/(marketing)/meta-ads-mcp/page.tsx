import { MetaAdsMcpPage } from "@/components/marketing/meta-ads-mcp-page";
import { buildMetadata, buildFaqJsonLd, SITE_URL } from "@/lib/seo";
import { META_MCP_SERVER_URL } from "@/lib/brand";

export const metadata = buildMetadata({
  title: "Meta Ads MCP Server — Configurations for Claude, Codex, Cursor & More",
  description:
    "Hosted Meta Ads MCP server for AI clients. Copy-paste configs so Claude, Codex, Cursor, and other MCP clients can diagnose and approve changes on Facebook + Instagram ad accounts.",
  path: "/meta-ads-mcp",
  keywords: [
    "meta ads mcp",
    "meta ads mcp server",
    "facebook ads mcp",
    "instagram ads mcp",
    "mcp meta ads",
    "claude meta ads mcp",
    "codex meta ads mcp",
    "cursor meta ads mcp",
    "meta ads mcp config",
    "model context protocol meta ads",
  ],
});

const faqItems = [
  {
    question: "What is the NotFair Meta Ads MCP server?",
    answer:
      "It's a hosted Model Context Protocol server that exposes your Meta ad accounts (Facebook + Instagram) to MCP-compatible AI clients. Read tools provide live campaign context for diagnosis; write tools propose fixes that you approve in chat.",
  },
  {
    question: "Which MCP clients are supported?",
    answer:
      "Any client that speaks the MCP Streamable HTTP transport — Claude.ai (Web, Desktop, Cowork), Claude Code, OpenAI Codex CLI, Cursor, Cline, and custom MCP clients. The server URL is the same; only the client-side config differs.",
  },
  {
    question: "Do I need to self-host anything?",
    answer:
      `No. The Meta Ads MCP server is hosted at ${META_MCP_SERVER_URL}. You just point your client at it and authenticate.`,
  },
  {
    question: "How does authentication work?",
    answer:
      "OAuth 2.0 with PKCE is the recommended flow — Claude.ai and Codex run it automatically. For clients that don't support OAuth, you can use a Bearer token via the Authorization header. Generate either at notfair.co/connect/meta-ads.",
  },
  {
    question: "Is the MCP server free?",
    answer:
      "Yes. Connecting to NotFair's Meta MCP is free with no credit card. Paid plans unlock higher usage limits and team features.",
  },
  {
    question: "Can the AI write to my Meta ad accounts through this server?",
    answer:
      "Only with your explicit approval. Write tools propose changes (pause campaigns, adjust budgets, rename entities, etc.), the client surfaces them, and you confirm before anything hits the Meta Marketing API. Read access is unrestricted; write access is gated.",
  },
  {
    question: "Does this work for both Facebook and Instagram ads?",
    answer:
      "Yes. Meta Ads covers both Facebook and Instagram inventory under a single ad account. The MCP exposes everything Meta surfaces through the Marketing API: campaigns, ad sets, ads, creative, audiences, insights, and the parent Business Manager.",
  },
];

const jsonLd = [
  buildFaqJsonLd(faqItems),
  {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "NotFair — Meta Ads MCP Server",
    applicationCategory: "DeveloperApplication",
    applicationSubCategory: "Model Context Protocol Server",
    operatingSystem: "Web",
    description:
      "Hosted Meta Ads MCP server for Claude.ai, Claude Code, OpenAI Codex, Cursor, Cline, and any MCP-compatible AI client. Diagnose Facebook + Instagram ad accounts, draft fixes, and approve writes. OAuth 2.0 + Bearer token auth.",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
    },
    url: new URL("/meta-ads-mcp", SITE_URL).toString(),
    featureList: [
      `Hosted MCP server at ${META_MCP_SERVER_URL}`,
      "Streamable HTTP transport (MCP 2025-03-26)",
      "OAuth 2.0 with PKCE",
      "Bearer token authentication",
      "Live Facebook + Instagram ad-account access",
      "Diagnosis and recommendation workflows",
      "Read-only by default; writes require human approval",
    ],
  },
  {
    "@context": "https://schema.org",
    "@type": "WebAPI",
    name: "NotFair Meta Ads MCP API",
    description:
      "Model Context Protocol API for Meta Ads diagnosis, recommendations, and approved execution. Compatible with Claude, Codex, Cursor, and any MCP-compatible client.",
    documentation: new URL("/meta-ads-mcp", SITE_URL).toString(),
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
      <MetaAdsMcpPage />
    </>
  );
}
