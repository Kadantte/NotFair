import { notFound } from "next/navigation";
import { GoHighLevelClaudeConnectorPage } from "@/components/marketing/gohighlevel-claude-connector-page";
import { buildMetadata, buildFaqJsonLd, SITE_URL } from "@/lib/seo";
import { checkGhlDevAccess } from "@/lib/gohighlevel/dev-gate";

export const metadata = buildMetadata({
  title: "GoHighLevel Claude Connector — Use NotFair in Claude Desktop, Web & Cowork",
  description:
    "Step-by-step guide to install the GoHighLevel Claude Connector. Add NotFair inside Claude Desktop, Claude.ai Web, or Claude Cowork in under 2 minutes — read your HighLevel CRM, conversations, opportunities, and calendar bookings through chat.",
  path: "/gohighlevel-claude-connector-setup-guide",
  // Belt-and-suspenders: dev-only surface. The page itself 404s for non-dev
  // viewers (including crawlers, since their session is unauthenticated), so
  // they never see body or metadata. We still emit `index:false` so any
  // future link from another page or sitemap entry doesn't ask Google to
  // index the URL.
  index: false,
  keywords: [
    "gohighlevel claude connector",
    "claude connector gohighlevel",
    "highlevel claude",
    "ghl claude",
    "claude.ai gohighlevel",
    "claude web gohighlevel",
    "claude cowork gohighlevel",
    "custom mcp connector claude",
    "add custom connector claude",
    "gohighlevel mcp connector",
    "highlevel mcp",
    "notfair claude gohighlevel",
  ],
});

const faqItems = [
  {
    question: "What is the GoHighLevel Claude Connector?",
    answer:
      "It's a custom MCP (Model Context Protocol) connector you add inside Claude Desktop, Claude.ai Web, or Claude Cowork. Once installed, Claude can read your HighLevel CRM in real time — contacts, conversations, opportunities, calendar bookings, locations — then summarize, diagnose, and answer questions over your live pipeline.",
  },
  {
    question: "Does the connector work with agency accounts and sub-accounts?",
    answer:
      "Yes. NotFair supports both Company-level (agency) and Location-level (sub-account) HighLevel installs. Connect the agency once and NotFair fans out per-location tokens automatically; or connect a single sub-account if you only manage one location.",
  },
  {
    question: "Where does this connector work?",
    answer:
      "Anywhere Claude supports remote custom connectors: Claude Desktop, Claude.ai on the web, and Claude Cowork. If you use Claude Code or Codex, NotFair also exposes the same MCP server you can wire up with a personal access token issued from the connect page.",
  },
  {
    question: "Do I need a HighLevel agency account?",
    answer:
      "No. Either an agency account or a sub-account works. The connector authenticates via the standard HighLevel Marketplace OAuth flow with read-only scopes: locations, contacts, conversations, opportunities, calendars, and calendar events.",
  },
  {
    question: "Do I need to write any code?",
    answer:
      "No. Setup is entirely point-and-click inside Claude Connectors. Open the Add custom connector flow, paste the NotFair GoHighLevel server URL, click Add, and Claude opens a browser tab to sign you in to HighLevel — no Client ID or Secret to copy.",
  },
  {
    question: "How long does setup take?",
    answer:
      "Under 2 minutes. Open the Add custom connector flow in Claude, paste the NotFair GoHighLevel server URL, click Add, then approve the install in HighLevel and pick which agency or location NotFair should access.",
  },
  {
    question: "Is the connector free?",
    answer:
      "Yes. Adding the NotFair GoHighLevel connector is free with no credit card. Paid plans unlock higher usage limits and team features.",
  },
  {
    question: "Can Claude actually change my HighLevel data through the connector?",
    answer:
      "No — the current release is read-only by design. Claude can read contacts, conversations, opportunities, calendars, and calendar events to answer questions and surface insights, but it cannot create, edit, or delete CRM records.",
  },
  {
    question: "Can I revoke access later?",
    answer:
      "Yes. From the connect page you can disconnect any individual HighLevel location or the whole agency. That immediately revokes the Claude OAuth token plus any personal access tokens you minted.",
  },
  {
    question: "What data does Claude see when the connector is enabled?",
    answer:
      "Live HighLevel data scoped to the locations you connect: locations, contacts (name/email/phone/custom fields), conversations and message history, opportunities by pipeline, calendars and calendar events. Tokens are encrypted at rest and refreshed server-side.",
  },
];

const jsonLd = [
  buildFaqJsonLd(faqItems),
  {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: "How to add the GoHighLevel Claude Connector to Claude",
    description:
      "Install NotFair as a custom MCP connector inside Claude Desktop, Claude.ai Web, or Claude Cowork to give Claude live access to your GoHighLevel CRM.",
    totalTime: "PT2M",
    step: [
      {
        "@type": "HowToStep",
        position: 1,
        name: "Open Claude Connectors",
        text: "Open Claude Desktop if you have it installed, or open Claude on the web, then jump straight to Add custom connector.",
        url: new URL("/gohighlevel-claude-connector-setup-guide#step-1", SITE_URL).toString(),
      },
      {
        "@type": "HowToStep",
        position: 2,
        name: "Configure the GoHighLevel connector",
        text: "Enter the name NotFair-GoHighLevel, paste the Remote MCP Server URL for GoHighLevel, click Add, and verify it appears in your Connectors list. Claude opens a browser tab to sign you in to HighLevel — no Client ID or Secret needed.",
        url: new URL("/gohighlevel-claude-connector-setup-guide#step-2", SITE_URL).toString(),
      },
      {
        "@type": "HowToStep",
        position: 3,
        name: "Ask Claude about your HighLevel CRM",
        text: "Open a new Claude chat and try a prompt like 'Summarize the last 50 conversations in my HighLevel sub-account and flag any leads that haven't been replied to in over 24 hours.' Claude calls the NotFair tools and answers with live data.",
        url: new URL("/gohighlevel-claude-connector-setup-guide#step-3", SITE_URL).toString(),
      },
    ],
  },
  {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "NotFair — GoHighLevel Claude Connector",
    applicationCategory: "BusinessApplication",
    applicationSubCategory: "CRM Integration",
    operatingSystem: "Web, macOS, Windows",
    description:
      "Custom MCP connector that gives Claude Desktop, Claude.ai Web, and Claude Cowork live read-access to your GoHighLevel CRM through NotFair.",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
    },
    url: new URL("/gohighlevel-claude-connector-setup-guide", SITE_URL).toString(),
    featureList: [
      "Custom MCP connector for Claude",
      "Works in Claude Desktop, Claude.ai Web, and Claude Cowork",
      "Live HighLevel CRM access — contacts, conversations, opportunities, calendars",
      "Agency and sub-account support",
      "Read-only by design; mutation tools on the roadmap",
      "Per-location access controls — pick which HighLevel sub-accounts Claude can see",
    ],
  },
];

export default async function Page() {
  // Dev-only surface — 404 for everyone else so we don't expose the route
  // before public launch. The 404 is deliberately indistinguishable from a
  // missing page; we don't reveal that this is gated.
  const access = await checkGhlDevAccess();
  if (!access.allowed) notFound();

  return (
    <>
      {jsonLd.map((schema, i) => (
        <script
          key={i}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
        />
      ))}
      <GoHighLevelClaudeConnectorPage />
    </>
  );
}
