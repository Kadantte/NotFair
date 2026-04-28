import { GoogleAdsClaudeConnectorPage } from "@/components/marketing/google-ads-claude-connector-page";
import { buildMetadata, buildFaqJsonLd, SITE_URL } from "@/lib/seo";

export const metadata = buildMetadata({
  title: "Google Ads Claude Connector — Use NotFair in Claude.ai (Web & Cowork)",
  description:
    "Step-by-step guide to install the Google Ads Claude Connector. Add NotFair as a custom MCP connector inside Claude.ai Web or Claude Cowork in under 2 minutes — manage Google Ads campaigns through chat.",
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
      "It's a custom MCP (Model Context Protocol) connector you add inside Claude.ai Web or Claude Cowork. Once installed, Claude can read your Google Ads campaigns, keywords, search terms, spend, and ad copy in real time — and propose changes you approve in chat.",
  },
  {
    question: "Where does this connector work?",
    answer:
      "Anywhere you use Claude.ai with custom connector support: Claude.ai on the web and Claude Cowork. If you use Claude Code instead, NotFair ships as a plugin — see the Claude Code setup guide.",
  },
  {
    question: "Do I need to write any code?",
    answer:
      "No. Setup is entirely point-and-click inside claude.ai/customize/connectors. You sign in with Google to generate your Client ID and Secret, paste them into Claude's custom connector dialog, and click Add.",
  },
  {
    question: "How long does setup take?",
    answer:
      "Under 2 minutes. Open the Connectors page in Claude, paste the NotFair server URL, sign in with your Google Ads account to generate credentials, paste them into Claude, and you're done.",
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
    name: "How to add the Google Ads Claude Connector to Claude.ai",
    description:
      "Install NotFair as a custom MCP connector inside Claude.ai Web or Claude Cowork to give Claude live access to your Google Ads account.",
    totalTime: "PT2M",
    step: [
      {
        "@type": "HowToStep",
        position: 1,
        name: "Open Claude Connectors",
        text: "Go to claude.ai/customize/connectors, click the + icon, and choose Add custom connector.",
        url: new URL("/google-ads-claude-connector-setup-guide#step-1", SITE_URL).toString(),
      },
      {
        "@type": "HowToStep",
        position: 2,
        name: "Configure the connector",
        text: "Enter the name NotFair, paste the Remote MCP Server URL, expand Advanced Settings, then sign in with your Google Ads account on NotFair to generate your Client ID and Client Secret.",
        url: new URL("/google-ads-claude-connector-setup-guide#step-2", SITE_URL).toString(),
      },
      {
        "@type": "HowToStep",
        position: 3,
        name: "Add the connector",
        text: "Click Add. The NotFair connector appears in your Connectors list with all available tools.",
        url: new URL("/google-ads-claude-connector-setup-guide#step-3", SITE_URL).toString(),
      },
      {
        "@type": "HowToStep",
        position: 4,
        name: "Enable NotFair in a chat",
        text: "Open a new chat on Claude.ai, click the + button, go to Connectors, and toggle NotFair on.",
        url: new URL("/google-ads-claude-connector-setup-guide#step-4", SITE_URL).toString(),
      },
      {
        "@type": "HowToStep",
        position: 5,
        name: "Ask Claude about your Google Ads",
        text: "Try a prompt like 'Audit my connected Google Ads account and tell me the 3 biggest optimization opportunities.' Claude calls NotFair tools and answers with live data.",
        url: new URL("/google-ads-claude-connector-setup-guide#step-5", SITE_URL).toString(),
      },
    ],
  },
  {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "NotFair — Google Ads Claude Connector",
    applicationCategory: "BusinessApplication",
    applicationSubCategory: "Google Ads Management Software",
    operatingSystem: "Web",
    description:
      "Custom MCP connector that gives Claude.ai Web and Claude Cowork live access to your Google Ads account through NotFair.",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
    },
    url: new URL("/google-ads-claude-connector-setup-guide", SITE_URL).toString(),
    featureList: [
      "Custom MCP connector for Claude.ai",
      "Works in Claude.ai Web and Claude Cowork",
      "Live Google Ads account access",
      "Audit, optimize, and manage campaigns through chat",
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
