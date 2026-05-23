import { MetaAdsClaudePage } from "@/components/marketing/meta-ads-claude-page";
import { buildMetadata, buildFaqJsonLd, SITE_URL } from "@/lib/seo";

export const metadata = buildMetadata({
  title: "Meta Ads Claude MCP Server | NotFair",
  description:
    "Connect Meta Ads (Facebook & Instagram) to Claude in 2 minutes. Claude gets live campaign context to diagnose issues, recommend fixes, and execute approved Meta Ads changes.",
  path: "/meta-ads-claude",
  keywords: [
    "meta ads claude",
    "claude meta ads",
    "facebook ads claude",
    "instagram ads claude",
    "connect meta ads to claude",
    "meta ads mcp server",
    "claude mcp meta ads",
    "claude ai facebook ads",
  ],
});

const faqItems = [
  {
    question: "How do I use Claude for Meta Ads with NotFair?",
    answer:
      "Add NotFair to your MCP config (one JSON snippet), connect your Meta Ads account via OAuth at notfair.co, and Claude immediately gains live access to your campaigns, ad sets, and ads across Facebook and Instagram. You can then ask Claude what is wrong, why performance changed, what to fix next, or to draft approved budget, audience, and creative changes — all in natural conversation.",
  },
  {
    question: "Does NotFair work with Claude Desktop, Claude Code, and Claude Cowork?",
    answer:
      "Yes. NotFair is a standard MCP server, so it works with any MCP-compatible Claude client. Add the same config snippet to Claude Desktop settings, your Claude Code MCP config, or Claude Cowork — it works identically in all three.",
  },
  {
    question: "What Meta Ads data can Claude see through NotFair?",
    answer:
      "Claude gets live access to campaign performance, ad set targeting and budgets, ad creative, spend, frequency, CPM, CTR, conversions, and audience overlap signals across Facebook and Instagram. It reads your actual ad account data in real time — no exports or manual uploads needed.",
  },
  {
    question: "Can Claude make changes to my Meta Ads account?",
    answer:
      "Yes, but only with your explicit approval at each step. Claude can propose budget changes, pause campaigns or ad sets, update creative, and launch new campaigns — but every action is shown to you before it executes. You review and confirm. NotFair also logs every change so you can track impact.",
  },
  {
    question: "Is this an official Meta or Anthropic integration?",
    answer:
      "NotFair is an independent product built on Anthropic's open Model Context Protocol (MCP) standard and the Meta Marketing API. It is not an official Meta product. MCP is the open standard Anthropic created for connecting AI to external tools — any developer can build MCP servers, and NotFair is one focused on ad platforms.",
  },
  {
    question: "What does setup actually take?",
    answer:
      "Under 2 minutes. Paste one JSON snippet into your MCP config, open notfair.co, click Connect Meta Ads, complete the OAuth flow. That's it — Claude can now access your Meta ad accounts.",
  },
  {
    question: "Do I need to know how to code to use this?",
    answer:
      "No coding required. Editing a JSON config file is the most technical step — it's copying and pasting one snippet. The rest is standard Meta OAuth and talking to Claude in plain English.",
  },
];

const jsonLd = [
  buildFaqJsonLd(faqItems),
  {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "NotFair",
    applicationCategory: "BusinessApplication",
    applicationSubCategory: "Meta Ads Management Software",
    operatingSystem: "Web",
    description:
      "NotFair is a Meta Ads MCP server for Claude. Connect your Meta ad accounts (Facebook & Instagram) to Claude Desktop, Claude Code, or Claude Cowork so Claude can diagnose issues, recommend fixes, and manage approved campaign changes through natural conversation.",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
    },
    url: new URL("/meta-ads-claude", SITE_URL).toString(),
    featureList: [
      "Live Meta Ads campaign data access (Facebook & Instagram)",
      "Natural language campaign diagnosis",
      "Wasted spend and frequency-fatigue detection",
      "Recommended budget, audience, and creative changes via Claude",
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
      <MetaAdsClaudePage />
    </>
  );
}
