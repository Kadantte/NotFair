import type { FaqItem } from "@/lib/seo";

export type MarketingLink = {
  href: string;
  title: string;
  description: string;
};

export type LandingPageContent = {
  slug:
  | "ai-google-ads-agent"
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
      "Use NotFair as an AI Google Ads agent to inspect campaigns, diagnose issues, recommend optimizations, and execute approved changes.",
    keywords: [
      "AI Google Ads agent",
      "Google Ads AI agent",
      "AI Google Ads management",
      "AI Google Ads optimization",
    ],
    heroTitle: "An AI Google Ads agent that works with your existing workflow",
    heroDescription:
      "NotFair connects your Google Ads account to MCP-compatible AI clients so Claude can diagnose performance issues, recommend fixes, and keep campaign changes traceable.",
    highlights: [
      "Inspect campaigns and search terms without exporting reports by hand",
      "Use AI to diagnose what should change before you touch bids, budgets, or negatives",
      "Turn recommendations into approved, traceable campaign edits",
    ],
    sections: [
      {
        title: "What makes NotFair different from a generic chatbot",
        body:
          "NotFair is not just a prompt template. It is the connection layer between Google Ads and an MCP-compatible AI workflow, so your agent can work with live campaign context instead of screenshots or copied tables.",
      },
      {
        title: "Where teams use it first",
        body:
          "Most teams start by asking what is wrong: rising CPA, wasted search terms, weak campaign structure, missing negatives, or budget misallocation. From there, Claude can recommend fixes and draft the approved changes.",
      },
    ],
    faq: [
      {
        question: "What is an AI Google Ads agent?",
        answer:
          "It is a workflow where an AI system can inspect campaign data, diagnose account issues, recommend fixes, and execute approved optimizations with better context than a standalone chatbot.",
      },
      {
        question: "Does NotFair replace Google Ads specialists?",
        answer:
          "No. It is best used to speed up analysis, reporting, and optimization workflows while a human still reviews strategy and approves changes.",
      },
      {
        question: "Can NotFair make changes safely?",
        answer:
          "NotFair is designed around reviewable workflows and impact tracking so teams can see what changed and judge whether it helped.",
      },
    ],
    relatedLinks: [
      {
        href: "/google-ads-claude",
        title: "Google Ads + Claude",
        description: "Set up Claude with live Google Ads access in under 2 minutes via MCP.",
      },
      {
        href: "/connect",
        title: "Connect Google Ads",
        description: "Connect your account and let your AI agent diagnose issues and draft fixes.",
      },
      {
        href: "/google-ads-mcp",
        title: "Google Ads MCP",
        description: "See how NotFair works as a Google Ads MCP server.",
      },
    ],
  },
  "connect-google-ads-to-claude": {
    slug: "connect-google-ads-to-claude",
    title: "Connect Google Ads to Claude",
    description:
      "Use NotFair to connect Google Ads to Claude through MCP so Claude can inspect campaigns, diagnose issues, recommend fixes, and guide approved changes.",
    keywords: [
      "connect Google Ads to Claude",
      "Claude Google Ads",
      "Google Ads Claude MCP",
      "Claude Google Ads agent",
    ],
    heroTitle: "Connect Google Ads to Claude without building the plumbing yourself",
    heroDescription:
      "NotFair is the shortest path to getting Claude working with live Google Ads context through MCP, so you can move from vague account questions to specific approved fixes faster.",
    highlights: [
      "Connect Google Ads once and use Claude with live campaign context",
      "Ask what is wrong, why performance changed, and what to fix next",
      "Keep the workflow reviewable instead of blindly automating changes",
    ],
    sections: [
      {
        title: "What teams usually ask Claude first",
        body:
          "Common prompts include why CPA rose, what is wasting spend, which search terms need negatives, what campaign structure is weak, and what to fix before increasing budget.",
      },
      {
        title: "Why NotFair fits Claude workflows",
        body:
          "Claude is strongest when it has structured tools and context. NotFair provides the Google Ads connection layer plus a focused product flow for setup, change tracking, and account review.",
      },
    ],
    faq: [
      {
        question: "Can Claude directly manage Google Ads through NotFair?",
        answer:
          "Claude can analyze account context, recommend fixes, draft changes, and help drive approved workflows once NotFair is connected through MCP.",
      },
      {
        question: "What do I need before connecting Claude?",
        answer:
          "You need a Google Ads account and an MCP-compatible Claude workflow. NotFair handles the Google Ads side of the connection and setup flow.",
      },
      {
        question: "What is the fastest first use case?",
        answer:
          "Most teams start by asking Claude what is wrong with performance, then review its recommended fixes before moving into approved campaign changes.",
      },
    ],
    relatedLinks: [
      {
        href: "/google-ads-claude",
        title: "Google Ads + Claude",
        description: "The full Claude setup guide — MCP config, OAuth, and first prompts.",
      },
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
    ],
  },
  "connect-google-ads-to-chatgpt": {
    slug: "connect-google-ads-to-chatgpt",
    title: "Connect Google Ads to ChatGPT Workflows",
    description:
      "NotFair is built for teams trying to connect Google Ads to ChatGPT-style AI workflows through MCP-compatible tooling, with reviewable optimization and tracking.",
    keywords: [
      "connect Google Ads to ChatGPT",
      "ChatGPT Google Ads",
      "Google Ads ChatGPT workflow",
      "Google Ads AI chat workflow",
    ],
    heroTitle: "A cleaner path for Google Ads in ChatGPT-style AI workflows",
    heroDescription:
      "If you are searching for a way to connect Google Ads to ChatGPT, the real need is usually live campaign context inside an AI workflow. NotFair handles that connection through MCP-compatible tooling and keeps the optimization flow reviewable.",
    highlights: [
      "Built for teams that want live Google Ads context inside AI chat workflows",
      "Useful when you want less copying, fewer exports, and more structured analysis",
      "Designed around diagnosis, recommendations, and reviewable execution instead of opaque auto-pilot",
    ],
    sections: [
      {
        title: "Important positioning",
        body:
          "NotFair is centered on MCP-compatible clients and agent workflows. If your ChatGPT setup supports that model or you use a nearby MCP client, NotFair gives you the Google Ads connection layer you are actually looking for.",
      },
      {
        title: "What people usually mean by this query",
        body:
          "Most teams want to ask an AI system what is wrong with campaign performance, which search terms or structures are causing it, and what actions to take without manually stitching together data. That is the workflow NotFair is built to support.",
      },
    ],
    faq: [
      {
        question: "Does NotFair claim native ChatGPT-only support?",
        answer:
          "NotFair is designed around MCP-compatible AI workflows. This page targets the broader user intent of bringing Google Ads into an AI chat workflow while staying accurate about the connection model.",
      },
      {
        question: "Why keep this page if the tooling varies?",
        answer:
          "Because the underlying problem is consistent: teams want Google Ads context inside an AI workflow. NotFair solves the connection and review layer around that need.",
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
        description: "See the integration model NotFair is built around.",
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
      "Use NotFair for AI-assisted Google Ads optimization, from issue diagnosis and search term review to approved changes and impact review.",
    keywords: [
      "AI Google Ads optimization",
      "Google Ads optimization AI",
      "AI Google Ads management",
      "optimize Google Ads with AI",
    ],
    heroTitle: "Use AI for Google Ads optimization without giving up control",
    heroDescription:
      "NotFair helps teams use AI to diagnose wasted spend, review campaign issues, recommend fixes, and execute approved optimizations with better context and cleaner tracking.",
    highlights: [
      "Spot wasted spend, weak search terms, and structural issues faster",
      "Prioritize budget, bid, negative keyword, and landing-page opportunities",
      "Execute approved fixes and track what changed",
    ],
    sections: [
      {
        title: "The right role for AI in Google Ads optimization",
        body:
          "AI is most useful when it accelerates diagnosis, prioritization, and execution without replacing judgment. NotFair is built to surface what matters and keep the path to action visible.",
      },
      {
        title: "What optimization workflows fit best",
        body:
          "The strongest early use cases are performance diagnosis, quick-win audits, negative keyword ideas, search term review, campaign restructuring, and change tracking after an optimization pass.",
      },
    ],
    faq: [
      {
        question: "What does AI Google Ads optimization actually mean?",
        answer:
          "In practice it means using AI to analyze campaign data, diagnose likely issues, recommend fixes, and help a human move through approved optimization work faster.",
      },
      {
        question: "What should I optimize first?",
        answer:
          "Most teams start with high-spend zero-conversion areas, weak search terms, budget misallocation, and obvious campaign structure issues.",
      },
      {
        question: "How does NotFair help after changes are made?",
        answer:
          "NotFair keeps a record of changes and before/after context so teams can review whether a change helped instead of guessing later.",
      },
    ],
    relatedLinks: [
      {
        href: "/connect",
        title: "Connect Google Ads",
        description: "Connect your account and start diagnosing the highest-impact fixes.",
      },
      {
        href: "/ai-google-ads-agent",
        title: "AI Google Ads agent",
        description: "Start with the broader NotFair positioning.",
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
    question: "What is NotFair?",
    answer:
      "NotFair is a Google Ads diagnosis and execution layer for Claude and other MCP-compatible AI clients. It lets AI inspect your account, recommend fixes, draft campaign edits, and run approved changes through the Google Ads API.",
  },
  {
    question: "Who is NotFair built for?",
    answer:
      "NotFair is built for AI-native founders, marketers, agencies, and portfolio builders who want Claude to find issues, recommend fixes, and execute approved Google Ads changes without giving up final approval.",
  },
  {
    question: "What can NotFair do?",
    answer:
      "NotFair can pull campaign performance, analyze search terms, create and pause keywords, manage negatives, adjust bids and budgets, draft ads and ad groups, run scripts, and track approved changes.",
  },
  {
    question: "Does NotFair work with Claude and other AI tools?",
    answer:
      "Yes. NotFair uses the open MCP protocol, so it works with Claude Code, Claude Cowork, Cursor, Windsurf, and other MCP-compatible AI clients.",
  },
  {
    question: "Will NotFair change campaigns automatically?",
    answer:
      "No. NotFair is designed around approval-gated writes. It can analyze and draft freely, but campaign changes are shown for review before anything is written to Google Ads.",
  },
];
