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
  | "ai-google-ads-optimization"
  | "google-ads-ai-tool"
  | "google-ads-optimization-tool"
  | "google-ads-connector";
  title: string;
  description: string;
  keywords: string[];
  index?: boolean;
  heroTitle: string;
  heroDescription: string;
  highlights: string[];
  sections: Array<{
    title: string;
    body: string;
  }>;
  deepSections?: Array<{
    title: string;
    body: string;
    bullets?: string[];
  }>;
  workflows?: Array<{
    title: string;
    prompt: string;
    outcome: string;
  }>;
  faq: FaqItem[];
  relatedLinks: MarketingLink[];
};

export const landingPages: Record<LandingPageContent["slug"], LandingPageContent> = {
  "ai-google-ads-agent": {
    slug: "ai-google-ads-agent",
    title: "Google Ads AI Agent",
    description:
      "Use NotFair as a Google Ads AI agent to inspect campaigns, diagnose issues, recommend optimizations, and execute approved changes from Claude, Codex, or any MCP client.",
    keywords: [
      "AI Google Ads agent",
      "Google Ads AI agent",
      "AI Google Ads management",
      "AI Google Ads optimization",
    ],
    heroTitle: "A Google Ads AI agent that can actually use your account",
    heroDescription:
      "NotFair gives Claude, Codex, Cursor, and other MCP clients live Google Ads access so your agent can diagnose performance issues, draft fixes, and apply approved changes with a traceable audit trail.",
    highlights: [
      "Ask an AI agent what changed, what is wasting spend, and what to fix next",
      "Move from diagnosis to approved writes: negatives, bids, budgets, ads, and campaign state",
      "Keep every change reviewable so AI speeds up execution without turning into autopilot",
    ],
    sections: [
      {
        title: "What makes NotFair different from a generic chatbot",
        body:
          "NotFair is not a prompt template or a dashboard screenshot workflow. It is the MCP connection layer between Google Ads and your AI client, so the agent can query live campaigns, inspect search terms, review recent changes, and prepare account edits through typed tools.",
      },
      {
        title: "Where teams use a Google Ads AI agent first",
        body:
          "The first useful prompts are concrete: why CPA moved, which search terms should become negatives, which campaigns spent with no conversions, which keywords need bid changes, and what changed last week. Those workflows map directly to D0 writes and Weekly Active Writers.",
      },
    ],
    faq: [
      {
        question: "What is an AI Google Ads agent?",
        answer:
          "It is an AI workflow that can inspect live Google Ads data, diagnose account issues, recommend fixes, and execute approved optimizations through a connected tool layer instead of relying on pasted exports.",
      },
      {
        question: "Does NotFair replace Google Ads specialists?",
        answer:
          "No. It is best used to speed up analysis, reporting, and optimization workflows while a human still reviews strategy and approves changes.",
      },
      {
        question: "Can NotFair make changes safely?",
        answer:
          "NotFair separates read tools from write tools. The agent can analyze freely, but campaign changes are approval-gated and logged so teams can review what changed later.",
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
      {
        href: "/google-ads-optimization-tool",
        title: "Google Ads optimization tool",
        description: "Move from agent diagnosis into concrete optimization workflows.",
      },
      {
        href: "/google-ads-ai-tool",
        title: "Google Ads AI tool",
        description: "Compare the tool-level workflow for AI-assisted Google Ads management.",
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
    index: false,
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
        href: "/google-ads-connector",
        title: "Google Ads connector",
        description: "Use the connector page when the search intent is setup and client compatibility.",
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
    index: false,
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
      {
        href: "/google-ads-ai-tool",
        title: "Google Ads AI tool",
        description: "See the more direct commercial page for AI-tool intent.",
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
    index: false,
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
      {
        href: "/google-ads-optimization-tool",
        title: "Google Ads optimization tool",
        description: "Use the commercial optimizer page for tool-comparison intent.",
      },
    ],
  },
  "google-ads-ai-tool": {
    slug: "google-ads-ai-tool",
    title: "Google Ads AI Tool",
    description:
      "NotFair is a Google Ads AI tool for Claude, Codex, Cursor, and MCP clients. Diagnose performance, review search terms, and execute approved changes with live account data.",
    keywords: [
      "Google Ads AI tool",
      "AI for Google Ads",
      "Google Ads AI",
      "Google AI Ads",
      "AI Google Ads software",
    ],
    heroTitle: "A Google Ads AI tool built for people who still approve the work",
    heroDescription:
      "NotFair connects live Google Ads data to your AI client so analysis, recommendations, and approved edits happen in one workflow instead of across exports, dashboards, and spreadsheets.",
    highlights: [
      "Diagnose campaigns, keywords, search terms, budgets, and recent changes from chat",
      "Use Claude or Codex to draft concrete edits instead of generic recommendations",
      "Approve writes before they reach Google Ads and keep a change trail afterward",
    ],
    sections: [
      {
        title: "Why most Google Ads AI tools stop short",
        body:
          "Many tools summarize reports or generate ad copy. NotFair focuses on the harder workflow: giving an AI agent enough live context and safe write access to find a problem, propose the fix, and apply it only after review.",
      },
      {
        title: "The first workflows to run",
        body:
          "Start with high-spend zero-conversion campaigns, search-term cleanup, weak Quality Score pockets, budget reallocation, and recent-change review. These workflows create the shortest path from organic visit to connected account to first approved write.",
      },
    ],
    deepSections: [
      {
        title: "What the tool needs to know before it can be useful",
        body:
          "A Google Ads AI tool is only as good as the context it can inspect. NotFair gives the agent structured access to account hierarchy, campaigns, ad groups, keywords, search terms, spend, conversions, recommendations, and recent changes. That lets the answer move past generic advice like improve ad relevance and into account-specific reasoning such as which campaign spent without conversions, which match types expanded too far, or which budget is blocking a working segment.",
        bullets: [
          "Account structure and accessible customer IDs",
          "Campaign, ad group, keyword, search term, and asset performance",
          "Recent changes that explain sudden CPA, CPC, or volume movement",
          "Reviewable write paths for negatives, bids, budgets, ads, and campaign state",
        ],
      },
      {
        title: "How NotFair differs from reporting dashboards",
        body:
          "Dashboards are useful when you already know which metric to inspect. NotFair is built for the messy middle: you know performance changed, but you do not know whether the cause is search terms, bidding, budget, conversion lag, network mix, landing pages, or recent edits. The agent can pull several slices of the account in one investigation and return a prioritized action list instead of another static chart.",
        bullets: [
          "Ask a plain-English diagnostic question and let the agent choose the account cuts",
          "Turn the diagnosis into a concrete draft change instead of a detached insight",
          "Keep final approval human-owned so the workflow stays useful for operators",
        ],
      },
      {
        title: "The safest rollout path",
        body:
          "The best first session is read-only. Ask the agent to explain account structure, summarize last-30-day performance, identify the largest waste pockets, and name the exact write it would do first. After that, approve one narrow change and review the before/after context. This prevents AI from becoming vague advisory software or unsafe automation.",
        bullets: [
          "First read: account map, spend, conversions, CPA, and change history",
          "First recommendation: one high-confidence action with the evidence attached",
          "First write: a narrow negative keyword, bid adjustment, or campaign-state update",
        ],
      },
    ],
    workflows: [
      {
        title: "CPA spike diagnosis",
        prompt:
          "Why did cost per lead increase over the last 7 days? Check search terms, device mix, network mix, campaign budgets, and recent changes before recommending fixes.",
        outcome:
          "A ranked explanation with the evidence for each cause and a small set of reviewed edits.",
      },
      {
        title: "Zero-conversion spend audit",
        prompt:
          "Find campaigns, ad groups, keywords, and search terms that spent more than $100 in the last 30 days with no conversions. Group them by likely action.",
        outcome:
          "A cleanup queue for negatives, bid reductions, pauses, and landing-page review.",
      },
      {
        title: "Launch structure draft",
        prompt:
          "Create a search campaign structure for this offer using the current account naming style. Include ad groups, keyword themes, negatives to start with, and ad copy angles.",
        outcome:
          "A campaign draft the operator can edit before any write reaches Google Ads.",
      },
    ],
    faq: [
      {
        question: "What is the difference between a Google Ads AI tool and an MCP server?",
        answer:
          "The MCP server is the connection layer. The AI tool workflow is what that connection enables: live reads, recommendations, approved writes, and change review from an AI client.",
      },
      {
        question: "Does NotFair run Google Ads automatically?",
        answer:
          "No. NotFair is designed for agent-assisted execution. Reads can happen freely, but account changes are reviewable and approval-gated.",
      },
      {
        question: "Which AI clients work with NotFair?",
        answer:
          "NotFair works with MCP-compatible clients including Claude, Claude Code, OpenAI Codex CLI, Cursor, Cline, and custom clients.",
      },
    ],
    relatedLinks: [
      {
        href: "/google-ads-mcp",
        title: "Google Ads MCP",
        description: "Connect your AI client to Google Ads through NotFair.",
      },
      {
        href: "/ai-google-ads-agent",
        title: "Google Ads AI agent",
        description: "See the agent workflow behind the tool.",
      },
      {
        href: "/google-ads-optimization-tool",
        title: "Google Ads optimization tool",
        description: "Use the same connection for concrete optimization work.",
      },
    ],
  },
  "google-ads-optimization-tool": {
    slug: "google-ads-optimization-tool",
    title: "Google Ads Optimization Tool",
    description:
      "Use NotFair as a Google Ads optimization tool for AI-assisted audits, search-term cleanup, bid changes, budget review, and approved campaign edits.",
    keywords: [
      "Google Ads optimization tool",
      "Google Ads optimizer",
      "Google Ads automation tools",
      "Google Ads optimization software",
      "optimize Google Ads with AI",
    ],
    heroTitle: "A Google Ads optimization tool for operators who want to act faster",
    heroDescription:
      "NotFair helps your AI agent inspect live account data, isolate what should change, draft the campaign edits, and keep every optimization tied to an approval and change record.",
    highlights: [
      "Find waste in search terms, campaigns, keywords, and budget allocation",
      "Draft negatives, bid updates, campaign pauses, and ad changes from the same workflow",
      "Review impact after changes instead of losing the trail in Google Ads history",
    ],
    sections: [
      {
        title: "Optimization starts with account context",
        body:
          "Good optimization depends on live account structure, search terms, cost, conversions, recent changes, and constraints. NotFair exposes that context to an AI agent through structured MCP tools instead of copied tables.",
      },
      {
        title: "Why approval-gated execution matters",
        body:
          "The dangerous version of automation is blind autopilot. NotFair is intentionally review-first: the agent can surface the fix and prepare the write, but budget, bid, negative, and campaign-state changes stay explicit.",
      },
    ],
    deepSections: [
      {
        title: "The optimization loop NotFair is designed around",
        body:
          "Useful optimization has a loop: diagnose the account, rank the opportunities, draft the smallest credible change, approve it, and check the result later. NotFair keeps those steps in one agent workflow. That matters because Google Ads accounts usually fail through many small leaks rather than one obvious broken setting.",
        bullets: [
          "Diagnose spend, conversions, CPA, search terms, budgets, and recent changes",
          "Rank fixes by expected impact, confidence, and reversibility",
          "Draft changes as explicit writes instead of vague recommendations",
          "Review impact after the change so the next session starts with memory",
        ],
      },
      {
        title: "Where optimization work usually starts",
        body:
          "The highest-confidence first wins are narrow and measurable. Search term cleanup removes irrelevant spend. Budget review finds campaigns that are capped while weaker campaigns keep spending. Bid and campaign-state review catches expensive segments that stopped converting. Ad and keyword review finds account structure that no longer matches the offer.",
        bullets: [
          "Negative keyword candidates from real search terms",
          "High-spend zero-conversion keywords, ad groups, and campaigns",
          "Budget reallocation from weak spend to constrained winners",
          "Recent-change review when performance moved suddenly",
        ],
      },
      {
        title: "Why the tool is built for operators, not autopilot",
        body:
          "A black-box optimizer is risky because it hides judgment. NotFair is meant for founders, agencies, and media buyers who want the agent to do the tedious account work while the operator still owns strategy. The agent can prepare the change, but the human can see the evidence, edit the write, and decide whether the risk is acceptable.",
        bullets: [
          "Use read-only audits for broad investigation",
          "Use approval-gated writes for negatives, bids, budgets, and state changes",
          "Use change review to decide whether the last optimization helped",
        ],
      },
    ],
    workflows: [
      {
        title: "Negative keyword cleanup",
        prompt:
          "Review the last 30 days of search terms. Find irrelevant or low-intent queries with spend, group them into exact and phrase-match negative keyword candidates, and explain the risk of each group.",
        outcome:
          "A reviewable negative keyword plan tied to spend, conversions, and intent.",
      },
      {
        title: "Budget reallocation",
        prompt:
          "Compare campaigns by spend, conversions, CPA, conversion rate, and budget constraints. Recommend which budgets to reduce, hold, or increase and why.",
        outcome:
          "A budget action plan that separates obvious waste from scaling opportunities.",
      },
      {
        title: "Recent-change review",
        prompt:
          "Find account changes from the last 14 days and compare performance before and after. Flag changes that likely hurt CPA or volume.",
        outcome:
          "A rollback or follow-up list grounded in actual account movement.",
      },
    ],
    faq: [
      {
        question: "What can NotFair optimize in Google Ads?",
        answer:
          "NotFair can help with search-term cleanup, negative keywords, bids, budgets, campaign and ad group state, ad copy, recommendations, and recent-change review.",
      },
      {
        question: "Is this a replacement for Optmyzr or WordStream?",
        answer:
          "Not directly. NotFair is an agent-native execution layer for teams using Claude, Codex, or MCP clients. It is strongest when you want AI to reason over account context and prepare reviewed changes.",
      },
      {
        question: "How should I measure whether it works?",
        answer:
          "Track connected accounts, first successful writes, Weekly Active Writers, and whether approved changes are later judged helpful, neutral, or harmful.",
      },
    ],
    relatedLinks: [
      {
        href: "/ai-google-ads-optimization",
        title: "AI Google Ads optimization",
        description: "The broader optimization workflow and use cases.",
      },
      {
        href: "/blog/negative-keywords-google-ads-ai",
        title: "Negative keyword cleanup",
        description: "Start with one of the clearest optimization workflows.",
      },
      {
        href: "/google-ads-ai-tool",
        title: "Google Ads AI tool",
        description: "See the AI-tool positioning behind the optimizer page.",
      },
    ],
  },
  "google-ads-connector": {
    slug: "google-ads-connector",
    title: "Google Ads Connector for Claude, Codex, and MCP",
    description:
      "Connect Google Ads to Claude, Codex, Cursor, and MCP-compatible AI clients with NotFair's hosted Google Ads connector.",
    keywords: [
      "Google Ads connector",
      "Google Ads Claude connector",
      "Claude connector",
      "connect Google Ads to Claude",
      "Google Ads MCP connector",
    ],
    heroTitle: "A Google Ads connector for the AI clients your team already uses",
    heroDescription:
      "NotFair gives Claude, Codex, Cursor, Cline, and custom MCP clients one hosted Google Ads connector with OAuth, live campaign reads, and approval-gated writes.",
    highlights: [
      "Use one hosted connector URL instead of building Google Ads API auth yourself",
      "Support Claude, Codex, Cursor, Cline, and any client that speaks MCP Streamable HTTP",
      "Connect once, then ask your agent to inspect campaigns and prepare reviewed fixes",
    ],
    sections: [
      {
        title: "Connector vs MCP server vs plugin",
        body:
          "The connector is the user-facing install path. The MCP server is the protocol endpoint behind it. Plugins and setup guides help specific clients discover the same NotFair tools faster.",
      },
      {
        title: "The shortest path to a useful first run",
        body:
          "Connect Google Ads, open your AI client, and ask for a read-only diagnosis before approving any edits. The first successful write should usually be narrow: a negative keyword, a bid adjustment, or a campaign-state change you can review.",
      },
    ],
    deepSections: [
      {
        title: "What the connector actually does",
        body:
          "The NotFair connector is the hosted bridge between your Google Ads account and an AI client. You authorize with Google OAuth, NotFair handles the Google Ads API side, and your client gets a structured tool surface for account reads and approved writes. The goal is to avoid the slow custom path of creating a Google Cloud project, applying for a developer token, mapping Google Ads resources, and maintaining a private MCP server.",
        bullets: [
          "OAuth connection for the Google account that can access the ad accounts",
          "Account discovery across accessible customer IDs and manager accounts",
          "Structured read tools for campaigns, ad groups, keywords, search terms, metrics, and changes",
          "Approval-gated write tools for optimization actions",
        ],
      },
      {
        title: "Which client should use it",
        body:
          "Use the connector when you want the same Google Ads account available inside different AI clients. Claude is the clearest starting point, Codex is useful for code-heavy workflows, Cursor and Cline fit IDE-native work, and custom MCP clients can call the same hosted endpoint. The connector page is about that practical setup path, not a general definition of MCP.",
        bullets: [
          "Claude and Claude Code for account diagnosis and operator workflows",
          "Codex CLI for scripted analysis, local reports, and repeatable account tasks",
          "Cursor, Cline, and custom MCP clients for developer-led integrations",
        ],
      },
      {
        title: "First-run checklist",
        body:
          "A useful connector setup is not done when OAuth succeeds. It is done when the client can list accounts, inspect a real campaign, produce a diagnosis, and prepare one reviewable action. This page should help a user get to that point without wandering through generic docs.",
        bullets: [
          "Confirm the expected Google Ads customer ID appears",
          "Run a read-only campaign performance query for the last 30 days",
          "Ask for one optimization recommendation with the evidence attached",
          "Approve only a narrow, reversible first write after reviewing the draft",
        ],
      },
      {
        title: "Troubleshooting the common failure modes",
        body:
          "Connector failures are usually not strategy problems. They are setup problems: the wrong Google account was authorized, the user has access to a manager account but not the client account they expected, the AI client has not refreshed its tool list, or the client is configured for a different MCP transport. The page should make those checks explicit because they are the difference between a visit and a successful activation.",
        bullets: [
          "If no accounts appear, check Google Ads access and manager account permissions",
          "If tools do not appear, refresh or restart the AI client after adding the connector",
          "If writes fail, verify the account role and start with a read-only prompt",
          "If the client rejects the URL, confirm it supports remote MCP Streamable HTTP",
        ],
      },
    ],
    workflows: [
      {
        title: "Account discovery",
        prompt:
          "List the Google Ads accounts I can access, show customer IDs, and identify which accounts had spend in the last 30 days.",
        outcome:
          "Proof that OAuth and account access are working before any optimization begins.",
      },
      {
        title: "Connector smoke test",
        prompt:
          "Pull campaign spend, conversions, CPA, and status for the last 30 days. Keep this read-only and summarize the highest-risk campaign.",
        outcome:
          "A real campaign diagnosis that confirms the connector is useful, not merely installed.",
      },
      {
        title: "First reviewed write",
        prompt:
          "Find one low-risk negative keyword candidate from recent search terms and draft the exact change for approval. Do not apply it until I confirm.",
        outcome:
          "A narrow activation path from connector setup to a reviewable optimization write.",
      },
    ],
    faq: [
      {
        question: "What is the NotFair Google Ads connector?",
        answer:
          "It is the hosted MCP connection between your Google Ads account and AI clients like Claude, Codex, Cursor, and Cline.",
      },
      {
        question: "Do I need a Google Ads developer token?",
        answer:
          "No. NotFair handles the Google Ads API developer-token side. You authorize access with the Google account that can see your ad accounts.",
      },
      {
        question: "Can the connector make campaign changes?",
        answer:
          "Yes, but writes are designed to be reviewable. The agent can draft changes and you approve them before they are sent to Google Ads.",
      },
    ],
    relatedLinks: [
      {
        href: "/google-ads-mcp",
        title: "Google Ads MCP",
        description: "See the underlying MCP server and setup options.",
      },
      {
        href: "/google-ads-claude-connector-setup-guide",
        title: "Claude connector setup",
        description: "Install NotFair inside Claude.ai Web, Desktop, or Cowork.",
      },
      {
        href: "/google-ads-codex-mcp-setup-guide",
        title: "Codex MCP setup",
        description: "Connect OpenAI Codex CLI to Google Ads through NotFair.",
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
