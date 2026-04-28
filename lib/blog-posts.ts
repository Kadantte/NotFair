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
  "google-ads-ai-agent": {
    slug: "google-ads-ai-agent",
    title: "Google Ads AI Agent: What It Actually Does (and What It Can't)",
    seoTitle: "Google Ads AI Agent: What It Actually Does",
    description:
      "Learn what a Google Ads AI agent can actually do — audit wasted spend, find negative keyword gaps, and optimize bids. Real examples, no hype.",
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
          "A Google Ads AI agent is software that can read your campaign data, identify problems, and take action — or recommend actions — using natural language instead of a manual workflow. Think of it as giving an AI access to your Google Ads account so it can audit spend, surface patterns, and make changes on your behalf or with your approval.",
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
          "The term \"AI agent\" gets used loosely. For Google Ads, it means an AI system that can read live account data, reason about that data to identify waste patterns and missed opportunities, take actions like pausing keywords or adjusting bids, and communicate in plain language — you ask a question or give an instruction, it responds with findings or executes a task.",
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
        content: "Auditing for Wasted Spend",
      },
      {
        type: "text",
        content:
          "This is where AI earns its keep most clearly. A manual spend audit on a mid-size account — 10 campaigns, 50+ ad groups, several hundred keywords — typically takes 2–4 hours. An AI agent can do the same structural analysis in under a minute.",
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
          "Negative keywords are one of the highest-ROI activities in Google Ads management, and one of the most neglected. An AI agent can pull the full search terms report for any date range, identify terms that spent money without converting, group them by theme (brand, location, intent modifier), generate a negative keyword list with suggested match types, and add them directly to the campaign.",
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
          "The NotFair approach implements review-first workflow: the AI audits and recommends, you approve. You can ask it to execute directly on lower-stakes changes (adding a negative keyword) while keeping approval gates on higher-stakes changes (bid strategy changes, budget adjustments). That trust is earned incrementally through consistent, accurate recommendations.",
      },
      {
        type: "heading",
        content: "Getting Started With an AI Google Ads Agent",
      },
      {
        type: "list",
        content: "",
        items: [
          "Use NotFair: connects your Google Ads account and gives you an AI interface immediately. No setup beyond authentication. Run a free audit to see what AI finds in your account.",
          "Use Claude with MCP: Anthropic's Claude supports Model Context Protocol, which NotFair uses. You get a conversational interface to your account data — ask questions, get analysis, approve actions.",
          "Build with the Google Ads API directly: for developers or agencies managing many accounts. The main costs are API authentication complexity and maintenance over time.",
        ],
      },
      {
        type: "text",
        content:
          "Start with a campaign audit focused on spend efficiency. Ask the agent to pull the search terms report for the last 30 days, identify keywords without negative lists that have over $100 in spend, and show the distribution of query match types. Those three data points will surface the highest-ROI quick wins in most accounts.",
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
          "Expecting AI to replace campaign strategy — AI agents are good at identifying waste and optimizing within an existing structure. They are poor at deciding whether to expand into a new product category or restructure your account.",
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
          "Google's AI features (Smart Bidding, Performance Max) optimize automatically within their defined scope and don't explain their decisions. An external AI agent reads your account data and reasons about it conversationally — you can ask 'what's wasting money?' and get a specific, auditable answer. The two can coexist: use Smart Bidding for bid execution, use an AI agent for account-level analysis and oversight.",
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
        href: "/google-ads-audit",
        title: "Free Google Ads Audit",
        description: "Run a free AI-powered audit — find wasted spend in 5 minutes.",
      },
      {
        href: "/google-ads-claude",
        title: "Google Ads + Claude",
        description: "Connect Google Ads to Claude and manage campaigns in natural language.",
      },
      {
        href: "/google-ads-mcp-server",
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
          "Learn how AI agents use MCP to manage Google Ads campaigns.",
      },
      {
        href: "/connect-google-ads-to-claude",
        title: "Connect Google Ads to Claude",
        description:
          "Step-by-step: connect your Google Ads account to Claude through MCP.",
      },
    ],
  },
};

export const allBlogPosts = Object.values(blogPosts);

export function getBlogPost(slug: string) {
  return blogPosts[slug] ?? null;
}
