import type { FaqItem } from "@/lib/seo";

export type MarketingLink = {
  href: string;
  title: string;
  description: string;
};

export type LandingPageContent = {
  slug:
    | "ai-google-ads-agent"
    | "google-ads-mcp"
    | "connect-google-ads-to-claude"
    | "connect-google-ads-to-chatgpt"
    | "ai-google-ads-optimization";
  title: string;
  description: string;
  keywords: string[];
  heroTitle: string;
  heroDescription: string;
  highlights: string[];
  sections: Array<{
    title: string;
    body: string;
  }>;
  faq: FaqItem[];
  relatedLinks: MarketingLink[];
};

export const landingPages: Record<LandingPageContent["slug"], LandingPageContent> = {
  "ai-google-ads-agent": {
    slug: "ai-google-ads-agent",
    title: "AI Google Ads Agent",
    description:
      "Use AdsAgent as an AI Google Ads agent to inspect campaigns, surface waste, recommend optimizations, and keep changes reviewable.",
    keywords: [
      "AI Google Ads agent",
      "Google Ads AI agent",
      "AI Google Ads management",
      "AI Google Ads optimization",
    ],
    heroTitle: "An AI Google Ads agent that works with your existing workflow",
    heroDescription:
      "AdsAgent connects your Google Ads account to MCP-compatible AI clients so you can ask better questions, spot wasted spend faster, and keep campaign changes traceable.",
    highlights: [
      "Inspect campaigns and search terms without exporting reports by hand",
      "Use AI to find quick wins before you touch bids, budgets, or negatives",
      "Keep a cleaner audit trail around optimization work",
    ],
    sections: [
      {
        title: "What makes AdsAgent different from a generic chatbot",
        body:
          "AdsAgent is not just a prompt template. It is the connection layer between Google Ads and an MCP-compatible AI workflow, so your agent can work with live campaign context instead of screenshots or copied tables.",
      },
      {
        title: "Where teams use it first",
        body:
          "Most teams start by asking for wasted-spend analysis, campaign summaries, negative keyword ideas, and prioritized fixes they can approve before execution.",
      },
    ],
    faq: [
      {
        question: "What is an AI Google Ads agent?",
        answer:
          "It is a workflow where an AI system can inspect campaign data, answer account questions, and recommend or execute approved optimizations with better context than a standalone chatbot.",
      },
      {
        question: "Does AdsAgent replace Google Ads specialists?",
        answer:
          "No. It is best used to speed up analysis, reporting, and optimization workflows while a human still reviews strategy and approves changes.",
      },
      {
        question: "Can AdsAgent make changes safely?",
        answer:
          "AdsAgent is designed around reviewable workflows and impact tracking so teams can see what changed and judge whether it helped.",
      },
    ],
    relatedLinks: [
      {
        href: "/google-ads-mcp",
        title: "Google Ads MCP",
        description: "See how AdsAgent works as a Google Ads MCP server.",
      },
      {
        href: "/ai-google-ads-optimization",
        title: "AI Google Ads optimization",
        description: "Learn how teams use AdsAgent to prioritize optimizations.",
      },
      {
        href: "/impact",
        title: "Impact tracking",
        description: "Review how AdsAgent records changes and before/after context.",
      },
    ],
  },
  "google-ads-mcp": {
    slug: "google-ads-mcp",
    title: "Google Ads MCP",
    description:
      "AdsAgent gives you a Google Ads MCP server so Claude, OpenClaw, and other MCP-compatible AI workflows can analyze campaigns and help manage changes.",
    keywords: [
      "Google Ads MCP",
      "Google Ads MCP server",
      "MCP Google Ads",
      "Google Ads for Claude MCP",
    ],
    heroTitle: "A Google Ads MCP server for AI-native campaign workflows",
    heroDescription:
      "If you want to connect Google Ads to an AI client without building a custom integration, AdsAgent gives you the MCP layer, campaign context, and a product flow built for optimization work.",
    highlights: [
      "Connect Google Ads to Claude, OpenClaw, and similar MCP clients",
      "Skip custom middleware just to expose campaign data to AI",
      "Move from analysis to tracked changes in one workflow",
    ],
    sections: [
      {
        title: "Why Google Ads MCP matters",
        body:
          "MCP gives AI tools a cleaner way to read campaign context and trigger approved actions. AdsAgent focuses that pattern specifically on Google Ads so teams can ask for performance analysis and optimization help in natural language.",
      },
      {
        title: "What you can do once connected",
        body:
          "Typical workflows include campaign health reviews, wasted-spend analysis, negative keyword recommendations, and safer bid or budget adjustments with human approval.",
      },
    ],
    faq: [
      {
        question: "What is Google Ads MCP?",
        answer:
          "It is an MCP integration layer that lets an AI client interact with Google Ads data and approved management actions in a structured way.",
      },
      {
        question: "Who is this page for?",
        answer:
          "Teams using Claude, OpenClaw, or other MCP-compatible AI tools who want live Google Ads context without building their own integration stack.",
      },
      {
        question: "Is AdsAgent only for read access?",
        answer:
          "No. AdsAgent supports analysis plus controlled optimization workflows, with change history and impact tracking designed to keep the process reviewable.",
      },
    ],
    relatedLinks: [
      {
        href: "/connect-google-ads-to-claude",
        title: "Connect Google Ads to Claude",
        description: "See the Claude-specific setup and workflow fit.",
      },
      {
        href: "/connect-google-ads-to-chatgpt",
        title: "Connect Google Ads to ChatGPT",
        description: "See the ChatGPT-style workflow positioning and caveats.",
      },
      {
        href: "/ai-google-ads-agent",
        title: "AI Google Ads agent",
        description: "Start with the higher-level product overview.",
      },
    ],
  },
  "connect-google-ads-to-claude": {
    slug: "connect-google-ads-to-claude",
    title: "Connect Google Ads to Claude",
    description:
      "Use AdsAgent to connect Google Ads to Claude through MCP so Claude can inspect campaigns, surface wasted spend, and guide approved changes.",
    keywords: [
      "connect Google Ads to Claude",
      "Claude Google Ads",
      "Google Ads Claude MCP",
      "Claude Google Ads agent",
    ],
    heroTitle: "Connect Google Ads to Claude without building the plumbing yourself",
    heroDescription:
      "AdsAgent is the shortest path to getting Claude working with live Google Ads context through MCP, so you can move from account questions to optimization decisions faster.",
    highlights: [
      "Connect Google Ads once and use Claude with live campaign context",
      "Ask for account summaries, waste analysis, and prioritized fixes",
      "Keep the workflow reviewable instead of blindly automating changes",
    ],
    sections: [
      {
        title: "What teams usually ask Claude first",
        body:
          "Common prompts include top spenders, zero-conversion waste, search term issues, and quick-win opportunities worth reviewing before anything changes in the account.",
      },
      {
        title: "Why AdsAgent fits Claude workflows",
        body:
          "Claude is strongest when it has structured tools and context. AdsAgent provides the Google Ads connection layer plus a focused product flow for setup, change tracking, and account review.",
      },
    ],
    faq: [
      {
        question: "Can Claude directly manage Google Ads through AdsAgent?",
        answer:
          "Claude can analyze account context and help drive approved workflows once AdsAgent is connected through MCP.",
      },
      {
        question: "What do I need before connecting Claude?",
        answer:
          "You need a Google Ads account and an MCP-compatible Claude workflow. AdsAgent handles the Google Ads side of the connection and setup flow.",
      },
      {
        question: "What is the fastest first use case?",
        answer:
          "Most teams start by asking Claude to summarize campaign performance and identify obvious wasted spend before moving into optimization work.",
      },
    ],
    relatedLinks: [
      {
        href: "/google-ads-mcp",
        title: "Google Ads MCP",
        description: "Understand the MCP layer behind the Claude workflow.",
      },
      {
        href: "/ai-google-ads-optimization",
        title: "AI Google Ads optimization",
        description: "See the optimization use cases teams usually pursue next.",
      },
      {
        href: "/impact",
        title: "Impact tracking",
        description: "Review how AdsAgent tracks changes after Claude-driven workflows.",
      },
    ],
  },
  "connect-google-ads-to-chatgpt": {
    slug: "connect-google-ads-to-chatgpt",
    title: "Connect Google Ads to ChatGPT Workflows",
    description:
      "AdsAgent is built for teams trying to connect Google Ads to ChatGPT-style AI workflows through MCP-compatible tooling, with reviewable optimization and tracking.",
    keywords: [
      "connect Google Ads to ChatGPT",
      "ChatGPT Google Ads",
      "Google Ads ChatGPT workflow",
      "Google Ads AI chat workflow",
    ],
    heroTitle: "A cleaner path for Google Ads in ChatGPT-style AI workflows",
    heroDescription:
      "If you are searching for a way to connect Google Ads to ChatGPT, the real need is usually live campaign context inside an AI workflow. AdsAgent handles that connection through MCP-compatible tooling and keeps the optimization flow reviewable.",
    highlights: [
      "Built for teams that want live Google Ads context inside AI chat workflows",
      "Useful when you want less copying, fewer exports, and more structured analysis",
      "Designed around reviewable recommendations instead of opaque auto-pilot",
    ],
    sections: [
      {
        title: "Important positioning",
        body:
          "AdsAgent is centered on MCP-compatible clients and agent workflows. If your ChatGPT setup supports that model or you use a nearby MCP client, AdsAgent gives you the Google Ads connection layer you are actually looking for.",
      },
      {
        title: "What people usually mean by this query",
        body:
          "Most teams want to ask an AI system about campaign performance, waste, search terms, and recommended actions without manually stitching together data. That is the workflow AdsAgent is built to support.",
      },
    ],
    faq: [
      {
        question: "Does AdsAgent claim native ChatGPT-only support?",
        answer:
          "AdsAgent is designed around MCP-compatible AI workflows. This page targets the broader user intent of bringing Google Ads into an AI chat workflow while staying accurate about the connection model.",
      },
      {
        question: "Why keep this page if the tooling varies?",
        answer:
          "Because the underlying problem is consistent: teams want Google Ads context inside an AI workflow. AdsAgent solves the connection and review layer around that need.",
      },
      {
        question: "What is the safer way to use AI here?",
        answer:
          "Use AI for analysis, prioritization, and recommendations first, then keep campaign changes explicit and reviewable rather than running blind automation.",
      },
    ],
    relatedLinks: [
      {
        href: "/google-ads-mcp",
        title: "Google Ads MCP",
        description: "See the integration model AdsAgent is built around.",
      },
      {
        href: "/connect-google-ads-to-claude",
        title: "Connect Google Ads to Claude",
        description: "Compare the more direct Claude-oriented workflow.",
      },
      {
        href: "/ai-google-ads-agent",
        title: "AI Google Ads agent",
        description: "Return to the product overview and primary use case.",
      },
    ],
  },
  "ai-google-ads-optimization": {
    slug: "ai-google-ads-optimization",
    title: "AI Google Ads Optimization",
    description:
      "Use AdsAgent for AI-assisted Google Ads optimization, from wasted-spend analysis and search term review to change tracking and impact review.",
    keywords: [
      "AI Google Ads optimization",
      "Google Ads optimization AI",
      "AI Google Ads management",
      "optimize Google Ads with AI",
    ],
    heroTitle: "Use AI for Google Ads optimization without giving up control",
    heroDescription:
      "AdsAgent helps teams use AI to identify wasted spend, review campaign issues, and move toward approved optimizations with better context and cleaner tracking.",
    highlights: [
      "Spot wasted spend and weak search terms faster",
      "Prioritize budget, bid, and negative keyword opportunities",
      "Track what changed so optimization work stays accountable",
    ],
    sections: [
      {
        title: "The right role for AI in Google Ads optimization",
        body:
          "AI is most useful when it accelerates analysis and prioritization, not when it replaces judgment. AdsAgent is built to surface what matters and keep the path to action visible.",
      },
      {
        title: "What optimization workflows fit best",
        body:
          "The strongest early use cases are campaign summaries, quick-win audits, negative keyword ideas, search term review, and change tracking after an optimization pass.",
      },
    ],
    faq: [
      {
        question: "What does AI Google Ads optimization actually mean?",
        answer:
          "In practice it means using AI to analyze campaign data, identify likely opportunities or waste, and help a human move through optimization work faster.",
      },
      {
        question: "What should I optimize first?",
        answer:
          "Most teams start with high-spend zero-conversion areas, weak search terms, budget misallocation, and obvious campaign structure issues.",
      },
      {
        question: "How does AdsAgent help after changes are made?",
        answer:
          "AdsAgent keeps a record of changes and before/after context so teams can review whether a change helped instead of guessing later.",
      },
    ],
    relatedLinks: [
      {
        href: "/ai-google-ads-agent",
        title: "AI Google Ads agent",
        description: "Start with the broader AdsAgent positioning.",
      },
      {
        href: "/impact",
        title: "Impact tracking",
        description: "See where AdsAgent records post-change context.",
      },
      {
        href: "/google-ads-mcp",
        title: "Google Ads MCP",
        description: "See the integration layer behind the optimization workflow.",
      },
    ],
  },
};

export const allLandingPages = Object.values(landingPages);

export function getLandingPage(slug: string) {
  return landingPages[slug as LandingPageContent["slug"]] ?? null;
}

export const homepageFaq: FaqItem[] = [
  {
    question: "What is AdsAgent?",
    answer:
      "AdsAgent is a Google Ads MCP server built for Claude. It connects your Google Ads account to Claude Code, Claude for Work, and other MCP-compatible AI clients so you can analyze campaigns, optimize spend, and manage changes through natural conversation.",
  },
  {
    question: "Who is AdsAgent built for?",
    answer:
      "Teams and founders who use Claude to manage their business and want to extend it to Google Ads. Instead of manually exporting CSVs and pasting them into chat, AdsAgent gives Claude live access to your campaign data.",
  },
  {
    question: "What can Claude do with AdsAgent?",
    answer:
      "Claude can pull campaign performance, analyze search terms, find wasted spend, recommend negative keywords, adjust bids, pause underperforming campaigns, and track the impact of every change — all through natural language with your approval at each step.",
  },
  {
    question: "Does AdsAgent work with other AI tools?",
    answer:
      "Yes. AdsAgent uses the open MCP protocol, so it works with any MCP-compatible client including Cursor, Windsurf, and custom agents built with the Claude Agent SDK. Claude Code and Claude for Work are the recommended primary clients.",
  },
  {
    question: "Why does AdsAgent use MCP?",
    answer:
      "MCP (Model Context Protocol) is the open standard created by Anthropic for connecting AI to external tools. It gives Claude structured access to Google Ads data and actions without custom integrations — one protocol that works everywhere.",
  },
];
