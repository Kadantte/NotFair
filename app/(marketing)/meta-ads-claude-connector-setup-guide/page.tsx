import { MetaAdsClaudeConnectorPage } from "@/components/marketing/meta-ads-claude-connector-page";
import { buildMetadata, buildFaqJsonLd, SITE_URL } from "@/lib/seo";

export const metadata = buildMetadata({
  title: "Meta Ads Claude Connector — Use NotFair in Claude Desktop, Web & Cowork",
  description:
    "Step-by-step guide to install the Meta Ads Claude Connector. Add NotFair inside Claude Desktop, Claude.ai Web, or Claude Cowork in under 2 minutes — diagnose and manage Facebook + Instagram ad accounts through chat.",
  path: "/meta-ads-claude-connector-setup-guide",
  keywords: [
    "meta ads claude connector",
    "claude connector meta ads",
    "facebook ads claude",
    "instagram ads claude",
    "claude.ai meta ads",
    "claude web meta ads",
    "claude cowork meta ads",
    "custom mcp connector claude",
    "add custom connector claude",
    "meta ads mcp connector",
    "facebook ads mcp",
    "notfair claude meta",
  ],
});

const faqItems = [
  {
    question: "What is the Meta Ads Claude Connector?",
    answer:
      "It's a custom MCP (Model Context Protocol) connector you add inside Claude Desktop, Claude.ai Web, or Claude Cowork. Once installed, Claude can read your Meta ad accounts (Facebook + Instagram) — campaigns, ad sets, ads, insights, and creative — in real time, then diagnose issues and propose changes you approve in chat.",
  },
  {
    question: "Does the Meta connector work with Facebook AND Instagram ads?",
    answer:
      "Yes. Meta Ads covers both Facebook and Instagram inventory under a single ad account. The connector reads everything Meta exposes through the Marketing API: campaigns, ad sets, ads, creative, audiences, insights, and the Business Manager hierarchy.",
  },
  {
    question: "Where does this connector work?",
    answer:
      "Anywhere Claude supports remote custom connectors: Claude Desktop, Claude.ai on the web, and Claude Cowork. If you use Claude Code or Codex, NotFair also ships as an MCP server you can wire to those CLIs — see the Meta Ads MCP server reference for the bearer-token configuration.",
  },
  {
    question: "Do I need a Meta Business account?",
    answer:
      "You need a personal or business Facebook account with access to at least one ad account, either as a direct user or via a Business Manager. NotFair connects via the standard Meta Login for Business OAuth flow with `ads_management`, `ads_read`, and `business_management` scopes.",
  },
  {
    question: "Do I need to write any code?",
    answer:
      "No. Setup is entirely point-and-click inside Claude Connectors. Open the Add custom connector flow, paste the NotFair Meta Ads server URL, click Add, and Claude opens a browser tab to sign you in — no Client ID or Secret to copy.",
  },
  {
    question: "How long does setup take?",
    answer:
      "Under 2 minutes. Open the Add custom connector flow in Claude, paste the NotFair Meta Ads server URL, click Add, then sign in to Facebook in the browser tab Claude opens for you and pick which ad accounts NotFair should manage.",
  },
  {
    question: "Is the connector free?",
    answer:
      "Yes. Adding the NotFair Meta connector is free with no credit card. Paid plans unlock higher usage limits and team features.",
  },
  {
    question: "Can Claude actually change my Meta ad accounts through the connector?",
    answer:
      "Only with your explicit approval. Claude can propose pausing campaigns, ad sets, or ads, adjusting budgets, or renaming entities — but every write action is shown to you first and requires confirmation. Read access is unrestricted; write access is gated.",
  },
  {
    question: "Can I limit which Meta ad accounts Claude can touch?",
    answer:
      "Yes. After OAuth, NotFair shows the full list of ad accounts your Meta identity has access to. You pick the curated subset NotFair is allowed to read and write — only those accounts are exposed to Claude.",
  },
  {
    question: "What data does Claude see when the connector is enabled?",
    answer:
      "Live ad-account info, campaigns, ad sets, ads, creative, insights (spend, impressions, clicks, CTR, CPC, CPM, conversions), breakdowns, and the parent Business Manager when applicable — pulled directly from the Meta Marketing API in real time.",
  },
];

const jsonLd = [
  buildFaqJsonLd(faqItems),
  {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: "How to add the Meta Ads Claude Connector to Claude",
    description:
      "Install NotFair as a custom MCP connector inside Claude Desktop, Claude.ai Web, or Claude Cowork to give Claude live access to diagnose and manage your Meta (Facebook + Instagram) ad accounts.",
    totalTime: "PT2M",
    step: [
      {
        "@type": "HowToStep",
        position: 1,
        name: "Open Claude Connectors",
        text: "Open Claude Desktop if you have it installed, or open Claude on the web, then jump straight to Add custom connector.",
        url: new URL("/meta-ads-claude-connector-setup-guide#step-1", SITE_URL).toString(),
      },
      {
        "@type": "HowToStep",
        position: 2,
        name: "Configure the Meta connector",
        text: "Enter the name NotFair-MetaAds, paste the Remote MCP Server URL for Meta, click Add, and verify it appears in your Connectors list. Claude opens a browser tab to sign you in to Facebook — no Client ID or Secret needed.",
        url: new URL("/meta-ads-claude-connector-setup-guide#step-2", SITE_URL).toString(),
      },
      {
        "@type": "HowToStep",
        position: 3,
        name: "Ask Claude about your Meta ads",
        text: "Open a new Claude chat and try a prompt like 'List my top-spending Meta campaigns over the last 30 days and flag any with rising CPM.' Claude calls the NotFair Meta tools and answers with live data.",
        url: new URL("/meta-ads-claude-connector-setup-guide#step-3", SITE_URL).toString(),
      },
    ],
  },
  {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "NotFair — Meta Ads Claude Connector",
    applicationCategory: "BusinessApplication",
    applicationSubCategory: "Meta Ads Management Software",
    operatingSystem: "Web, macOS, Windows",
    description:
      "Custom MCP connector that gives Claude Desktop, Claude.ai Web, and Claude Cowork live access to diagnose and manage your Meta (Facebook + Instagram) ad accounts through NotFair.",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
    },
    url: new URL("/meta-ads-claude-connector-setup-guide", SITE_URL).toString(),
    featureList: [
      "Custom MCP connector for Claude",
      "Works in Claude Desktop, Claude.ai Web, and Claude Cowork",
      "Live Meta Ads account access (Facebook + Instagram)",
      "Diagnose, optimize, and manage approved campaign changes through chat",
      "Read-only by default; writes require human approval",
      "Per-account access controls — pick which Meta ad accounts Claude can touch",
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
      <MetaAdsClaudeConnectorPage />
    </>
  );
}
