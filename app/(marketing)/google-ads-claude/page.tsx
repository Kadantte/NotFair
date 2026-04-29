import { GoogleAdsClaudePage } from "@/components/marketing/google-ads-claude-page";
import { buildMetadata, buildFaqJsonLd, SITE_URL } from "@/lib/seo";

export const metadata = buildMetadata({
  title: "Google Ads Claude MCP Server | NotFair",
  description:
    "Connect Google Ads to Claude in 2 minutes. Claude gets live campaign context to diagnose issues, recommend fixes, and execute approved Google Ads changes.",
  path: "/google-ads-claude",
  keywords: [
    "google ads claude",
    "claude google ads",
    "use claude for google ads",
    "claude ai google ads",
    "connect google ads to claude",
    "google ads mcp server",
    "claude mcp google ads",
  ],
});

const faqItems = [
  {
    question: "How do I use Claude for Google Ads with NotFair?",
    answer:
      "Add NotFair to your MCP config (one JSON snippet), connect your Google Ads account via OAuth at notfair.co, and Claude immediately gains live access to your campaigns. You can then ask Claude what is wrong, why performance changed, what to fix next, or to draft approved bid, keyword, negative, and ad changes — all in natural conversation.",
  },
  {
    question: "Does NotFair work with Claude Desktop, Claude Code, and Claude Cowork?",
    answer:
      "Yes. NotFair is a standard MCP server, so it works with any MCP-compatible Claude client. Add the same config snippet to Claude Desktop settings, your Claude Code MCP config, or Claude Cowork — it works identically in all three.",
  },
  {
    question: "What Google Ads data can Claude see through NotFair?",
    answer:
      "Claude gets live access to campaign performance, keyword bids and Quality Scores, search term reports, ad copy, spend data, impression share, and conversion tracking status. It reads your actual account data in real time — no exports or manual uploads needed.",
  },
  {
    question: "Can Claude make changes to my Google Ads account?",
    answer:
      "Yes, but only with your explicit approval at each step. Claude can propose bid changes, pause campaigns, add negative keywords, and write new ads — but every action is shown to you before it executes. You review and confirm. NotFair also logs every change so you can track impact.",
  },
  {
    question: "Is this an official Google or Anthropic integration?",
    answer:
      "NotFair is an independent product built on Anthropic's open Model Context Protocol (MCP) standard and the Google Ads API. It is not an official Google product. MCP is the open standard Anthropic created for connecting AI to external tools — any developer can build MCP servers, and NotFair is one focused entirely on Google Ads.",
  },
  {
    question: "What does setup actually take?",
    answer:
      "Under 2 minutes. Paste one JSON snippet into your MCP config, open notfair.co, click Connect Google Ads, complete the OAuth flow. That's it — Claude can now access your campaigns.",
  },
  {
    question: "Do I need to know how to code to use this?",
    answer:
      "No coding required. Editing a JSON config file is the most technical step — it's copying and pasting one snippet. The rest is standard Google OAuth and talking to Claude in plain English.",
  },
];

const jsonLd = [
  buildFaqJsonLd(faqItems),
  {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "NotFair",
    applicationCategory: "BusinessApplication",
    applicationSubCategory: "Google Ads Management Software",
    operatingSystem: "Web",
    description:
      "NotFair is a Google Ads MCP server for Claude. Connect your Google Ads account to Claude Desktop, Claude Code, or Claude Cowork so Claude can diagnose issues, recommend fixes, and manage approved campaign changes through natural conversation.",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
    },
    url: new URL("/google-ads-claude", SITE_URL).toString(),
    featureList: [
      "Live Google Ads campaign data access",
      "Natural language campaign diagnosis",
      "Wasted spend and structural issue detection",
      "Recommended bid, keyword, negative, and ad changes via Claude",
      "Works with Claude Desktop, Claude Code, Claude Cowork",
      "Reviewable changes with human approval",
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
      <GoogleAdsClaudePage />
    </>
  );
}
