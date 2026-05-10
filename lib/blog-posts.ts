import type { FaqItem } from "@/lib/seo";

export type BlogPost = {
  slug: string;
  title: string;
  seoTitle: string;
  description: string;
  keywords: string[];
  publishedAt: string;
  updatedAt: string;
  author: {
    name: string;
    role: string;
  };
  content: BlogSection[];
  faq: FaqItem[];
  relatedLinks: Array<{
    href: string;
    title: string;
    description: string;
  }>;
};

export type BlogSection = {
  type: "text" | "heading" | "subheading" | "list" | "callout" | "code";
  content: string;
  items?: string[];
  language?: string;
};

export const blogPosts: Record<string, BlogPost> = {
  "can-claude-manage-google-ads": {
    slug: "can-claude-manage-google-ads",
    title: "Can Claude Manage Google Ads? (Short Answer: Yes)",
    seoTitle: "Can Claude Manage Google Ads? (Yes — Here's How)",
    description:
      "Yes — Claude can read, audit, and manage Google Ads through an MCP server. What it can do, what it can't, and how to set it up in 5 minutes.",
    keywords: [
      "can claude manage google ads",
      "claude google ads",
      "claude manage google ads",
      "ai manage google ads",
    ],
    publishedAt: "2026-04-29",
    updatedAt: "2026-04-29",
    author: { name: "NotFair Team", role: "AI ads infrastructure" },
    content: [
      {
        type: "text",
        content:
          "Yes. Claude can manage Google Ads — read account data, run audits, draft ad copy, pause keywords, adjust bids, add negatives, and apply most write operations available in the Google Ads API. The connection runs through an MCP (Model Context Protocol) server that bridges Claude to Google's API. Setup takes about 5 minutes.",
      },
      {
        type: "text",
        content:
          "The most common path uses NotFair, a hosted MCP server that handles OAuth and the Google Ads developer token for you. Once connected, Claude has access to ~40 tools split across read (audits, search terms, change history) and write (pause, bulk update bids, negatives, RSAs).",
      },
      {
        type: "heading",
        content: "What Claude can manage",
      },
      {
        type: "list",
        content: "",
        items: [
          "Audits — full account health diagnosis in under a minute, including waste analysis, search term review, and quality score breakdown.",
          "Bids — increase or decrease bids on individual keywords, ad groups, or in bulk by filter expressions.",
          "Negatives — find irrelevant search terms and add them as negative keywords across one or many campaigns.",
          "Campaign state — pause and enable campaigns, ad groups, keywords, and ads.",
          "Ad copy — generate RSA headlines and descriptions, A/B test variants, update final URLs.",
          "Budgets and bidding strategies — change budgets, switch between bid strategies, link strategies to campaigns.",
          "Change history — query \"what changed in this account this week?\" and roll back specific edits.",
        ],
      },
      {
        type: "heading",
        content: "What Claude can't manage (yet)",
      },
      {
        type: "list",
        content: "",
        items: [
          "Billing and payment methods — outside the Google Ads API surface; you still manage these in the Google Ads UI.",
          "Account-level user permissions — adding or removing users on the account itself.",
          "Some Performance Max optimizations — Google reserves much of the PMax tuning to its internal systems.",
          "Strategic decisions — Claude can recommend reallocating budget from a losing campaign to a winning one, but the call is yours.",
        ],
      },
      {
        type: "heading",
        content: "How to give Claude access to your Google Ads account",
      },
      {
        type: "text",
        content:
          "Three steps: sign in to NotFair with the Google identity that has Ads access at notfair.co/connect, pick which customer IDs Claude should manage, and add the connector to Claude Desktop with one click. Detailed walkthrough — including ChatGPT/Codex, Claude Code, and Cursor setup — is in the connect-Google-Ads-to-Claude guide.",
      },
      {
        type: "heading",
        content: "Should Claude manage your Google Ads autonomously?",
      },
      {
        type: "text",
        content:
          "No. Read access can run autonomously — Claude reading audits and surfacing recommendations is safe. Write access should not. A misread instruction that bulk-pauses campaigns can burn budget the same way a junior media buyer with bad context can. Use approval gates for the first month, build trust on read-only audits, and graduate write tools one at a time.",
      },
      {
        type: "heading",
        content: "FAQ",
      },
    ],
    faq: [
      {
        question: "Can Claude run Google Ads completely on its own?",
        answer:
          "Technically yes if you grant write access without approval gates. Practically no — you should keep a human in the loop on budget changes, bid strategy switches, and campaign state changes for at least the first 30 days.",
      },
      {
        question: "Does Claude need a developer token to access Google Ads?",
        answer:
          "Not directly. NotFair holds an approved developer token and proxies API calls under it. You only complete the OAuth flow with your Google account.",
      },
      {
        question: "Can Claude manage multiple Google Ads accounts?",
        answer:
          "Yes. NotFair supports multiple customer IDs including clients under a manager (MCC) account, and Claude can switch between them by name.",
      },
      {
        question: "Is Claude better at Google Ads than a human media buyer?",
        answer:
          "Not as a replacement, but it is faster at structural diagnosis. A 3-hour manual audit becomes a 1-minute conversation. The judgment call on what to fix and how aggressively still benefits from human context.",
      },
    ],
    relatedLinks: [
      { href: "/connect", title: "Connect Google Ads", description: "Start the OAuth flow and pick which accounts Claude can manage." },
      { href: "/blog/connect-google-ads-to-claude", title: "How to Connect Google Ads to Claude", description: "Step-by-step setup for Claude Desktop, Claude Code, ChatGPT/Codex, and any MCP client." },
      { href: "/blog/google-ads-ai-agent", title: "Google Ads AI Agent: What It Actually Does", description: "What an AI agent can realistically do for ad accounts — diagnose waste, find negative keyword gaps, and optimize bids with human review." },
    ],
  },
  "does-claude-work-with-google-ads": {
    slug: "does-claude-work-with-google-ads",
    title: "Does Claude Work With Google Ads?",
    seoTitle: "Does Claude Work With Google Ads? (Yes, Here's How)",
    description:
      "Yes. Claude works with Google Ads through an MCP server. Which Claude products are supported, what's required, and the 5-minute setup.",
    keywords: [
      "does claude work with google ads",
      "claude google ads compatibility",
      "claude google ads support",
      "claude with google ads",
    ],
    publishedAt: "2026-04-29",
    updatedAt: "2026-04-29",
    author: { name: "NotFair Team", role: "AI ads infrastructure" },
    content: [
      {
        type: "text",
        content:
          "Yes — Claude works with Google Ads. Claude does not have a built-in Google Ads connector from Anthropic, but it can connect to Google Ads through an MCP (Model Context Protocol) server. The most common path is NotFair, a hosted MCP server that handles OAuth and the Google Ads developer token. Setup takes about 5 minutes.",
      },
      {
        type: "heading",
        content: "Which Claude products work with Google Ads?",
      },
      {
        type: "list",
        content: "",
        items: [
          "Claude Desktop — supported via the Connectors UI. One-click install through notfair.co/connect/claude-connector.",
          "Claude Web (claude.ai) — supported via the same hosted connector. No local config required.",
          "Claude Cowork — supported. Same connector setup.",
          "Claude Code (CLI) — supported via the AdsAgent plugin: claude plugin install nowork-studio/adsagent-plugin.",
          "Claude API (programmatic) — supported by configuring the NotFair MCP endpoint as a tool source in your API client.",
        ],
      },
      {
        type: "heading",
        content: "What you need to make it work",
      },
      {
        type: "list",
        content: "",
        items: [
          "A Google Ads account with at least one active customer ID.",
          "A Google identity that has access to that account (direct or via a manager / MCC account).",
          "Any current Claude product. Older Claude builds before Connectors landed do not support MCP — update Claude Desktop if the install fails.",
          "About 5 minutes for the OAuth flow and connector install.",
        ],
      },
      {
        type: "heading",
        content: "What does not work",
      },
      {
        type: "list",
        content: "",
        items: [
          "Claude cannot read your Google Ads account by URL or screenshot. Pasting an Ads dashboard URL into Claude does nothing without an MCP connection.",
          "Claude cannot use the Google Ads UI directly. Browser-use style agents can drive the UI, but the MCP path is faster, safer, and 100x more reliable.",
          "Older Claude versions without MCP support cannot connect to Google Ads even with NotFair installed. Update Claude before troubleshooting.",
        ],
      },
      {
        type: "heading",
        content: "How does Claude actually talk to Google Ads?",
      },
      {
        type: "text",
        content:
          "Claude does not call the Google Ads API directly. It calls an MCP server (NotFair), which calls the Google Ads API on your behalf. The chain: you talk to Claude, Claude calls NotFair tools, NotFair calls Google Ads. This separation is what lets the MCP server enforce auth, scope, and approval gates without Claude needing API credentials.",
      },
      {
        type: "heading",
        content: "FAQ",
      },
    ],
    faq: [
      {
        question: "Does Claude have a built-in Google Ads connector?",
        answer:
          "No. As of April 2026, Anthropic has not shipped a first-party Google Ads connector. Connection happens via third-party MCP servers like NotFair.",
      },
      {
        question: "Does ChatGPT also work with Google Ads?",
        answer:
          "Yes — through the same MCP server, exposed via the Codex connector. The same NotFair connection can power Claude and ChatGPT simultaneously.",
      },
      {
        question: "Will my Google Ads data be sent to Anthropic?",
        answer:
          "Tool call inputs and outputs flow through Claude (which is hosted by Anthropic) the same way any conversation does. Anthropic's data retention policies apply. NotFair only sends Google Ads data Claude requests via tool calls — not your full account.",
      },
      {
        question: "What's the simplest way to test if Claude works with my account?",
        answer:
          "Sign in at notfair.co/connect with the demo flow (no Google Ads account required) and ask Claude \"audit my account.\" The demo uses simulated ecommerce data and confirms the integration works in your Claude client.",
      },
    ],
    relatedLinks: [
      { href: "/connect", title: "Connect Google Ads", description: "Start the OAuth flow and pick which accounts Claude can manage." },
      { href: "/blog/connect-google-ads-to-claude", title: "How to Connect Google Ads to Claude", description: "Step-by-step setup for every Claude surface plus ChatGPT/Codex and Cursor." },
      { href: "/blog/what-is-mcp", title: "What Is MCP (Model Context Protocol)?", description: "The open standard behind every Claude integration." },
    ],
  },
  "is-there-an-mcp-for-google-ads": {
    slug: "is-there-an-mcp-for-google-ads",
    title: "Is There an MCP Server for Google Ads?",
    seoTitle: "Is There an MCP Server for Google Ads? (Yes)",
    description:
      "Yes — several MCP servers connect Google Ads to Claude, ChatGPT, Cursor, and other AI clients. The current landscape and which one to use.",
    keywords: [
      "is there an mcp for google ads",
      "google ads mcp",
      "mcp google ads",
      "google ads model context protocol",
    ],
    publishedAt: "2026-04-29",
    updatedAt: "2026-04-29",
    author: { name: "NotFair Team", role: "AI ads infrastructure" },
    content: [
      {
        type: "text",
        content:
          "Yes — multiple MCP (Model Context Protocol) servers connect Google Ads to AI clients. As of April 2026 the options fall into three buckets: hosted production-grade servers (NotFair), community open-source wrappers on GitHub, and roll-your-own builds on top of the Google Ads API and the official MCP SDK.",
      },
      {
        type: "heading",
        content: "What's available right now",
      },
      {
        type: "list",
        content: "",
        items: [
          "NotFair — hosted MCP server with ~40 read and write tools, one-click OAuth, MCC support, sandboxed GAQL execution, and approval gates on destructive operations. Used by individual marketers and agencies.",
          "Community open-source servers — published by individual developers since late 2024. Quality and tool coverage vary; most are read-focused thin wrappers around the official client libraries.",
          "Roll-your-own — build directly on top of the Google Ads API using the official MCP SDK (TypeScript or Python). Realistic effort: 2–4 weeks plus the Google developer token application.",
        ],
      },
      {
        type: "heading",
        content: "Which one should you use?",
      },
      {
        type: "list",
        content: "",
        items: [
          "Use NotFair if you want to be auditing a real account in 5 minutes without standing up infrastructure or applying for a Google developer token.",
          "Use a community server if you already have an approved developer token, only need read tools, and want full code control.",
          "Roll your own if you have specific compliance, data-residency, or bespoke-tool requirements that the existing options don't meet.",
        ],
      },
      {
        type: "heading",
        content: "Is there an official Google MCP server?",
      },
      {
        type: "text",
        content:
          "No. As of April 2026, Google has not published a first-party MCP server for Google Ads. All available options are third-party — built by NotFair or by individual community developers.",
      },
      {
        type: "heading",
        content: "Is there an Anthropic-published MCP server for Google Ads?",
      },
      {
        type: "text",
        content:
          "No. Anthropic publishes the MCP specification and SDKs, but not vertical MCP servers themselves. Third-party servers like NotFair fill that role for Google Ads.",
      },
      {
        type: "heading",
        content: "FAQ",
      },
    ],
    faq: [
      {
        question: "How many MCP servers exist for Google Ads?",
        answer:
          "A handful of public ones as of April 2026. NotFair is the most actively maintained hosted option. Several community open-source wrappers exist on GitHub. The number is growing — MCP is still a young protocol.",
      },
      {
        question: "Can I use any MCP server with Claude?",
        answer:
          "Most MCP servers work with Claude Desktop, Claude Code, and Claude Cowork. Some only support stdio transport (works with Claude Code, Cursor) and not HTTP/SSE (needed for Claude Desktop). Check the server's docs before installing.",
      },
      {
        question: "Do I need a developer token to use any Google Ads MCP server?",
        answer:
          "Hosted servers like NotFair handle the developer token for you. Community open-source servers and roll-your-own builds require you to apply for your own — typically a 1–2 week Google approval process.",
      },
      {
        question: "What's the most production-ready Google Ads MCP server?",
        answer:
          "NotFair, as of April 2026. It's the only one we know of with a hosted OAuth flow, MCC support, sandboxed GAQL, and approval-gated write tools. Community options are catching up.",
      },
    ],
    relatedLinks: [
      { href: "/google-ads-mcp", title: "NotFair Google Ads MCP Server", description: "The hosted server — connect Google Ads in one OAuth flow." },
      { href: "/blog/google-ads-mcp-servers-compared", title: "Google Ads MCP Servers Compared", description: "Decision matrix for picking the right MCP server for your use case." },
      { href: "/blog/what-is-mcp", title: "What Is MCP (Model Context Protocol)?", description: "The open standard behind every Claude integration." },
    ],
  },
  "what-is-mcp-for-google-ads": {
    slug: "what-is-mcp-for-google-ads",
    title: "What Is MCP for Google Ads?",
    seoTitle: "What Is MCP for Google Ads? Plain-English Explainer",
    description:
      "MCP for Google Ads is the open-standard interface that lets AI assistants like Claude read and act on your campaigns. Plain-English explainer + setup.",
    keywords: [
      "what is mcp for google ads",
      "mcp google ads",
      "google ads model context protocol",
      "model context protocol google ads",
    ],
    publishedAt: "2026-04-29",
    updatedAt: "2026-04-29",
    author: { name: "NotFair Team", role: "AI ads infrastructure" },
    content: [
      {
        type: "text",
        content:
          "MCP for Google Ads is an MCP (Model Context Protocol) server that exposes Google Ads API operations as structured tools an AI assistant can call. Plug it into Claude, ChatGPT, Cursor, or any MCP-compatible client and the assistant can read campaigns, run audits, pause keywords, adjust bids — all from a normal conversation.",
      },
      {
        type: "text",
        content:
          "The Model Context Protocol itself is an open standard from Anthropic that defines how AI clients connect to tools. Think of it as USB-C for AI. \"MCP for Google Ads\" is a specific server implementation that speaks the protocol on one side and the Google Ads API on the other.",
      },
      {
        type: "heading",
        content: "What does an MCP for Google Ads do?",
      },
      {
        type: "list",
        content: "",
        items: [
          "Translates natural language into Google Ads API calls — \"audit my account\" becomes a parallel GAQL fan-out across spend, search terms, and quality scores.",
          "Holds the Google Ads developer token (hosted servers) so individual users do not need to apply to Google.",
          "Manages OAuth — one click to grant read/write scope; revocable through Google's account settings.",
          "Enforces approval gates on destructive operations — pausing campaigns, deleting assets, big budget changes.",
          "Exposes both read tools (audits, reports, change history) and write tools (pause, bid update, negative keywords, RSAs).",
        ],
      },
      {
        type: "heading",
        content: "Why MCP and not just the Google Ads API directly?",
      },
      {
        type: "text",
        content:
          "The Google Ads API is built for human developers writing code. MCP is built for AI clients picking tools at runtime. The MCP layer makes Google Ads accessible to any compatible AI without per-client integration code — connect once, use anywhere.",
      },
      {
        type: "text",
        content:
          "MCP also adds the safety layer the Google Ads API does not have on its own: approval flows, scoped auth, change history, and rollback. The raw API will let an AI delete a campaign with a single call. A well-designed MCP server requires confirmation first.",
      },
      {
        type: "heading",
        content: "How do you actually use one?",
      },
      {
        type: "text",
        content:
          "Three steps: pick an MCP server (the simplest is NotFair, hosted), authenticate with Google through the server's OAuth flow, and add the server to your AI client. From that point on, you can ask \"why did CPA rise this week?\" or \"pause keywords with zero conversions in 90 days\" and the AI will route the call to the right tool.",
      },
      {
        type: "heading",
        content: "FAQ",
      },
    ],
    faq: [
      {
        question: "Is MCP for Google Ads the same as Google's AI features?",
        answer:
          "No. Smart Bidding, Performance Max, and other Google-built AI features run inside the Google Ads platform. MCP for Google Ads is what lets external AI assistants — Claude, ChatGPT, Cursor — read and act on your account. They are complementary, not competing.",
      },
      {
        question: "Does MCP work with Microsoft Ads or Meta Ads?",
        answer:
          "Yes — separate servers exist or are being built for those platforms. MCP is a generic protocol; each ad platform needs its own server implementation.",
      },
      {
        question: "Is MCP for Google Ads free?",
        answer:
          "The MCP protocol is free and open. NotFair's hosted server is free during the public beta. Community open-source servers are free but require you to bring your own Google developer token.",
      },
      {
        question: "What client should I use to connect MCP for Google Ads?",
        answer:
          "Claude Desktop is the easiest entry point — one-click install via the Connectors UI. Claude Code, ChatGPT (via Codex), and Cursor all also work.",
      },
    ],
    relatedLinks: [
      { href: "/blog/what-is-mcp", title: "What Is MCP (Model Context Protocol)?", description: "The general MCP protocol explained — clients, servers, tools, and a real Google Ads example." },
      { href: "/blog/connect-google-ads-to-claude", title: "How to Connect Google Ads to Claude", description: "Step-by-step setup for every Claude surface plus ChatGPT/Codex and Cursor." },
      { href: "/google-ads-mcp", title: "NotFair Google Ads MCP Server", description: "The hosted MCP server — connect Google Ads in one OAuth flow." },
    ],
  },
  "can-ai-run-google-ads-campaigns": {
    slug: "can-ai-run-google-ads-campaigns",
    title: "Can AI Run Google Ads Campaigns?",
    seoTitle: "Can AI Run Google Ads Campaigns? (Honest Answer)",
    description:
      "Yes, but with limits. What AI can and cannot do for Google Ads, where it adds the most value, and the right human-in-the-loop pattern for ad spend.",
    keywords: [
      "can ai run google ads",
      "ai run google ads campaigns",
      "ai google ads management",
      "ai manage google ads",
    ],
    publishedAt: "2026-04-29",
    updatedAt: "2026-04-29",
    author: { name: "NotFair Team", role: "AI ads infrastructure" },
    content: [
      {
        type: "text",
        content:
          "Yes — but with limits. AI can run most operational tasks in Google Ads through an MCP server: audits, search term review, negative keyword management, bid adjustments, ad copy generation, and campaign state changes. AI should not run autonomously on budget changes, bid strategy switches, or creative decisions without human review. The right pattern is AI-recommends-human-approves, not AI-decides-and-executes.",
      },
      {
        type: "heading",
        content: "What AI can run well",
      },
      {
        type: "list",
        content: "",
        items: [
          "Account audits — diagnose waste, find negative keyword gaps, identify low-quality landing pages. Faster and more thorough than manual review.",
          "Search term cleanup — pull the search terms report, group bad terms by theme, propose negative keyword lists.",
          "Bid analysis — surface device, dayparting, and auction-insights opportunities that take 4–5 manual reports to find.",
          "Ad copy generation — create RSA variants, A/B test headlines, refresh stale creative.",
          "Reporting — answer \"what changed last week?\" in one query against the change history.",
        ],
      },
      {
        type: "heading",
        content: "What AI should not run autonomously",
      },
      {
        type: "list",
        content: "",
        items: [
          "Budget changes — a misread instruction can burn thousands before you notice. Always require approval.",
          "Bid strategy switches — tCPA to tROAS swaps reset learning periods. Big consequences, easy to misjudge.",
          "Pausing high-volume campaigns — even \"underperforming\" campaigns can be intentionally throttled because of business context the AI doesn't have.",
          "Creative direction at the brand level — AI is good at variants of an existing voice, not at deciding what voice to use.",
          "Reallocation across product lines — strategic capital allocation needs human judgment.",
        ],
      },
      {
        type: "heading",
        content: "The right pattern: review-first, then graduate",
      },
      {
        type: "text",
        content:
          "Start in read-only mode. Let AI run audits and surface recommendations for the first two weeks. Review what it suggests; calibrate against your judgment. Then enable low-stakes write tools — adding negative keywords, pausing keywords with zero conversions over 90 days, ad copy refreshes. Keep approval gates on bid strategies, budgets, and campaign state changes for the first month.",
      },
      {
        type: "text",
        content:
          "Trust is earned incrementally. We've seen accounts where AI was running approved write tools autonomously after 30 days, with the operator only reviewing weekly summaries. That's the goal — not day-one autonomy.",
      },
      {
        type: "heading",
        content: "What about Google's own AI features?",
      },
      {
        type: "text",
        content:
          "Smart Bidding, Performance Max, and the AI features inside Google Ads are different from external AI agents like Claude. They optimize within their narrow scope and don't explain why. External AI agents read across your whole account, explain their reasoning, and can be reviewed before acting. Use both — Smart Bidding for bid execution, an external AI for diagnosis and oversight.",
      },
      {
        type: "heading",
        content: "FAQ",
      },
    ],
    faq: [
      {
        question: "Can AI replace a Google Ads media buyer?",
        answer:
          "Not yet — and probably not entirely. AI is excellent at structural diagnosis and operational execution. It is weaker at strategy, creative judgment, and integrating context the account data doesn't capture. The strongest pattern is one media buyer plus an AI agent doing the work of a 3-person team.",
      },
      {
        question: "Will AI hurt my Google Ads performance?",
        answer:
          "Only if you let it run unchecked. AI with approval gates and a slow trust-building ramp consistently improves accounts because it surfaces waste no human has time to find. The risk comes from autonomous-mode rollouts on day one.",
      },
      {
        question: "Can AI create new Google Ads campaigns from scratch?",
        answer:
          "Technically yes — most MCP servers expose campaign-creation tools. We don't recommend it. AI is much better at optimizing existing structure than designing it. Have a human define the campaign architecture; let AI handle the keywords, copy, and ongoing optimization.",
      },
      {
        question: "What's the smallest account where AI is worth using?",
        answer:
          "$1K/month and up sees clear value from audits and search term cleanup. Below that, the AI is still useful but the marginal gain over manual management is smaller because there's less waste to find.",
      },
    ],
    relatedLinks: [
      { href: "/blog/google-ads-ai-agent", title: "Google Ads AI Agent: What It Actually Does", description: "What AI agents can realistically do for ad accounts." },
      { href: "/blog/connect-google-ads-to-claude", title: "How to Connect Google Ads to Claude", description: "Step-by-step setup for every Claude surface plus ChatGPT/Codex and Cursor." },
      { href: "/connect", title: "Try It on Your Account", description: "Connect Google Ads and run an audit in 5 minutes." },
    ],
  },
  "can-claude-pause-google-ads-campaigns": {
    slug: "can-claude-pause-google-ads-campaigns",
    title: "Can Claude Pause Google Ads Campaigns?",
    seoTitle: "Can Claude Pause Google Ads Campaigns? (Yes)",
    description:
      "Yes. Claude can pause campaigns, ad groups, keywords, and ads through an MCP server. How it works, the approval gate, and how to undo a pause.",
    keywords: [
      "can claude pause google ads",
      "claude pause campaign",
      "ai pause google ads",
      "pause google ads with claude",
    ],
    publishedAt: "2026-04-29",
    updatedAt: "2026-04-29",
    author: { name: "NotFair Team", role: "AI ads infrastructure" },
    content: [
      {
        type: "text",
        content:
          "Yes. With an MCP server connected, Claude can pause Google Ads campaigns, ad groups, keywords, and individual ads. The pause request goes through an approval gate by default — Claude proposes the pause, you confirm, and the change is applied. Every paused entity is logged in a change history so you can undo it in one call.",
      },
      {
        type: "heading",
        content: "What Claude can pause",
      },
      {
        type: "list",
        content: "",
        items: [
          "Campaigns — pauseCampaign tool. Stops all delivery for that campaign immediately.",
          "Ad groups — pauseAdGroup. Useful for surgical pausing within a campaign.",
          "Keywords — pauseKeyword (single) and bulkPauseKeywords (filtered). Common use: pause keywords with zero conversions in 90 days.",
          "Ads — pauseAd. Stops a specific ad while leaving the ad group running.",
          "PMax asset groups — pausePmaxAssetGroup. Less common but supported.",
        ],
      },
      {
        type: "heading",
        content: "How the approval flow works",
      },
      {
        type: "text",
        content:
          "When you ask Claude to pause something, it proposes the change with a one-line summary of what will be paused and the impact. You confirm in the chat. Claude calls the pause tool. The MCP server applies the change and returns a confirmation with the change ID — which you can use later to undo.",
      },
      {
        type: "callout",
        content:
          "You: \"Pause keywords with zero conversions in 90 days, but keep anything spending less than $5/day.\"\n\nClaude proposes: 47 keywords matching, 3 in your top-spending ad group will be paused. Confirm?\n\nYou: \"Confirm.\"\n\nClaude calls bulkPauseKeywords with the filter. Server returns: 47 keywords paused, change_id abc123 logged.",
      },
      {
        type: "heading",
        content: "Can Claude pause without asking?",
      },
      {
        type: "text",
        content:
          "It can be configured to, but we strongly advise against it. Pause is reversible but it still affects delivery — auctions you would have entered, conversions you would have captured. The 30 seconds of confirmation is cheap insurance against a misread instruction.",
      },
      {
        type: "heading",
        content: "How to undo a pause",
      },
      {
        type: "text",
        content:
          "Two ways. (1) Ask Claude: \"undo the last pause\" or \"undo change abc123.\" Claude calls the undoChange tool, which reverses the operation. (2) Ask Claude to enable the entity directly — enableCampaign, enableKeyword, etc. Both work; the undo path is preferred because it preserves the audit trail.",
      },
      {
        type: "heading",
        content: "FAQ",
      },
    ],
    faq: [
      {
        question: "Can Claude pause my entire account?",
        answer:
          "Not with one tool call — Google Ads doesn't expose an account-level pause. Claude can iterate through every campaign and pause each one, but that's a lot of approval gates. If you need a full account pause, the Google Ads UI has a single switch for it.",
      },
      {
        question: "Will pausing a keyword affect Quality Score?",
        answer:
          "Paused keywords don't accumulate new performance data, so historical Quality Score is preserved but doesn't update. If you re-enable later, Google may take a few days to re-establish auction signals.",
      },
      {
        question: "Can Claude pause based on a schedule (e.g., \"pause after 5pm\")?",
        answer:
          "Not directly through MCP — schedules need to be implemented via Google Ads ad scheduling rules, not through pause tool calls. Claude can configure the schedule rules for you, but the rules run inside Google's system, not the MCP.",
      },
      {
        question: "What if I accidentally pause something important?",
        answer:
          "Use the undoChange tool. Claude logs every write with a change ID; \"undo the last change\" reverses it cleanly. The change history is queryable for the last 90 days.",
      },
    ],
    relatedLinks: [
      { href: "/blog/can-claude-manage-google-ads", title: "Can Claude Manage Google Ads?", description: "Full list of what Claude can do with your account." },
      { href: "/blog/connect-google-ads-to-claude", title: "How to Connect Google Ads to Claude", description: "Step-by-step setup before any pause is possible." },
      { href: "/connect", title: "Connect Google Ads", description: "Try a pause in demo mode first — no Google Ads account required." },
    ],
  },
  "is-it-safe-to-give-ai-access-to-google-ads": {
    slug: "is-it-safe-to-give-ai-access-to-google-ads",
    title: "Is It Safe to Give AI Access to Google Ads?",
    seoTitle: "Is It Safe to Give AI Access to Google Ads?",
    description:
      "Yes if you pick a server with approval gates, scoped OAuth, and a change log. The realistic risks, the controls that matter, and how to verify them.",
    keywords: [
      "is it safe to give ai access to google ads",
      "ai google ads safety",
      "ai google ads security",
      "claude google ads risks",
    ],
    publishedAt: "2026-04-29",
    updatedAt: "2026-04-29",
    author: { name: "NotFair Team", role: "AI ads infrastructure" },
    content: [
      {
        type: "text",
        content:
          "Yes — if you pick an MCP server with three controls in place: approval gates on destructive operations, OAuth scope limited to Google Ads only, and a queryable change log. Without those, the risk is the same as giving keyboard access to a junior media buyer who doesn't ask before pressing buttons. With them, it's lower risk than most agencies' existing access models.",
      },
      {
        type: "heading",
        content: "What can actually go wrong?",
      },
      {
        type: "list",
        content: "",
        items: [
          "Misinterpreted instructions — \"pause underperforming campaigns\" can mean different things. A model without context might pause a brand-defense campaign that's intentionally low-CTR.",
          "Bulk operations on the wrong scope — \"add 'free' as a negative\" applied to all campaigns when you meant only search.",
          "Over-aggressive bid changes — a 40% bid increase based on a one-day conversion spike that turns out to be a tracking glitch.",
          "Prompt injection — if your AI client is also reading external content (search terms can carry strange characters), an attacker could try to embed instructions. Real risk; mostly mitigated by the MCP server requiring confirmation.",
        ],
      },
      {
        type: "text",
        content:
          "Note what's not on this list: data exfiltration, password theft, billing fraud. Those would require the MCP server to have credentials it shouldn't have. Properly scoped OAuth eliminates them.",
      },
      {
        type: "heading",
        content: "The three controls that matter",
      },
      {
        type: "subheading",
        content: "1. Approval gates on destructive writes",
      },
      {
        type: "text",
        content:
          "Pausing campaigns, deleting assets, and budget changes should require explicit confirmation in your AI client before the MCP server executes them. NotFair enforces this server-side. Verify the server you're using does the same.",
      },
      {
        type: "subheading",
        content: "2. OAuth scope limited to Google Ads",
      },
      {
        type: "text",
        content:
          "When you grant access, Google should only request the Google Ads scope — not Gmail, Drive, calendar, or full account access. You can verify which scopes are granted at myaccount.google.com/permissions, and revoke them in 5 seconds if anything looks wrong.",
      },
      {
        type: "subheading",
        content: "3. Change log with rollback",
      },
      {
        type: "text",
        content:
          "Every write should be logged with the change ID, the tool called, and the timestamp. \"What did Claude change in my account this week?\" should be a one-query answer. If something goes wrong, you should be able to undo any individual change in one call.",
      },
      {
        type: "heading",
        content: "Reasonable starting posture",
      },
      {
        type: "list",
        content: "",
        items: [
          "Connect with read-only mindset for the first two weeks — let AI audit and recommend, you execute manually.",
          "Graduate to low-risk writes — pausing keywords with zero conversions, adding obvious negatives, ad copy refreshes.",
          "Keep approval gates on bid strategy switches, budget changes, and campaign state changes for at least 30 days.",
          "Review the change log weekly. Build trust based on observed quality, not promises.",
        ],
      },
      {
        type: "heading",
        content: "FAQ",
      },
    ],
    faq: [
      {
        question: "Can the AI server see my credit card or billing details?",
        answer:
          "No. Google Ads API scope does not include billing methods, payment info, or invoices. Those are accessible only through the Google Ads UI with full account access.",
      },
      {
        question: "Can the AI access my Gmail or Drive?",
        answer:
          "No, if the OAuth scope is correctly limited to Google Ads. Verify at myaccount.google.com/permissions — the server should only request \"See, edit, create, and delete your Google Ads accounts and data,\" nothing more.",
      },
      {
        question: "What happens if my Google account is compromised?",
        answer:
          "Same as any OAuth integration — the attacker would inherit the existing scope. Revoke access immediately at myaccount.google.com/permissions, change your Google password, and review the MCP server's change log for unauthorized writes.",
      },
      {
        question: "Should I trust a hosted MCP server with my Google Ads auth?",
        answer:
          "Conditional yes. The auth token sits on the server; that's the threat surface. Pick a server with public security practices, scoped OAuth, and a clear data-handling policy. NotFair stores auth state encrypted at rest and never accesses your account except in response to your tool calls.",
      },
      {
        question: "Is self-hosting safer?",
        answer:
          "On paper, yes — you control where the auth token lives. In practice, it's only safer if you operate your infrastructure to the same standard. Most teams underestimate the work involved. For most users, a well-run hosted server is safer than a self-hosted one with default settings.",
      },
    ],
    relatedLinks: [
      { href: "/blog/connect-google-ads-to-claude", title: "How to Connect Google Ads to Claude", description: "Setup walkthrough including the safety controls discussed here." },
      { href: "/blog/google-ads-mcp-servers-compared", title: "Google Ads MCP Servers Compared", description: "Decision matrix for picking a server based on your security posture." },
      { href: "/blog/google-ads-ai-agent", title: "Google Ads AI Agent: What It Actually Does", description: "Realistic capabilities and limits — context for the trust ramp." },
    ],
  },
  "which-ai-tools-work-with-google-ads": {
    slug: "which-ai-tools-work-with-google-ads",
    title: "Which AI Tools Work With Google Ads?",
    seoTitle: "Which AI Tools Work With Google Ads? (2026)",
    description:
      "The AI tools that actually connect to Google Ads in 2026 — Claude, ChatGPT, Cursor, Windsurf — plus how each connection works and which to start with.",
    keywords: [
      "which ai tools work with google ads",
      "ai tools for google ads",
      "ai google ads tools",
      "best ai for google ads",
    ],
    publishedAt: "2026-04-29",
    updatedAt: "2026-04-29",
    author: { name: "NotFair Team", role: "AI ads infrastructure" },
    content: [
      {
        type: "text",
        content:
          "As of April 2026, any AI tool that supports MCP (Model Context Protocol) can connect to Google Ads. That includes Claude (Desktop, Web, Cowork, Code), ChatGPT (via Codex connectors), Cursor, Windsurf, and Cline. Tools that don't support MCP — and there are many — can't talk to Google Ads natively. Here's the actual list.",
      },
      {
        type: "heading",
        content: "AI tools that work with Google Ads",
      },
      {
        type: "list",
        content: "",
        items: [
          "Claude Desktop — fully supported via the Connectors UI. One-click install through notfair.co. Best for marketers and agency operators.",
          "Claude Web (claude.ai) — supported via the same hosted connector. No local install required.",
          "Claude Cowork — supported. Same connector setup as Desktop.",
          "Claude Code — supported via the AdsAgent plugin (claude plugin install nowork-studio/adsagent-plugin). Best for developer/agency workflows.",
          "ChatGPT — supported via Codex connectors. Same NotFair auth works simultaneously with Claude.",
          "OpenAI Codex CLI — supported. Add the NotFair MCP endpoint to ~/.codex/config.toml.",
          "Cursor — supported via stdio MCP config in ~/.cursor/mcp.json.",
          "Windsurf — supported via the same stdio MCP config pattern.",
          "Cline — supported. Add NotFair to the MCP servers list in Cline's settings.",
        ],
      },
      {
        type: "heading",
        content: "AI tools that do not work with Google Ads (yet)",
      },
      {
        type: "list",
        content: "",
        items: [
          "Gemini (consumer app) — no MCP client support as of April 2026. Cannot connect to Google Ads despite being a Google product.",
          "Microsoft Copilot — no MCP client support. Has its own plugin model.",
          "Perplexity — no MCP client support. Browse-and-summarize only.",
          "Most chatbot builders (e.g., HubSpot AI) — closed integration models, no MCP.",
        ],
      },
      {
        type: "text",
        content:
          "These tools may add MCP support over time. The MCP standard has gained adoption fast since late 2024.",
      },
      {
        type: "heading",
        content: "Which one should you start with?",
      },
      {
        type: "list",
        content: "",
        items: [
          "Marketers, agency owners — Claude Desktop. The Connectors UI is the lowest-friction setup.",
          "Developers, technical teams — Claude Code or Cursor. Faster iteration, scriptable, integrates with the rest of your dev workflow.",
          "ChatGPT-first teams — ChatGPT via Codex connectors. Same NotFair auth, no need to switch tools.",
          "Mixed teams — connect both Claude and ChatGPT to the same NotFair account. Compare reasoning across models on the same data.",
        ],
      },
      {
        type: "heading",
        content: "What about Google's own AI features?",
      },
      {
        type: "text",
        content:
          "Smart Bidding, Performance Max, and the AI features inside Google Ads are different — they run inside Google's platform and optimize within their narrow scope. They don't replace external AI assistants like Claude. They work alongside: use Smart Bidding for bid execution, use Claude or ChatGPT (over MCP) for diagnosis, recommendations, and oversight.",
      },
      {
        type: "heading",
        content: "FAQ",
      },
    ],
    faq: [
      {
        question: "Does ChatGPT work with Google Ads?",
        answer:
          "Yes — through the Codex connector or Codex CLI, pointed at an MCP server like NotFair. The same auth that powers Claude works for ChatGPT in parallel.",
      },
      {
        question: "Does Gemini work with Google Ads?",
        answer:
          "Not via MCP, as of April 2026. Despite being a Google product, the consumer Gemini app does not support MCP clients. Some Google Workspace AI features have limited Ads integration but not the full read/write surface that MCP provides.",
      },
      {
        question: "What about no-code AI tools like Zapier AI or Make?",
        answer:
          "These connect via traditional Google Ads API integrations, not MCP. They work for simple automations but lack the conversational interface and multi-tool orchestration MCP enables.",
      },
      {
        question: "Can I use multiple AI tools with the same Google Ads account?",
        answer:
          "Yes. One MCP server (one OAuth flow) can serve multiple AI clients in parallel. Connect once at the server level; use Claude, ChatGPT, and Cursor all on top of it.",
      },
      {
        question: "Will Anthropic ship a first-party Google Ads connector?",
        answer:
          "No public announcement as of April 2026. Anthropic publishes the MCP protocol but not vertical servers. Third-party servers like NotFair are the path.",
      },
    ],
    relatedLinks: [
      { href: "/blog/connect-google-ads-to-claude", title: "How to Connect Google Ads to Claude", description: "Step-by-step setup for every supported AI client." },
      { href: "/blog/google-ads-mcp-servers-compared", title: "Google Ads MCP Servers Compared", description: "Picking the right MCP server for your AI tool." },
      { href: "/connect", title: "Try It Now", description: "One OAuth flow, then point Claude or ChatGPT at it." },
    ],
  },
  "claude-find-wasted-ad-spend": {
    slug: "claude-find-wasted-ad-spend",
    title: "Find Wasted Ad Spend With Claude (Step-by-Step)",
    seoTitle: "Find Wasted Ad Spend With Claude (Step-by-Step)",
    description:
      "Use Claude to find every wasted dollar in your Google Ads account in 5 minutes. Exact prompt, tools called, sample output, and what to do with the findings.",
    keywords: [
      "claude find wasted ad spend",
      "find wasted ad spend with ai",
      "claude google ads waste",
      "ai google ads waste analysis",
    ],
    publishedAt: "2026-04-29",
    updatedAt: "2026-04-29",
    author: { name: "NotFair Team", role: "AI ads infrastructure" },
    content: [
      {
        type: "text",
        content:
          "Wasted ad spend is the highest-leverage opportunity in most Google Ads accounts. Claude — connected to your account through an MCP server — can surface it in about 60 seconds. This page shows the exact prompt, the tools Claude calls under the hood, what the output looks like, and how to act on it.",
      },
      {
        type: "heading",
        content: "The prompt that works",
      },
      {
        type: "callout",
        content:
          "You: \"Find every dollar of waste in this account from the last 30 days. I want to see: keywords spending with zero conversions, search terms triggering on irrelevant queries, campaigns with no negative keyword list, and any device or daypart where CPA is 2x the account average.\"",
      },
      {
        type: "text",
        content:
          "The specificity matters. \"Find waste\" alone leaves too much interpretation room. The four-bucket prompt above maps cleanly to Google Ads API queries and produces a structured answer Claude can return in one pass.",
      },
      {
        type: "heading",
        content: "What Claude does under the hood",
      },
      {
        type: "text",
        content:
          "Claude calls the runScript tool, which executes a sandboxed JavaScript that fans out parallel GAQL queries against the four waste surfaces in your prompt:",
      },
      {
        type: "list",
        content: "",
        items: [
          "Keywords with spend > 0 and conversions = 0 in the last 30 days, ordered by cost descending.",
          "Search terms with the same filter, joined to their parent campaign and ad group.",
          "Campaigns where negative_keywords_list_count = 0.",
          "Device and ad-schedule performance segments where CPA exceeds 2x the campaign average.",
        ],
      },
      {
        type: "text",
        content:
          "Parallel execution matters here. Sequential queries would burn token budget and time. NotFair's runScript can fire 20 GAQL queries in one call and correlate the results in-script.",
      },
      {
        type: "heading",
        content: "What the output looks like",
      },
      {
        type: "callout",
        content:
          "Claude: \"Last 30 days: $1,847 in zero-conversion keyword spend, concentrated in 7 keywords. Top: 'small dog daycare near me' ($412 spend, 0 conversions, 89 clicks). Search terms: 73 of 214 unique queries on your broad-match 'pet boarding' keyword are irrelevant ('pet sitting jobs', 'free pet adoption', etc.) — $623 wasted there. 3 campaigns have no negative keyword list at all. Mobile CPA is 2.3x desktop in your search campaign while bids are equal. Total recoverable: ~$3,100/month at current rates.\"",
      },
      {
        type: "heading",
        content: "What to do with the findings",
      },
      {
        type: "list",
        content: "",
        items: [
          "Pause the zero-conversion keywords with sustained spend — \"pause keywords with $100+ spend and 0 conversions in 30 days\" → Claude runs bulkPauseKeywords with the filter.",
          "Add the irrelevant search terms as negatives — group by theme first (\"jobs\", \"free\", \"adoption\"), then add as phrase-match negatives at the campaign or shared list level.",
          "Apply a starter negative keyword list to the bare campaigns — Claude can generate a list from the search terms history and apply it in one call.",
          "Adjust device bid modifiers — drop mobile -50% on the search campaign and watch CPA over the next week.",
        ],
      },
      {
        type: "text",
        content:
          "Approval gate every write. Claude proposes; you confirm. The whole loop — diagnose, propose, approve, execute — typically takes 10 minutes. Compare to the 2–4 hours a manual audit takes on the same account.",
      },
      {
        type: "heading",
        content: "How often should you run this?",
      },
      {
        type: "text",
        content:
          "Weekly is the sweet spot. Daily is overkill for most accounts (waste accumulates slower than that). Monthly misses recoverable spend that compounds — finding $1,800 waste 30 days later means you already lost $1,200 of it. We've found that a 5-minute weekly waste check on a $20K/month account recovers more spend than most paid optimization tools surface in a quarter.",
      },
      {
        type: "heading",
        content: "FAQ",
      },
    ],
    faq: [
      {
        question: "How long does Claude take to find wasted spend?",
        answer:
          "Typically 30–90 seconds for the analysis on a mid-size account (10 campaigns, 50 ad groups, several hundred keywords). Larger MCC accounts with 50+ campaigns may take 2–3 minutes due to API rate limits, not Claude's reasoning speed.",
      },
      {
        question: "Will Claude pause keywords without asking?",
        answer:
          "No — not by default. NotFair's MCP server requires explicit confirmation before any write tool executes. Claude proposes the pause; you approve in chat; the change applies. You can configure auto-approve for specific safe operations later if you want.",
      },
      {
        question: "Does this work on Performance Max campaigns?",
        answer:
          "Partially. Google restricts much of PMax's internal data, so Claude can see top-level spend and conversion data but not granular search-term performance the way it can on standard search campaigns. PMax waste analysis is more about asset group performance and audience signals.",
      },
      {
        question: "What's the smallest account where this is worth doing?",
        answer:
          "$1K/month and up sees clear value. Below that, the absolute waste numbers are small but the percentage gain is similar — and the analysis still costs you nothing in time. Worth running on any account that has a search terms report.",
      },
    ],
    relatedLinks: [
      { href: "/connect", title: "Try It on Your Account", description: "Connect Google Ads in 5 minutes and run a waste audit." },
      { href: "/blog/connect-google-ads-to-claude", title: "How to Connect Google Ads to Claude", description: "Setup walkthrough for every Claude surface." },
      { href: "/blog/google-ads-ai-agent", title: "Google Ads AI Agent: What It Actually Does", description: "Realistic capabilities and limits — context for what AI can manage end-to-end." },
    ],
  },
  "ai-google-ads-weekly-report": {
    slug: "ai-google-ads-weekly-report",
    title: "AI Google Ads Weekly Report (Auto-Generated)",
    seoTitle: "AI Google Ads Weekly Report — Generate It in Claude",
    description:
      "Generate a Google Ads weekly report in Claude in 60 seconds. The exact prompt, what's included, sample output, and how to share it with clients.",
    keywords: [
      "ai google ads weekly report",
      "google ads weekly report ai",
      "claude google ads report",
      "automated google ads reporting",
    ],
    publishedAt: "2026-04-29",
    updatedAt: "2026-04-29",
    author: { name: "NotFair Team", role: "AI ads infrastructure" },
    content: [
      {
        type: "text",
        content:
          "A weekly Google Ads report — the kind you'd send a client or VP of Marketing — usually takes 30–60 minutes to assemble. Pull data from the Ads UI, build a deck or doc, write commentary, format charts. Claude can produce the same report in about 60 seconds when connected to your account through an MCP server. This page shows the exact prompt, what's in the report, and how to format it for sharing.",
      },
      {
        type: "heading",
        content: "The prompt",
      },
      {
        type: "callout",
        content:
          "You: \"Generate a weekly Google Ads report for last week vs. the prior week. Include: spend, conversions, CPA, ROAS, top 5 wins (campaigns where performance improved most), top 3 concerns (campaigns where performance dropped), search term highlights, change log, and a 3-bullet exec summary. Format it as markdown ready to paste into a doc.\"",
      },
      {
        type: "heading",
        content: "What Claude pulls",
      },
      {
        type: "text",
        content:
          "Claude calls runScript with a parallel GAQL fan-out across these surfaces:",
      },
      {
        type: "list",
        content: "",
        items: [
          "Campaign-level metrics for last week and the prior week (spend, conversions, conversion value, CPA, ROAS, CTR).",
          "Week-over-week deltas computed in-script.",
          "Search term report filtered to last week's top 50 by spend.",
          "Change history — every write applied during the reporting period (yours, the team's, or Claude's).",
          "Quality score snapshot for keywords driving 80% of spend.",
        ],
      },
      {
        type: "heading",
        content: "Sample report",
      },
      {
        type: "callout",
        content:
          "## Weekly Google Ads Report — Apr 21–27, 2026\n\n**Exec summary:** Spend up 8%, conversions up 14%, CPA down 5%. Brand campaign drove most of the gain. PMax mobile CTR dropped meaningfully — investigate landing page.\n\n**Spend:** $14,820 (+8% WoW). Conversions: 142 (+14%). CPA: $104 (−5%). ROAS: 4.1x (+11%).\n\n**Top wins:** Brand Search (+22% conv, no extra spend), Boarding Services (+18% conv), Local Daycare (+9% conv).\n\n**Top concerns:** PMax Holiday (mobile CTR dropped from 4.2% to 2.1%), Grooming Search (CPA up 31%).\n\n**Search terms:** 'overnight pet boarding near me' top by conv (12 conv, $32 CPA). Added 'free' as negative across 3 campaigns Wed.\n\n**Changes this week:** 47 keywords paused (zero conv 90d), $200 daily budget shift Brand → Boarding, new RSA variants live in Daycare.",
      },
      {
        type: "heading",
        content: "Tweak it for your audience",
      },
      {
        type: "list",
        content: "",
        items: [
          "Client-facing — ask Claude to soften the language and lead with the win narrative; drop technical jargon like \"GAQL\" or \"impression share lost to budget.\"",
          "Internal team — ask for the diagnostic version with raw deltas, hypothesis tags on every metric drop, and recommended actions.",
          "Email-ready — \"format it as a 6-line email I can paste into Gmail\" produces a tight summary instead of a full doc.",
          "Slack-ready — \"format it as a Slack message with bullet points\" — works great for #marketing channels.",
        ],
      },
      {
        type: "heading",
        content: "Schedule it",
      },
      {
        type: "text",
        content:
          "Two patterns. (1) Manual every Monday — open Claude, paste the prompt, share the output. Takes 2 minutes. (2) Automated via Claude API — schedule a weekly job that calls Claude with the prompt against the NotFair MCP, posts the result to Slack or email. The second path requires light dev work; the first works for most agencies and in-house teams.",
      },
      {
        type: "heading",
        content: "FAQ",
      },
    ],
    faq: [
      {
        question: "Can Claude pull data from the Google Ads UI directly?",
        answer:
          "No — Claude reads the Google Ads API via an MCP server, not the UI. Same data, faster, and more flexible than UI exports.",
      },
      {
        question: "Will the report include data Google takes 24h to finalize?",
        answer:
          "It will reflect what's currently in the API. Google's conversion data finalizes over 24–72 hours depending on conversion type, so a Monday-morning report may slightly under-count Sunday's conversions. Generate the report Tuesday for the cleanest week-end numbers.",
      },
      {
        question: "Can I include charts in the report?",
        answer:
          "Claude can output the data tables in markdown, which renders as tables in most tools. For chart images, pipe the data into your visualization tool of choice — most agencies do a quick paste into Looker Studio or Sheets for chart-heavy decks.",
      },
      {
        question: "Does this work for multiple accounts at once?",
        answer:
          "Yes. Connect multiple customer IDs in NotFair, then ask Claude to \"generate weekly reports for all connected accounts\" — it iterates through each and produces a per-account report or a roll-up.",
      },
    ],
    relatedLinks: [
      { href: "/blog/claude-find-wasted-ad-spend", title: "Find Wasted Ad Spend With Claude", description: "The natural follow-on after a weekly report flags spend creep." },
      { href: "/connect", title: "Try It on Your Account", description: "Connect Google Ads and generate your first report in 5 minutes." },
      { href: "/blog/connect-google-ads-to-claude", title: "How to Connect Google Ads to Claude", description: "Setup walkthrough." },
    ],
  },
  "claude-search-terms-report-analysis": {
    slug: "claude-search-terms-report-analysis",
    title: "Claude Search Terms Report Analysis (Tutorial)",
    seoTitle: "Claude Search Terms Report Analysis (Tutorial)",
    description:
      "Use Claude to analyze your Google Ads search terms report. Group bad terms, find conversion patterns, and add negatives in one conversation.",
    keywords: [
      "claude search terms report analysis",
      "google ads search terms ai",
      "ai search terms analysis",
      "claude negative keywords",
    ],
    publishedAt: "2026-04-29",
    updatedAt: "2026-04-29",
    author: { name: "NotFair Team", role: "AI ads infrastructure" },
    content: [
      {
        type: "text",
        content:
          "The search terms report is the highest-ROI section of any Google Ads account. It's also the most painful to analyze manually — hundreds of rows, judgment calls on every term. Claude can pull the report, group bad terms by intent, and propose negative keyword lists in 60 seconds. This page shows the exact workflow.",
      },
      {
        type: "heading",
        content: "The prompt",
      },
      {
        type: "callout",
        content:
          "You: \"Pull last 30 days of search terms with $50+ spend or 5+ clicks. Group them by intent: irrelevant (block), informational (review), competitor terms (decide), and converting (expand). For irrelevant ones, propose a phrase-match negative keyword list grouped by theme.\"",
      },
      {
        type: "heading",
        content: "What Claude does under the hood",
      },
      {
        type: "list",
        content: "",
        items: [
          "Calls runScript with a GAQL query joining search_term_view to ad group and campaign with the spend/clicks filter.",
          "Groups terms in-script by intent using semantic clustering (the model reads the terms; it doesn't need a separate ML system).",
          "Cross-references with conversion data to confirm \"converting\" buckets aren't misclassified.",
          "Generates a negative keyword list with match types, ready to apply via addNegativeKeyword or addKeywordToNegativeList.",
        ],
      },
      {
        type: "heading",
        content: "Sample output",
      },
      {
        type: "callout",
        content:
          "Claude: \"Pulled 247 search terms matching the filter.\n\n**Irrelevant (block):** 73 terms, $623 spend, 0 conversions. Themes: jobs/careers (12 terms), free/adoption (18 terms), DIY/recipes (9 terms), competitor brand variants (14 terms), unrelated locations (20 terms).\n\n**Informational (review):** 28 terms, $401 spend, 4 conversions. Mostly 'how to' and 'what is' queries — low intent but some converted.\n\n**Competitor:** 19 terms, $312 spend, 7 conversions. Decision: keep — 8% conv rate is profitable.\n\n**Converting:** 41 terms, $1,847 spend, 67 conversions. Top: 'overnight pet boarding near me', 'cage-free dog daycare', '24 hour pet hotel'.\n\nProposed negatives (phrase match): 'jobs', 'careers', 'free', 'adoption', 'DIY', 'how to make', plus 14 specific competitor variants. Want me to apply?\"",
      },
      {
        type: "heading",
        content: "Approve and apply",
      },
      {
        type: "text",
        content:
          "Once you say \"apply,\" Claude calls addNegativeKeyword (or createNegativeKeywordList for a shared list across campaigns) with the proposed terms. The MCP server logs every addition with a change ID. If a negative kills delivery on something you didn't expect, undo with one call: \"undo the last negative keyword change.\"",
      },
      {
        type: "heading",
        content: "What about the converting terms?",
      },
      {
        type: "list",
        content: "",
        items: [
          "Promote them as exact-match keywords with their own ad groups — get more control over bid and copy for each.",
          "Find adjacent variants — \"give me 20 keyword ideas similar to 'overnight pet boarding near me' with monthly search volume\" → Claude calls getKeywordIdeas.",
          "Tighten match types — if a converting term is currently matching via broad, switch to phrase or exact to reduce wasted impressions on adjacent queries.",
        ],
      },
      {
        type: "heading",
        content: "How often should you run this?",
      },
      {
        type: "text",
        content:
          "Weekly for accounts spending $5K+/month. Bi-weekly for smaller accounts. The compounding gains come from running it consistently — each cycle catches new wasteful queries before they accumulate spend.",
      },
      {
        type: "heading",
        content: "FAQ",
      },
    ],
    faq: [
      {
        question: "Can Claude tell the difference between converting and non-converting search terms?",
        answer:
          "Yes — the GAQL query pulls conversions per search term, so Claude has the data directly. The model also adds intent classification on top, which catches cases where a term hasn't converted yet but obviously should be blocked (job-seeker queries, etc.).",
      },
      {
        question: "Does this work for shopping campaigns?",
        answer:
          "Yes. Shopping campaigns have search term reports too. The analysis works the same way; Claude pulls shopping_performance_view instead of search_term_view.",
      },
      {
        question: "How does Claude know which terms are competitor names?",
        answer:
          "It reads the term and recognizes brand-shaped tokens. If your industry has obscure competitor names, give Claude a hint in the prompt: \"competitors are X, Y, Z — flag any variants.\" The model picks them up correctly.",
      },
      {
        question: "Can Claude add negatives to a shared negative list?",
        answer:
          "Yes — addKeywordToNegativeList. Claude can create a new shared list (createNegativeKeywordList), populate it, and link it to specific campaigns (linkNegativeListToCampaign) in one conversation.",
      },
    ],
    relatedLinks: [
      { href: "/blog/claude-find-wasted-ad-spend", title: "Find Wasted Ad Spend With Claude", description: "Companion analysis — search term cleanup is one of four waste buckets." },
      { href: "/blog/connect-google-ads-to-claude", title: "How to Connect Google Ads to Claude", description: "Setup before any analysis is possible." },
      { href: "/connect", title: "Try It on Your Account", description: "5-minute setup, then run your first search terms analysis." },
    ],
  },
  "ai-google-ads-quality-score-audit": {
    slug: "ai-google-ads-quality-score-audit",
    title: "AI Google Ads Quality Score Audit (in Claude)",
    seoTitle: "AI Google Ads Quality Score Audit (in Claude)",
    description:
      "Run a full Quality Score audit in Claude. See which keywords are dragging your account, why, and the fastest fixes for each component.",
    keywords: [
      "ai google ads quality score audit",
      "claude quality score",
      "google ads quality score ai",
      "improve quality score ai",
    ],
    publishedAt: "2026-04-29",
    updatedAt: "2026-04-29",
    author: { name: "NotFair Team", role: "AI ads infrastructure" },
    content: [
      {
        type: "text",
        content:
          "Quality Score directly affects what you pay per click and how often your ads show. Most accounts have 10–20% of spend going to keywords with QS 5 or below — Google's tax on poorly aligned ads. Claude can audit your full account in 60 seconds, surface the laggards, and explain which of the three QS components (expected CTR, ad relevance, landing page experience) is dragging each one.",
      },
      {
        type: "heading",
        content: "The prompt",
      },
      {
        type: "callout",
        content:
          "You: \"Run a quality score audit. Group keywords by QS bucket (1-3, 4-6, 7-10). For everything below 7, show the spend share, the dragging component (CTR, ad relevance, or landing page), and the top 3 fix recommendations per ad group.\"",
      },
      {
        type: "heading",
        content: "What Claude pulls",
      },
      {
        type: "list",
        content: "",
        items: [
          "ad_group_criterion.quality_info.quality_score and the three component scores (creative_quality_score, post_click_quality_score, search_predicted_ctr).",
          "Spend per keyword joined to QS — so Claude can compute spend share by QS bucket.",
          "The active ads in each ad group (for ad relevance diagnosis).",
          "Final URLs (for landing page experience diagnosis).",
        ],
      },
      {
        type: "heading",
        content: "Sample output",
      },
      {
        type: "callout",
        content:
          "Claude: \"Audit complete. Account-wide weighted QS: 6.2.\n\n**QS 1-3 (low):** 47 keywords, $1,240 spend (8% of total). Mostly dragged by 'below average' ad relevance — your ads don't include the keyword text. Top fix: pin the keyword token into headline 1 of the RSA in 'Boarding > Overnight Stays' and 4 other ad groups.\n\n**QS 4-6 (medium):** 312 keywords, $4,800 spend (32%). Mixed dragging — 60% landing page experience, 40% CTR. Landing page issue concentrated in your /services page; mobile load time is 4.8s.\n\n**QS 7-10 (good):** 521 keywords, $9,100 spend (60%).\n\nTop 3 fixes (in priority order):\n1. Add keyword pinning to RSAs in 5 underperforming ad groups (would lift ~47 keywords from QS 1-3 to 4-6).\n2. Fix /services mobile load time — currently 4.8s, target <2.5s.\n3. Test 3 new RSA variants in 'Daycare' ad group where expected CTR is 'below average' on all keywords.\"",
      },
      {
        type: "heading",
        content: "Apply the fixes through Claude",
      },
      {
        type: "list",
        content: "",
        items: [
          "Update RSA assets — Claude calls updateAdAssets with new headlines that include the keyword tokens. You confirm before each ad group.",
          "Pause low-QS keywords with no path to improvement — \"pause keywords with QS 1-2 where spend < $20 and clicks < 5 in 30 days.\" Some keywords are just not worth fixing.",
          "Generate fresh RSA variants — \"write 3 new RSA variants for the Daycare ad group focused on 'cage-free' and 'overnight available' angles.\"",
        ],
      },
      {
        type: "text",
        content:
          "Landing page fixes happen outside Google Ads — Claude can flag the issue but the fix is in your CMS. We've found that the spend-weighted QS lift of 0.5–1.0 from a focused audit pays for itself within 2 weeks at most account sizes.",
      },
      {
        type: "heading",
        content: "FAQ",
      },
    ],
    faq: [
      {
        question: "What is a good Quality Score?",
        answer:
          "QS 7+ is healthy. QS 8–10 is excellent and meaningfully reduces your effective CPC. QS below 5 is a flag; below 3 means you're paying a premium just to show. The metric is spend-weighted — improving QS on a $4K/month keyword matters more than improving it on a $40/month one.",
      },
      {
        question: "How fast does Quality Score update after I make changes?",
        answer:
          "Google recalculates QS on each auction, but the displayed score in the Ads UI updates more slowly — often 24–72 hours. Don't panic if you don't see the score move the same day you ship the fix.",
      },
      {
        question: "Can Claude fix landing page issues?",
        answer:
          "Not directly — landing pages are outside the Google Ads API. Claude can identify which pages are dragging which keywords, but the fix happens in your CMS or with your dev team. Claude can also draft a brief for the dev team if you want.",
      },
      {
        question: "Does Quality Score matter for Performance Max?",
        answer:
          "PMax doesn't expose keyword-level QS the same way Search does. Claude can still audit asset quality and ad relevance signals on PMax, but the lever is different — it's about asset diversity and conversion signals more than the classic QS components.",
      },
    ],
    relatedLinks: [
      { href: "/blog/claude-find-wasted-ad-spend", title: "Find Wasted Ad Spend With Claude", description: "Companion audit — low-QS keywords are often the same ones bleeding spend." },
      { href: "/blog/claude-search-terms-report-analysis", title: "Claude Search Terms Report Analysis", description: "Search term cleanup directly improves expected CTR." },
      { href: "/connect", title: "Try It on Your Account", description: "Run your first QS audit in 5 minutes." },
    ],
  },
  "ai-conversion-tracking-audit": {
    slug: "ai-conversion-tracking-audit",
    title: "AI Conversion Tracking Audit (Google Ads)",
    seoTitle: "AI Conversion Tracking Audit for Google Ads",
    description:
      "Audit your Google Ads conversion tracking with Claude. Find broken conversions, double-counted events, and attribution gaps in one conversation.",
    keywords: [
      "ai conversion tracking audit",
      "google ads conversion audit ai",
      "claude conversion tracking",
      "fix google ads conversion tracking",
    ],
    publishedAt: "2026-04-29",
    updatedAt: "2026-04-29",
    author: { name: "NotFair Team", role: "AI ads infrastructure" },
    content: [
      {
        type: "text",
        content:
          "Broken conversion tracking quietly destroys ad performance. Smart Bidding learns from the wrong signal, reporting numbers diverge from analytics, and you can't trust any audit downstream. Claude can run a full conversion-tracking audit in about 60 seconds — flag broken tags, double-counted events, weird attribution patterns, and the gaps that explain why your reported ROAS doesn't match GA4 or Stripe.",
      },
      {
        type: "heading",
        content: "The prompt",
      },
      {
        type: "callout",
        content:
          "You: \"Audit conversion tracking. List every conversion action with its status, count, and value (last 30 days). Flag any that haven't fired in the last 14 days, anything with a wildly different click-through vs view-through ratio, primary vs secondary configuration, and any campaigns optimizing for non-primary conversions.\"",
      },
      {
        type: "heading",
        content: "What Claude pulls",
      },
      {
        type: "list",
        content: "",
        items: [
          "All conversion actions (conversion_action) with status, primary/secondary flag, attribution model, and counting type (one vs many).",
          "Conversion totals per action over the audit window.",
          "Last fired timestamp per action.",
          "Campaign-level conversion goals — which actions each campaign is optimizing for.",
          "Cross-checked against the campaign's actual conversion volume (mismatch = a tracking issue).",
        ],
      },
      {
        type: "heading",
        content: "Sample output",
      },
      {
        type: "callout",
        content:
          "Claude: \"6 conversion actions, 4 issues found.\n\n**🚨 'Phone Call' — 0 conversions in 14 days.** Last fire 18 days ago. Either the call extension was removed, or the call tracking number expired. Investigate immediately — your call-heavy campaigns are flying blind.\n\n**⚠️ 'Lead Form Submit' — counting type 'every' but it's a one-time signup.** Likely double-counting form submissions. Real conversion volume probably ~60% of reported.\n\n**⚠️ 'Purchase' — set as secondary on 3 campaigns.** Those campaigns are optimizing for 'Add to Cart' (set as primary). You probably want Purchase as primary on revenue campaigns.\n\n**⚠️ 'Newsletter Signup' — view-through:click-through ratio is 8:1.** Suspiciously high view-through count suggests the pixel may be firing on page views rather than form submits. Verify in tag manager.\n\n**Healthy:** 'Add to Cart', 'Account Create' — firing as expected.\"",
      },
      {
        type: "heading",
        content: "What to fix first",
      },
      {
        type: "list",
        content: "",
        items: [
          "Restore broken conversions — they're the most damaging because Smart Bidding is making blind decisions on those campaigns.",
          "Fix counting types — switch one-time conversions (signups, purchases of unique items) to count 'one' instead of 'every'.",
          "Set the right primaries — your revenue-driving conversion should be primary on revenue campaigns. Lead-gen secondary if it's not what you optimize for.",
          "Verify view-through configuration — a high view-through ratio is sometimes legitimate (display campaigns) and sometimes a tag firing on the wrong event. Check in GTM.",
        ],
      },
      {
        type: "heading",
        content: "How Claude can apply the fixes",
      },
      {
        type: "list",
        content: "",
        items: [
          "Pause broken conversion actions — pauseConversionAction. Stops Smart Bidding from learning from a stale signal until you fix the root cause.",
          "Update counting type — updateConversionAction with the right counting setting.",
          "Adjust primary/secondary status — updateConversionAction. Can be applied per campaign or globally.",
          "Update campaign optimization goals — updateCampaignGoals to point at the right conversion action.",
        ],
      },
      {
        type: "text",
        content:
          "Tag/pixel issues themselves still need to be fixed in Tag Manager or your code — the Google Ads API doesn't reach into your site's tracking. Claude can flag the symptom and tell you exactly which tag to look at.",
      },
      {
        type: "heading",
        content: "FAQ",
      },
    ],
    faq: [
      {
        question: "How often should I audit conversion tracking?",
        answer:
          "Monthly for stable accounts. Immediately after any site or tag manager change. Conversion tracking is brittle — a single dev push can silently break a tag and you won't notice until the next reporting cycle.",
      },
      {
        question: "Can Claude check GA4 conversion mismatches?",
        answer:
          "Not via the Google Ads MCP — that surfaces only what's in the Ads conversion report. To cross-check against GA4, you'd need a separate GA4 MCP or pull both reports manually. NotFair's roadmap includes GA4 integration.",
      },
      {
        question: "Should imported GA4 conversions or native Ads tags be primary?",
        answer:
          "It depends on your tracking setup, but usually native Ads tags are more reliable because they're not subject to GA4's 24-hour processing lag. Use native Ads conversions as primary and GA4 imports as secondary or for analysis only.",
      },
      {
        question: "What if Claude flags a conversion that's actually working correctly?",
        answer:
          "Sometimes happens — if your business model has a long sales cycle, a 14-day silence might be normal. Tell Claude the context: \"this conversion is for enterprise deals with a 30-day cycle\" and it adjusts the analysis. The flag is a heuristic, not gospel.",
      },
    ],
    relatedLinks: [
      { href: "/blog/ai-google-ads-quality-score-audit", title: "AI Google Ads Quality Score Audit", description: "Conversion tracking issues often show up as QS issues downstream — audit both." },
      { href: "/blog/claude-find-wasted-ad-spend", title: "Find Wasted Ad Spend With Claude", description: "Broken conversions distort waste analysis — fix tracking first." },
      { href: "/connect", title: "Try It on Your Account", description: "Run a tracking audit in 5 minutes." },
    ],
  },
  "claude-vs-chatgpt-for-google-ads": {
    slug: "claude-vs-chatgpt-for-google-ads",
    title: "Claude vs ChatGPT for Google Ads (2026)",
    seoTitle: "Claude vs ChatGPT for Google Ads: Honest 2026 Pick",
    description:
      "Both Claude and ChatGPT manage Google Ads via the same NotFair MCP. Here's where each one wins, where it's a tie, and which to start with.",
    keywords: [
      "claude vs chatgpt for google ads",
      "claude or chatgpt google ads",
      "best ai for google ads chatgpt vs claude",
      "chatgpt google ads vs claude",
    ],
    publishedAt: "2026-04-29",
    updatedAt: "2026-04-29",
    author: { name: "NotFair Team", role: "AI ads infrastructure" },
    content: [
      {
        type: "text",
        content:
          "Both Claude and ChatGPT can manage Google Ads in 2026, and they do it through the same path: a hosted MCP (Model Context Protocol) server like NotFair. One OAuth flow at notfair.co/connect powers both. The honest answer is that for most users either is fine — pick the assistant you already pay for, then revisit if you hit the edges where they differ.",
      },
      {
        type: "text",
        content:
          "If you're on the fence, we recommend trying both. The same NotFair connection works in Claude Desktop and in ChatGPT (via the Codex connector and Codex CLI), so a single setup gets you side-by-side runs of the same prompt across both models.",
      },
      {
        type: "heading",
        content: "TL;DR — when each one wins",
      },
      {
        type: "list",
        content: "",
        items: [
          "Claude wins on — long-context audits, multi-step tool orchestration (parallel GAQL fan-outs, change-history correlation), and following nuanced approval gates without rushing.",
          "ChatGPT wins on — the Codex connector ecosystem, plugin breadth outside of ads, and teams already living in ChatGPT for everything else.",
          "Tie — basic audits, search term cleanup, bid changes, RSA generation, and pause/enable workflows. Either model handles these well.",
        ],
      },
      {
        type: "heading",
        content: "Where Claude pulls ahead",
      },
      {
        type: "subheading",
        content: "Long-context account audits",
      },
      {
        type: "text",
        content:
          "Claude's larger working context handles full-account audits without dropping detail. When NotFair's runScript fans out 10–20 parallel GAQL queries for a real audit, the result set can be hundreds of rows of campaigns, search terms, quality scores, and change events. Claude tends to keep all of that in mind across follow-up questions; in our testing it's less likely to forget the campaign you flagged 15 messages ago.",
      },
      {
        type: "subheading",
        content: "Multi-step tool orchestration",
      },
      {
        type: "text",
        content:
          "Real ads work is rarely one tool call. It's audit, then surface a hypothesis, then drill into the specific ad group, then propose negatives, then ask for approval before applying. Claude's planning loop chains these steps cleanly. We see ChatGPT occasionally short-circuit a multi-step audit into a single broad query, which gives a faster but shallower answer.",
      },
      {
        type: "subheading",
        content: "Approval-gate discipline",
      },
      {
        type: "text",
        content:
          "Destructive write operations (bulk pause, budget changes, removing assets) hit a server-side approval gate inside NotFair. Both assistants respect the gate, but Claude is more deliberate about presenting the diff before invoking it — \"here are the 47 keywords I want to pause; confirm?\" rather than diving straight to the call.",
      },
      {
        type: "heading",
        content: "Where ChatGPT pulls ahead",
      },
      {
        type: "subheading",
        content: "Codex connector ecosystem",
      },
      {
        type: "text",
        content:
          "ChatGPT exposes MCP through its Codex connectors (and the Codex CLI). If your stack already lives in ChatGPT — analytics plugins, custom GPTs, internal connectors — adding NotFair plugs Google Ads into the same surface. You get cross-tool prompts like \"compare last week's Google Ads spend with conversions in our analytics connector\" without bouncing between assistants.",
      },
      {
        type: "subheading",
        content: "Familiarity for non-technical teammates",
      },
      {
        type: "text",
        content:
          "If your marketer, junior, or client already uses ChatGPT daily, the friction of teaching them to use NotFair is roughly zero. Same prompts, same chat UI, just with Google Ads tools wired in. That's a real adoption advantage that has nothing to do with raw model quality.",
      },
      {
        type: "heading",
        content: "Setup is the same for both",
      },
      {
        type: "text",
        content:
          "One OAuth flow at notfair.co/connect grants Google Ads access. After that, install the connector once for Claude (Connectors UI in Claude Desktop or claude.ai) and once for ChatGPT (Codex connector). Both auths share the same NotFair-side credentials, so you don't reauthorize Google when you switch assistants.",
      },
      {
        type: "callout",
        content:
          "You: Audit my account for last 30 days, then explain what changed in the last 7.\n\nClaude: Running parallel GAQL across campaigns, search terms, quality scores, and change events… top finding: spend on \"free [brand]\" increased 38% with 0 conversions. Three RSAs were edited last Tuesday — two had final-URL changes that broke tracking. Want me to draft negatives and revert the URL changes?",
      },
      {
        type: "heading",
        content: "Our recommendation",
      },
      {
        type: "list",
        content: "",
        items: [
          "Default — start with Claude if you don't already have a strong preference. The orchestration discipline matters once you move past simple read questions.",
          "ChatGPT — start there if your team already lives in ChatGPT, or if you need NotFair to run alongside other Codex-connected tools.",
          "Both — the practical answer for power users. Same NotFair auth, different lens. Use Claude for deep audits and ChatGPT for fast back-and-forth.",
        ],
      },
      {
        type: "heading",
        content: "FAQ",
      },
    ],
    faq: [
      {
        question: "Do I need separate Google Ads access for Claude and ChatGPT?",
        answer:
          "No. NotFair holds the OAuth credentials. One sign-in at notfair.co/connect powers both Claude and ChatGPT, and revoking access in NotFair revokes it for both at once.",
      },
      {
        question: "Is one model materially better at Google Ads work?",
        answer:
          "Not for everyday tasks. Claude is more deliberate on multi-step audits and long-context follow-ups; ChatGPT integrates better with the rest of the Codex connector ecosystem. Outside the edges, the gap is small.",
      },
      {
        question: "Can I run the exact same prompt against both?",
        answer:
          "Yes — NotFair exposes the same ~40 tools to both clients. Run \"audit my account\" in Claude and ChatGPT side by side and compare. Most users find the answers converge on the same actions.",
      },
      {
        question: "Which one is safer for write operations?",
        answer:
          "Both. Approval gates on destructive writes live server-side inside NotFair, not on the assistant side. The model can request a bulk pause, but the gate is the same regardless of which assistant called it.",
      },
      {
        question: "Does Anthropic ship a first-party Google Ads connector?",
        answer:
          "No. As of April 2026, Anthropic does not publish its own Google Ads connector. The connection happens through third-party MCP servers like NotFair.",
      },
    ],
    relatedLinks: [
      { href: "/connect", title: "Connect Google Ads", description: "One OAuth flow that powers both Claude and ChatGPT." },
      { href: "/blog/which-ai-tools-work-with-google-ads", title: "Which AI Tools Work With Google Ads?", description: "The full list of MCP-compatible clients in 2026." },
      { href: "/blog/connect-google-ads-to-claude", title: "How to Connect Google Ads to Claude", description: "Step-by-step setup for every Claude surface plus ChatGPT/Codex and Cursor." },
    ],
  },
  "best-ai-for-ppc-management": {
    slug: "best-ai-for-ppc-management",
    title: "Best AI for PPC Management (2026)",
    seoTitle: "Best AI for PPC Management in 2026: Honest Comparison",
    description:
      "The best AI for PPC management depends on your team. Our 2026 picks for Claude, ChatGPT, Cursor, and Google's built-in AI features — with tradeoffs.",
    keywords: [
      "best ai for ppc management",
      "best ai ppc tools",
      "ai ppc management tools",
      "ai for paid media management",
    ],
    publishedAt: "2026-04-29",
    updatedAt: "2026-04-29",
    author: { name: "NotFair Team", role: "AI ads infrastructure" },
    content: [
      {
        type: "text",
        content:
          "The best AI for PPC management in 2026 isn't one tool — it's the right tool for your team. For most non-developer marketers, Claude with NotFair (a hosted Google Ads MCP server) is the default pick. For ChatGPT-loyal teams, ChatGPT with NotFair via the Codex connector is the same capability through a different chat UI. For technical agencies that script every workflow, Cursor + NotFair gives you a code-native cockpit. Google's own Smart Bidding and PMax sit in a different category and pair well with all of the above.",
      },
      {
        type: "heading",
        content: "TL;DR — pick by team",
      },
      {
        type: "list",
        content: "",
        items: [
          "Default for non-developers — Claude (Desktop or claude.ai) + NotFair. Lowest friction, strongest multi-step orchestration.",
          "ChatGPT-loyal teams — ChatGPT + NotFair via Codex. Same Google Ads coverage, different chat UI, integrates with your existing Codex connectors.",
          "Technical agencies — Cursor + NotFair. Treat campaigns like code, version control your prompts, build internal scripts on top of runScript.",
          "Google's built-in AI — Smart Bidding and PMax. Different category — they live inside Google Ads and run automatically, no chat layer.",
        ],
      },
      {
        type: "heading",
        content: "Claude + NotFair — the default",
      },
      {
        type: "text",
        content:
          "Claude is the assistant we recommend for most marketers managing Google Ads in 2026. The reasoning: long-context audits and multi-step tool orchestration are exactly what PPC work demands, and Claude's planning loop handles them without rushing.",
      },
      {
        type: "list",
        content: "",
        items: [
          "Strengths — full-account audits without dropping detail, careful approval-gate behavior on destructive writes, clean multi-tool chains.",
          "Surfaces — Claude Desktop, claude.ai, Claude Code, Claude Cowork, and the Claude API all work with NotFair through one OAuth flow.",
          "Tradeoff — slightly slower than ChatGPT on snappy back-and-forth questions. Worth it for audits.",
        ],
      },
      {
        type: "heading",
        content: "ChatGPT + NotFair (Codex) — the same capability",
      },
      {
        type: "text",
        content:
          "ChatGPT supports MCP via its Codex connectors and the Codex CLI. The same NotFair auth that powers Claude powers ChatGPT — one sign-in, both assistants, ~40 Google Ads tools. If your team already runs everything in ChatGPT, this is the path of least resistance.",
      },
      {
        type: "list",
        content: "",
        items: [
          "Strengths — sits next to your existing Codex connectors and custom GPTs, fastest path for ChatGPT-native teams, same tool coverage as Claude.",
          "Tradeoff — occasionally short-circuits multi-step audits into a single broad query. Fine for tactical questions, slightly less rigorous for full account reviews.",
        ],
      },
      {
        type: "heading",
        content: "Cursor + NotFair — for technical agencies",
      },
      {
        type: "text",
        content:
          "Cursor is the code editor with built-in MCP support. For agencies that already version control playbooks, build internal scripts, or run client work like a software project, wiring NotFair into Cursor turns Google Ads into a programmable surface. You can persist GAQL snippets in repo, kick off runScript directly from a code file, and review tool outputs alongside your normal IDE.",
      },
      {
        type: "list",
        content: "",
        items: [
          "Strengths — repeatable scripted audits, easy code review of agent-generated changes, low friction for engineering-led teams.",
          "Tradeoff — requires comfort in a code editor. Not the right surface for non-technical marketers or junior buyers.",
        ],
      },
      {
        type: "heading",
        content: "Google's built-in AI — different category",
      },
      {
        type: "text",
        content:
          "Smart Bidding (tCPA, tROAS, Maximize Conversions) and Performance Max are AI features that live inside Google Ads itself. They handle bid optimization and asset rotation automatically based on Google's signals. They don't replace a chat-based assistant — they complement one. The AI assistant audits the strategy and the data; Smart Bidding executes inside the auction in milliseconds.",
      },
      {
        type: "text",
        content:
          "Use both. Let Smart Bidding handle real-time bidding, and use Claude or ChatGPT to ask whether the strategy is the right one in the first place — \"is tROAS still beating Maximize Conversions on this campaign?\" \"What would happen if I switched this to manual CPC?\"",
      },
      {
        type: "heading",
        content: "What about Gemini?",
      },
      {
        type: "text",
        content:
          "As of April 2026, Gemini (the consumer app) does not support MCP clients, which means it cannot connect to Google Ads via NotFair or any other MCP server. Despite Gemini being a Google product, Claude and ChatGPT are ahead on Google Ads management today, specifically because of MCP support. Google may add MCP later — when it does, this list expands.",
      },
      {
        type: "heading",
        content: "Sample first prompt (works in any of the above)",
      },
      {
        type: "callout",
        content:
          "You: Audit my Google Ads account for the last 30 days. Find wasted spend, low-QS keywords, and any change-history events that could explain the CPA drift.\n\nAssistant: Running parallel GAQL across spend, search terms, quality scores, and change events… 3 quick wins worth ~$2,400/mo, 12 negative keywords to add, and one budget change last Thursday that doubled spend on a campaign with no tracking. Want me to draft the fixes?",
      },
      {
        type: "heading",
        content: "Decision in one line",
      },
      {
        type: "text",
        content:
          "If you don't already have a strong preference: Claude + NotFair. If you live in ChatGPT: ChatGPT + NotFair via Codex. If you're an agency that scripts everything: Cursor + NotFair. Google's Smart Bidding pairs with all three — don't pick one over the other.",
      },
      {
        type: "heading",
        content: "FAQ",
      },
    ],
    faq: [
      {
        question: "Is there a single \"best\" AI tool for PPC?",
        answer:
          "No. The best tool depends on your team's existing stack. Claude is our default for non-developers; ChatGPT for ChatGPT-loyal teams; Cursor for technical agencies. The Google Ads coverage is roughly identical because all three connect through the same NotFair MCP.",
      },
      {
        question: "Can I switch between AI tools without losing setup?",
        answer:
          "Yes. NotFair holds the Google Ads OAuth credentials, not the assistant. Sign in once at notfair.co/connect, and Claude, ChatGPT, and Cursor all use the same connection.",
      },
      {
        question: "Do I still need a PPC manager if I use AI?",
        answer:
          "For most accounts, yes — but the work shifts. AI handles audits, search-term cleanup, bid analysis, and reporting. Strategy, brand voice, and budget allocation across product lines still need a human in the loop.",
      },
      {
        question: "Does NotFair work with Microsoft Ads or Meta Ads?",
        answer:
          "NotFair focuses on Google Ads as of April 2026. Other MCP servers exist for Microsoft Ads and Meta — same pattern, different platform. Watch the NotFair changelog for cross-platform support.",
      },
    ],
    relatedLinks: [
      { href: "/connect", title: "Connect Google Ads", description: "One OAuth flow that powers Claude, ChatGPT, and Cursor." },
      { href: "/blog/which-ai-tools-work-with-google-ads", title: "Which AI Tools Work With Google Ads?", description: "The full list of MCP-compatible clients in 2026." },
      { href: "/blog/google-ads-ai-agent", title: "Building a Google Ads AI Agent", description: "How to set up and trust a Google Ads AI agent without losing sleep." },
    ],
  },
  "claude-vs-gemini-for-google-ads": {
    slug: "claude-vs-gemini-for-google-ads",
    title: "Claude vs Gemini for Google Ads (2026)",
    seoTitle: "Claude vs Gemini for Google Ads: Why Claude Wins Today",
    description:
      "Claude beats Gemini for Google Ads management today — not because of model quality, but because Gemini doesn't support MCP yet. Here's what that means.",
    keywords: [
      "claude vs gemini for google ads",
      "gemini google ads",
      "google gemini ads",
      "ai gemini google ads",
    ],
    publishedAt: "2026-04-29",
    updatedAt: "2026-04-29",
    author: { name: "NotFair Team", role: "AI ads infrastructure" },
    content: [
      {
        type: "text",
        content:
          "Claude is the better pick for Google Ads management in 2026 — and the reason is structural, not about model quality. Claude supports MCP (Model Context Protocol) clients, so it can connect to Google Ads through a hosted MCP server like NotFair. Gemini, the consumer app from Google, does not support MCP as of April 2026, so it cannot read or write to Google Ads the way Claude can. Despite Gemini being a Google product, this is the rare case where the non-Google assistant manages the Google product better.",
      },
      {
        type: "text",
        content:
          "This isn't a Gemini takedown. Gemini has real strengths — multimodal reasoning, deep Workspace integration, and Google's signal advantage. None of those help if you want to ask an AI to audit your Google Ads account today. MCP is the bridge, and Gemini hasn't crossed it yet.",
      },
      {
        type: "heading",
        content: "What Claude can do for Google Ads (and Gemini can't yet)",
      },
      {
        type: "list",
        content: "",
        items: [
          "Audit accounts in natural language — \"audit my account, find wasted spend\" runs ~20 parallel GAQL queries through NotFair and returns a ranked action list.",
          "Apply changes — pause keywords, add negatives, update bids, edit RSAs, change budgets, with server-side approval gates on destructive writes.",
          "Query change history — \"what changed last Tuesday?\" pulls Google Ads change events and correlates with spend movements.",
          "Connect once, use everywhere — Claude Desktop, claude.ai, Claude Code, Claude Cowork, and the Claude API all use the same NotFair OAuth.",
          "Operate alongside ChatGPT — same NotFair connection powers ChatGPT via Codex, so Claude's setup isn't a lock-in.",
        ],
      },
      {
        type: "heading",
        content: "What Gemini does well (just not for Google Ads via MCP)",
      },
      {
        type: "list",
        content: "",
        items: [
          "Multimodal — Gemini handles images, audio, and video natively. Useful for creative review and ad asset analysis pasted into the chat.",
          "Workspace integration — deep ties into Gmail, Docs, Sheets, and the broader Google Workspace surface area.",
          "Google Ads UI in the browser — Gemini in Chrome can summarize what you're seeing in the Google Ads UI, but that's screen-reading, not API access.",
          "Limited Workspace-side Ads features — Google has experimented with surfacing Ads insights inside Workspace, but the surface is much smaller than the full API.",
        ],
      },
      {
        type: "heading",
        content: "Why MCP is the deciding factor",
      },
      {
        type: "text",
        content:
          "MCP (Model Context Protocol) is the open standard that lets AI clients call external tools — Google Ads, GitHub, Slack, anything with an MCP server. Claude pioneered MCP support, and ChatGPT followed via Codex. Gemini's consumer app doesn't speak MCP yet, which means it can't invoke the tools that NotFair exposes.",
      },
      {
        type: "text",
        content:
          "Without MCP, Gemini can describe what Google Ads does, but it can't read your account, run a real audit, or apply a change. It's the difference between a research assistant who reads docs and a hands-on operator who actually pauses the underperforming campaign.",
      },
      {
        type: "heading",
        content: "Will Gemini support MCP later?",
      },
      {
        type: "text",
        content:
          "Probably. MCP adoption has accelerated since 2025, and a Google AI assistant without MCP support is increasingly the exception. When Gemini adds MCP, the picture changes — Google's first-party ad signals plus MCP tooling would be a strong combination. Until then, Claude (or ChatGPT via Codex) is the practical choice for managing Google Ads with AI.",
      },
      {
        type: "heading",
        content: "What we'd recommend today",
      },
      {
        type: "list",
        content: "",
        items: [
          "Default — Claude + NotFair for Google Ads work. Sign in at notfair.co/connect and add the connector to Claude Desktop or claude.ai.",
          "Already in ChatGPT — ChatGPT + NotFair via Codex gets you the same capability. Same auth, different assistant.",
          "Use Gemini for adjacent work — multimodal asset review, Workspace summaries, and general research where it's genuinely strong.",
          "Revisit when Gemini ships MCP — the comparison flips at that point, and we'll update this post.",
        ],
      },
      {
        type: "callout",
        content:
          "You: My Search campaign CPA jumped 40% last week. Find why.\n\nClaude: Pulled change history + spend + search terms in parallel. Two changes Tuesday: bid strategy switched from tCPA to Maximize Conversions, and a brand negative list was unlinked. The negative list change opened spend on \"free [brand]\" — 38% of last week's incremental cost, zero conversions. Want me to relink the negative list?",
      },
      {
        type: "heading",
        content: "FAQ",
      },
    ],
    faq: [
      {
        question: "Can Gemini connect to Google Ads at all?",
        answer:
          "Not via MCP as of April 2026. Gemini in Chrome can read what's on screen in the Google Ads UI, and Workspace has limited Ads surfaces, but neither matches the full API access Claude gets through NotFair.",
      },
      {
        question: "Is Claude actually better than Gemini overall?",
        answer:
          "For Google Ads management today, yes — because of MCP support, not because of raw model quality. For other tasks (multimodal reasoning, Workspace integration), Gemini is competitive or stronger. Pick the right tool for the task.",
      },
      {
        question: "What happens to this comparison if Gemini adds MCP?",
        answer:
          "It changes. Gemini with MCP plus Google's first-party signals would be a strong option. We'll update this post when that ships.",
      },
      {
        question: "Does using Claude for Google Ads send my data to Google?",
        answer:
          "Tool calls go from Claude to NotFair to the Google Ads API — same data flow you'd get from any Google Ads API client. NotFair only requests what Claude asks for; it doesn't broadcast your account to anyone.",
      },
      {
        question: "Can I use Claude alongside Google's Smart Bidding?",
        answer:
          "Yes. Smart Bidding runs inside Google Ads at auction time. Claude + NotFair runs at the strategy and audit layer. They are complementary — Claude tells you whether Smart Bidding has the right setup, and Smart Bidding executes inside it.",
      },
    ],
    relatedLinks: [
      { href: "/connect", title: "Connect Google Ads", description: "Start the OAuth flow and pick which accounts Claude can manage." },
      { href: "/blog/which-ai-tools-work-with-google-ads", title: "Which AI Tools Work With Google Ads?", description: "The current list of MCP-compatible AI clients." },
      { href: "/blog/can-claude-manage-google-ads", title: "Can Claude Manage Google Ads?", description: "What Claude can and can't do once it has MCP access." },
    ],
  },
  "ai-google-ads-agent-comparison": {
    slug: "ai-google-ads-agent-comparison",
    title: "AI Google Ads Agent Comparison (2026)",
    seoTitle: "AI Google Ads Agent Comparison 2026: Categories That Matter",
    description:
      "A 2026 comparison of AI Google Ads tools — MCP-based agents (Claude, ChatGPT, Cursor) vs SaaS optimizers vs Google's built-in AI. Decision matrix at the end.",
    keywords: [
      "ai google ads agent comparison",
      "google ads ai tools comparison",
      "ai ads management comparison",
      "compare ai google ads tools",
    ],
    publishedAt: "2026-04-29",
    updatedAt: "2026-04-29",
    author: { name: "NotFair Team", role: "AI ads infrastructure" },
    content: [
      {
        type: "text",
        content:
          "There are dozens of AI tools that touch Google Ads in 2026, but they fall into three meaningfully different categories — and picking the right category matters more than picking a brand. The categories: MCP-based AI agents (Claude or ChatGPT plus a hosted MCP server like NotFair), SaaS PPC optimizers with embedded AI, and Google's own first-party AI inside the Ads platform. Most teams should run one tool from each category, not pick a single winner.",
      },
      {
        type: "heading",
        content: "The three categories at a glance",
      },
      {
        type: "list",
        content: "",
        items: [
          "MCP-based AI agents — Claude, ChatGPT (via Codex), or Cursor connected to a hosted MCP server like NotFair. Most flexible, conversation-driven, full API coverage.",
          "SaaS PPC optimizers — third-party platforms that ingest Google Ads data and surface AI-driven recommendations through their own dashboard. Examples in this category include rule-based optimizers, automated negative keyword tools, and bid management suites.",
          "Google's first-party AI — Smart Bidding (tCPA, tROAS, Maximize Conversions), Performance Max, and the AI features inside the Google Ads UI. Runs inside the auction, no chat layer.",
        ],
      },
      {
        type: "heading",
        content: "Category 1 — MCP-based AI agents",
      },
      {
        type: "text",
        content:
          "An MCP-based agent is just an AI assistant (Claude, ChatGPT, or Cursor) wired to Google Ads through a Model Context Protocol server. NotFair is the hosted MCP option — one OAuth flow at notfair.co/connect, ~40 read and write tools, server-side approval gates on destructive writes, and the same connection works for Claude and ChatGPT in parallel.",
      },
      {
        type: "list",
        content: "",
        items: [
          "Strengths — full Google Ads API surface, natural-language queries, multi-step tool orchestration, easy human-in-the-loop pattern with approval gates.",
          "Weaknesses — requires you to drive the conversation. Not a set-it-and-forget-it system. Best with at least weekly engagement.",
          "Who it's for — operators who want to actually understand their account and apply changes themselves. Marketers, in-house PPC managers, and most agencies.",
        ],
      },
      {
        type: "heading",
        content: "Category 2 — SaaS PPC optimizers with embedded AI",
      },
      {
        type: "text",
        content:
          "This category is the legacy PPC tooling space, now reframed with AI features. Tools in this category run continuously against your Google Ads account on a fixed schedule, surface recommendations in their own dashboard, and let you accept or reject batches of changes. They're typically rule-based under the hood with AI-generated explanations on top.",
      },
      {
        type: "list",
        content: "",
        items: [
          "Strengths — runs continuously without prompting, opinionated UX with one-click accept-all, mature in areas like negative keyword automation and bid scripts.",
          "Weaknesses — opaque logic, harder to ask custom questions, slow to add features compared to MCP agents, often duplicates what Smart Bidding does for free.",
          "Who it's for — large agencies managing many accounts who want a dashboard cockpit. Less compelling for single-account operators.",
        ],
      },
      {
        type: "heading",
        content: "Category 3 — Google's first-party AI",
      },
      {
        type: "text",
        content:
          "Smart Bidding and Performance Max are Google's AI features that live inside Google Ads. They run inside the auction in milliseconds, optimizing bids and asset rotation against signals only Google sees. There is no chat layer — you set goals (CPA, ROAS, conversions) and Google's models execute.",
      },
      {
        type: "list",
        content: "",
        items: [
          "Strengths — operates on signals no third party can match (cross-device, query intent, real-time auction context), zero ongoing operator effort once configured.",
          "Weaknesses — opaque, doesn't explain itself, can't be asked questions, ignores context outside Google's signals.",
          "Who it's for — basically every Google Ads account. Smart Bidding is table stakes in 2026.",
        ],
      },
      {
        type: "heading",
        content: "Decision matrix",
      },
      {
        type: "list",
        content: "",
        items: [
          "Solo founder, one account, weekly check-ins — Claude + NotFair, plus Smart Bidding inside the account. Skip the SaaS optimizer.",
          "In-house PPC manager, 1–5 accounts — Claude or ChatGPT + NotFair as the main cockpit, Smart Bidding inside campaigns, occasional spot-check with a SaaS optimizer free trial if you want a second opinion.",
          "Agency, 20+ accounts — MCP agents for deep audits and custom work, a SaaS optimizer as the always-on dashboard for routine recommendations, Smart Bidding inside every account.",
          "Enterprise with strict compliance — MCP agents for analyst workflows, custom integration with a SaaS optimizer for governance/reporting, Smart Bidding for execution.",
          "ChatGPT-loyal team — same recommendation as above but swap Claude for ChatGPT via Codex. NotFair is the same.",
        ],
      },
      {
        type: "heading",
        content: "Why MCP-based agents are the most flexible category",
      },
      {
        type: "text",
        content:
          "SaaS optimizers ship a fixed feature set; you wait for the vendor to add what you need. Google's AI runs inside the auction and doesn't take requests. MCP-based agents are different — the underlying Google Ads API has thousands of GAQL queries you can write, and a tool like NotFair's runScript lets the assistant compose any of them on demand. New question, new analysis, no roadmap dependency.",
      },
      {
        type: "callout",
        content:
          "You: Compare last 30 days vs prior 30 days. Spend up, conversions flat — find what changed.\n\nClaude: Running parallel GAQL across campaigns, search terms, change events, and quality scores… two findings. (1) Brand campaign CPC up 22% from auction-insights pressure. (2) A negative list was unlinked Apr 14, opening $1,840 of irrelevant spend. Want the relink and a draft note for the team?",
      },
      {
        type: "heading",
        content: "What we'd actually recommend",
      },
      {
        type: "text",
        content:
          "Run all three categories. Smart Bidding inside every campaign as a baseline. An MCP-based agent (Claude or ChatGPT + NotFair) as your primary thinking partner — for audits, search-term work, and multi-step decisions. A SaaS optimizer only if you're at agency scale and want an always-on dashboard for many accounts. Single-account operators usually don't need the SaaS layer.",
      },
      {
        type: "heading",
        content: "FAQ",
      },
    ],
    faq: [
      {
        question: "Should I pick just one AI tool for Google Ads?",
        answer:
          "Usually no. The three categories serve different jobs. Smart Bidding executes inside the auction. MCP-based agents do strategy and audits. SaaS optimizers run dashboards. Most teams benefit from at least two of the three.",
      },
      {
        question: "Are MCP-based agents harder to set up than SaaS tools?",
        answer:
          "No — actually the opposite for hosted servers. NotFair takes about 5 minutes through one OAuth flow. SaaS optimizers usually require account linking plus a learning period plus team training on their UI.",
      },
      {
        question: "Does Anthropic publish its own Google Ads agent?",
        answer:
          "No. As of April 2026, Anthropic does not ship a first-party Google Ads connector. The connection happens via third-party MCP servers like NotFair.",
      },
      {
        question: "Where does Gemini fit in this comparison?",
        answer:
          "Not yet. Gemini (consumer app) doesn't support MCP clients as of April 2026, so it can't function as an MCP-based agent for Google Ads. When it adds MCP, it joins the first category.",
      },
      {
        question: "What about browser-use AI agents that drive the Google Ads UI?",
        answer:
          "They exist, but the MCP path is faster, safer, and more reliable. Driving the UI breaks every time Google ships a layout change; the API stays stable. We don't recommend browser-use agents for production ads work.",
      },
    ],
    relatedLinks: [
      { href: "/blog/google-ads-mcp-servers-compared", title: "Google Ads MCP Servers Compared", description: "Picking the right MCP server for your AI tool." },
      { href: "/blog/google-ads-ai-agent", title: "Building a Google Ads AI Agent", description: "How to set up and trust a Google Ads AI agent without losing sleep." },
      { href: "/google-ads-mcp", title: "NotFair Google Ads MCP Server", description: "The hosted MCP server — connect Google Ads in one OAuth flow." },
    ],
  },
  "google-ads-ai-for-agencies": {
    slug: "google-ads-ai-for-agencies",
    title: "Google Ads AI for Agencies: Run 10+ Accounts Per PM",
    seoTitle: "Google Ads AI for Agencies — MCC, Audits, Reports",
    description:
      "Google Ads AI for agencies: run weekly audits across every MCC client in one prompt, draft client-ready reports, and scale account managers without hiring.",
    keywords: [
      "google ads ai for agencies",
      "ai google ads agency",
      "ai for ppc agency",
      "agency google ads ai",
    ],
    publishedAt: "2026-04-29",
    updatedAt: "2026-04-29",
    author: { name: "NotFair Team", role: "AI ads infrastructure" },
    content: [
      {
        type: "text",
        content:
          "If you run a media-buying agency, the math on weekly account reviews has never worked. A thorough audit takes 60-90 minutes per account. With 12 clients, that's a day and a half — every week — before anyone has touched a bid. Google Ads AI through Claude collapses that to a single prompt across the whole MCC.",
      },
      {
        type: "text",
        content:
          "We built NotFair specifically with agencies in mind. The hosted MCP server at notfair.co supports manager (MCC) accounts natively — when you connect, you pick which direct customers and client accounts under your manager Claude should be able to read and act on. Once connected, Claude can fan out audits across every account in parallel.",
      },
      {
        type: "heading",
        content: "What changes when an agency uses Google Ads AI",
      },
      {
        type: "list",
        content: "",
        items: [
          "Weekly reviews go from 12 hours to 12 minutes — an audit that used to fill Monday now runs while you make coffee.",
          "Client reports write themselves — Claude pulls last week's spend, conversions, and CPA per account and drafts the email in your tone.",
          "New account onboarding gets faster — handing a new client off to a junior PM no longer requires a senior buyer to do the first audit by hand.",
          "Senior buyers stop being the bottleneck — leverage moves from headcount to a connected Claude session per account manager.",
          "Margin improves without raising rates — the same retainer covers more depth of optimization, not more hours.",
        ],
      },
      {
        type: "callout",
        content:
          "You: Run a wasted-spend audit across all 14 client accounts under our MCC. For each one, return the top 5 search terms with spend over $100 and zero conversions in the last 30 days.\n\nClaude: Pulled all 14. Sorted. Acme Plumbing has $3,400 of waste on \"free leak repair\" terms. Vista Dental has nothing flagged — clean. Drafted a client-ready summary per account; want me to send the Acme one to their PM?",
      },
      {
        type: "heading",
        content: "Recommendation-only mode for client preview",
      },
      {
        type: "text",
        content:
          "One pattern we hear from agencies: \"how do I show a client what we'd do, before we do it?\" Run Claude in recommendation-only mode. Approval gates on destructive writes are server-side at NotFair, so you can ask Claude for a full optimization plan — bid changes, negatives, paused keywords, budget shifts — and it generates a structured proposal without touching the account. Paste it into your Friday client deck.",
      },
      {
        type: "heading",
        content: "Auto-generated weekly client reports",
      },
      {
        type: "text",
        content:
          "Most agencies waste an entire afternoon per week on reporting. Claude eliminates that. Ask for last week's performance, top movers, what got optimized, and what's flagged for next week — Claude returns a formatted brief per account in one pass. Some agencies pipe it directly to email; others paste it into a Notion template. See the AI weekly report guide for a tighter spec.",
      },
      {
        type: "heading",
        content: "Approval gates: when AI suggests, when humans decide",
      },
      {
        type: "text",
        content:
          "Read access can run autonomously — Claude reading audits, surfacing wasted spend, drafting client emails, all safe. Write access (pausing campaigns, bulk bid updates, removing keywords) goes through approval gates. For agencies, this is the right default. The senior buyer reviews and approves, the AI does the typing. Same outcome, 10x the throughput. A junior account manager runs $60-80K fully loaded and can hold maybe 8 accounts at quality. A senior PM with NotFair can hold 20 at a higher quality bar — the unit economics shift dramatically.",
      },
      {
        type: "heading",
        content: "Getting started in under an hour",
      },
      {
        type: "list",
        content: "",
        items: [
          "Connect at notfair.co/connect — sign in with the Google identity that has manager access.",
          "Select your MCC plus the client accounts you want Claude to see — pick all of them or scope to a subset.",
          "Install the connector in Claude Desktop, Claude Web, or Claude Code. The same connection works across all of them simultaneously.",
          "Run a single test prompt: \"audit my full MCC and return the top 3 issues per account.\"",
          "Decide which clients are read-only and which graduate to write-with-approval. Most agencies start with everyone read-only for the first week.",
        ],
      },
      {
        type: "heading",
        content: "FAQ",
      },
    ],
    faq: [
      {
        question: "Does NotFair support manager (MCC) accounts?",
        answer:
          "Yes. During the connect flow, NotFair detects every customer ID linked under your Google identity — including direct accounts and clients under a manager — and lets you pick which ones Claude can access.",
      },
      {
        question: "Can multiple account managers use the same NotFair connection?",
        answer:
          "Each PM should connect under their own Google identity for clean OAuth and audit logs. The MCP server supports multiple Claude clients simultaneously, so a PM running Claude Desktop and Claude Code at the same time is fine.",
      },
      {
        question: "How do I show a client a recommendation without applying it?",
        answer:
          "Ask Claude for a recommendation report rather than a write action. Server-side approval gates stop destructive writes from running unattended, so a \"draft me a plan\" prompt is safe — you get a formatted proposal you can paste into a client deck.",
      },
      {
        question: "Is the data Google Ads OAuth-scoped?",
        answer:
          "Yes. NotFair's OAuth scopes are limited to Google Ads only. We do not access Gmail, Drive, Analytics, or other Google products through the same connection.",
      },
      {
        question: "Can I scope a Claude session to one client account?",
        answer:
          "Yes. You can switch active customers mid-conversation by name (\"switch to Vista Dental\") or scope a Claude project to one client at session start.",
      },
    ],
    relatedLinks: [
      { href: "/connect", title: "Connect Google Ads", description: "Start the OAuth flow and pick which manager-linked accounts Claude can manage." },
      { href: "/blog/ai-google-ads-weekly-report", title: "AI Weekly Google Ads Report", description: "Generate client-ready weekly reports across every account in one prompt." },
      { href: "/blog/claude-find-wasted-ad-spend", title: "Find Wasted Ad Spend with Claude", description: "Run portfolio-wide wasted-spend audits across an MCC in minutes." },
    ],
  },
  "google-ads-ai-for-small-business": {
    slug: "google-ads-ai-for-small-business",
    title: "Google Ads AI for Small Business: Stop Wasting Budget",
    seoTitle: "Google Ads AI for Small Business — Plain English",
    description:
      "Google Ads AI for small business: catch wasted spend, fix conversion tracking, and get plain-English answers to what's working — without hiring an agency.",
    keywords: [
      "google ads ai for small business",
      "ai google ads small business",
      "small business google ads ai",
      "ai ppc small business",
    ],
    publishedAt: "2026-04-29",
    updatedAt: "2026-04-29",
    author: { name: "NotFair Team", role: "AI ads infrastructure" },
    content: [
      {
        type: "text",
        content:
          "If you're running your own Google Ads on a $1K-$10K monthly budget, you already know the bind: you can't justify $2K/month for an agency, the Google Ads UI assumes you have a media-buying degree, and Smart Bidding eats anything you don't actively understand. Google Ads AI through Claude is the missing layer. Plain English in, account-specific answers out.",
      },
      {
        type: "text",
        content:
          "We built NotFair for exactly this audience. It's a hosted MCP server — meaning there's nothing to install on your computer beyond Claude itself, no developer tokens to apply for, no API quota to manage. Sign in with the Google account that runs your ads, and Claude can see your account.",
      },
      {
        type: "heading",
        content: "Try it before you connect your account",
      },
      {
        type: "text",
        content:
          "Skeptical? Start at notfair.co/connect with the demo mode. We loaded a real anonymized small-business account so you can ask Claude things like \"where am I wasting money\" and \"what's my best campaign\" before granting access to your own data. If the demo is useful, the OAuth flow takes another two minutes.",
      },
      {
        type: "heading",
        content: "The five things every small business should ask Claude first",
      },
      {
        type: "list",
        content: "",
        items: [
          "Wasted spend — \"Find every search term that has spent more than $50 in the last 60 days with zero conversions.\" The list is usually longer than you'd guess.",
          "Conversion tracking health — \"Audit my conversion tracking. Are all my conversion actions firing? Any duplicates?\" Most small businesses we see have at least one broken conversion.",
          "Quality Score — \"Show me my keywords with quality score under 5 sorted by spend.\" Below-5 keywords cost you 2-4x more per click than they should.",
          "Smart Bidding sanity check — \"Is my bidding strategy actually getting me conversions, or is it spending budget without delivering?\" Claude reads the conversion lag honestly.",
          "Geographic waste — \"Am I getting clicks from cities I don't serve?\" Plumbers running national campaigns is a real problem we see often.",
        ],
      },
      {
        type: "heading",
        content: "Plain-English explanations, not jargon",
      },
      {
        type: "callout",
        content:
          "You: I spent $1,800 last month and got 9 leads. Is that good or bad?\n\nClaude: At $200 per lead, you're below your cost target if your average customer is worth more than $600 lifetime. But three of those leads came from one keyword (\"emergency dishwasher repair near me\") that costs $0.40 per click and converts at 12%. The other six leads cost you $1,750 collectively. The fix: pause six keywords that drove zero or low-quality traffic, and double the budget on the one that's working.",
      },
      {
        type: "heading",
        content: "What about Performance Max?",
      },
      {
        type: "text",
        content:
          "PMax is the campaign type Google pushes hardest and the one most small businesses get burned by. Claude can audit your PMax campaign, tell you which asset groups are pulling weight, identify whether your conversions are coming from genuinely new customers or from existing brand searches Google is taking credit for, and recommend whether to keep it or move budget to a search campaign. We've seen this single audit save accounts $500+/month.",
      },
      {
        type: "heading",
        content: "No developer skills, with approval before changes",
      },
      {
        type: "text",
        content:
          "If you can install Claude Desktop, you can use NotFair. Open notfair.co/connect, sign in with Google, pick your Ads account, click \"add to Claude.\" Done. Writes default to require approval — Claude can recommend pausing a keyword, but the actual click happens after you say yes. You stay in control, the AI does the analysis.",
      },
      {
        type: "heading",
        content: "Your first weekly routine",
      },
      {
        type: "list",
        content: "",
        items: [
          "Monday — \"How did last week go? Any campaigns I should worry about?\" Claude reviews spend, conversions, and any flagged anomalies.",
          "Wednesday — \"Find new wasted-spend search terms from this week and add them as negatives.\" Approve the list, Claude applies them.",
          "Friday — \"What's my Quality Score doing? Anything dropping?\" Catch issues before they snowball.",
          "Monthly — \"Audit my conversion tracking and PMax setup. Anything broken or misconfigured?\" Long-running issues get caught early.",
        ],
      },
      {
        type: "heading",
        content: "FAQ",
      },
    ],
    faq: [
      {
        question: "Do I need a Google Ads developer token?",
        answer:
          "No. NotFair handles the developer token for you. You only complete a normal Google OAuth flow with the account that runs your ads.",
      },
      {
        question: "Can I try it without connecting my account?",
        answer:
          "Yes. The demo at notfair.co/connect loads an anonymized small-business account so you can prompt Claude before granting access to your own data.",
      },
      {
        question: "Will Claude actually change things in my account?",
        answer:
          "Only if you grant write access and approve each change. Read-only is the safer default for small business owners; you can graduate to write actions once you've built trust.",
      },
      {
        question: "What if I'm running both Search and Performance Max?",
        answer:
          "Claude audits both. PMax is where small businesses lose the most money to misconfiguration, so we'd recommend an explicit \"audit my PMax campaign and tell me if it's actually working\" prompt early on.",
      },
      {
        question: "Is my data safe?",
        answer:
          "OAuth scopes are limited to Google Ads only — NotFair cannot access Gmail, Drive, or Analytics. The connection is yours; you can revoke it from your Google account at any time.",
      },
    ],
    relatedLinks: [
      { href: "/connect", title: "Connect Google Ads", description: "Try the demo or connect your own account in under five minutes." },
      { href: "/blog/claude-find-wasted-ad-spend", title: "Find Wasted Ad Spend with Claude", description: "The first prompt every small business owner should run." },
      { href: "/blog/ai-conversion-tracking-audit", title: "AI Conversion Tracking Audit", description: "Catch broken conversion events before they cost you another month of budget." },
    ],
  },
  "claude-google-ads-for-ecommerce": {
    slug: "claude-google-ads-for-ecommerce",
    title: "Claude Google Ads for Ecommerce: ROAS-First Reporting",
    seoTitle: "Claude Google Ads for Ecommerce — Shopping & PMax",
    description:
      "Claude Google Ads for ecommerce: ROAS-first audits across Shopping and PMax, search term cleanup, and conversion tracking checks for $20K-$200K/month brands.",
    keywords: [
      "claude google ads for ecommerce",
      "ai google ads ecommerce",
      "ecommerce google ads ai",
      "ai shopping ads",
    ],
    publishedAt: "2026-04-29",
    updatedAt: "2026-04-29",
    author: { name: "NotFair Team", role: "AI ads infrastructure" },
    content: [
      {
        type: "text",
        content:
          "If you run an ecommerce brand spending $20K-$200K/month on Google Ads, your KPI is ROAS, not CPA — and the standard Google Ads UI is designed around the wrong metric. Worse, your real performance lives across Shopping, PMax, brand search, and a feed-quality layer Google barely surfaces. Claude through NotFair gives you a single ROAS-first lens across all of it.",
      },
      {
        type: "text",
        content:
          "We've found ecommerce operators care about three questions every week: did we hit blended ROAS, where did the budget actually go, and is conversion tracking still firing the way it should be? Claude answers all three without tab-switching.",
      },
      {
        type: "heading",
        content: "ROAS-first reporting Claude can run on demand",
      },
      {
        type: "list",
        content: "",
        items: [
          "Blended ROAS across all campaigns — \"What was my ROAS last week, broken down by Shopping vs PMax vs Search vs Brand?\"",
          "Top winners and losers — \"Which campaigns hit my 3x ROAS target last week, which fell below 2x, and what changed?\"",
          "New customer ROAS — \"Strip out branded conversions and show me my new-customer ROAS only.\" The number that actually grows the business.",
          "Holiday-cycle compares — \"Compare this week's Shopping ROAS to the same week of Black Friday cycle last year.\"",
          "Product-level performance — \"Which products in my feed drove 80% of revenue this month, and which are eating budget at sub-1x ROAS?\"",
        ],
      },
      {
        type: "heading",
        content: "PMax: the black box gets a flashlight",
      },
      {
        type: "text",
        content:
          "PMax frustrates ecommerce operators because Google withholds detail by default. Claude pushes harder. It pulls asset group performance, search categories, audience signals, and listing group spend, then tells you whether your PMax is genuinely incremental or whether it's harvesting branded traffic. We see brands recover meaningful margin from a single PMax audit.",
      },
      {
        type: "callout",
        content:
          "You: My PMax campaign reports 4.2x ROAS but my overall account is only at 2.8x. What's going on?\n\nClaude: PMax is double-counting branded search. 38% of its reported conversions came from queries containing your brand name — which would have converted via your Brand Search campaign anyway. Stripped of those, PMax's true incremental ROAS is 1.9x. Three options: add brand exclusions, shift PMax budget to Standard Shopping, or accept it as a brand defense layer. Want the negative keyword list to add?",
      },
      {
        type: "heading",
        content: "Search term cleanup and conversion tracking — the cheap audits that pay for themselves",
      },
      {
        type: "text",
        content:
          "Shopping campaigns leak budget on comparison shoppers, wrong product types, and free-intent searches. Claude pulls every search term that triggered a Shopping ad in the last 7 days, sorts by spend with no conversion, and produces a negative list ready to apply with one approval. On the conversion side, half the ecommerce accounts we see have at least one broken purchase event — a duplicate fire, a missing value, a Google Tag that lost its anchor after a Shopify theme update. Claude verifies what fired, whether values look sane, and where reported zero conversions should be hundreds.",
      },
      {
        type: "heading",
        content: "GA4 attribution sanity and holiday volatility",
      },
      {
        type: "text",
        content:
          "GA4 imports into Google Ads as a conversion source for many brands, and the data quality is uneven. Claude can compare in-platform conversions vs imported GA4 conversions and flag where the gap is unusually large. For peak cycles — Black Friday, Mother's Day, Q4 — your account behaves like a different account. Claude can pull last year's same-week performance, identify which campaigns hit walls (impression share lost to budget, lost to rank), and recommend pre-cycle budget moves a week before the surge.",
      },
      {
        type: "heading",
        content: "Feed quality and the brand-owner weekly digest",
      },
      {
        type: "text",
        content:
          "Your Shopping feed is your Shopping campaign — disapproved products, missing GTINs, and low-quality titles directly suppress impression share. Claude pulls product-level data showing which SKUs are getting impressions, which aren't, and where Merchant Center is unhappy. Pair this with a Friday brand-owner digest: three numbers up top (spend, revenue attributed, ROAS), three lines below on what crushed and what struggled, and one paragraph on next week. Brands with multiple storefronts under an MCC can connect them all and run portfolio-wide ROAS reports across every Claude client (Desktop, Web, Code, ChatGPT/Codex) simultaneously.",
      },
      {
        type: "heading",
        content: "FAQ",
      },
    ],
    faq: [
      {
        question: "Can Claude see Performance Max data?",
        answer:
          "Yes. Claude can pull asset group performance, search category insights, listing group spend, and audience signals — the full set of PMax data exposed via the Google Ads API.",
      },
      {
        question: "Does it work for Shopping and Performance Max together?",
        answer:
          "Yes. Most ecommerce brands run both, and Claude treats them as one inventory of campaigns. ROAS reports automatically span both campaign types.",
      },
      {
        question: "Will Claude touch my Merchant Center feed?",
        answer:
          "NotFair scopes to Google Ads only — Merchant Center is a separate product. Claude can read product performance through Ads, surface which SKUs are disapproved, and tell you what to fix in Merchant Center, but you do the feed edit there.",
      },
      {
        question: "How does new-customer ROAS work?",
        answer:
          "If you've configured the New Customer Acquisition goal in Google Ads, Claude can pull that segment directly. If not, Claude can approximate by stripping branded conversions from total ROAS as a quick proxy.",
      },
      {
        question: "Can it auto-apply negatives weekly?",
        answer:
          "It can — but we recommend approval gates for the first month. After you've reviewed a few weekly negative lists and trust the criteria, graduating to auto-apply on negative keywords (a hard-to-misuse write) is a reasonable next step.",
      },
    ],
    relatedLinks: [
      { href: "/blog/ai-conversion-tracking-audit", title: "AI Conversion Tracking Audit", description: "Catch broken purchase events on Shopify, BigCommerce, and headless ecommerce stacks." },
      { href: "/blog/claude-search-terms-report-analysis", title: "Search Terms Report Analysis", description: "Weekly Shopping and Search negative-keyword sweeps in one prompt." },
      { href: "/blog/ai-google-ads-weekly-report", title: "AI Weekly Google Ads Report", description: "Brand-owner-ready ROAS digest, generated in seconds." },
    ],
  },
  "claude-google-ads-for-saas": {
    slug: "claude-google-ads-for-saas",
    title: "Claude Google Ads for SaaS: Beyond Click Conversions",
    seoTitle: "Claude Google Ads for SaaS — Qualified Leads, Not Forms",
    description:
      "Claude Google Ads for SaaS: optimize for qualified leads and trial-to-paid, not form fills. Multi-touch context, brand bidding, expansion-keyword research.",
    keywords: [
      "claude google ads for saas",
      "ai google ads saas",
      "saas google ads ai",
      "ai ppc saas",
    ],
    publishedAt: "2026-04-29",
    updatedAt: "2026-04-29",
    author: { name: "NotFair Team", role: "AI ads infrastructure" },
    content: [
      {
        type: "text",
        content:
          "B2B SaaS Google Ads is hard for one structural reason: the click conversion is not the conversion that matters. A form fill is upstream of an SQL, an SQL is upstream of a trial, a trial is upstream of a paid customer, and the paid customer doesn't show up for 30-90 days. Optimizing toward form fills is the easiest way to fill your pipeline with garbage. We've worked with SaaS teams running $5K-$50K/month who realized halfway through their first audit that their bidding strategy was happily optimizing for free-tier signups that never converted to paid. Claude through NotFair lets you optimize toward the metric that actually matters.",
      },
      {
        type: "heading",
        content: "What SaaS teams should ask Claude first",
      },
      {
        type: "list",
        content: "",
        items: [
          "Lead-quality breakdown — \"For each campaign, what's my qualified-lead rate vs raw-lead rate? Where am I optimizing on volume not quality?\"",
          "Pipeline attribution — \"Trace conversions reported in Google Ads to actual deals closed in the last 90 days. Which campaigns produce real revenue?\"",
          "Brand-bidding ROI — \"Strip out branded keywords. What's my non-brand cost per qualified lead?\" The honest answer.",
          "Trial-to-paid by source — \"Which campaigns drive trials that convert to paid at the highest rate?\" Volume vs quality, exposed.",
          "Geographic expansion — \"Where am I getting cheap clicks but never closing? Where am I winning that I haven't doubled down on?\"",
        ],
      },
      {
        type: "heading",
        content: "Custom conversion definitions matter more than you think",
      },
      {
        type: "text",
        content:
          "Most SaaS accounts ship with the wrong conversion event in production. They count form fills, free signups, or pricing-page visits. Smart Bidding then optimizes toward more of the same — the cheapest form fills, the lowest-friction signups, the lookers who never buy. Claude can audit your conversion actions, identify the upgrade opportunity (qualified lead, demo booked, trial activated, paid conversion), and walk you through the fix.",
      },
      {
        type: "callout",
        content:
          "You: My CPA looks great in Google Ads — $42 per conversion. But our CRM says half of these leads disqualify in week one. What do I do?\n\nClaude: You're optimizing on form fills. Half your traffic is enterprise-sounding lookers who don't fit your ICP. Two fixes: First, push your qualified-lead event to Google Ads via offline conversion import (I can draft the spec). Second, in the meantime, exclude job titles below \"director\" via observation audiences and watch the cost-per-true-MQL move. We can ship the audience layer this week and the offline import next week.",
      },
      {
        type: "heading",
        content: "Multi-touch context and long sales cycles",
      },
      {
        type: "text",
        content:
          "B2B buyers touch your ads four to seven times before converting. Last-click attribution undercounts top-of-funnel keywords and overcredits brand. Claude can pull data-driven attribution conversions, compare them to last-click, and surface which keywords get systematically under-credited. And if your sales cycle is 60 days but your conversion lookback window is 30, Smart Bidding doesn't see half your conversions — Claude flags this mismatch and recommends the right window before you make decisions on half-mature data.",
      },
      {
        type: "heading",
        content: "Should you bid on your own brand?",
      },
      {
        type: "text",
        content:
          "Every SaaS team relitigates this every six months. Claude can pull your branded campaign data, model what would happen to organic CTR if you paused it, and quantify the cannibalization risk. This isn't an absolute answer — it depends on whether you have aggressive competitors bidding on your brand — but it's a quantitative answer rather than a hot take.",
      },
      {
        type: "heading",
        content: "Expansion keywords and geographic rollout",
      },
      {
        type: "text",
        content:
          "Generic keyword tools give you generic answers. Claude uses your actual best-converting keywords as seeds, pulls related terms via the Google Ads keyword ideas API, filters for the cluster that fits your ICP, and prioritizes by estimated CPC vs forecasted volume. SaaS is global by default but every market behaves differently — Claude compares conversion rates and CPLs across countries, identifies under-served markets where your brand performs disproportionately well, and proposes a structured rollout (start with the top 3 markets at 25% of US budget, expand based on performance).",
      },
      {
        type: "heading",
        content: "Weekly SaaS routine",
      },
      {
        type: "list",
        content: "",
        items: [
          "Monday — \"Pull last week's qualified-lead count by campaign and flag any campaign whose lead quality dropped vs four-week average.\"",
          "Wednesday — \"Identify expansion keywords from this week's converting search queries that I'm not yet bidding on.\"",
          "Friday — \"Compare reported conversions vs CRM-confirmed deals for the last 90 days. Any campaigns I should pause?\"",
          "Monthly — \"Audit my conversion actions and lookback windows against my actual sales cycle. Any mismatches?\"",
        ],
      },
      {
        type: "heading",
        content: "FAQ",
      },
    ],
    faq: [
      {
        question: "Can Claude push offline conversions back to Google Ads?",
        answer:
          "Yes. NotFair exposes the conversion upload tools, so once you have a CSV or webhook from your CRM with click IDs and a qualified-lead event, Claude can upload them to Google Ads. We recommend a human review of the first batch.",
      },
      {
        question: "How does Claude handle long sales cycles?",
        answer:
          "Claude can read your conversion lookback window settings and flag when they're too short for your real sales cycle. The most common SaaS fix is moving the window from 30 to 90 days for Smart Bidding to see the full picture.",
      },
      {
        question: "Can it work without a CRM integration?",
        answer:
          "Yes — but you'll lean more on observation audiences and structural analysis rather than direct lead-quality scoring. Connecting your CRM via offline conversion import unlocks a much more useful loop.",
      },
      {
        question: "What about LinkedIn or Facebook?",
        answer:
          "NotFair is Google Ads only. The same MCP pattern can work for other ad platforms but our scope today is Google. Many SaaS teams keep LinkedIn separate and run NotFair for the Google side.",
      },
      {
        question: "Is the brand-bidding analysis reliable?",
        answer:
          "It's a model, not a guarantee. Claude pulls historical data and computes the likely cannibalization, but the only true test is a brand-pause holdout experiment, which Claude can also help design.",
      },
    ],
    relatedLinks: [
      { href: "/blog/ai-conversion-tracking-audit", title: "AI Conversion Tracking Audit", description: "Verify the conversion event you're optimizing for actually matches your business goal." },
      { href: "/blog/can-claude-manage-google-ads", title: "Can Claude Manage Google Ads?", description: "What Claude can and can't do across read and write tools." },
      { href: "/blog/connect-google-ads-to-claude", title: "Connect Google Ads to Claude", description: "Step-by-step setup for Claude Desktop, Claude Web, Claude Code, and ChatGPT/Codex." },
    ],
  },
  "ai-google-ads-for-solopreneurs": {
    slug: "ai-google-ads-for-solopreneurs",
    title: "AI Google Ads for Solopreneurs: Cron Your PPC",
    seoTitle: "AI Google Ads for Solopreneurs — Claude Code + Cron",
    description:
      "AI Google Ads for solopreneurs: scriptable Claude Code workflows, weekly cleanups in cron, and CLI-driven optimization for indie hackers running their own ads.",
    keywords: [
      "ai google ads for solopreneurs",
      "solopreneur google ads",
      "indie hacker google ads ai",
      "founder google ads ai",
    ],
    publishedAt: "2026-04-29",
    updatedAt: "2026-04-29",
    author: { name: "NotFair Team", role: "AI ads infrastructure" },
    content: [
      {
        type: "text",
        content:
          "If you're a technical solopreneur running $500-$5K/month on Google Ads, your problem is not budget — it's time. Ads aren't your job, but neither is clicking through the Google Ads UI for an hour every week. Claude Code plus the AdsAgent plugin lets you treat your Google Ads account like any other piece of infrastructure: scriptable, automatable, version-controllable, cron-able.",
      },
      {
        type: "text",
        content:
          "We've found that founders who already live in their terminal hit \"this is what I wanted\" within the first 10 minutes. Open Claude Code, run a one-liner to install the plugin, ask \"audit my account,\" and you're getting a wasted-spend report before your coffee finishes brewing.",
      },
      {
        type: "heading",
        content: "Install in 30 seconds",
      },
      {
        type: "code",
        language: "bash",
        content:
          "# Install the AdsAgent plugin into Claude Code\nclaude plugin install nowork-studio/adsagent-plugin\n\n# First-time setup: connect your Google Ads account\nopen https://notfair.co/connect\n\n# Verify it works\nclaude -p \"audit my Google Ads account and return the top 5 issues\"",
      },
      {
        type: "text",
        content:
          "The plugin wraps the same NotFair MCP server the Claude Desktop connector uses. Same OAuth, same ~40 tools, same approval gates on writes. The difference is that Claude Code is a CLI you can pipe and script.",
      },
      {
        type: "heading",
        content: "Weekly cleanup as a cron job",
      },
      {
        type: "text",
        content:
          "Most solopreneurs don't need real-time optimization. They need consistent weekly hygiene — negative keyword sweeps, budget pacing checks, conversion-tracking sanity. Cron a Claude Code prompt and treat your ads like a CI job.",
      },
      {
        type: "code",
        language: "bash",
        content:
          "# ~/scripts/ads-weekly.sh\n#!/usr/bin/env bash\nset -euo pipefail\n\nclaude -p --output-format json \"\nRun a weekly Google Ads audit:\n1. Find search terms with >\\$30 spend in last 7 days, zero conversions\n2. Add them to the shared negative keyword list (require approval)\n3. Pull last week's spend, conversions, and CPA\n4. Format as a markdown digest\nReturn the digest only.\n\" > ~/ads-weekly-$(date +%Y-%m-%d).md\n\n# Crontab entry — every Monday at 8am\n# 0 8 * * 1 ~/scripts/ads-weekly.sh && open ~/ads-weekly-$(date +%Y-%m-%d).md",
      },
      {
        type: "callout",
        content:
          "You: claude -p \"find every keyword whose CPC went up >50% week-over-week and return as JSON\"\n\nClaude: [\n  { \"keyword\": \"workflow automation tool\", \"cpc_last_week\": 3.40, \"cpc_this_week\": 6.20, \"campaign\": \"Search-Productivity\" },\n  { \"keyword\": \"slack alternative\", \"cpc_last_week\": 4.10, \"cpc_this_week\": 7.80, \"campaign\": \"Search-Competitor\" }\n]\n\nYou: pipe that into a slack webhook, simple.",
      },
      {
        type: "heading",
        content: "Multiple Claude clients, one connection",
      },
      {
        type: "text",
        content:
          "Founders often run Claude Desktop on the laptop for ad-hoc questions and Claude Code in the terminal for scripted runs. Both connect to the same NotFair endpoint with the same OAuth — no need to maintain two integrations. ChatGPT via Codex hooks in too. When Claude Code wants to apply a destructive write — pause a campaign, bulk-update bids — the approval gate fires and Claude prints what it's about to do; you confirm at the terminal. For headless cron use, scope the prompt to read-only or recommendation output and apply changes in a follow-up interactive session.",
      },
      {
        type: "heading",
        content: "A week in the life of a solopreneur using NotFair",
      },
      {
        type: "list",
        content: "",
        items: [
          "Monday morning — Cron runs. The digest lands in your inbox before standup. You skim, approve any negative keyword adds, move on with your day.",
          "Wednesday — You ship a feature. You tell Claude Code, \"draft three RSA variants for our new export feature,\" review them, approve the best one.",
          "Friday — You ask Claude, \"what changed in my account this week and did anything matter?\" Five-line summary, ten seconds.",
          "Monthly — You run a deeper audit (\"full account audit, prioritize by spend impact\") and act on the top 3 issues. The other 47 issues from a typical agency report can wait or get ignored — you're the strategist.",
          "Quarterly — You ask Claude to draft a quarterly performance report for your own records. Done in a minute.",
        ],
      },
      {
        type: "heading",
        content: "FAQ",
      },
    ],
    faq: [
      {
        question: "Do I need a Google Ads developer token to use Claude Code with NotFair?",
        answer:
          "No. NotFair handles the developer token for you. The plugin just authenticates against the hosted MCP endpoint after you complete OAuth at notfair.co/connect.",
      },
      {
        question: "Can I run Claude Code headlessly in cron without prompts?",
        answer:
          "Yes for read-only operations. For destructive writes, approval gates default to on; scope your cron prompts to audits and recommendations, then run a separate interactive session to approve and apply changes.",
      },
      {
        question: "Does this work with Cursor or Codex too?",
        answer:
          "Yes. Cursor's MCP support and ChatGPT via Codex both connect to the same NotFair endpoint with the same OAuth. Same tools, different chrome.",
      },
      {
        question: "What's the smallest spend that justifies this?",
        answer:
          "Honestly, even at $300/month if you value your time. The setup cost is 30 seconds; finding $50 of wasted spend in your first audit pays for the year.",
      },
      {
        question: "Can I version-control my ad-management scripts?",
        answer:
          "Yes — that's the point. Your weekly audit prompt, your expansion-keyword script, your reporting templates all live in your dotfiles or in a private repo. Treat ads ops like any other infra.",
      },
    ],
    relatedLinks: [
      { href: "/connect", title: "Connect Google Ads", description: "Complete the OAuth flow before installing the Claude Code plugin." },
      { href: "/blog/connect-google-ads-to-claude", title: "Connect Google Ads to Claude", description: "Setup for Claude Code, Claude Desktop, ChatGPT/Codex, and Cursor." },
      { href: "/blog/ai-google-ads-weekly-report", title: "AI Weekly Google Ads Report", description: "Cron-friendly weekly digest you can pipe to Slack or Notion." },
    ],
  },
  "talk-to-google-ads-with-ai": {
    slug: "talk-to-google-ads-with-ai",
    title: "Talking to Google Ads With AI: What It's Like",
    seoTitle: "Talk to Google Ads With AI: What It's Like (2026)",
    description:
      "Imagine asking your ad account why CPA jumped and getting a real answer. Here's what it actually feels like to talk to Google Ads with AI today.",
    keywords: [
      "talk to google ads with ai",
      "chat with google ads",
      "ai chat google ads",
      "google ads chatbot",
      "ai conversation google ads",
    ],
    publishedAt: "2026-04-29",
    updatedAt: "2026-04-29",
    author: { name: "NotFair Team", role: "AI ads infrastructure" },
    content: [
      {
        type: "text",
        content:
          "Imagine opening a chat window, typing \"why did my CPA jump 40% last week?\" and getting a real answer in 30 seconds — not a generic article, not a dashboard URL, but the actual diagnosis from your actual account, with the specific campaigns and search terms that broke. That's the experience people are looking for when they search for \"talk to Google Ads with AI.\" The good news: it exists, it works today, and you can set it up in five minutes.",
      },
      {
        type: "text",
        content:
          "Here's what a real five-turn conversation looks like with Claude connected to a Google Ads account. We'll explain the technology underneath after.",
      },
      {
        type: "callout",
        content:
          "You: My CPA spiked last week. What happened?\n\nClaude: CPA on your Search - US campaign went from $42 to $61 between April 14 and April 21. The cause is concentrated: one ad group (\"enterprise plans\") had three new search terms eat 38% of spend with zero conversions — \"free crm software\", \"hubspot alternative free\", and \"crm download free\". They started matching on April 13 after a broad match expansion.\n\nYou: Show me the spend on those three terms.\n\nClaude: Combined $1,847 over 7 days, 0 conversions. \"free crm software\" alone was $912.\n\nYou: Add them as negatives and pause anything else with \"free\" in the search term over the last 30 days with zero conversions.\n\nClaude: Found 11 search terms matching that filter. Total wasted spend: $2,304. Want me to add all 11 as exact-match negatives at the campaign level? This is a write operation and will require your approval.\n\nYou: Yes, approve.\n\nClaude: Done. Added 11 negative keywords to Search - US. Estimated weekly savings at current pacing: ~$340. I can re-run this audit in 7 days to confirm the CPA recovers.",
      },
      {
        type: "heading",
        content: "What just happened under the hood",
      },
      {
        type: "text",
        content:
          "That conversation involved roughly six tool calls behind the scenes. Claude pulled campaign-level performance for the trailing two weeks, fanned out parallel queries across search terms and change history, ran a Python-style filter on the result, drafted a write operation, surfaced an approval prompt, and finally executed the negative-keyword additions through the Google Ads API. The whole thing took 45 seconds of wall clock time.",
      },
      {
        type: "text",
        content:
          "The piece that makes this possible is called MCP — Model Context Protocol. Anthropic published it in late 2024 as an open standard for connecting AI models to external tools and data. NotFair is a hosted MCP server at notfair.co/api/mcp that exposes about 40 tools backed by the Google Ads API. When Claude needs to read your account or apply a change, it calls those tools through the protocol. You never see the API plumbing — you just type and read replies.",
      },
      {
        type: "heading",
        content: "Is this a real product or a demo?",
      },
      {
        type: "text",
        content:
          "It's a real product. Real accounts, real spend, real changes flowing through Google's API the same way an agency dashboard would push them. The conversation above is representative — we run it on our own accounts daily. The only thing that varies is how much context the AI has about your business goals, which improves the more you talk to it.",
      },
      {
        type: "heading",
        content: "Where the magic actually shows up",
      },
      {
        type: "list",
        content: "",
        items: [
          "Diagnosis — \"Why did conversions drop?\" used to be a 90-minute spreadsheet exercise. Now it's a 45-second answer with the specific change events, search terms, and quality score moves that explain the drop.",
          "Bulk operations — Adding 50 negatives across 12 campaigns is a sentence, not a CSV upload. Pausing every keyword under $0.50 quality score with zero conversions in the last 30 days is one prompt.",
          "Hypothesis testing — \"What would happen if I cut budget on Search - EU by 30%?\" The AI can model historical impression share, project lost conversions, and tell you whether the trade is worth it before you make the change.",
          "Audit on demand — \"Audit my account\" returns a structured report with waste, quality score gaps, search-term hygiene issues, and ad-copy underperformers in under a minute.",
        ],
      },
      {
        type: "heading",
        content: "The parts that aren't magic",
      },
      {
        type: "text",
        content:
          "Conversations with AI feel magical, but the AI is still operating on the raw Google Ads API. If a metric isn't in the API — say, attribution model nuances or audience overlap from third-party tools — the AI can't see it either. Same with strategic decisions. The AI will recommend reallocating budget from a losing campaign to a winning one, but the call to actually shift dollars stays with you. That's a feature, not a bug.",
      },
      {
        type: "heading",
        content: "Approval gates: the part that keeps you safe",
      },
      {
        type: "text",
        content:
          "Every destructive write — pausing campaigns, bulk-updating bids, deleting ads — passes through a server-side approval gate. The AI drafts the change, you review the diff, you approve. There is no \"the AI went rogue and burned my budget overnight\" failure mode because the AI cannot execute writes without your explicit confirmation. Read operations (audits, diagnostics, dashboards) run autonomously since they can't break anything.",
      },
      {
        type: "heading",
        content: "How to start a conversation with your ad account",
      },
      {
        type: "list",
        content: "",
        items: [
          "Sign in at notfair.co/connect — OAuth scoped to Google Ads only, takes 30 seconds.",
          "Pick which customer IDs you want the AI to access. You can select one account or every account in a manager (MCC).",
          "Install the NotFair connector in Claude Desktop, Claude Web, or ChatGPT (Codex connectors). Cursor and Windsurf work too via stdio config.",
          "Open a chat and ask \"audit my account.\" The first audit takes about a minute. From there it's just conversation.",
        ],
      },
      {
        type: "heading",
        content: "Try the openings that everyone uses on day one",
      },
      {
        type: "list",
        content: "",
        items: [
          "Find wasted spend — \"Find every search term over $50 in spend with zero conversions in the last 30 days.\"",
          "Diagnose a regression — \"Why did CTR on Search - Brand drop this week?\"",
          "Quick wins — \"Give me the three changes that would most improve ROAS in this account.\"",
          "Daily standup — \"Summarize what changed in this account yesterday and the impact.\"",
        ],
      },
      {
        type: "heading",
        content: "FAQ",
      },
    ],
    faq: [
      {
        question: "Can I really chat with my Google Ads account in plain English?",
        answer:
          "Yes. Through an MCP connector like NotFair, Claude or ChatGPT can read your account and execute changes through the Google Ads API. You type natural language; the AI translates it into structured queries and write operations.",
      },
      {
        question: "Will the AI make changes without asking me?",
        answer:
          "No. Read operations (audits, queries) run automatically. Every destructive write — pause, delete, bid change — passes through a server-side approval gate. You see the diff and confirm before anything ships.",
      },
      {
        question: "How is this different from a Google Ads chatbot?",
        answer:
          "A chatbot answers questions about Google Ads in general. This connects an AI to your specific account so it can read live data, run audits, and apply real changes. The conversation is grounded in your numbers, not a help article.",
      },
      {
        question: "What's the fastest way to try it?",
        answer:
          "Sign in at notfair.co/connect, install the connector in Claude Desktop, and ask \"audit my account.\" From OAuth to first answer is about five minutes.",
      },
      {
        question: "Does it work with ChatGPT too?",
        answer:
          "Yes. ChatGPT supports MCP via Codex connectors, so the same NotFair endpoint works there. Cursor and Windsurf also support it via stdio config.",
      },
    ],
    relatedLinks: [
      { href: "/connect", title: "Connect Google Ads", description: "Start the OAuth flow and pick which accounts the AI can talk to." },
      { href: "/blog/connect-google-ads-to-claude", title: "How to Connect Google Ads to Claude", description: "Step-by-step setup for Claude Desktop, Claude Code, ChatGPT, and any MCP client." },
      { href: "/blog/google-ads-ai-agent", title: "Google Ads AI Agent: What It Actually Does", description: "Concrete capabilities of an AI agent for Google Ads — diagnostics, optimization, and human-reviewed writes." },
    ],
  },
  "natural-language-google-ads": {
    slug: "natural-language-google-ads",
    title: "Natural Language Google Ads: How It Works",
    seoTitle: "Natural Language Google Ads: How It Actually Works",
    description:
      "Natural language Google Ads management is real. Here's the prompt-to-API pipeline, what works, what fails, and why ambiguity becomes a clarification.",
    keywords: [
      "natural language google ads",
      "natural language ads management",
      "nlp google ads",
      "ai natural language ads",
      "natural language ppc",
    ],
    publishedAt: "2026-04-29",
    updatedAt: "2026-04-29",
    author: { name: "NotFair Team", role: "AI ads infrastructure" },
    content: [
      {
        type: "text",
        content:
          "Natural language Google Ads management means typing a sentence — \"pause every keyword in the brand campaign with zero conversions in the last 30 days\" — and having that sentence translated into the right Google Ads API calls and executed against your live account. It's not a wrapper around the Ads UI. It's an AI model with structured tool access reading your data and writing back through the API.",
      },
      {
        type: "text",
        content:
          "This works because of a specific architecture: an AI model (Claude, GPT, etc.) plus an MCP server that exposes Google Ads API operations as named tools. NotFair is the production MCP server most people use. The AI maps your sentence to one or more tool calls, the tools hit the API, results come back, and the AI summarizes them in plain English.",
      },
      {
        type: "heading",
        content: "The prompt-to-API pipeline, end to end",
      },
      {
        type: "list",
        content: "",
        items: [
          "Step 1: parse intent — The model classifies the sentence as a read or write, identifies the entities (campaigns, keywords, search terms), and pulls out the filter expressions (\"zero conversions\", \"last 30 days\").",
          "Step 2: pick the tool — Reads almost always go through runScript with a GAQL query. Writes go through specific tools like pauseKeyword, bulkPauseKeywords, addNegativeKeyword, or updateCampaignBudget.",
          "Step 3: build the structured call — The model fills in the tool arguments: customer ID, resource names, filter clauses. For runScript, it writes a JS sandbox snippet that calls ads.gaql or ads.gaqlParallel.",
          "Step 4: server validates — NotFair checks scopes, validates the GAQL syntax, and for writes, gates the call behind an approval prompt that you confirm.",
          "Step 5: API execution — The Google Ads API receives the call under NotFair's developer token, authenticated as your Google identity via OAuth.",
          "Step 6: summarize — The model takes the raw API response (JSON, often verbose) and renders it as a readable answer with the numbers that matter.",
        ],
      },
      {
        type: "heading",
        content: "A real prompt mapped to real tool calls",
      },
      {
        type: "callout",
        content:
          "You: Find search terms that wasted more than $100 with no conversions in the last two weeks and add them as negatives.\n\nUnder the hood:\n  1. runScript({ script: \"return await ads.gaql(`SELECT search_term_view.search_term, metrics.cost_micros, metrics.conversions, campaign.id FROM search_term_view WHERE segments.date DURING LAST_14_DAYS AND metrics.cost_micros > 100000000 AND metrics.conversions = 0`)\" }) — returns 7 terms\n  2. (Approval gate) — model surfaces the 7 terms and asks for confirmation\n  3. bulkAddNegativeKeywords({ keywords: [\"free crm\", \"crm tutorial\", ...], campaignId: 12345, matchType: \"EXACT\" }) — executes after you approve\n\nClaude: Found 7 search terms over $100 with zero conversions. Total wasted spend: $1,432. Added all 7 as exact-match negatives.",
      },
      {
        type: "heading",
        content: "Why this is more reliable than \"AI clicking buttons\"",
      },
      {
        type: "text",
        content:
          "Browser-automation agents that drive the Google Ads UI exist, but they're slow and brittle. They depend on DOM selectors that Google changes, struggle with auth, and can't handle bulk operations cleanly. The MCP path skips the UI entirely. The AI talks to the same REST API that an enterprise PPC platform would talk to. No clicking, no waiting on page loads, no breakage when Google ships a redesign.",
      },
      {
        type: "heading",
        content: "How ambiguity is handled (this is the important part)",
      },
      {
        type: "text",
        content:
          "Natural language is ambiguous. \"Pause my underperforming campaigns\" is not a precise instruction. The AI's job, when faced with ambiguity, is to ask a clarification question rather than guess and execute. NotFair's tools are structured so that destructive writes require explicit parameters — there is no API call for \"pause underperforming things,\" so the model has to resolve the ambiguity into specific resource names before any write can happen.",
      },
      {
        type: "callout",
        content:
          "You: Pause my underperforming campaigns.\n\nClaude: \"Underperforming\" needs a definition. I see three reasonable interpretations:\n  1. CPA above target ($85 target on this account) — would pause 2 campaigns ($340/day spend)\n  2. ROAS below 1.0 last 30 days — would pause 4 campaigns ($890/day spend)\n  3. Zero conversions in last 14 days with $500+ spend — would pause 1 campaign ($120/day spend)\nWhich rule do you want, or want to combine them?",
      },
      {
        type: "heading",
        content: "Failure modes you should know about",
      },
      {
        type: "list",
        content: "",
        items: [
          "Hallucinated metrics — Models occasionally invent numbers when context is thin. The fix: every claim should be backed by a tool call. If Claude says \"CPA is $40\" without a runScript call before it, treat that number as suspect.",
          "Wrong scope — \"Pause this keyword\" can refer to one of many keywords with similar text. Tools require resource IDs; ambiguity should produce a clarification, not a guess.",
          "Date interpretation — \"Last week\" means different things (last calendar week vs last 7 days). The AI should state which interpretation it picked.",
          "Stale changes — If you make a change in the Google Ads UI mid-conversation, the AI is working from cached numbers. Re-running a query is cheap; do it after manual UI edits.",
        ],
      },
      {
        type: "heading",
        content: "What a good natural-language ads system looks like",
      },
      {
        type: "list",
        content: "",
        items: [
          "Grounded — Every numerical claim ties to a specific tool call. No vague \"your CTR is low.\"",
          "Reversible — Writes flow through an approval gate. Many operations also expose an undoChange tool for emergency rollback.",
          "Composable — One sentence can fan out into 20 parallel queries (gaqlParallel) when correlation across surfaces is needed for an audit.",
          "Auditable — The conversation log is the audit log. You can scroll back to see exactly what was asked, what tools fired, and what changed.",
        ],
      },
      {
        type: "heading",
        content: "Setting up a natural language interface to your account",
      },
      {
        type: "text",
        content:
          "The shortest path: visit notfair.co/connect, complete OAuth with the Google identity that has Ads access, pick the customer IDs you want exposed, and install the connector in Claude Desktop, Claude Web, or ChatGPT. Cursor and Windsurf both support MCP via stdio config and work the same way. From OAuth to first natural-language audit is about five minutes.",
      },
      {
        type: "heading",
        content: "FAQ",
      },
    ],
    faq: [
      {
        question: "What is natural language Google Ads management?",
        answer:
          "Typing English sentences that get translated into Google Ads API calls — reads (queries, audits) and writes (pause, bid changes, negatives). The translation happens through an AI model with structured tool access via MCP.",
      },
      {
        question: "How does the AI know which API call to make?",
        answer:
          "An MCP server exposes named tools (pauseKeyword, runScript, addNegativeKeyword, etc.) with structured argument schemas. The model picks a tool from that list based on the sentence and fills in the arguments.",
      },
      {
        question: "What happens when my prompt is ambiguous?",
        answer:
          "A well-built system asks a clarification question instead of guessing. \"Pause underperforming campaigns\" should produce \"how do you want to define underperforming?\" not a silent bulk pause based on the model's guess.",
      },
      {
        question: "Can I trust the numbers the AI reports?",
        answer:
          "Trust them only if they tie to a tool call. Every claim should be backed by a query result. If the AI states a metric without first calling a tool, ask it to re-run with the underlying GAQL so you can verify.",
      },
      {
        question: "Does this work for ChatGPT, Cursor, and Claude?",
        answer:
          "Yes. ChatGPT uses Codex connectors. Cursor and Windsurf use stdio MCP config. Claude supports both hosted connectors (Desktop, Web) and the AdsAgent plugin in Claude Code.",
      },
    ],
    relatedLinks: [
      { href: "/blog/what-is-mcp-for-google-ads", title: "What Is MCP for Google Ads?", description: "The protocol that makes natural language ads management possible — explained without the jargon." },
      { href: "/blog/which-ai-tools-work-with-google-ads", title: "Which AI Tools Work With Google Ads?", description: "A current list of AI clients that support MCP and connect to Google Ads through NotFair." },
      { href: "/connect", title: "Connect Google Ads", description: "OAuth in 30 seconds, then start typing natural-language commands at your account." },
    ],
  },
  "conversational-google-ads-management": {
    slug: "conversational-google-ads-management",
    title: "Conversational Google Ads: Stop Clicking Tabs",
    seoTitle: "Conversational Google Ads Management (2026 Guide)",
    description:
      "The Google Ads UI takes 14 clicks to find wasted spend. A conversation takes one. Here's the side-by-side, with time savings and setup.",
    keywords: [
      "conversational google ads management",
      "google ads conversational ai",
      "chat-based google ads",
      "conversational ppc",
      "google ads chat interface",
    ],
    publishedAt: "2026-04-29",
    updatedAt: "2026-04-29",
    author: { name: "NotFair Team", role: "AI ads infrastructure" },
    content: [
      {
        type: "text",
        content:
          "The Google Ads UI was built for completeness, not speed. Finding wasted spend across 8 campaigns takes 14 clicks, two filter dialogs, an export, and a pivot table. A conversational interface — typing one sentence into Claude or ChatGPT and getting the answer — takes one prompt. We measured both. Conversational beats UI navigation by 8x to 40x on the workflows marketers run every day.",
      },
      {
        type: "text",
        content:
          "Conversational Google Ads management means using a chat interface (Claude Desktop, Claude Web, ChatGPT, Cursor) connected to your ad account through an MCP server. NotFair is the hosted MCP server most people use; it handles OAuth, the developer token, and exposes about 40 tools backed by the Google Ads API.",
      },
      {
        type: "heading",
        content: "The UI workflow vs the conversation, side by side",
      },
      {
        type: "subheading",
        content: "Find wasted spend (search terms with no conversions)",
      },
      {
        type: "list",
        content: "",
        items: [
          "UI path — Open Google Ads. Pick a campaign. Click \"Search terms.\" Set date range. Add filter for cost > $50. Add filter for conversions = 0. Sort by cost. Repeat for each campaign. Export to CSV. Paste into sheet. ~12 minutes for an 8-campaign account.",
          "Conversation — \"Find every search term over $50 with zero conversions in the last 30 days, across all campaigns.\" One sentence. ~15 seconds.",
        ],
      },
      {
        type: "subheading",
        content: "Bulk pause keywords below a quality score threshold",
      },
      {
        type: "list",
        content: "",
        items: [
          "UI path — Per ad group: Keywords tab, sort by quality score, multi-select, bulk action menu, pause. Repeat for every ad group. ~25 minutes for a mid-sized account.",
          "Conversation — \"Pause every keyword with quality score below 4 and zero conversions in the last 30 days.\" One sentence, one approval. ~30 seconds.",
        ],
      },
      {
        type: "subheading",
        content: "Diagnose a CPA spike",
      },
      {
        type: "list",
        content: "",
        items: [
          "UI path — Compare two date ranges. Drill into each campaign. Check change history. Look at search terms tab per ad group. Check device segment. Check geographic segment. ~45 minutes if you know what you're doing.",
          "Conversation — \"My CPA jumped this week. What happened?\" ~45 seconds. The AI fans out parallel queries across spend, search terms, change history, and quality scores in one pass.",
        ],
      },
      {
        type: "subheading",
        content: "Add 20 negative keywords across 5 campaigns",
      },
      {
        type: "list",
        content: "",
        items: [
          "UI path — Per campaign: Negative keywords > Add > paste list > save. Repeat 5 times, or build a shared list and link it. ~10 minutes.",
          "Conversation — Paste the list. \"Add these as exact-match negatives to Search - US, Search - EU, Search - APAC, Brand, and Generic.\" One prompt, one approval. ~20 seconds.",
        ],
      },
      {
        type: "heading",
        content: "Why a conversation actually saves time (it's not just typing)",
      },
      {
        type: "text",
        content:
          "The UI forces sequential clicking because each filter and sort happens one at a time. A conversational interface backed by GAQL — Google's query language for Ads — can fan out 20 queries in parallel and join them client-side in a single response. \"Find search terms above $50, no conversions, in campaigns where overall ROAS is below 1.0\" is one query in GAQL. In the UI, it's three filters across two tabs and a manual cross-reference.",
      },
      {
        type: "heading",
        content: "The workflows where conversation wins biggest",
      },
      {
        type: "list",
        content: "",
        items: [
          "Cross-account — Manager (MCC) accounts amplify the gap. \"Audit all 12 of my client accounts and rank them by waste\" is one prompt vs an afternoon of UI work.",
          "Correlation queries — Anything that joins surfaces (search terms × quality score × change history) is multi-tab in the UI and one query for the AI.",
          "Bulk safe operations — Paste a list of 200 negatives. \"Add these to my brand campaign as exact match.\" Done in 30 seconds.",
          "Audits — \"Audit my account\" is the killer prompt. It returns the same structured report you'd pay an agency $1,500 for, in under 60 seconds.",
        ],
      },
      {
        type: "heading",
        content: "Where the UI still wins",
      },
      {
        type: "list",
        content: "",
        items: [
          "Browsing — Casual exploration of an unfamiliar account is faster in the UI. The dashboard layout helps you build mental context.",
          "Asset previews — Looking at how an RSA actually renders in search is still better in the UI.",
          "Some Performance Max tuning — Google reserves much of PMax tuning to its own systems. The UI surfaces those reserved controls.",
          "Billing — Payment methods, invoices, and account-level user permissions are outside the API. Always UI.",
        ],
      },
      {
        type: "heading",
        content: "What it feels like the first week",
      },
      {
        type: "text",
        content:
          "The first three days you'll catch yourself reaching for the UI out of habit. Day four you stop. By the end of week one you'll have run more diagnostics on the account than you did the entire previous month — because the marginal cost of a question went from \"15 minutes of clicking\" to \"15 seconds of typing.\" The compounding effect on account hygiene is real.",
      },
      {
        type: "callout",
        content:
          "You: What's the lowest-hanging fruit in this account?\n\nClaude: Three quick wins, ranked by impact:\n  1. \"Free CRM\" search terms wasting $312/week — add 4 negatives, projected save $1,250/month.\n  2. Mobile bid adjustment on Search - Brand is +20%, but mobile CPA is 1.4x desktop — drop to 0%, projected save $480/month.\n  3. Five paused ads in Search - US that historically converted above account average — re-enable for an estimated +12 conversions/month.\n\nWant me to draft all three changes for review?",
      },
      {
        type: "heading",
        content: "How to switch from clicking to talking",
      },
      {
        type: "list",
        content: "",
        items: [
          "Connect — notfair.co/connect, OAuth, pick customer IDs. ~30 seconds.",
          "Install — One-click connector for Claude Desktop or Claude Web. ChatGPT via Codex connectors. Cursor and Windsurf via stdio config.",
          "Open with an audit — \"Audit my account\" is the right first prompt. It surfaces the issues you'd otherwise hunt for.",
          "Build a habit — Replace your morning UI check with a one-line prompt: \"Summarize what changed in this account yesterday and the impact.\"",
        ],
      },
      {
        type: "heading",
        content: "FAQ",
      },
    ],
    faq: [
      {
        question: "Will conversational AI replace the Google Ads UI?",
        answer:
          "Not entirely. Browsing, asset previews, and some PMax controls stay in the UI. But for diagnostics, bulk operations, and cross-account work, conversation is faster by 8x to 40x and most marketers shift the bulk of their work there.",
      },
      {
        question: "How much time does conversational ads management actually save?",
        answer:
          "Based on common workflows: search-term cleanup goes from 12 minutes to 15 seconds, a CPA-spike diagnosis from 45 minutes to under a minute, and bulk negative adds from 10 minutes to 20 seconds. The compounding effect is bigger than any single workflow saving.",
      },
      {
        question: "Is the conversation as accurate as clicking through the UI?",
        answer:
          "Yes when grounded in tool calls. Every numerical claim should tie to a runScript or specific tool result. The same Google Ads API powers both surfaces, so the underlying numbers match.",
      },
      {
        question: "Can my team share a conversational interface across accounts?",
        answer:
          "Yes. Each user authenticates with their own Google identity. Manager (MCC) accounts let one user query and manage every linked client account through the same conversation.",
      },
      {
        question: "What if I ask for a destructive change by accident?",
        answer:
          "Every write passes through a server-side approval gate. You see the diff and confirm before anything ships. Pure conversation, with a safety net before execution.",
      },
    ],
    relatedLinks: [
      { href: "/connect", title: "Connect Google Ads", description: "OAuth in 30 seconds and start using a chat interface against your account." },
      { href: "/blog/claude-find-wasted-ad-spend", title: "Find Wasted Ad Spend With Claude", description: "The single prompt that surfaces wasted spend across an entire account in under a minute." },
      { href: "/blog/connect-google-ads-to-claude", title: "How to Connect Google Ads to Claude", description: "Step-by-step setup for Claude Desktop, Claude Code, ChatGPT, and Cursor." },
    ],
  },
  "google-ads-ai-copilot": {
    slug: "google-ads-ai-copilot",
    title: "Google Ads AI Copilot: Suggests, Drafts, You Approve",
    seoTitle: "Google Ads AI Copilot: How It Works (2026)",
    description:
      "An AI copilot for Google Ads sits next to you — drafting changes, surfacing waste, executing on approval. Here's how it differs from Smart Bidding.",
    keywords: [
      "google ads ai copilot",
      "ai copilot for google ads",
      "copilot google ads",
      "ai assistant google ads",
      "google ads copilot",
    ],
    publishedAt: "2026-04-29",
    updatedAt: "2026-04-29",
    author: { name: "NotFair Team", role: "AI ads infrastructure" },
    content: [
      {
        type: "text",
        content:
          "An AI copilot for Google Ads is exactly what it sounds like — an AI sitting next to you in your account, suggesting changes, drafting bid updates, and executing on your approval. Same idea as GitHub Copilot for code: the human stays in the driver's seat, the AI handles the tedious work, every change is reviewable. It's a different category from Google's Smart Bidding (which is autopilot, not copilot) and from agency software (which is dashboards, not collaboration).",
      },
      {
        type: "text",
        content:
          "The product most marketers use today is Claude or ChatGPT plus a Google Ads MCP connector. NotFair is the hosted connector — it exposes about 40 tools backed by the Google Ads API and gates every destructive write behind your approval. The result is a copilot you can talk to: ask it questions, get suggestions, approve or reject each change.",
      },
      {
        type: "heading",
        content: "Copilot vs autopilot: the important distinction",
      },
      {
        type: "text",
        content:
          "Smart Bidding is autopilot. You set a target, Google optimizes bids inside its black box, and you don't see the per-decision rationale. It's powerful but opaque. A copilot is the opposite: every action is initiated by a human prompt, the rationale is visible (\"I'm pausing these because they had $1,200 in spend and zero conversions\"), and you can approve, modify, or reject individually.",
      },
      {
        type: "list",
        content: "",
        items: [
          "Smart Bidding — Optimization decisions made inside Google's models. You set objectives. You see outcomes. Limited insight into per-bid rationale.",
          "AI copilot — Diagnostic and editing decisions made through conversation with you. You see every proposed change before it ships. Full audit trail of what was changed and why.",
          "Agency dashboards — Reporting layers on top of Google Ads. Pretty charts, no agency in the chart.",
          "Browser-automation agents — AI driving the Ads UI. Slow, brittle, and skips the API safety net. Avoid for production work.",
        ],
      },
      {
        type: "heading",
        content: "What a Google Ads copilot actually does",
      },
      {
        type: "list",
        content: "",
        items: [
          "Reads — Audits, search-term reviews, change-history queries, quality-score breakdowns, performance dashboards. Runs autonomously since reads can't break anything.",
          "Drafts — Writes proposed changes (paused keywords, new negatives, bid updates, RSA copy variants) but does not execute until you approve.",
          "Suggests — Surfaces \"three quick wins\" or \"the one bid change that would most improve ROAS\" based on account state.",
          "Executes — On approval, calls the Google Ads API directly. No clicking through the UI. No CSV uploads.",
          "Reverses — Most operations expose an undoChange tool. If a change was a mistake, the rollback is one prompt.",
        ],
      },
      {
        type: "heading",
        content: "What it feels like to work with a copilot",
      },
      {
        type: "callout",
        content:
          "You: Anything I should know about this morning?\n\nClaude: Three things:\n  1. Yesterday's spend on Search - US was $214 above pacing because impression share spiked overnight. Causes: a competitor paused a Brand campaign and a new search term \"crm comparison 2026\" started matching broad. CTR is healthy (4.1%), CPA is fine ($38). No action needed unless you want to cap budget.\n  2. The Black Friday RSA you A/B tested last week is statistically significant — Variant B has 23% better CTR. Want me to pause Variant A and shift impressions?\n  3. Three keywords in Search - APAC dropped to QS 2 in the last 24 hours. Likely landing-page experience flagging on a recent product page change.\n\nYou: Pause Variant A and look at the APAC quality score issue.",
      },
      {
        type: "heading",
        content: "Why \"still in control\" matters here",
      },
      {
        type: "text",
        content:
          "Many marketers we talk to are nervous about handing AI the keys. The valid concern: an AI that misreads context can torch a budget overnight. The copilot pattern solves this directly. Read access can run autonomously — it's safe. Write access never runs without you. Every paused campaign, every bid update, every negative keyword is a diff you saw and approved. The AI is a force multiplier, not a replacement.",
      },
      {
        type: "heading",
        content: "The four tiers of trust to graduate through",
      },
      {
        type: "list",
        content: "",
        items: [
          "Tier 1 (week 1) — Read-only audits and diagnostics. Get comfortable with the model's reasoning before granting any write.",
          "Tier 2 (week 2-3) — Approve writes one at a time. Review every diff. Use this period to calibrate trust on small-stakes changes (negatives, RSA edits).",
          "Tier 3 (month 2) — Batch approvals on low-risk operations (negatives, paused-keyword adds). Still gate budget and bid-strategy changes individually.",
          "Tier 4 (month 3+) — Recurring autonomous tasks for read-only reports. \"Audit my account every Monday morning and email the summary\" runs without you.",
        ],
      },
      {
        type: "heading",
        content: "Where a copilot beats the alternatives",
      },
      {
        type: "list",
        content: "",
        items: [
          "vs hiring an agency — A copilot runs the diagnostics an agency would charge $1,500 for in 60 seconds, anytime you want, with the same quality.",
          "vs hiring a junior media buyer — A copilot handles the 80% of work that's mechanical (search-term cleanup, negative adds, bid maintenance), freeing humans for strategy.",
          "vs Google Ads Editor — Editor is a fat client for bulk edits. A copilot is a conversational layer on top of every API operation, including diagnostics Editor doesn't support.",
          "vs scripts — Google Ads Scripts require code. A copilot writes the GAQL for you and explains the result. Same power, no engineering effort.",
        ],
      },
      {
        type: "heading",
        content: "Setting up your copilot",
      },
      {
        type: "list",
        content: "",
        items: [
          "Sign in at notfair.co/connect with the Google identity that has Ads access.",
          "Pick the customer IDs the copilot can see — single account or every account in a manager (MCC).",
          "Install the connector in your AI client of choice — Claude Desktop, Claude Web, ChatGPT (Codex connectors), Cursor or Windsurf (stdio config).",
          "First prompt: \"audit my account.\" From there, copilot work is just conversation.",
        ],
      },
      {
        type: "heading",
        content: "FAQ",
      },
    ],
    faq: [
      {
        question: "How is a Google Ads AI copilot different from Smart Bidding?",
        answer:
          "Smart Bidding is autopilot — Google optimizes bids inside its model with limited per-decision visibility. A copilot is collaborative — you initiate every action, see every proposed change, and approve before execution. Different categories, both useful.",
      },
      {
        question: "Will the copilot make changes without my approval?",
        answer:
          "No. Reads run autonomously. Every destructive write — pause, bid change, delete — passes through a server-side approval gate. You see the diff and confirm before anything ships.",
      },
      {
        question: "Can I roll back a change the copilot made?",
        answer:
          "Yes. Most operations expose an undoChange tool, and the change history is queryable through the same conversation. \"Roll back the negatives I added yesterday\" is one prompt.",
      },
      {
        question: "Does the copilot replace my media buyer?",
        answer:
          "No. It handles the mechanical 80% — search-term cleanup, negative adds, audits, bid hygiene — so humans can focus on strategy, creative, and account growth. Most teams add a copilot, they don't subtract a person.",
      },
      {
        question: "Which AI clients can I use as my copilot?",
        answer:
          "Claude Desktop, Claude Web, Claude Code, ChatGPT (via Codex connectors), Cursor, and Windsurf all support MCP and work with NotFair. Pick whichever your team already uses.",
      },
    ],
    relatedLinks: [
      { href: "/connect", title: "Connect Google Ads", description: "OAuth in 30 seconds and start using your AI copilot." },
      { href: "/blog/can-claude-manage-google-ads", title: "Can Claude Manage Google Ads?", description: "What Claude can and cannot do as a copilot for your Google Ads account." },
      { href: "/blog/google-ads-ai-agent", title: "Google Ads AI Agent: What It Actually Does", description: "Concrete capabilities of an AI agent for Google Ads — diagnostics, optimization, and human-reviewed writes." },
    ],
  },
  "ai-assistant-for-ppc": {
    slug: "ai-assistant-for-ppc",
    title: "AI Assistant for PPC: What's Real in 2026",
    seoTitle: "AI Assistant for PPC: What Works in 2026",
    description:
      "Google Ads has a working AI assistant today via MCP. Microsoft, Meta, LinkedIn don't yet. Here's the state of AI for paid search and where it's headed.",
    keywords: [
      "ai assistant for ppc",
      "ai ppc assistant",
      "ppc ai tools",
      "ai for paid search",
      "ai assistant paid media",
    ],
    publishedAt: "2026-04-29",
    updatedAt: "2026-04-29",
    author: { name: "NotFair Team", role: "AI ads infrastructure" },
    content: [
      {
        type: "text",
        content:
          "An AI assistant for PPC is, in 2026, not a single product — it's a pattern. The pattern: a general-purpose AI model (Claude, GPT) plus a connector to a specific ad platform's API, exposed through MCP (Model Context Protocol). The pattern works extremely well for Google Ads today and is gradually arriving for the other platforms. Here's an honest map of where it's real, where it's nascent, and where it doesn't exist yet.",
      },
      {
        type: "heading",
        content: "Why MCP changed the AI-for-PPC conversation",
      },
      {
        type: "text",
        content:
          "Before MCP, AI assistants for PPC meant standalone SaaS products with their own UI, their own model, and their own integration. Useful, but expensive to build and limited to one model. MCP — published by Anthropic in late 2024 — is an open protocol for connecting any AI client to any data source. It means anyone can build a connector for a specific ad platform and any MCP-capable AI client can use it. That includes Claude, ChatGPT (via Codex connectors), Cursor, Windsurf, and more.",
      },
      {
        type: "heading",
        content: "The state of AI assistants by platform",
      },
      {
        type: "subheading",
        content: "Google Ads — production-ready",
      },
      {
        type: "text",
        content:
          "Google Ads is the most mature. Live MCP servers — NotFair is the hosted option — expose ~40 tools covering audits, search terms, change history, recommendations, keyword ideas, parallel GAQL queries, plus writes (pause, bulk bid updates, negative keywords, RSAs, budgets). OAuth scoped to Google Ads only. Approval gates server-side on destructive writes. Setup is about 5 minutes. This is the baseline experience the rest of the industry is catching up to.",
      },
      {
        type: "subheading",
        content: "Microsoft Advertising — partial",
      },
      {
        type: "text",
        content:
          "Microsoft Advertising has a comparable API to Google Ads (they're structurally similar by design). MCP connectors are emerging but not yet at parity. Most marketers running Microsoft Ads use Claude or ChatGPT for read-only queries via API tokens manually plumbed in, or they use the Microsoft Ads UI alongside their Google Ads AI workflow. We expect MCP coverage here to land properly within 12 months.",
      },
      {
        type: "subheading",
        content: "Meta Ads — limited",
      },
      {
        type: "text",
        content:
          "Meta's Marketing API is rich, but the platform's account structure (campaigns × ad sets × ads × creative) and the heavy reliance on creative iteration make it a different shape of problem. MCP connectors exist but are early. Conversational creative iteration (\"draft 5 hooks for this audience\") is where AI assistants shine on Meta today. Account management automation is less developed.",
      },
      {
        type: "subheading",
        content: "LinkedIn Ads, TikTok Ads, Reddit Ads — early or absent",
      },
      {
        type: "text",
        content:
          "These platforms have APIs, but the ecosystem hasn't shipped production MCP connectors at NotFair-grade quality yet. If you're advertising primarily on these platforms, an AI assistant today probably means custom integration work or waiting.",
      },
      {
        type: "heading",
        content: "What an AI assistant for PPC should give you",
      },
      {
        type: "list",
        content: "",
        items: [
          "On-demand audits — A one-prompt account audit that surfaces waste, quality issues, and quick wins. Production-grade AI assistants do this in under a minute.",
          "Cross-account intelligence — For agencies and in-house teams running multiple accounts, the ability to ask \"which of my accounts has the most waste right now?\" in one prompt.",
          "Reversible writes — Pauses, bid updates, negatives, ad copy edits, all gated behind your approval and rollbackable.",
          "Diagnostic depth — \"Why did CPA spike?\" with parallel queries across spend, search terms, change history, and quality scores.",
          "Reporting on demand — \"Build me a weekly performance report\" without opening a dashboard tool.",
        ],
      },
      {
        type: "heading",
        content: "What an AI assistant for PPC won't do (yet)",
      },
      {
        type: "list",
        content: "",
        items: [
          "Creative production — AI can draft ad copy and refine images, but the final creative call still benefits from human eyes and brand context.",
          "Strategic planning — Channel mix decisions, budget allocation across platforms, and audience strategy stay with the human strategist.",
          "Replacing Smart Bidding — AI assistants are copilots; Google's Smart Bidding is autopilot. Different categories, both useful.",
          "Cross-platform attribution — Stitching attribution across Google, Meta, LinkedIn requires data outside any single ad platform's API.",
        ],
      },
      {
        type: "heading",
        content: "How to actually start using one (today)",
      },
      {
        type: "list",
        content: "",
        items: [
          "Pick a platform that has working MCP support — Google Ads is the safest bet today.",
          "Pick an AI client that supports MCP — Claude Desktop, Claude Web, ChatGPT (Codex connectors), Cursor, or Windsurf.",
          "Connect through a hosted MCP server — for Google Ads, that's notfair.co/connect, ~30 seconds for OAuth.",
          "Open with an audit — \"Audit my account\" is the right first prompt. It calibrates the model's understanding of your account.",
        ],
      },
      {
        type: "heading",
        content: "Why the protocol matters more than any one product",
      },
      {
        type: "text",
        content:
          "MCP being an open protocol means you're not locking yourself into a vendor when you adopt an AI assistant. The same NotFair connector works in Claude Desktop today and ChatGPT tomorrow. If a better AI model launches in six months, your account access doesn't break — you point the new client at the same MCP endpoint. This is a meaningful change from the SaaS model where switching tools means re-integrating everything.",
      },
      {
        type: "callout",
        content:
          "You: Audit my Google Ads account and tell me where I'm wasting money.\n\nClaude: Audit complete. Top three findings:\n  1. $4,210 wasted on \"free\" search terms across 6 campaigns last 30 days — 0 conversions, $0 revenue. Add as exact-match negatives across all Search campaigns.\n  2. Mobile bid adjustment on Search - Brand is +20% but mobile CPA is 1.4x desktop. Drop to 0% to save ~$480/month.\n  3. 14 keywords below QS 4 with $620 spend in last 30 days — pause or rewrite landing pages.\n\nWant me to draft the changes for review?",
      },
      {
        type: "heading",
        content: "FAQ",
      },
    ],
    faq: [
      {
        question: "Is there a real working AI assistant for PPC today?",
        answer:
          "Yes for Google Ads — Claude or ChatGPT plus an MCP connector like NotFair gives you a production-grade AI assistant that can audit, diagnose, and execute changes. Microsoft Ads, Meta, LinkedIn have less mature support today but are catching up.",
      },
      {
        question: "Do AI assistants for PPC work across multiple ad platforms?",
        answer:
          "Per platform today. Each ad platform needs its own MCP connector. The same AI client (Claude, ChatGPT) can speak to multiple connectors, but cross-platform attribution and unified reporting still require additional tooling.",
      },
      {
        question: "Are AI assistants for PPC safe to use on production accounts?",
        answer:
          "Yes when the connector implements server-side approval gates on destructive writes. NotFair gates every pause, bid update, and bulk operation behind your explicit confirmation. Reads run autonomously since they can't break anything.",
      },
      {
        question: "Will an AI assistant replace my PPC specialist?",
        answer:
          "No. It handles the mechanical 80% of the work — search-term cleanup, negative adds, audits, hygiene — so humans focus on strategy, creative, and growth. The teams getting the most value add an AI assistant, they don't subtract a person.",
      },
      {
        question: "What's the protocol making this all work?",
        answer:
          "MCP — Model Context Protocol — published by Anthropic in late 2024. It's an open standard for AI clients to connect to external tools and data sources. NotFair is an MCP server for Google Ads.",
      },
    ],
    relatedLinks: [
      { href: "/blog/what-is-mcp-for-google-ads", title: "What Is MCP for Google Ads?", description: "The protocol making AI assistants for PPC possible — explained without the jargon." },
      { href: "/blog/which-ai-tools-work-with-google-ads", title: "Which AI Tools Work With Google Ads?", description: "Current AI clients with MCP support and how they connect to Google Ads through NotFair." },
      { href: "/connect", title: "Connect Google Ads", description: "OAuth in 30 seconds and start using a real AI assistant on your PPC account." },
    ],
  },
  "google-ads-mcp-servers-compared": {
    slug: "google-ads-mcp-servers-compared",
    title: "Google Ads MCP Servers Compared (2026)",
    seoTitle: "Google Ads MCP Servers Compared (2026)",
    description:
      "Comparison of the MCP servers that connect Google Ads to Claude, ChatGPT, and Cursor — tools, auth, guardrails, and what to use when.",
    keywords: [
      "google ads mcp",
      "google ads mcp server",
      "best google ads mcp",
      "open source google ads mcp",
      "google ads mcp github",
      "mcp for google ads",
      "anthropic mcp google ads",
      "model context protocol google ads",
    ],
    publishedAt: "2026-04-29",
    updatedAt: "2026-04-29",
    author: {
      name: "NotFair Team",
      role: "AI ads infrastructure",
    },
    content: [
      {
        type: "text",
        content:
          "A Google Ads MCP server is a program that exposes Google Ads API operations as MCP (Model Context Protocol) tools, so any compatible AI client — Claude, ChatGPT/Codex, Cursor, Windsurf — can read campaigns, run audits, and apply changes through natural language. As of April 2026 there are a handful of public options. Most are thin API wrappers; one or two ship the production-grade pieces (OAuth, guardrails, change history) you actually need to run on a live account.",
      },
      {
        type: "text",
        content:
          "We build NotFair, so this is not a neutral review. What follows is the most honest read we can give: the criteria that matter for a Google Ads MCP server, where each option lands, and which one is right for which job. We will tell you when something else is the better choice.",
      },
      {
        type: "heading",
        content: "What a Google Ads MCP server actually has to do",
      },
      {
        type: "text",
        content:
          "It is easy to write a 200-line MCP server that wraps a few Google Ads API endpoints. It is much harder to ship one that is safe to point Claude at on Monday morning. Six things separate a demo from a production-ready server:",
      },
      {
        type: "list",
        content: "",
        items: [
          "OAuth and developer token handling — Google Ads API requires a developer token (1–2 week approval) plus OAuth. A good server hides both behind a single sign-in.",
          "GAQL fan-out — real audits hit 10+ reports (campaigns, search terms, quality scores, change events). Issuing them sequentially is slow and burns token budget. The server should support parallel GAQL.",
          "Write-side guardrails — the model must not be able to delete a campaign because of a misread instruction. Approval gates, dry runs, and undo are required, not optional.",
          "Change history and rollback — every write should be logged with enough context to undo it in one call. Standard Google Ads change history is not enough.",
          "Manager (MCC) account support — agencies and most mid-market accounts run under an MCC. The server has to enumerate clients via login-customer-id and let users pick.",
          "Multi-client transport — Claude Desktop wants HTTP/SSE, Claude Code wants stdio, Cursor wants stdio with config, ChatGPT/Codex wants HTTP. A useful server speaks all of them.",
        ],
      },
      {
        type: "text",
        content:
          "Most of the open-source servers on GitHub today cover items 1–2 and stop. That is fine for read-only experimentation. It is not fine for a media buyer running optimizations against a live account.",
      },
      {
        type: "heading",
        content: "The current landscape",
      },
      {
        type: "subheading",
        content: "NotFair (hosted)",
      },
      {
        type: "text",
        content:
          "NotFair is the MCP server we maintain. ~40 tools split across read (audits, search terms, change history, recommendations) and write (pause, bulk update bids, negatives, RSAs, budgets, bidding strategies). One sandboxed runScript tool runs JS with ads.gaql() and ads.gaqlParallel() so a single audit pass can fan out 20 GAQL queries and correlate them in-script. Hosted at notfair.co/api/mcp with a one-click OAuth flow that handles the developer token. Hosted only today — self-host is not a supported distribution.",
      },
      {
        type: "list",
        content: "",
        items: [
          "Best for — anyone who wants to be auditing a real account in 5 minutes without standing up infrastructure.",
          "Skip if — you have a hard policy against hosted MCP servers and need every byte of auth state inside your own VPC.",
        ],
      },
      {
        type: "subheading",
        content: "Community open-source MCP wrappers",
      },
      {
        type: "text",
        content:
          "Several individual developers have published Google Ads MCP servers on GitHub since late 2024. Quality varies — some are well-engineered single-developer projects; others are 200-line proofs of concept. Common pattern: thin wrappers around the official googleads-python-lib or google-ads-node, exposing 5–10 tools, expecting you to bring your own developer token and OAuth refresh token.",
      },
      {
        type: "list",
        content: "",
        items: [
          "Best for — developers who already have an approved developer token, want full code control, and only need read tools.",
          "Skip if — you do not want to apply for a Google developer token, or you need write-side guardrails out of the box.",
        ],
      },
      {
        type: "subheading",
        content: "Roll-your-own with the Google Ads API",
      },
      {
        type: "text",
        content:
          "If you are an engineering team with strong opinions about MCP shape and want exactly the tools you want, you can build directly on the Google Ads API and the official MCP SDK (TypeScript or Python). Realistic effort: 2–4 weeks for a credible v1 with auth, GAQL helpers, and a handful of write tools — plus the Google developer token application that runs in parallel.",
      },
      {
        type: "list",
        content: "",
        items: [
          "Best for — agencies or in-house teams who need bespoke tools, custom guardrails, or to integrate the MCP into a larger product.",
          "Skip if — your team does not need bespoke logic. The marginal value over forking an open-source server is usually negative.",
        ],
      },
      {
        type: "heading",
        content: "Decision matrix: which server should you use?",
      },
      {
        type: "list",
        content: "",
        items: [
          "Solo marketer or agency owner who wants to use Claude on Monday — NotFair hosted. Five-minute setup beats two weeks of Google approval every time.",
          "In-house growth team running multiple accounts under an MCC — NotFair hosted, with the MCC selected during connect. Re-auth once, manage many clients.",
          "Engineer evaluating MCP for a side project — community open-source server. Lowest commitment, easiest to fork.",
          "Agency building a proprietary internal tool on top of MCP — roll-your-own with the Google Ads API and the official MCP SDK. NotFair is hosted-only today.",
          "Compliance-bound enterprise — roll-your-own inside your VPC, with your own Google developer token. The infra cost is justified by the data-residency requirement.",
        ],
      },
      {
        type: "heading",
        content: "What to look for in any MCP server you evaluate",
      },
      {
        type: "text",
        content:
          "Independent of which path you take, here is the checklist we use when reviewing other people's MCP servers:",
      },
      {
        type: "list",
        content: "",
        items: [
          "Tool surface area — does it cover both read and write, or only read? A read-only server is a research toy, not a workflow tool.",
          "GAQL access — can the server execute arbitrary GAQL, or only the report shapes the author thought to expose? Arbitrary GAQL is a 10x multiplier for what Claude can do.",
          "Parallel queries — can it batch GAQL calls? Without parallelism, audits hit token-budget limits before they finish.",
          "Approval flow on writes — does it require explicit confirmation for destructive operations, or does it just YOLO whatever the model says? Production servers require confirmation.",
          "Change log and undo — is there a server-side change history that can be queried (\"what did Claude change this week?\") and rolled back? If not, your account has no audit trail.",
          "Error surfaces — does the server return Google Ads API errors verbatim, or wrap them with helpful context? \"AUTHENTICATION_ERROR\" with no extra info is a debugging nightmare.",
          "Transport coverage — does it support stdio (Claude Code, Cursor), HTTP/SSE (Claude Desktop, ChatGPT/Codex), or both?",
          "License and source visibility — even hosted servers should have public source for the parts that touch your auth tokens. \"Trust us\" is not a security posture.",
        ],
      },
      {
        type: "heading",
        content: "Common mistakes when picking a Google Ads MCP",
      },
      {
        type: "list",
        content: "",
        items: [
          "Optimizing for tool count — \"100+ tools\" sounds impressive but it is mostly noise. A small set of well-designed tools (with one sandboxed GAQL escape hatch) outperforms a hundred narrow endpoints.",
          "Skipping the developer-token question — the Google Ads API requires an approved developer token. If a server does not provide one, you have to apply for your own. Plan for that or pick a server that handles it.",
          "Ignoring write guardrails — the most common AI ads incident we have seen is a model bulk-pausing campaigns based on misread context. A server without approval gates makes this 10x more likely.",
          "Treating MCP as a Claude-only thing — MCP is an open standard. The same server should work with ChatGPT/Codex, Cursor, and Windsurf. If a server is Claude-locked, that is a signal of immaturity.",
          "Confusing MCP with Google's own AI features — Smart Bidding and Performance Max are inside Google Ads. An MCP server is the thing that makes your AI assistant outside Google Ads (Claude, ChatGPT) able to read and act on your account. They are complementary, not competing.",
        ],
      },
      {
        type: "heading",
        content: "How to get started in 5 minutes",
      },
      {
        type: "text",
        content:
          "If you want to skip the comparison and just try it, the fastest path is the NotFair hosted server. Sign in at notfair.co/connect with the Google account that has Ads access, pick which customer IDs Claude (or ChatGPT, or Cursor) should see, and copy the connector config into your client of choice. The connect page has a tab per client with the exact config snippet for each.",
      },
      {
        type: "text",
        content:
          "If you need an MCP server inside your own infrastructure, NotFair is hosted-only today — there is no published self-host distribution. The two real options are to fork an open-source community wrapper from GitHub and bring your own Google developer token, or to roll your own on top of the Google Ads API and the official MCP SDK. Both routes assume engineering capacity. Most teams who think they want self-host find the hosted server clears their threat model after they read its OAuth scope and revocation story.",
      },
      {
        type: "heading",
        content: "FAQ",
      },
    ],
    faq: [
      {
        question: "Is there an official Google Ads MCP server from Google?",
        answer:
          "No. As of April 2026, Google has not published a first-party MCP server for Google Ads. All available servers are built on top of the Google Ads API by third parties (NotFair) or community developers.",
      },
      {
        question: "Do I need a Google Ads developer token to use a Google Ads MCP server?",
        answer:
          "It depends on the server. Hosted servers like NotFair handle the developer token for you. If you self-host or fork an open-source server, you need to apply for your own developer token from Google — typically a 1–2 week approval process.",
      },
      {
        question: "Can I use a Google Ads MCP server with ChatGPT, not just Claude?",
        answer:
          "Yes, if the server supports HTTP/SSE transport. NotFair exposes a Codex-compatible endpoint that works with ChatGPT's Codex connectors and OpenAI's Codex CLI. Stdio-only servers (a common pattern in early open-source builds) work with Claude Desktop and Cursor but not with ChatGPT.",
      },
      {
        question: "What is the safest way to give an MCP server write access to my Google Ads account?",
        answer:
          "Pick a server with explicit approval gates on destructive operations (delete, hard pause, budget changes), a queryable change log so you can audit what was modified, and OAuth scopes limited to Google Ads only. Start with read-only mode for the first week and graduate to writes after you trust the recommendations.",
      },
      {
        question: "How is an MCP server different from the Google Ads API directly?",
        answer:
          "The MCP server wraps the API in a shape that AI models can use without per-tool integration code. The Google Ads API is for human developers writing code. An MCP server is for AI clients picking tools at runtime based on what the user asked. Most MCP servers use the API under the hood — the value is the standardized AI-facing layer.",
      },
      {
        question: "Can I run a Google Ads MCP server inside my own infrastructure?",
        answer:
          "Yes, but not via NotFair today — NotFair is hosted-only. To self-host, you have two options: fork a community open-source MCP wrapper, or roll your own on top of the Google Ads API and the official MCP SDK. Either route requires you to apply for your own Google developer token. Most teams that think they need self-host end up using the hosted version after reading its OAuth scope and revocation story.",
      },
      {
        question: "How many tools should a Google Ads MCP server have?",
        answer:
          "Fewer, well-designed tools beat many narrow ones. The right shape is ~10–15 high-value tools (covering audits, search terms, bids, negatives, RSAs, change history) plus one sandboxed GAQL execution tool that lets the model run arbitrary read queries when none of the prebuilt tools fit. NotFair ships this exact pattern.",
      },
    ],
    relatedLinks: [
      {
        href: "/google-ads-mcp",
        title: "NotFair Google Ads MCP Server",
        description:
          "The hosted version — connect Google Ads in one OAuth flow, then point Claude, ChatGPT, or Cursor at it.",
      },
      {
        href: "/blog/connect-google-ads-to-claude",
        title: "How to Connect Google Ads to Claude",
        description:
          "Step-by-step setup for Claude Desktop, Claude Code, ChatGPT/Codex, and any MCP client.",
      },
      {
        href: "/blog/what-is-mcp",
        title: "What Is MCP (Model Context Protocol)?",
        description:
          "The open standard behind every Claude integration — clients, servers, tools, and a real Google Ads example.",
      },
    ],
  },
  "connect-google-ads-to-claude": {
    slug: "connect-google-ads-to-claude",
    title: "How to Connect Google Ads to Claude (2026 Guide)",
    seoTitle: "How to Connect Google Ads to Claude (2026 Guide)",
    description:
      "Connect Google Ads to Claude in under 5 minutes. Step-by-step setup for Claude Desktop, Claude Code, ChatGPT/Codex, and any MCP client.",
    keywords: [
      "connect google ads to claude",
      "claude google ads integration",
      "claude desktop google ads setup",
      "give claude access to google ads",
      "claude google ads tutorial",
      "google ads mcp",
      "claude mcp google ads",
      "connect google ads api to claude",
    ],
    publishedAt: "2026-04-29",
    updatedAt: "2026-04-29",
    author: {
      name: "NotFair Team",
      role: "AI ads infrastructure",
    },
    content: [
      {
        type: "text",
        content:
          "You connect Google Ads to Claude with an MCP (Model Context Protocol) server that bridges Claude to the Google Ads API. Once connected, Claude can read your campaigns, audit performance, draft ad copy, pause wasteful keywords, and bulk-update bids — all from a normal chat or coding session, no spreadsheets, no Google Ads UI clicking.",
      },
      {
        type: "text",
        content:
          "The fastest way is the open-source NotFair MCP server. It works with Claude Desktop, Claude Web, Claude Cowork, Claude Code, ChatGPT (via Codex connectors), Cursor, Windsurf, and any other MCP-compatible client. Setup takes about 5 minutes and starts at notfair.co/connect. This guide walks through every supported path, the exact errors you will hit if something goes wrong, and what changes in your day-to-day once Claude has access.",
      },
      {
        type: "heading",
        content: "What you need before you start",
      },
      {
        type: "text",
        content:
          "You need three things: a Google Ads account with at least one active customer ID; a Claude client (Claude Desktop, Claude Web, Claude Cowork, Claude Code, ChatGPT with Codex connectors, or any MCP-compatible IDE like Cursor or Windsurf); and about 5 minutes for the OAuth handshake and the connector install.",
      },
      {
        type: "list",
        content: "",
        items: [
          "No developer token required — NotFair handles the Google Ads API token on your behalf, so you skip the 1–2 week Google approval process.",
          "No coding background required — the recommended path is point-and-click through Claude's built-in connector UI.",
          "No paid plan required — NotFair is free during the public beta, and there is a demo mode with sample data if you do not have a Google Ads account yet.",
        ],
      },
      {
        type: "text",
        content:
          "If your team uses a manager (MCC) account, sign in with the Google identity that has client access — not just MCC access. NotFair will surface both direct customers and clients linked under a manager during account selection.",
      },
      {
        type: "heading",
        content: "How Claude actually connects to Google Ads",
      },
      {
        type: "text",
        content:
          "Claude does not talk to Google Ads directly. It talks to an MCP server, which talks to the Google Ads API on your behalf. The chain looks like this: you to Claude, Claude to the NotFair MCP server, NotFair to the Google Ads API.",
      },
      {
        type: "text",
        content:
          "MCP is Anthropic's open standard for letting AI agents call external tools safely. NotFair implements ~40 Google Ads tools — listCampaigns, pauseKeyword, runScript, bulkUpdateBids, addNegativeKeyword, and more — and exposes them through the MCP protocol. Claude reads the tool list, picks the right one for what you ask, and the server enforces auth and guardrails before anything touches your account.",
      },
      {
        type: "text",
        content:
          "The implication: you authenticate once on the server side, and every Claude client you connect afterwards reuses that auth. You do not paste API keys directly into Claude.",
      },
      {
        type: "heading",
        content: "Connect Google Ads to Claude Desktop (recommended)",
      },
      {
        type: "text",
        content:
          "This is the path most users should take. It uses Claude's built-in Connectors UI — no config files, no terminal.",
      },
      {
        type: "subheading",
        content: "Step 1 — Sign in to NotFair with Google",
      },
      {
        type: "text",
        content:
          "Go to notfair.co/connect and click Sign in with Google. Use the Google identity that has access to your Google Ads account. On the consent screen, keep the \"See, edit, create, and delete your Google Ads accounts and data\" checkbox checked. If you uncheck it, NotFair has no permission to read your campaigns and the next step will fail.",
      },
      {
        type: "subheading",
        content: "Step 2 — Pick which Ads accounts Claude can manage",
      },
      {
        type: "text",
        content:
          "After OAuth, NotFair lists every Google Ads customer ID your account can reach — direct accounts and any clients under a manager (MCC) account, grouped clearly. Tick the accounts you want Claude to manage. You can add more or remove access later from the dashboard.",
      },
      {
        type: "subheading",
        content: "Step 3 — Add the NotFair connector in Claude Desktop",
      },
      {
        type: "text",
        content:
          "Stay on the Claude Desktop tab at notfair.co/connect/claude-connector. Click Add to Claude — this deeplinks into Claude Desktop and installs the connector with your auth token preconfigured. If the deeplink does not open (older Claude Desktop builds), copy the connector URL shown on the page and add it manually in Claude Desktop under Settings, Connectors, Add custom connector.",
      },
      {
        type: "subheading",
        content: "Step 4 — Verify it works",
      },
      {
        type: "text",
        content:
          "Open a new Claude conversation and ask for an audit. Claude should respond with a tool call to NotFair, return spend, conversion, and waste numbers, and offer next actions.",
      },
      {
        type: "callout",
        content:
          "You: \"Audit my Google Ads account from the last 30 days.\"\n\nClaude calls listConnectedAccounts, then runScript with a parallel GAQL query covering campaigns, search terms, and quality scores. It returns: total spend, top wasted-spend keywords, accounts with no negative keyword list, and recommended next actions — all with your approval at each write step.",
      },
      {
        type: "heading",
        content: "Connect Google Ads to Claude Code (CLI)",
      },
      {
        type: "text",
        content:
          "For developers and agency teams who live in the terminal. Claude Code installs the AdsAgent plugin in one command, which bundles the NotFair MCP server config plus three skills: /ads, /ads-audit, and /ads-copy.",
      },
      {
        type: "code",
        language: "bash",
        content: "claude plugin install nowork-studio/adsagent-plugin",
      },
      {
        type: "text",
        content:
          "On first run, Claude Code prompts you for an API key. Generate one at notfair.co/connect/claude-code (after the OAuth step above) and paste it in — or set it as an environment variable so future sessions pick it up automatically.",
      },
      {
        type: "code",
        language: "bash",
        content: "export ADSAGENT_API_KEY=your_key_here",
      },
      {
        type: "text",
        content:
          "Restart Claude Code, run /ads-audit, and you should see a full account health report with scoring, persona inference, and a prioritized fix list.",
      },
      {
        type: "heading",
        content: "Connect Google Ads to ChatGPT or Codex",
      },
      {
        type: "text",
        content:
          "NotFair also exposes a Codex-compatible MCP endpoint, so the same auth works with OpenAI's Codex CLI and the ChatGPT Codex connector. After signing in, go to notfair.co/connect/codex, copy the MCP server URL and bearer token, then either:",
      },
      {
        type: "list",
        content: "",
        items: [
          "Codex CLI — add the server to the MCP block in your ~/.codex/config.toml file.",
          "ChatGPT Codex connector — paste the URL into the Codex connector setup screen inside ChatGPT.",
        ],
      },
      {
        type: "text",
        content:
          "A single Google Ads connection can power both Claude and ChatGPT side by side — useful if your team uses both, or if you want to compare reasoning across models on the same account data.",
      },
      {
        type: "heading",
        content: "Connect Google Ads to Cursor, Windsurf, or any MCP client",
      },
      {
        type: "text",
        content:
          "Any client that speaks MCP can connect to NotFair. Visit notfair.co/connect/any-mcp, copy the server URL and bearer token, and paste them into your client's MCP server config. For Cursor, that is typically the ~/.cursor/mcp.json file.",
      },
      {
        type: "code",
        language: "json",
        content:
          "{\n  \"mcpServers\": {\n    \"notfair\": {\n      \"url\": \"https://mcp.notfair.co/v1\",\n      \"headers\": { \"Authorization\": \"Bearer YOUR_TOKEN\" }\n    }\n  }\n}",
      },
      {
        type: "text",
        content:
          "Restart the client. The NotFair tools should appear in the agent panel. The same pattern works for Windsurf, Cline, and any custom MCP client — only the config file path changes.",
      },
      {
        type: "heading",
        content: "What you can do once it is connected",
      },
      {
        type: "text",
        content:
          "Real prompts that work, with what each one does under the hood:",
      },
      {
        type: "list",
        content: "",
        items: [
          "Audit my account and find waste — runScript fans out parallel GAQL queries across spend, conversions, search terms, and quality scores, then correlates them in one pass.",
          "Pause keywords with zero conversions in 90 days — bulkPauseKeywords with a filter expression.",
          "Write 3 RSA variants for boarding services — createAd with experience-driven copy generation.",
          "Increase bids 15% on converting keywords — bulkUpdateBids scoped to keywords with at least one conversion.",
          "What changed in this account last week — getChanges from change history with diff summaries.",
          "Add 'free' as a negative keyword across all search campaigns — addNegativeKeyword applied at the campaign level.",
        ],
      },
      {
        type: "text",
        content:
          "The first audit is the highest-impact moment. Most accounts surface at least one fixable waste item in the first five minutes — usually a keyword bleeding spend with no conversions, or a search term triggering on intent it should not. Reviewing and approving those fixes recovers more spend than most paid optimization tools surface in their first month.",
      },
      {
        type: "heading",
        content: "Common setup errors (and the fix)",
      },
      {
        type: "text",
        content:
          "These are the four errors users actually hit, in order of frequency. NotFair's connect page handles each with specific guidance — but knowing them ahead of time saves a few minutes.",
      },
      {
        type: "subheading",
        content: "No Google Ads accounts found for [email]",
      },
      {
        type: "text",
        content:
          "You signed in with the wrong Google identity. The most common cause is using your personal Gmail when your team's Ads account is on a different Workspace email. Click Use a different Google account and try again with the correct identity.",
      },
      {
        type: "subheading",
        content: "No client accounts under this manager",
      },
      {
        type: "text",
        content:
          "You signed in with an MCC (manager) account that does not have any client accounts linked yet. Either link a client in the Google Ads UI first, or sign in with a Google identity that has direct (non-manager) access.",
      },
      {
        type: "subheading",
        content: "Google Ads access is required",
      },
      {
        type: "text",
        content:
          "You unchecked the permission checkbox on Google's consent screen. NotFair literally cannot read your campaigns without it. Click the retry button — Google will re-prompt you, and this time leave the box checked.",
      },
      {
        type: "subheading",
        content: "Claude says \"no tools available\" after install",
      },
      {
        type: "text",
        content:
          "The connector was added but Claude has not picked up the tools yet. Quit and reopen Claude Desktop fully — not just a new conversation. MCP tools register at startup. The same applies to Claude Code, Cursor, and Windsurf: a full restart is required after adding a server.",
      },
      {
        type: "heading",
        content: "Is it safe to give Claude access to Google Ads?",
      },
      {
        type: "text",
        content:
          "A reasonable question. Three guardrails that matter:",
      },
      {
        type: "list",
        content: "",
        items: [
          "OAuth-scoped access — NotFair only gets the Google Ads scope you grant. It cannot read your Gmail, Drive, calendar, or any other Google product. You can revoke access in 5 seconds at myaccount.google.com/permissions.",
          "Server-side guardrails — destructive actions like deleting a campaign or hard-pausing asset groups require explicit confirmation. NotFair also supports per-account spend caps and a preview-only mode for agencies who want to demo recommendations without execution rights.",
          "Auditable — every write is logged with full context, queryable through Claude (\"what did you change in this account this week?\") and reversible through the change-history view in the NotFair dashboard.",
        ],
      },
      {
        type: "text",
        content:
          "The realistic risk is the same risk you would have giving a junior media buyer keyboard access: a misunderstood instruction. Mitigate with the same controls — start with read-only audits, review proposed changes before applying, and keep the change-history tab open so you can roll back quickly if needed.",
      },
      {
        type: "heading",
        content: "FAQ",
      },
    ],
    faq: [
      {
        question: "Does Claude work with Google Ads natively?",
        answer:
          "No. Claude needs an MCP server (like NotFair) to bridge to the Google Ads API. There is no built-in Google Ads connector from Anthropic as of April 2026.",
      },
      {
        question: "Can I connect multiple Google Ads accounts to one Claude instance?",
        answer:
          "Yes. During the NotFair connect flow you can select multiple customer IDs, including clients under a manager (MCC) account. Claude can switch between them by name during a conversation.",
      },
      {
        question: "Do I need a Google Ads developer token to use Claude with Google Ads?",
        answer:
          "No. NotFair holds a single approved developer token and proxies API calls under it. You only complete the OAuth flow with your Google account.",
      },
      {
        question: "Can Claude make changes to my Google Ads account, or only read it?",
        answer:
          "Both. The MCP exposes around 40 tools split across read (audits, reports, change history) and write (pause, create, bulk update bids, add negative keywords). Write tools require your auth token and respect any guardrails you set, including approval gates for destructive actions.",
      },
      {
        question: "What is the difference between NotFair and connecting via the Google Ads API directly?",
        answer:
          "Direct API integration requires a developer token (Google approval typically takes 1–2 weeks), a working OAuth flow, and a custom MCP server implementation. NotFair handles all of that. You get from \"I have a Google Ads account\" to \"Claude is auditing it\" in five minutes instead of two weeks.",
      },
      {
        question: "Does this work with ChatGPT?",
        answer:
          "Yes. The same NotFair connection works with ChatGPT via Codex connectors and with Claude simultaneously. A single Google Ads auth powers both clients.",
      },
      {
        question: "Is NotFair really free?",
        answer:
          "The hosted version at notfair.co is free during the public beta. Pricing for paid tiers will be published before any plan change — no surprise charges.",
      },
    ],
    relatedLinks: [
      {
        href: "/connect",
        title: "Connect Google Ads",
        description:
          "Start the OAuth flow and pick which accounts Claude can manage.",
      },
      {
        href: "/blog/what-is-mcp",
        title: "What Is MCP (Model Context Protocol)?",
        description:
          "The protocol behind every Claude integration explained — clients, servers, tools, and a real Google Ads example.",
      },
      {
        href: "/blog/google-ads-ai-agent",
        title: "Google Ads AI Agent: What It Actually Does",
        description:
          "What an AI agent can realistically do for ad accounts — diagnose waste, find negative keyword gaps, and optimize bids with human review.",
      },
    ],
  },
  "google-ads-ai-agent": {
    slug: "google-ads-ai-agent",
    title: "Google Ads AI Agent: What It Actually Does (and What It Can't)",
    seoTitle: "Google Ads AI Agent: What It Actually Does",
    description:
      "Learn what a Google Ads AI agent can actually do — diagnose account issues, find negative keyword gaps, recommend fixes, and optimize bids. Real examples, no hype.",
    keywords: [
      "google ads ai agent",
      "ai google ads management",
      "ai google ads optimization",
      "google ads automation ai",
      "ai ppc management",
    ],
    publishedAt: "2026-04-07",
    updatedAt: "2026-04-07",
    author: {
      name: "NotFair Team",
      role: "AI ads infrastructure",
    },
    content: [
      {
        type: "text",
        content:
          "A Google Ads AI agent is software that can read your campaign data, identify problems, recommend fixes, and take approved action using natural language instead of a manual workflow. Think of it as giving an AI access to your Google Ads account so it can diagnose spend, surface patterns, and make changes on your behalf or with your approval.",
      },
      {
        type: "text",
        content:
          "This guide covers what AI agents can realistically do for Google Ads management, how they differ from Google's built-in automation, and what \"human in the loop\" means in practice. If you're evaluating whether AI can actually manage your ads — not just generate copy — this is for you.",
      },
      {
        type: "heading",
        content: "What Is a Google Ads AI Agent?",
      },
      {
        type: "text",
        content:
          "The term \"AI agent\" gets used loosely. For Google Ads, it means an AI system that can read live account data, reason about that data to diagnose waste patterns and missed opportunities, recommend fixes, take actions like pausing keywords or adjusting bids, and communicate in plain language — you ask a question or describe a problem, it responds with findings or executes an approved task.",
      },
      {
        type: "text",
        content:
          "This is different from a dashboard or a reporting tool. An agent doesn't just display data — it interprets it and can act on it. The meaningful distinction: can the AI actually query your account in real time and take actions based on what it finds? If yes, it's an agent. If it just takes text input and generates suggestions without reading your data, it's a writing tool.",
      },
      {
        type: "text",
        content:
          "Tools like NotFair implement this as an MCP server — a Model Context Protocol server that lets AI assistants like Claude connect to external systems and call structured tools against live data.",
      },
      {
        type: "heading",
        content: "What AI Agents Can Actually Do",
      },
      {
        type: "subheading",
        content: "Diagnosing Wasted Spend and Structural Issues",
      },
      {
        type: "text",
        content:
          "This is where AI earns its keep most clearly. A manual diagnosis on a mid-size account — 10 campaigns, 50+ ad groups, several hundred keywords — typically takes 2–4 hours. An AI agent can do the same structural analysis in under a minute, then translate the findings into recommended fixes.",
      },
      {
        type: "callout",
        content:
          "Example: In one account audit, an AI agent reviewed the search terms report across all campaigns and flagged that a single broad-match keyword had generated impressions across 214 unique search queries — but the campaign had no negative keyword list at all. Of those 214 queries, 73 were clearly irrelevant. The wasted spend attributable to those terms over 30 days: $1,847. A human auditor would eventually find this, but it would take 2–3 hours of manual filtering and judgment calls.",
      },
      {
        type: "subheading",
        content: "Finding Negative Keyword Gaps",
      },
      {
        type: "text",
        content:
          "Negative keywords are one of the highest-ROI activities in Google Ads management, and one of the most neglected. An AI agent can pull the full search terms report for any date range, identify terms that spent money without converting, group them by theme (brand, location, intent modifier), generate a negative keyword list with suggested match types, and add them to the campaign after approval.",
      },
      {
        type: "text",
        content:
          "The grouping step is where AI adds real value. It's not just finding individual bad terms — it's noticing that you're wasting money on every variant of a competitor brand name and suggesting a phrase-match negative that blocks the whole category.",
      },
      {
        type: "subheading",
        content: "Bid Optimization Analysis",
      },
      {
        type: "text",
        content:
          "AI agents can analyze bid performance more granularly than manual review allows: device bid adjustments (if mobile converts at half the rate of desktop but bids are equal), dayparting gaps (hours where CPA spikes without a bid reduction), and auction insights cross-referencing impression share loss against budget vs. rank. These analyses exist in the Google Ads interface, but pulling them together and reaching a recommendation involves 4–5 different reports. An agent does it in one query.",
      },
      {
        type: "heading",
        content: "How AI Agents Differ From Google's Built-In Automation",
      },
      {
        type: "text",
        content:
          "The critical difference is reviewability. Smart Campaigns and Performance Max operate as black boxes — they adjust bids, select audiences, and rotate creative without explaining why. An AI agent can show its work. You can ask \"why did you recommend pausing that keyword?\" and get a specific, auditable answer you can evaluate and override.",
      },
      {
        type: "list",
        content: "",
        items: [
          "Google Smart Campaigns / Performance Max: reads data, takes action automatically, does not explain reasoning, limited human control",
          "Rule-based automation: reads data, takes action by predefined rules, no explanation, campaign-level control",
          "AI Agent (NotFair): reads data, takes action only with approval, explains reasoning, full account scope, natural language interface",
        ],
      },
      {
        type: "heading",
        content: "Why \"Human in the Loop\" Matters for Ads",
      },
      {
        type: "text",
        content:
          "Budget risk is asymmetric. A wrong bid adjustment doesn't just fail to help — it actively spends money. An AI that autonomously raises CPCs by 40% because it misread a conversion spike can burn significant budget before you notice. There's also context the AI doesn't have: a campaign that appears underperforming might be intentionally throttled because you're waiting on a landing page redesign.",
      },
      {
        type: "text",
        content:
          "The NotFair approach implements review-first workflow: the AI diagnoses and recommends, you approve. You can ask it to execute directly on lower-stakes changes (adding a negative keyword) while keeping approval gates on higher-stakes changes (bid strategy changes, budget adjustments). That trust is earned incrementally through consistent, accurate recommendations.",
      },
      {
        type: "heading",
        content: "Getting Started With an AI Google Ads Agent",
      },
      {
        type: "list",
        content: "",
        items: [
          "Use NotFair: connects your Google Ads account and gives you an AI interface immediately. No setup beyond authentication. Run a free diagnosis to see what AI finds in your account.",
          "Use Claude with MCP: Anthropic's Claude supports Model Context Protocol, which NotFair uses. You get a conversational interface to your account data — ask questions, get analysis, approve actions.",
          "Build with the Google Ads API directly: for developers or agencies managing many accounts. The main costs are API authentication complexity and maintenance over time.",
        ],
      },
      {
        type: "text",
        content:
          "Start with a campaign diagnosis focused on spend efficiency. Ask the agent why performance changed, what is wasting spend, which keywords lack negative lists, and where query match types are too loose. Those data points surface the highest-ROI quick wins in most accounts.",
      },
      {
        type: "heading",
        content: "Common Mistakes When Using AI for Google Ads",
      },
      {
        type: "list",
        content: "",
        items: [
          "Treating AI output as automatically correct — AI agents read data accurately but can misinterpret context. A keyword with high CPA might be your highest-LTV acquisition channel. Always ask \"why\" before approving a change.",
          "Starting with autonomous mode — if a tool offers fully autonomous optimization, run it in recommendation-only mode for at least 30 days first. Establish a baseline for the quality of its judgment.",
          "Ignoring the search terms report — tools that can't show you specific queries driving waste are not analyzing your account. Generic advice without data access is a writing tool, not an agent.",
          "Expecting AI to replace campaign strategy — AI agents are good at diagnosing waste, explaining likely causes, and optimizing within an existing structure. They are weaker at deciding whether to expand into a new product category or reposition the business.",
        ],
      },
      {
        type: "heading",
        content: "FAQ",
      },
    ],
    faq: [
      {
        question: "What's the difference between a Google Ads AI agent and Google's AI features?",
        answer:
          "Google's AI features (Smart Bidding, Performance Max) optimize automatically within their defined scope and don't explain their decisions. An external AI agent reads your account data and reasons about it conversationally — you can ask 'what is wrong and what should I fix?' and get a specific, auditable answer. The two can coexist: use Smart Bidding for bid execution, use an AI agent for account-level diagnosis, recommendations, and oversight.",
      },
      {
        question: "Can an AI agent actually make changes to my Google Ads account?",
        answer:
          "Yes, if the tool has API write access. NotFair can pause keywords, add negative keywords, adjust bids, and create ad variations. The question is whether it does so autonomously or with your approval. Review-first mode is safer for most use cases.",
      },
      {
        question: "How accurate is AI spend analysis?",
        answer:
          "As accurate as the data it reads — Google Ads API-level accuracy for spend, clicks, and conversions. The risk isn't data accuracy; it's interpretation. Make sure the agent understands your optimization goal (CPA vs. ROAS vs. LTV) before acting on its recommendations.",
      },
      {
        question: "Do I need technical skills to use a Google Ads AI agent?",
        answer:
          "For managed tools like NotFair: no. Authentication is handled through OAuth and the interface is conversational. For building a custom agent with the Google Ads API directly: yes, developer skills are required.",
      },
      {
        question: "Is AI Google Ads management worth it for small accounts?",
        answer:
          "The ROI case is clearer for accounts spending $5K+/month where waste patterns are large enough to matter. For smaller accounts, AI agents are still useful for audit purposes — spending 15 minutes having an AI review your account is faster than spending 3 hours doing it manually, regardless of account size.",
      },
      {
        question: "What data does an AI agent need access to?",
        answer:
          "At minimum: campaigns, ad groups, keywords, bids, spend data, and the search terms report. Some analyses require conversion data. The AI doesn't need your billing details or personal account information.",
      },
      {
        question: "Can AI write good Google Ads copy?",
        answer:
          "AI can write competent ad copy that follows format requirements and includes relevant keywords. Best practice: use AI to generate 10–15 headline variations quickly, then edit the best 3–4 for accuracy and brand voice. This is faster than writing from scratch, but slower than just publishing what the AI produces.",
      },
    ],
    relatedLinks: [
      {
        href: "/connect",
        title: "Connect Google Ads",
        description: "Connect your account and let your AI agent diagnose issues, recommend fixes, and draft approved changes.",
      },
      {
        href: "/google-ads-claude",
        title: "Google Ads + Claude",
        description: "Connect Google Ads to Claude to diagnose issues, recommend fixes, and manage approved changes in natural language.",
      },
      {
        href: "/google-ads-mcp",
        title: "Google Ads MCP Server",
        description: "The technical details: tools, auth, and setup for the MCP server.",
      },
    ],
  },
  "what-is-mcp": {
    slug: "what-is-mcp",
    title: "What Is MCP (Model Context Protocol)?",
    seoTitle: "What Is MCP? Model Context Protocol Explained",
    description:
      "MCP (Model Context Protocol) is the open standard connecting AI agents to tools and data. Learn how it works, MCP vs APIs, and a real Google Ads example.",
    keywords: [
      "what is mcp",
      "model context protocol",
      "mcp protocol",
      "mcp server",
      "model context protocol explained",
      "mcp vs api",
      "anthropic mcp",
      "mcp tools",
    ],
    publishedAt: "2026-04-05",
    updatedAt: "2026-04-05",
    author: {
      name: "NotFair Team",
      role: "AI ads infrastructure",
    },
    content: [
      {
        type: "text",
        content:
          "MCP (Model Context Protocol) is an open standard created by Anthropic that lets AI models connect to external tools, data sources, and services through a unified interface. Instead of each AI application building its own custom integration for every tool it needs, MCP provides a single protocol that any AI client can use to talk to any compatible server. Think of it as USB-C for AI — one connector that works everywhere.",
      },
      {
        type: "text",
        content:
          "If you have used Claude Desktop, Cursor, Windsurf, or any MCP-compatible AI client, you have already benefited from MCP — even if you did not know it by name. MCP is the reason these tools can interact with your files, databases, APIs, and third-party services without bespoke integrations glued together with duct tape.",
      },
      {
        type: "heading",
        content: "Why MCP exists",
      },
      {
        type: "text",
        content:
          "Before MCP, connecting an AI model to an external tool required custom work for every combination. Want Claude to read your GitHub repos? Build a custom integration. Want it to query your database? Build another one. Want it to manage your Google Ads account? Build yet another. Each integration had its own auth model, data format, error handling, and maintenance burden.",
      },
      {
        type: "text",
        content:
          "This is the N-times-M problem: N AI clients times M tools equals N*M custom integrations. MCP solves this by defining a standard protocol. Each tool builds one MCP server. Each AI client builds one MCP client. Now everything connects to everything — and the ecosystem grows without exponential integration work.",
      },
      {
        type: "text",
        content:
          "Anthropic released MCP as an open specification in late 2024. Since then, adoption has spread rapidly: Claude Desktop, Cursor, Windsurf, Cline, and dozens of other AI clients now support MCP natively. The server ecosystem has grown to cover databases, file systems, APIs, SaaS tools, and vertical applications like Google Ads management.",
      },
      {
        type: "heading",
        content: "How MCP works: clients, servers, and tools",
      },
      {
        type: "text",
        content:
          "MCP follows a client-server architecture with three core concepts:",
      },
      {
        type: "list",
        content: "",
        items: [
          "MCP Client — The AI application (Claude Desktop, Cursor, your custom agent). It discovers what tools a server offers, sends requests, and handles responses.",
          "MCP Server — A lightweight program that exposes specific capabilities. A Google Ads MCP server exposes campaign data and management actions. A GitHub MCP server exposes repo operations. Each server is focused on one domain.",
          "MCP Tools — The individual actions a server offers. An MCP server for Google Ads might expose tools like getCampaignPerformance, getKeywords, pauseCampaign, and updateBid. The AI model sees these tools and decides when to call them based on what the user asks.",
        ],
      },
      {
        type: "text",
        content:
          "When you connect an MCP server to your AI client, the client discovers the available tools automatically. The AI model then has context about what it can do — it knows it can query campaign performance, look up keywords, or pause a campaign. When you ask a question like \"which campaigns wasted the most spend last week?\", the model calls the appropriate tools, gets live data, and reasons over it to give you a direct answer.",
      },
      {
        type: "subheading",
        content: "The protocol in practice",
      },
      {
        type: "text",
        content:
          "MCP uses JSON-RPC 2.0 over standard transports (stdio for local servers, HTTP with Server-Sent Events for remote ones). A typical interaction looks like this:",
      },
      {
        type: "list",
        content: "",
        items: [
          "The client connects to the server and calls initialize to exchange capabilities.",
          "The client calls tools/list to discover available tools and their input schemas.",
          "When the AI model decides to use a tool, the client sends a tools/call request with the tool name and arguments.",
          "The server executes the action (queries an API, reads a database, etc.) and returns the result.",
          "The AI model incorporates the result into its reasoning and response.",
        ],
      },
      {
        type: "text",
        content:
          "This is all transparent to the end user. You ask a question in natural language, and the AI handles the tool orchestration behind the scenes.",
      },
      {
        type: "heading",
        content: "MCP vs traditional APIs: what is actually different",
      },
      {
        type: "text",
        content:
          "If MCP servers wrap APIs, why not just use the API directly? This is the most common question from developers encountering MCP for the first time. The difference is who the consumer is.",
      },
      {
        type: "text",
        content:
          "A traditional REST or GraphQL API is designed for human developers writing code. The developer reads documentation, writes integration code, handles authentication, parses responses, and builds UI around the data. An MCP server is designed for AI models. It exposes tool descriptions that the model can read, input schemas the model can populate, and structured responses the model can reason over — all at runtime, without any code written by the user.",
      },
      {
        type: "list",
        content: "",
        items: [
          "Discovery — APIs require docs and manual integration. MCP tools are self-describing; the AI discovers them automatically.",
          "Consumer — APIs serve developers. MCP serves AI models (and through them, end users who never write code).",
          "Integration cost — Connecting to an API means writing and maintaining code. Connecting to an MCP server means adding a config line to your AI client.",
          "Composability — An AI client can connect to multiple MCP servers simultaneously. One conversation can pull data from Google Ads, your CRM, and your analytics platform without any glue code.",
        ],
      },
      {
        type: "text",
        content:
          "MCP does not replace APIs — it sits on top of them. Most MCP servers use traditional APIs under the hood. The value is in the standardized interface layer that makes these APIs accessible to AI models without per-tool integration work.",
      },
      {
        type: "heading",
        content: "Real-world example: Google Ads over MCP",
      },
      {
        type: "text",
        content:
          "To make this concrete, here is how MCP works in practice with NotFair, a Google Ads MCP server. Instead of exporting CSV reports from Google Ads and pasting them into ChatGPT, or building a custom integration to feed campaign data into an AI workflow, you connect NotFair as an MCP server to your AI client.",
      },
      {
        type: "text",
        content:
          "Once connected, your AI client has access to over 30 Google Ads tools: campaign performance, keyword data, search term reports, bid adjustments, budget changes, negative keyword management, and more. A conversation might look like this:",
      },
      {
        type: "callout",
        content:
          "You: \"Which campaigns spent more than $500 last month with zero conversions?\"\n\nClaude calls getCampaignPerformance with the date range, filters for campaigns with cost > $500 and conversions = 0, and returns a prioritized list with spend amounts and click data.\n\nYou: \"Pause the bottom three and add their top search terms as negatives to the other campaigns.\"\n\nClaude calls pauseCampaign for each, then getSearchTermReport to find the terms, then addNegativeKeyword to apply them — all with your approval at each step.",
      },
      {
        type: "text",
        content:
          "The entire workflow happens in natural language. No dashboards, no exports, no code. The AI model handles the tool orchestration because MCP gives it the structured interface to do so. Setup takes about 30 seconds — connect your Google Ads account, add the MCP server config to your AI client, and start asking questions.",
      },
      {
        type: "heading",
        content: "What MCP servers exist today",
      },
      {
        type: "text",
        content:
          "The MCP ecosystem has grown quickly since the protocol launched. Here are the major categories of MCP servers available today:",
      },
      {
        type: "list",
        content: "",
        items: [
          "Developer tools — GitHub, GitLab, linear issue tracking, file system access, database queries (Postgres, SQLite, etc.)",
          "Data and analytics — Google Sheets, Notion databases, web scraping and browser automation",
          "Communication — Slack, email, calendar integrations",
          "Cloud infrastructure — AWS, GCP, Docker, Kubernetes management",
          "Advertising and marketing — Google Ads (NotFair), search console integrations, analytics platforms",
          "Vertical SaaS — CRM systems, e-commerce platforms, payment processors",
        ],
      },
      {
        type: "text",
        content:
          "Anthropic maintains a directory of MCP servers, and community registries like Smithery, Glama, and mcp.so catalog hundreds more. The long tail is where it gets interesting — niche servers for specific industries and workflows that would never justify a first-party AI integration.",
      },
      {
        type: "heading",
        content: "Common mistakes when evaluating MCP",
      },
      {
        type: "list",
        content: "",
        items: [
          "Confusing MCP with a specific product — MCP is a protocol, not a product. Claude uses MCP, but MCP is not Claude-specific. Any AI client can implement the MCP client specification.",
          "Thinking MCP replaces human oversight — MCP gives AI tools access to take actions, but well-built MCP servers (and clients) include approval flows. NotFair, for example, requires human confirmation before making campaign changes.",
          "Assuming MCP is only for developers — Setting up an MCP server often requires a one-time config step, but using it afterward is pure natural language. The whole point is removing the need to write code for every AI-tool interaction.",
          "Ignoring auth and security — MCP servers handle their own authentication. A Google Ads MCP server manages OAuth with Google. The AI model never sees your credentials directly. But you should still evaluate each server's security model before granting access.",
          "Expecting MCP to fix bad AI reasoning — MCP provides the connection layer. If the underlying AI model hallucinates or gives bad advice, MCP does not fix that. Choose an AI client with strong reasoning capabilities, especially for high-stakes domains like ad spend management.",
        ],
      },
      {
        type: "heading",
        content: "Getting started with MCP",
      },
      {
        type: "text",
        content:
          "If you want to start using MCP today, the path depends on what you want to connect:",
      },
      {
        type: "list",
        content: "",
        items: [
          "For Google Ads — NotFair gives you a ready-to-use MCP server. Connect your Google Ads account at www.notfair.co/connect, add the server to your MCP client config, and start querying campaigns in natural language.",
          "For development tools — Claude Desktop and Cursor ship with built-in MCP server support for file systems and common dev tools. Check your client's documentation for what is available out of the box.",
          "For other tools — Search the MCP server registries (Smithery, mcp.so) for your specific tool. Most servers include setup instructions that take under five minutes.",
          "For building your own — The MCP specification is open. Anthropic publishes SDKs for TypeScript and Python. If your tool has an API, you can wrap it in an MCP server to make it accessible to any MCP client.",
        ],
      },
      {
        type: "heading",
        content: "FAQ",
      },
    ],
    faq: [
      {
        question: "What does MCP stand for?",
        answer:
          "MCP stands for Model Context Protocol. It is an open standard created by Anthropic that defines how AI models connect to external tools and data sources.",
      },
      {
        question: "Is MCP only for Claude?",
        answer:
          "No. MCP is an open protocol. While Anthropic created it, any AI client can implement MCP support. Claude Desktop, Cursor, Windsurf, Cline, and many other tools already support it.",
      },
      {
        question: "How is MCP different from function calling?",
        answer:
          "Function calling is a capability within a single AI model's API — you define functions the model can call. MCP is a protocol that standardizes how any AI client connects to any tool server. MCP builds on top of function calling to create a universal, interoperable ecosystem.",
      },
      {
        question: "Do I need to write code to use MCP?",
        answer:
          "Not usually. Most MCP servers require a one-time configuration step (adding the server URL or config to your AI client). After that, you interact entirely through natural language. Building a new MCP server does require code.",
      },
      {
        question: "Is MCP safe to use with sensitive data like ad accounts?",
        answer:
          "MCP servers handle their own authentication and authorization. A well-built server like NotFair manages OAuth securely and supports approval flows before taking actions. Always evaluate a server's security practices before connecting sensitive accounts.",
      },
    ],
    relatedLinks: [
      {
        href: "/google-ads-mcp",
        title: "Google Ads MCP Server",
        description:
          "See NotFair's MCP server — connect Google Ads to Claude and other MCP clients.",
      },
      {
        href: "/ai-google-ads-agent",
        title: "AI Google Ads Agent",
        description:
          "Learn how AI agents use MCP to diagnose and manage Google Ads campaigns.",
      },
      {
        href: "/blog/connect-google-ads-to-claude",
        title: "Connect Google Ads to Claude",
        description:
          "Step-by-step: connect your Google Ads account to Claude through MCP.",
      },
    ],
  },
  "negative-keywords-google-ads-ai": {
    slug: "negative-keywords-google-ads-ai",
    title: "Negative Keywords in Google Ads: How to Use AI Without Overblocking",
    seoTitle: "Negative Keywords in Google Ads: AI Search Term Cleanup Guide",
    description:
      "How to find negative keywords in Google Ads with AI, review search terms safely, and apply approval-gated cleanup without blocking good intent.",
    keywords: [
      "negative keywords google ads",
      "google ads negative keywords",
      "find negative keywords",
      "negative keywords list",
      "performance max negative keywords",
      "ai negative keywords google ads",
      "negative keyword automation google ads",
    ],
    publishedAt: "2026-05-09",
    updatedAt: "2026-05-09",
    author: { name: "NotFair Team", role: "Google Ads optimization" },
    content: [
      {
        type: "text",
        content:
          "Negative keywords are one of the highest-leverage Google Ads optimizations because they remove bad intent before it consumes budget again. The mistake is treating them like a one-time checklist. Search terms drift every week, Performance Max exposes messy intent, and broad match can pull in queries that looked reasonable until you see the actual terms.",
      },
      {
        type: "text",
        content:
          "AI is useful here, but not because it should blindly block everything that looks odd. The right workflow is search-term cleanup with review: pull live search terms, group bad intent, explain the reason, propose match types, then apply only the negatives a human approves.",
      },
      {
        type: "heading",
        content: "What makes a good negative keyword candidate",
      },
      {
        type: "list",
        content: "",
        items: [
          "Repeated bad intent — Queries that clearly ask for jobs, free templates, definitions, DIY help, or unrelated services when your campaign sells something else.",
          "Spend with no conversion signal — Search terms with meaningful cost and clicks but no leads, purchases, calls, or qualified downstream action.",
          "Poor match to landing page — Queries that technically include a keyword but imply a different customer, location, price point, or service category.",
          "Account-wide exclusions — Terms that are wrong everywhere, not just in one ad group, belong in shared negative lists so the cleanup compounds.",
          "Risky near-matches — Terms that look bad but may overlap with real customers need narrower phrase or exact negatives, not broad blocking.",
        ],
      },
      {
        type: "heading",
        content: "The AI-assisted workflow",
      },
      {
        type: "list",
        content: "",
        items: [
          "Pull search terms — Use live Google Ads data, not a CSV from last month. Include campaign, ad group, term, cost, clicks, conversions, and match type context.",
          "Group by intent — Cluster terms into themes like job seekers, free information, competitor research, wrong service, wrong geography, or low-value DIY.",
          "Score the risk — Separate obvious blocks from terms that might be valuable in a different campaign or landing-page context.",
          "Preview negatives — Show the proposed keyword, match type, scope, and reason before anything is applied.",
          "Apply with approval — Add only the reviewed negatives, then keep the change traceable so impact can be checked later.",
        ],
      },
      {
        type: "callout",
        content:
          "Prompt to try after connecting NotFair:\n\nReview my last 30 days of search terms. Group irrelevant terms by intent, show spend/clicks/conversions, propose negative keywords with match type and scope, and flag anything that might overblock valuable traffic.",
      },
      {
        type: "heading",
        content: "Why automation needs guardrails",
      },
      {
        type: "text",
        content:
          "Negative-keyword automation is dangerous when it optimizes for a long blocked list instead of account quality. A model can misread a niche term, block a profitable variant, or apply an account-level negative when the issue only exists in one campaign. That is why NotFair treats negative-keyword cleanup as approval-gated execution, not autopilot.",
      },
      {
        type: "text",
        content:
          "The agent can move quickly through the analysis: it can fan out Google Ads queries, identify recurring patterns, and draft the exact operations. The operator still decides whether each negative belongs at campaign, ad group, or shared-list scope.",
      },
      {
        type: "heading",
        content: "Performance Max negative keywords",
      },
      {
        type: "text",
        content:
          "Performance Max makes negative keywords more sensitive because inventory and query matching are less transparent than standard Search campaigns. The practical rule is to start with obvious brand-safety and wrong-intent exclusions, keep them narrow, and review whether the same bad intent appears across multiple campaigns before broadening scope.",
      },
      {
        type: "heading",
        content: "FAQ",
      },
    ],
    faq: [
      {
        question: "Can AI find negative keywords for Google Ads?",
        answer:
          "Yes. AI can review search terms, group irrelevant intent, and propose negative keywords. The safest workflow still requires human approval before applying the negatives.",
      },
      {
        question: "Should negative keywords be added automatically?",
        answer:
          "Usually no. Obvious exclusions can be batched, but the final write should be reviewed because overblocking can remove valuable traffic.",
      },
      {
        question: "What match type should I use for negative keywords?",
        answer:
          "Use the narrowest match type that blocks the bad intent. Exact or phrase negatives are often safer for ambiguous terms; broader exclusions fit terms that are wrong across the whole account.",
      },
      {
        question: "Can NotFair apply negative keywords?",
        answer:
          "Yes. NotFair can help an AI agent review search terms, propose negatives, and apply approved negative keyword changes through the Google Ads API.",
      },
    ],
    relatedLinks: [
      {
        href: "/google-ads-optimization-tool",
        title: "Google Ads optimization tool",
        description:
          "Use NotFair to move from diagnosis to approved Google Ads optimization work.",
      },
      {
        href: "/google-ads-ai-tool",
        title: "Google Ads AI tool",
        description:
          "See how NotFair connects AI clients to live Google Ads data and approved actions.",
      },
      {
        href: "/google-ads-mcp",
        title: "Google Ads MCP",
        description:
          "Connect Claude, Codex, Cursor, or another MCP client to Google Ads.",
      },
    ],
  },
};

export const allBlogPosts = Object.values(blogPosts);

export function getBlogPost(slug: string) {
  return blogPosts[slug] ?? null;
}
