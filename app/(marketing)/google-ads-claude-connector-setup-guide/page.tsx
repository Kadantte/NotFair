import { GoogleAdsClaudeConnectorPage } from "@/components/marketing/google-ads-claude-connector-page";
import { buildMetadata, buildFaqJsonLd, SITE_URL } from "@/lib/seo";

export const metadata = buildMetadata({
  title: "Google Ads Claude Connector — Use NotFair in Claude Desktop, Web & Cowork",
  description:
    "Step-by-step guide to install the Google Ads Claude Connector. Add NotFair inside Claude Desktop, Claude.ai Web, or Claude Cowork in under 2 minutes — diagnose issues and manage approved Google Ads changes through chat.",
  path: "/google-ads-claude-connector-setup-guide",
  keywords: [
    "google ads claude connector",
    "claude connector google ads",
    "claude.ai google ads",
    "claude web google ads",
    "claude cowork google ads",
    "custom mcp connector claude",
    "add custom connector claude",
    "google ads mcp connector",
    "adsagent claude connector",
  ],
});

const faqItems = [
  {
    question: "What is the Google Ads Claude Connector?",
    answer:
      "It's a custom MCP (Model Context Protocol) connector you add inside Claude Desktop, Claude.ai Web, or Claude Cowork. Once installed, Claude can read your Google Ads campaigns, keywords, search terms, spend, and ad copy in real time — then diagnose issues, recommend fixes, and propose changes you approve in chat.",
  },
  {
    question: "Where does this connector work?",
    answer:
      "Anywhere Claude supports remote custom connectors: Claude Desktop, Claude.ai on the web, and Claude Cowork. If you use Claude Code instead, NotFair ships as a plugin — see the Claude Code setup guide.",
  },
  {
    question: "Do I need to write any code?",
    answer:
      "No. Setup is entirely point-and-click inside Claude Connectors. Open the Add custom connector flow, paste the NotFair server URL, click Add, and Claude opens a browser tab to sign you in — no Client ID or Secret to copy.",
  },
  {
    question: "How long does setup take?",
    answer:
      "Under 2 minutes. Open the Add custom connector flow in Claude, paste the NotFair server URL, click Add, and sign in with your Google Ads account in the browser tab Claude opens for you.",
  },
  {
    question: "Is the connector free?",
    answer:
      "Yes. Adding the NotFair connector and running a free Google Ads audit is free with no credit card. Paid plans unlock higher usage limits and team features.",
  },
  {
    question: "Can Claude actually change my Google Ads account through the connector?",
    answer:
      "Only with your explicit approval. Claude can propose pausing campaigns, adjusting bids, adding negative keywords, or writing new ads — but every write action is shown to you first and requires confirmation. Read access is unrestricted; write access is gated.",
  },
  {
    question: "What data does Claude see when the NotFair connector is enabled?",
    answer:
      "Live campaign performance, keyword bids and Quality Scores, search term reports, ad copy, spend, impression share, and conversion tracking status — pulled directly from the Google Ads API in real time.",
  },
];

const jsonLd = [
  buildFaqJsonLd(faqItems),
  {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: "How to add the Google Ads Claude Connector to Claude",
    description:
      "Install NotFair as a custom MCP connector inside Claude Desktop, Claude.ai Web, or Claude Cowork to give Claude live access to diagnose and manage your Google Ads account.",
    totalTime: "PT2M",
    step: [
      {
        "@type": "HowToStep",
        position: 1,
        name: "Open Claude Connectors",
        text: "Open Claude Desktop if you have it installed, or open Claude on the web, then jump straight to Add custom connector.",
        url: new URL("/google-ads-claude-connector-setup-guide#step-1", SITE_URL).toString(),
      },
      {
        "@type": "HowToStep",
        position: 2,
        name: "Configure the connector",
        text: "Enter the name NotFair, paste the Remote MCP Server URL, click Add, and verify NotFair appears in your Connectors list with all available tools. Claude opens a browser tab to sign you in — no Client ID or Secret needed.",
        url: new URL("/google-ads-claude-connector-setup-guide#step-2", SITE_URL).toString(),
      },
      {
        "@type": "HowToStep",
        position: 3,
        name: "Ask Claude about your Google Ads",
        text: "Open a new Claude chat and try a prompt like 'Audit my connected Google Ads account and prioritize the 3 changes most likely to improve performance. For each one, show the evidence, expected upside, and exact change you recommend I approve, and create a live dashboard for me for ongoing monitoring.' Claude calls NotFair tools and answers with live data.",
        url: new URL("/google-ads-claude-connector-setup-guide#step-3", SITE_URL).toString(),
      },
    ],
  },
  {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "NotFair — Google Ads Claude Connector",
    applicationCategory: "BusinessApplication",
    applicationSubCategory: "Google Ads Management Software",
    operatingSystem: "Web, macOS, Windows",
    description:
      "Custom MCP connector that gives Claude Desktop, Claude.ai Web, and Claude Cowork live access to diagnose and manage your Google Ads account through NotFair.",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
    },
    url: new URL("/google-ads-claude-connector-setup-guide", SITE_URL).toString(),
    featureList: [
      "Custom MCP connector for Claude",
      "Works in Claude Desktop, Claude.ai Web, and Claude Cowork",
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
      <GoogleAdsClaudeConnectorPage />
    </>
  );
}
