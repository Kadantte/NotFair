import { GoogleAdsCodexPage } from "@/components/marketing/google-ads-codex-page";
import { buildMetadata, buildFaqJsonLd, SITE_URL } from "@/lib/seo";

export const metadata = buildMetadata({
  title: "OpenAI Codex for Google Ads — AI Agent | NotFair",
  description:
    "Connect OpenAI Codex to Google Ads with NotFair. Live campaign access from your terminal — diagnose issues, recommend fixes, and approve every change.",
  path: "/google-ads-codex",
  keywords: [
    "codex google ads",
    "google ads codex",
    "use codex for google ads",
    "codex ai google ads",
    "google ads mcp codex",
    "codex google ads agent",
  ],
});

const faqItems = [
  {
    question: "What is the NotFair Codex integration?",
    answer:
      "It's an MCP (Model Context Protocol) server that gives OpenAI's Codex CLI live access to your Google Ads account. One terminal command wires it up — Codex can then diagnose issues, recommend fixes, and propose changes you approve in chat.",
  },
  {
    question: "How is this different from the Claude integration?",
    answer:
      "Same backend, different client. The Codex CLI calls the NotFair MCP server using OpenAI's MCP support. The Claude Connector and Claude Code plugin call the same server from Anthropic's clients. Capabilities are identical — only the client differs.",
  },
  {
    question: "What kinds of Google Ads tasks can Codex handle?",
    answer:
      "Codex can audit campaigns, surface wasted spend, find missing negatives, propose bid adjustments, and draft new ad copy. It pulls live data from your account through NotFair's MCP tools, so answers are grounded in your real numbers — not generic best practices. Anything that touches your account is shown to you for approval before it runs.",
  },
  {
    question: "Who is OpenAI Codex for Google Ads built for?",
    answer:
      "Developers and technical marketers who already live in the terminal. If you run Codex CLI for code, adding NotFair lets you treat your Google Ads account the same way — describe what you want, see live data, approve changes. No CSV exports, no dashboard hopping.",
  },
  {
    question: "Is this free?",
    answer:
      "Yes. Adding NotFair to Codex and running a Google Ads audit is free with no credit card. Paid plans unlock higher usage limits and team features.",
  },
  {
    question: "Can Codex actually change my Google Ads account?",
    answer:
      "Only with your explicit approval. Codex can propose pausing campaigns, adjusting bids, adding negative keywords, or writing new ads — but every write action is shown to you first and requires your confirmation. Read access is unrestricted; write access is gated.",
  },
];

const jsonLd = [
  buildFaqJsonLd(faqItems),
  {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "NotFair — Google Ads for OpenAI Codex",
    applicationCategory: "BusinessApplication",
    applicationSubCategory: "Google Ads Management Software",
    operatingSystem: "macOS, Linux, Windows",
    description:
      "NotFair is a Google Ads MCP server for OpenAI's Codex CLI. Connect your Google Ads account to Codex so it can diagnose issues, recommend fixes, and manage approved campaign changes from your terminal.",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
    },
    url: new URL("/google-ads-codex", SITE_URL).toString(),
    featureList: [
      "Live Google Ads campaign data access",
      "Natural language campaign diagnosis from the terminal",
      "Wasted spend and structural issue detection",
      "Recommended bid, keyword, negative, and ad changes via Codex",
      "Reviewable changes with human approval before execution",
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
      <GoogleAdsCodexPage />
    </>
  );
}
