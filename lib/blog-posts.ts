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
      name: "AdsAgent Team",
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
          "To make this concrete, here is how MCP works in practice with AdsAgent, a Google Ads MCP server. Instead of exporting CSV reports from Google Ads and pasting them into ChatGPT, or building a custom integration to feed campaign data into an AI workflow, you connect AdsAgent as an MCP server to your AI client.",
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
          "Advertising and marketing — Google Ads (AdsAgent), search console integrations, analytics platforms",
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
          "Thinking MCP replaces human oversight — MCP gives AI tools access to take actions, but well-built MCP servers (and clients) include approval flows. AdsAgent, for example, requires human confirmation before making campaign changes.",
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
          "For Google Ads — AdsAgent gives you a ready-to-use MCP server. Connect your Google Ads account at adsagent.org/connect, add the server to your MCP client config, and start querying campaigns in natural language.",
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
          "MCP servers handle their own authentication and authorization. A well-built server like AdsAgent manages OAuth securely and supports approval flows before taking actions. Always evaluate a server's security practices before connecting sensitive accounts.",
      },
    ],
    relatedLinks: [
      {
        href: "/google-ads-mcp",
        title: "Google Ads MCP Server",
        description:
          "See AdsAgent's MCP server — connect Google Ads to Claude and other MCP clients.",
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
