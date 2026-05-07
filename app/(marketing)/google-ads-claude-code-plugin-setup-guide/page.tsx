import { GoogleAdsClaudeCodePluginSetupPage } from "@/components/marketing/google-ads-claude-code-plugin-setup-page";
import { buildMetadata, buildFaqJsonLd, SITE_URL } from "@/lib/seo";
import { GOOGLE_ADS_AUDIT_PROMPT } from "@/lib/prompts";

export const metadata = buildMetadata({
  title: "Google Ads Claude Code Plugin — Setup Guide for NotFair",
  description:
    "Step-by-step guide to install the NotFair plugin in Claude Code. Run /ads to diagnose issues, recommend fixes, and manage approved Google Ads changes from the terminal — under 2 minutes, no config edits.",
  path: "/google-ads-claude-code-plugin-setup-guide",
  keywords: [
    "google ads claude code plugin",
    "claude code google ads",
    "claude code plugin setup",
    "claude code mcp google ads",
    "toprank claude code",
    "adsagent claude code",
    "install claude code plugin",
    "claude code marketplace",
  ],
});

const faqItems = [
  {
    question: "What is the NotFair Claude Code plugin?",
    answer:
      "It's a Claude Code plugin (distributed through the toprank marketplace) that gives Claude Code live access to your Google Ads account. Once installed, /ads connects Claude to your campaigns, keywords, search terms, and spend so you can diagnose issues, recommend fixes, and optimize through chat in your terminal.",
  },
  {
    question: "How is this different from the Claude Connector?",
    answer:
      "The plugin is for Claude Code — Anthropic's terminal-based coding agent. The Claude Connector is for Claude.ai Web and Claude Cowork. Both surfaces use the same NotFair backend, so the data and capabilities are identical; the install flow is just different.",
  },
  {
    question: "How long does setup take?",
    answer:
      "Under 2 minutes. Run three slash commands inside Claude Code to add the marketplace, install the plugin, and reload, then run /ads — Claude will open your browser to sign in with Google. No API key to copy.",
  },
  {
    question: "Do I need to write any code?",
    answer:
      "No. Setup is entirely slash-command driven inside Claude Code. You'll paste a few commands — no JSON config edits, no environment variables, no scripts, no API keys.",
  },
  {
    question: "Is the plugin free?",
    answer:
      "Yes. Installing the toprank plugin and running a free Google Ads audit is free with no credit card. Paid plans unlock higher usage limits and team features.",
  },
  {
    question: "Can Claude actually change my Google Ads account through the plugin?",
    answer:
      "Only with your explicit approval. Claude can propose pausing campaigns, adjusting bids, adding negative keywords, or writing new ads — but every write action is shown to you first and requires confirmation. Read access is unrestricted; write access is gated.",
  },
  {
    question: "What does toprank ship with the plugin?",
    answer:
      "Pre-made Google Ads and SEO skills that teach Claude how to diagnose, optimize, and manage campaigns — plus slash commands like /ads. Skills are reusable workflows that pair with the NotFair MCP tools to give Claude domain expertise out of the box.",
  },
];

const jsonLd = [
  buildFaqJsonLd(faqItems),
  {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: "How to install the NotFair plugin in Claude Code",
    description:
      "Install the NotFair plugin in Claude Code via the toprank marketplace to give Claude live access to diagnose and manage your Google Ads account from the terminal.",
    totalTime: "PT2M",
    step: [
      {
        "@type": "HowToStep",
        position: 1,
        name: "Open Claude Code",
        text: "Open a terminal and start Claude Code. If you don't have it installed, follow Anthropic's install guide first.",
        url: new URL("/google-ads-claude-code-plugin-setup-guide#step-1", SITE_URL).toString(),
      },
      {
        "@type": "HowToStep",
        position: 2,
        name: "Install the toprank plugin",
        text: "In Claude Code, run /plugin marketplace add nowork-studio/toprank, then /plugin install toprank@nowork-studio, then /reload-plugins to register the marketplace, install the NotFair plugin, and pick up the new commands.",
        url: new URL("/google-ads-claude-code-plugin-setup-guide#step-2", SITE_URL).toString(),
      },
      {
        "@type": "HowToStep",
        position: 3,
        name: "Run /ads",
        text: "Run /ads in Claude Code. It opens your browser to sign in with Google and connect NotFair — no API key to copy. If the command doesn't appear, restart Claude Code first.",
        url: new URL("/google-ads-claude-code-plugin-setup-guide#step-3", SITE_URL).toString(),
      },
      {
        "@type": "HowToStep",
        position: 4,
        name: "Ask Claude about your Google Ads",
        text: `Try a prompt like '${GOOGLE_ADS_AUDIT_PROMPT}' Claude calls NotFair tools and answers with live data.`,
        url: new URL("/google-ads-claude-code-plugin-setup-guide#step-4", SITE_URL).toString(),
      },
    ],
  },
  {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "NotFair — Google Ads Claude Code Plugin",
    applicationCategory: "BusinessApplication",
    applicationSubCategory: "Google Ads Management Software",
    operatingSystem: "macOS, Linux, Windows",
    description:
      "Claude Code plugin that gives Anthropic's terminal coding agent live access to your Google Ads account through NotFair.",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
    },
    url: new URL("/google-ads-claude-code-plugin-setup-guide", SITE_URL).toString(),
    featureList: [
      "Claude Code plugin via the toprank marketplace",
      "Slash commands for Google Ads audits and optimization",
      "Live Google Ads account access through MCP",
      "Pre-made Google Ads and SEO skills",
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
      <GoogleAdsClaudeCodePluginSetupPage />
    </>
  );
}
