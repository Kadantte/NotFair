import { GoogleAdsMcpServerPage } from "@/components/marketing/google-ads-mcp-server-page";
import { buildMetadata, buildFaqJsonLd, SITE_URL } from "@/lib/seo";

export const metadata = buildMetadata({
  title: "Google Ads MCP Server | NotFair",
  description:
    "Production-ready Google Ads MCP server for Claude and any MCP client. Diagnose account issues, draft approved fixes, and connect in 2 minutes. Free to start.",
  path: "/google-ads-mcp-server",
  keywords: [
    "google ads mcp server",
    "google ads mcp",
    "mcp server google ads",
    "connect google ads to claude",
    "google ads model context protocol",
    "google ads mcp tools",
  ],
});

const faqItems = [
  {
    question: "What MCP clients does NotFair support?",
    answer:
      "Any client that supports the MCP stdio transport: Claude Desktop, Claude Code, Claude Cowork, and third-party MCP clients. If it can run an npx subprocess, it works.",
  },
  {
    question: "Is the Google Ads MCP server read-only safe?",
    answer:
      "Yes. Read and write tools are distinct. You can configure your MCP client to expose only read tools. All write operations also show a preview before executing — nothing changes without your explicit confirmation.",
  },
  {
    question: "What OAuth scopes does NotFair request?",
    answer:
      "Only the Google Ads API scope. No Gmail, Calendar, or other Google services are requested.",
  },
  {
    question: "Does NotFair support manager accounts (MCCs)?",
    answer:
      "Yes. If your OAuth account has access to multiple Google Ads accounts, you can specify the customer ID at runtime. Manager account hierarchies are supported.",
  },
  {
    question: "How do I install the Google Ads MCP server?",
    answer:
      'Add the following to your MCP config: {"mcpServers":{"adsagent":{"command":"npx","args":["-y","@adsagent/mcp"]}}}. No global install required — npx pulls the latest version on demand.',
  },
  {
    question: "How is NotFair different from using the Google Ads API directly?",
    answer:
      "The Google Ads API requires a developer token, OAuth setup, and writing GAQL queries by hand. NotFair wraps all of that into typed MCP tools your AI agent can call through natural language for diagnosis, recommendations, and approved execution — no API knowledge required.",
  },
  {
    question: "What happens if a tool call fails?",
    answer:
      "NotFair returns structured error messages through the MCP protocol. Your agent sees the error, can reason about it, and can retry or escalate. No silent failures.",
  },
];

const jsonLd = [
  buildFaqJsonLd(faqItems),
  {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "NotFair Google Ads MCP Server",
    applicationCategory: "DeveloperApplication",
    operatingSystem: "Any (Node.js runtime required)",
    url: new URL("/google-ads-mcp-server", SITE_URL).toString(),
    description:
      "A production-ready Model Context Protocol server for Google Ads. Exposes live campaign data, diagnosis workflows, keyword management, bid updates, and approved account actions as MCP tools for Claude and any MCP-compatible client.",
    downloadUrl: "https://www.npmjs.com/package/@adsagent/mcp",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
    },
    featureList: [
      "runScript — JS sandbox with GAQL fan-out for every analytical read (audits, dashboards, diagnostics)",
      "getRecommendations — Google's optimization suggestions with impact estimates",
      "getKeywordIdeas — Keyword Planner search volume and CPC data",
      "getChanges & reviewChangeImpact — change log and before/after impact analysis",
      "updateBid — keyword and ad group bid management",
      "pauseCampaign — pause underperforming campaigns",
      "addNegativeKeyword — block irrelevant search terms after review",
      "getResourceMetadata — GAQL schema discovery",
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
      <GoogleAdsMcpServerPage faqItems={faqItems} />
    </>
  );
}
