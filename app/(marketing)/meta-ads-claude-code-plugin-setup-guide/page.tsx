import { MetaAdsClaudeCodePluginSetupPage } from "@/components/marketing/meta-ads-claude-code-plugin-setup-page";
import { buildMetadata, buildFaqJsonLd, SITE_URL } from "@/lib/seo";

export const metadata = buildMetadata({
  title: "Meta Ads Claude Code Plugin — Setup Guide for NotFair",
  description:
    "Step-by-step guide to install the NotFair plugin in Claude Code for Meta Ads. Run /ads to diagnose and manage Facebook + Instagram campaigns from the terminal — under 2 minutes, no config edits.",
  path: "/meta-ads-claude-code-plugin-setup-guide",
  keywords: [
    "meta ads claude code plugin",
    "facebook ads claude code",
    "instagram ads claude code",
    "claude code meta ads",
    "claude code plugin setup meta",
    "toprank claude code meta",
    "notfair claude code meta",
    "install claude code plugin meta",
  ],
});

const faqItems = [
  {
    question: "What is the NotFair Claude Code plugin for Meta Ads?",
    answer:
      "It's the same toprank Claude Code plugin that gives Claude Code live access to your ad accounts — once installed, /ads connects Claude to your Meta (Facebook + Instagram) campaigns, ad sets, ads, insights, and creative. You diagnose issues, recommend fixes, and optimize through chat in your terminal.",
  },
  {
    question: "How is this different from the Claude Connector?",
    answer:
      "The plugin is for Claude Code — Anthropic's terminal-based coding agent. The Claude Connector is for Claude.ai Web and Claude Cowork. Both use the same NotFair backend; the install flow is just different.",
  },
  {
    question: "How long does setup take?",
    answer:
      "Under 2 minutes. Run three slash commands inside Claude Code to add the marketplace, install the plugin, and reload, then run /ads — Claude opens your browser to sign in via Meta's OAuth flow. No API key to copy.",
  },
  {
    question: "Do I need to write any code?",
    answer:
      "No. Setup is entirely slash-command driven inside Claude Code. You'll paste a few commands — no JSON config edits, no environment variables, no scripts, no API keys.",
  },
  {
    question: "Is the plugin free?",
    answer:
      "Yes. Installing the toprank plugin and using it for Meta Ads is free with no credit card. Paid plans unlock higher usage limits and team features.",
  },
  {
    question: "Can Claude actually change my Meta ad accounts through the plugin?",
    answer:
      "Only with your explicit approval. Claude can propose pausing campaigns/ad sets/ads, adjusting budgets, or renaming entities — but every write action is shown to you first and requires confirmation. Read access is unrestricted; write access is gated.",
  },
  {
    question: "Can I use the same plugin for both Google and Meta?",
    answer:
      "Yes. The toprank plugin ships skills for both platforms. Once installed, /ads can read whichever platforms you've linked. Switch between them via the navbar account dropdown in the NotFair web app.",
  },
];

const jsonLd = [
  buildFaqJsonLd(faqItems),
  {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: "How to install the NotFair plugin in Claude Code for Meta Ads",
    description:
      "Install the NotFair plugin in Claude Code via the toprank marketplace to give Claude live access to diagnose and manage your Meta (Facebook + Instagram) ad accounts from the terminal.",
    totalTime: "PT2M",
    step: [
      {
        "@type": "HowToStep",
        position: 1,
        name: "Open Claude Code",
        text: "Open a terminal and start Claude Code. If you don't have it installed, follow Anthropic's install guide first.",
        url: new URL("/meta-ads-claude-code-plugin-setup-guide#step-1", SITE_URL).toString(),
      },
      {
        "@type": "HowToStep",
        position: 2,
        name: "Install the toprank plugin",
        text: "In Claude Code, run /plugin marketplace add nowork-studio/toprank, then /plugin install toprank@nowork-studio, then /reload-plugins to register the marketplace, install the NotFair plugin, and pick up the new commands.",
        url: new URL("/meta-ads-claude-code-plugin-setup-guide#step-2", SITE_URL).toString(),
      },
      {
        "@type": "HowToStep",
        position: 3,
        name: "Run /ads and link Meta",
        text: "Run /ads in Claude Code. It opens your browser to sign in. Choose to link Meta Ads — Claude redirects you through Meta's OAuth flow, then back to NotFair to pick which Meta ad accounts to expose.",
        url: new URL("/meta-ads-claude-code-plugin-setup-guide#step-3", SITE_URL).toString(),
      },
      {
        "@type": "HowToStep",
        position: 4,
        name: "Ask Claude about your Meta ads",
        text: "Try a prompt like 'List my top-spending Meta campaigns over the last 30 days and flag any with rising CPM.' Claude calls NotFair's Meta tools and answers with live data.",
        url: new URL("/meta-ads-claude-code-plugin-setup-guide#step-4", SITE_URL).toString(),
      },
    ],
  },
  {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "NotFair — Meta Ads Claude Code Plugin",
    applicationCategory: "BusinessApplication",
    applicationSubCategory: "Meta Ads Management Software",
    operatingSystem: "macOS, Linux, Windows",
    description:
      "Claude Code plugin that gives Anthropic's terminal coding agent live access to your Meta (Facebook + Instagram) ad accounts through NotFair.",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
    },
    url: new URL("/meta-ads-claude-code-plugin-setup-guide", SITE_URL).toString(),
    featureList: [
      "Claude Code plugin via the toprank marketplace",
      "Slash commands for Meta Ads audits and optimization",
      "Live Facebook + Instagram ad account access through MCP",
      "Single plugin works for both Google and Meta",
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
      <MetaAdsClaudeCodePluginSetupPage />
    </>
  );
}
