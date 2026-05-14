import {
  MCP_CONNECTOR_NAME,
  MCP_SERVER_URL,
  SUPPORT_EMAIL,
} from "@/lib/brand";
import { SHARED_FAQ } from "@/lib/marketing-faqs";
import type { FaqItem } from "@/lib/seo";

export type IntegrationStatus = "supported" | "via-bridge" | "roadmap";

export const INTEGRATION_STATUS_LABEL: Record<IntegrationStatus, string> = {
  supported: "Supported",
  "via-bridge": "Via MCP bridge",
  roadmap: "Roadmap",
};

export const INTEGRATION_STATUS_TONE: Record<IntegrationStatus, string> = {
  supported: "text-[#4CAF6E] border-[#4CAF6E]/40 bg-[#4CAF6E]/10",
  "via-bridge": "text-[#D4882A] border-[#D4882A]/40 bg-[#D4882A]/10",
  roadmap: "text-[#C4C0B6] border-[#3D3C36] bg-[#24231F]",
};

export type IntegrationSetupStep = {
  title: string;
  body: string;
  code?: string;
};

export type IntegrationWorkflow = {
  title: string;
  prompt: string;
  outcome: string;
};

export type IntegrationCapability = {
  label: string;
  detail: string;
};

export type IntegrationContent = {
  slug: string;
  client: string;
  clientShort?: string;
  status: IntegrationStatus;
  title: string;
  description: string;
  keywords: string[];
  heroEyebrow: string;
  heroTitle: string;
  heroDescription: string;
  highlights: string[];
  setupIntro: string;
  setupSteps: IntegrationSetupStep[];
  capabilities: IntegrationCapability[];
  workflows: IntegrationWorkflow[];
  whyNotfair: {
    title: string;
    body: string;
    bullets: string[];
  };
  faq: FaqItem[];
  relatedSlugs: string[];
};

export type IntegrationHubEntry = {
  href: string;
  client: string;
  status: IntegrationStatus;
  blurb: string;
  badge?: string;
};

const sharedFaq = SHARED_FAQ;

const claudeCodeIntegration: IntegrationContent = {
  slug: "claude-code-google-ads",
  client: "Claude Code",
  status: "supported",
  title: "Claude Code + Google Ads | NotFair",
  description:
    "Wire Claude Code into your Google Ads account with one CLI command. Diagnose wasted spend, draft negative keywords, and ship approved campaign changes from your terminal.",
  keywords: [
    "Claude Code Google Ads",
    "Google Ads Claude Code",
    "Claude Code MCP Google Ads",
    "Claude Code ads agent",
    "ads MCP for Claude Code",
  ],
  heroEyebrow: "Integration · Claude Code × Google Ads",
  heroTitle: "Run a Google Ads agent inside Claude Code",
  heroDescription:
    "NotFair connects Claude Code to your live Google Ads account through MCP. Ask Claude Code what's wasting spend, get a diff of recommended writes, and approve each change from your terminal.",
  highlights: [
    "One CLI command to register NotFair as an MCP server in Claude Code",
    "Live account context — campaigns, search terms, change history, conversion status",
    "Write tools gated behind explicit approval, every action logged for audit",
  ],
  setupIntro:
    "Setup takes under two minutes — one shell command, then OAuth into Google Ads through the NotFair web app.",
  setupSteps: [
    {
      title: "Register NotFair as an MCP server",
      body: "Add NotFair to Claude Code's MCP config from your terminal.",
      code: `claude mcp add ${MCP_CONNECTOR_NAME} --transport http ${MCP_SERVER_URL}`,
    },
    {
      title: "Authorize Google Ads",
      body: "Open notfair.co/connect, sign in, and grant Google Ads access. Tokens are scoped to read + propose; writes still require approval.",
    },
    {
      title: "Start a session",
      body: "Inside any Claude Code workspace, ask: \"Audit my Google Ads account and tell me the top three wasted-spend issues.\" Claude Code will call NotFair's read tools and return a structured diagnosis.",
    },
  ],
  capabilities: [
    {
      label: "Read live campaign data",
      detail:
        "Performance, search terms, change history, conversion tracking status, impression share — pulled fresh on every prompt.",
    },
    {
      label: "Diagnose wasted spend",
      detail:
        "Surfaces high-spend search terms with zero conversions, structural issues, and broken landing pages.",
    },
    {
      label: "Approval-gated writes",
      detail:
        "Negatives, bids, budgets, ad copy, campaign state — every mutation goes through an explicit approval step.",
    },
    {
      label: "Full audit trail",
      detail:
        "Every write is logged with operation_id, user_id, and undo metadata so you can reverse changes later.",
    },
  ],
  workflows: [
    {
      title: "Wasted-spend triage",
      prompt:
        "Find the five search terms last 30 days with the most spend and zero conversions across all campaigns. Group them and propose negative keywords I should approve.",
      outcome:
        "Claude Code returns a ranked list with cost, conversion count, and a draft negative-keyword set you can approve in-terminal.",
    },
    {
      title: "Pre-budget-increase audit",
      prompt:
        "Before I raise budget on campaign X by 50%, audit its structure, landing page status, conversion setup, and impression share. Flag anything that would waste the new budget.",
      outcome:
        "A structured pre-flight report so you don't pour money into a structurally broken campaign.",
    },
    {
      title: "Change-history review",
      prompt:
        "What changed in this account in the last 7 days, by whom, and what was the performance impact?",
      outcome:
        "Pulls Google's change history plus NotFair's own operation log and correlates with performance deltas.",
    },
  ],
  whyNotfair: {
    title: "Why NotFair instead of a free Google Ads MCP server",
    body:
      "Free Google Ads MCP servers exist, but they're thin GAQL wrappers that hand the agent a raw API and hope for the best. NotFair is the connection plus the safety layer — typed tools, freshness metadata, undo, approval gates, and operation provenance.",
    bullets: [
      "Typed tools, not raw GAQL — the agent doesn't have to learn an undocumented query language",
      "Snapshot freshness metadata so the agent knows when data is stale",
      "Approval and undo for every write — not a one-way door into your real account",
      "Operation log linking each write to the user/agent that authored it",
    ],
  },
  faq: [
    {
      question: "Does NotFair work with Claude Code's plan mode and subagents?",
      answer:
        "Yes. NotFair tools are visible to plan-mode and to spawned subagents, so a planning agent can propose the diagnosis and a separate executor subagent can apply approved writes.",
    },
    {
      question: "Can I scope NotFair to one Google Ads account?",
      answer:
        "Yes. Each OAuth connection is scoped to the account(s) you authorized. You can revoke or re-scope from notfair.co/manage-ads-accounts.",
    },
    sharedFaq.trust,
    sharedFaq.cost,
    sharedFaq.official,
  ],
  relatedSlugs: ["chatgpt-google-ads", "cursor-google-ads", "codex-google-ads"],
};

const chatgptIntegration: IntegrationContent = {
  slug: "chatgpt-google-ads",
  client: "ChatGPT",
  status: "via-bridge",
  title: "ChatGPT + Google Ads | NotFair",
  description:
    "Bring live Google Ads context into ChatGPT-style workflows through MCP-compatible clients. Diagnose wasted spend, draft negative keywords, and review fixes — no copy-paste reports.",
  keywords: [
    "ChatGPT Google Ads",
    "ChatGPT Google Ads automation",
    "Google Ads ChatGPT",
    "ChatGPT ads agent",
    "ChatGPT MCP Google Ads",
  ],
  heroEyebrow: "Integration · ChatGPT × Google Ads",
  heroTitle: "A real Google Ads workflow for ChatGPT-style agents",
  heroDescription:
    "ChatGPT works best when it sees live account data, not pasted screenshots. NotFair gives any MCP-compatible chat client — including the OpenAI Codex CLI and custom GPTs wired through MCP — live Google Ads context with safe writes.",
  highlights: [
    "Use NotFair through Codex CLI, custom GPTs with MCP bridge, or any OpenAI-compatible MCP client",
    "Stop pasting Google Ads exports — the agent reads campaigns live and updates with one approval",
    "Built for SMB operators who manage spend themselves and want AI doing the boring optimization triage",
  ],
  setupIntro:
    "ChatGPT itself doesn't yet speak MCP natively. Most teams use NotFair with ChatGPT via the OpenAI Codex CLI, a custom GPT calling NotFair as an Action, or any OpenAI-compatible MCP client.",
  setupSteps: [
    {
      title: "Pick your bridge",
      body: "If you're a developer, the fastest path is Codex CLI (built-in MCP support). For non-CLI use, NotFair can be exposed as a Custom GPT Action against the OpenAPI-shaped MCP endpoints.",
    },
    {
      title: "Add NotFair to your client",
      body: "For Codex CLI, register NotFair as an MCP server.",
      code: `codex mcp add ${MCP_CONNECTOR_NAME} --url ${MCP_SERVER_URL}`,
    },
    {
      title: "Authorize Google Ads",
      body: "Visit notfair.co/connect, complete OAuth, and your agent gains scoped, revocable access.",
    },
  ],
  capabilities: [
    {
      label: "Live campaign reads",
      detail: "Performance, search terms, change history, conversion status — fresh, not pasted.",
    },
    {
      label: "Wasted-spend diagnosis",
      detail: "Surfaces the highest-cost search terms with no conversions, plus structural issues.",
    },
    {
      label: "Approval-gated writes",
      detail: "Every campaign edit waits for an explicit yes from you before it touches Google Ads.",
    },
    {
      label: "Provenance + undo",
      detail: "Operation log captures every write with metadata, so any change can be reviewed or reversed.",
    },
  ],
  workflows: [
    {
      title: "Natural-language campaign audit",
      prompt:
        "Pretend you're a senior Google Ads consultant. Audit my account and give me the top five things to fix this week, ranked by cost impact.",
      outcome:
        "ChatGPT (via NotFair) pulls live data, ranks by spend × conversion gap, and explains each fix with the numbers behind it.",
    },
    {
      title: "Negative keyword sweep",
      prompt:
        "Find every search term last 14 days with >$5 spend and zero conversions. Group them, suggest negatives, and tell me which campaign to apply each to.",
      outcome:
        "Returns a structured list and proposes negatives at the right match type and scope.",
    },
    {
      title: "Cross-account comparison",
      prompt:
        "Compare CPA and ROAS across my three Google Ads accounts last quarter. Which is most underperforming and why?",
      outcome:
        "Multi-account aggregate with a diagnosis on why the worst-performing one is bleeding.",
    },
  ],
  whyNotfair: {
    title: "Why NotFair instead of a ChatGPT prompt template",
    body:
      "Pasting a CSV into ChatGPT gives you a stale snapshot the model invents around. NotFair gives ChatGPT-style agents typed, live tools so the analysis is real and the writes are safe.",
    bullets: [
      "Live data beats pasted exports — no stale numbers, no hallucinated metrics",
      "Typed tool calls beat freeform analysis — the model can't accidentally fabricate a campaign ID",
      "Approval-gated writes beat blind automation — the human stays in the loop on every change",
      "Operation provenance beats ad-hoc edits — every change is auditable later",
    ],
  },
  faq: [
    {
      question: "Does ChatGPT support MCP servers directly?",
      answer:
        "Not yet natively in the consumer ChatGPT app. NotFair works with ChatGPT-style workflows through the OpenAI Codex CLI (built-in MCP), Custom GPT Actions, and any OpenAI-compatible MCP client. If you're using Claude or Codex CLI, you get native MCP support out of the box.",
    },
    {
      question: "Can I use NotFair as a Custom GPT Action?",
      answer: `Yes. NotFair exposes its tools through a documented HTTP surface that can be wrapped as a Custom GPT Action. Email ${SUPPORT_EMAIL} for the OpenAPI spec.`,
    },
    sharedFaq.trust,
    sharedFaq.cost,
    sharedFaq.official,
  ],
  relatedSlugs: ["codex-google-ads", "claude-code-google-ads", "cursor-google-ads"],
};

const cursorIntegration: IntegrationContent = {
  slug: "cursor-google-ads",
  client: "Cursor",
  status: "supported",
  title: "Cursor + Google Ads | NotFair",
  description:
    "Use Cursor's AI agent to inspect Google Ads campaigns, diagnose wasted spend, and ship approved fixes — all without leaving your editor.",
  keywords: [
    "Cursor Google Ads",
    "Google Ads Cursor",
    "Cursor MCP Google Ads",
    "Cursor ads agent",
    "ads MCP for Cursor",
  ],
  heroEyebrow: "Integration · Cursor × Google Ads",
  heroTitle: "Manage Google Ads from inside Cursor",
  heroDescription:
    "NotFair adds Google Ads as an MCP server in Cursor so the agent can pull live campaign data, draft optimizations, and ship approved changes — without you tabbing into the Google Ads UI.",
  highlights: [
    "Add NotFair to Cursor's mcp.json — under two minutes",
    "Agent reads live performance, search terms, and change history in your editor",
    "Approval gate on every write so you stay in control",
  ],
  setupIntro:
    "Cursor speaks MCP natively. Drop NotFair into your Cursor MCP config and authorize Google Ads through the NotFair web app.",
  setupSteps: [
    {
      title: "Open Cursor's MCP config",
      body: "In Cursor, open Settings → MCP and click \"Edit Config\". Or open ~/.cursor/mcp.json directly.",
    },
    {
      title: "Add NotFair",
      body: "Add NotFair under mcpServers.",
      code: `{
  "mcpServers": {
    "${MCP_CONNECTOR_NAME}": {
      "url": "${MCP_SERVER_URL}"
    }
  }
}`,
    },
    {
      title: "Authorize Google Ads",
      body: "Open notfair.co/connect, complete Google OAuth, and Cursor immediately gains live access.",
    },
  ],
  capabilities: [
    {
      label: "Live reads in chat",
      detail: "Performance, search terms, change history, conversion tracking — surfaced in the Cursor sidebar.",
    },
    {
      label: "Inline diagnosis",
      detail: "Ask 'why did CPA jump?' and get a ranked diagnosis backed by real data.",
    },
    {
      label: "Approval-gated writes",
      detail: "Cursor proposes changes; you approve before they hit Google Ads.",
    },
    {
      label: "Undo + audit",
      detail: "Every write is logged. Undo metadata lets you reverse approved actions later.",
    },
  ],
  workflows: [
    {
      title: "Landing-page audit",
      prompt:
        "Pull every active ad's final URL. Hit each URL, report status code, and tell me which are broken or 4xx so I can pause those ads.",
      outcome:
        "Cursor's agent crawls each URL, returns a sorted list of broken landing pages, and offers to pause those ads.",
    },
    {
      title: "Negative-keyword sweep",
      prompt:
        "Across all my campaigns, find the 10 most expensive search terms with zero conversions in the last 30 days. Propose negatives at the right level.",
      outcome:
        "Returns a triaged list with proposed negatives, scope (campaign vs ad group vs shared list), and match type.",
    },
    {
      title: "Pre-launch checklist",
      prompt:
        "Before I launch this new campaign, audit conversion tracking, budget pacing, and bid strategy. Flag anything that would make me waste money.",
      outcome:
        "Comprehensive pre-launch review surfaced inline in your Cursor session.",
    },
  ],
  whyNotfair: {
    title: "Why Cursor users pick NotFair",
    body:
      "Cursor is great at code, but founders increasingly run Google Ads themselves from the same editor. NotFair turns Cursor into a credible ads agent without forcing you to switch tools.",
    bullets: [
      "Same chat surface you already use for code",
      "MCP-native — no proxies, no shims, no API key juggling",
      "Per-prompt freshness so the agent doesn't quote stale numbers",
      "Approval gate keeps a human in the loop on every campaign edit",
    ],
  },
  faq: [
    {
      question: "Does NotFair work with Cursor's Composer agent?",
      answer:
        "Yes. Composer can call NotFair tools the same way it calls any other MCP server. Useful for multi-step diagnoses that pull live data and produce structured output.",
    },
    {
      question: "Can the Cursor agent push code AND Google Ads changes in one session?",
      answer:
        "Yes — and we recommend it. A common pattern is editing landing pages in code, then asking the agent to pause ads pointing at the changed routes until the deploy lands.",
    },
    sharedFaq.trust,
    sharedFaq.cost,
    sharedFaq.official,
  ],
  relatedSlugs: ["claude-code-google-ads", "windsurf-google-ads", "codex-google-ads"],
};

const codexIntegration: IntegrationContent = {
  slug: "codex-google-ads",
  client: "OpenAI Codex CLI",
  clientShort: "Codex",
  status: "supported",
  title: "Codex CLI + Google Ads | NotFair",
  description:
    "Use OpenAI's Codex CLI with NotFair to manage Google Ads from your terminal. Diagnose wasted spend, draft fixes, and approve writes against your live account.",
  keywords: [
    "Codex Google Ads",
    "Codex CLI Google Ads",
    "Google Ads Codex",
    "OpenAI Codex MCP Google Ads",
    "Codex ads agent",
  ],
  heroEyebrow: "Integration · Codex CLI × Google Ads",
  heroTitle: "A Google Ads agent that runs in your Codex CLI",
  heroDescription:
    "NotFair connects OpenAI's Codex CLI to your live Google Ads account through MCP. Diagnose campaigns, draft optimizations, and approve writes — all from the terminal.",
  highlights: [
    "Single `codex mcp add` command and you're running",
    "Native MCP — no API key shims, no glue scripts",
    "Approval-gated writes keep the agent on rails",
  ],
  setupIntro:
    "Codex CLI ships with native MCP support. NotFair drops in as one of its MCP servers.",
  setupSteps: [
    {
      title: "Register NotFair as an MCP server",
      body: "From any shell where Codex CLI is installed.",
      code: `codex mcp add ${MCP_CONNECTOR_NAME} --url ${MCP_SERVER_URL}`,
    },
    {
      title: "Authorize Google Ads",
      body: "Open notfair.co/connect, sign in, complete OAuth. Tokens are scoped to the accounts you authorize.",
    },
    {
      title: "Start a session",
      body: "Open Codex CLI in any directory and ask: \"Diagnose my Google Ads account. What's wasting spend?\"",
    },
  ],
  capabilities: [
    {
      label: "Native MCP support",
      detail: "Codex CLI handles MCP servers as first-class citizens — no bridges or wrappers.",
    },
    {
      label: "Live account reads",
      detail: "Performance, search terms, change history, landing-page status, conversion setup.",
    },
    {
      label: "Approval-gated writes",
      detail: "Bids, negatives, budgets, ad copy, campaign state — all gated and logged.",
    },
    {
      label: "Scriptable",
      detail: "Wrap NotFair workflows in shell scripts for recurring weekly audits.",
    },
  ],
  workflows: [
    {
      title: "Weekly account check",
      prompt:
        "Give me this week's Google Ads health report. What changed, what broke, what to fix this week. Be specific.",
      outcome:
        "A structured weekly report you can pipe into Slack or email.",
    },
    {
      title: "Budget reallocation",
      prompt:
        "Across all my campaigns, find the ones that are budget-constrained AND have CPA below target. Propose a budget reallocation.",
      outcome:
        "Ranked list with current spend, lost-impression-share-to-budget, target CPA, and a proposed reallocation.",
    },
    {
      title: "Ad copy refresh",
      prompt:
        "Find ad groups where every ad has been running over 90 days with declining CTR. Draft new responsive search ad headlines that I can review.",
      outcome:
        "Drafts new RSA assets per ad group; you approve before publishing.",
    },
  ],
  whyNotfair: {
    title: "Why NotFair for Codex CLI",
    body:
      "Codex CLI is the cleanest agent surface OpenAI ships. NotFair is the Google Ads tool layer designed for exactly this use case — typed primitives, no GAQL-by-LLM, safe writes.",
    bullets: [
      "Typed tools beat raw GAQL — the agent gets a stable contract",
      "Freshness metadata stops the agent from quoting yesterday's numbers",
      "Approval-gated writes keep destructive actions on rails",
      "Designed for terminal-native operators who manage spend themselves",
    ],
  },
  faq: [
    {
      question: "Does NotFair work with Codex CLI's auto-execute mode?",
      answer:
        "Read tools, yes. Write tools still pass through NotFair's approval gate even if Codex CLI is configured to auto-execute — this is intentional, because the gate protects your real ad spend.",
    },
    {
      question: "Can I use NotFair in CI?",
      answer:
        "Read-only workflows yes. We don't recommend running write workflows in CI without a human approval step. NotFair will support team-level approval workflows for CI scenarios on the roadmap.",
    },
    sharedFaq.trust,
    sharedFaq.cost,
    sharedFaq.official,
  ],
  relatedSlugs: ["chatgpt-google-ads", "claude-code-google-ads", "cursor-google-ads"],
};

const windsurfIntegration: IntegrationContent = {
  slug: "windsurf-google-ads",
  client: "Windsurf",
  status: "supported",
  title: "Windsurf + Google Ads | NotFair",
  description:
    "Connect Windsurf's Cascade agent to Google Ads through NotFair. Diagnose wasted spend, propose negatives, and ship approved changes from your editor.",
  keywords: [
    "Windsurf Google Ads",
    "Google Ads Windsurf",
    "Windsurf MCP Google Ads",
    "Windsurf Cascade Google Ads",
    "ads MCP for Windsurf",
  ],
  heroEyebrow: "Integration · Windsurf × Google Ads",
  heroTitle: "Run a Google Ads agent inside Windsurf",
  heroDescription:
    "NotFair plugs into Windsurf's Cascade agent through MCP so the IDE can read live campaign data, diagnose performance issues, and ship approved Google Ads writes.",
  highlights: [
    "Cascade gets typed Google Ads tools, not a brittle prompt template",
    "Setup is one mcp_config.json edit + OAuth",
    "Writes are approval-gated — your campaigns stay safe",
  ],
  setupIntro:
    "Windsurf supports MCP servers in mcp_config.json. NotFair adds in one block.",
  setupSteps: [
    {
      title: "Open Windsurf's MCP config",
      body: "Open the Windsurf command palette and run \"Open MCP Config\", or edit ~/.codeium/windsurf/mcp_config.json.",
    },
    {
      title: "Add NotFair",
      body: "Add NotFair under mcpServers.",
      code: `{
  "mcpServers": {
    "${MCP_CONNECTOR_NAME}": {
      "url": "${MCP_SERVER_URL}"
    }
  }
}`,
    },
    {
      title: "Authorize Google Ads",
      body: "notfair.co/connect → Google OAuth → scoped access in seconds.",
    },
  ],
  capabilities: [
    {
      label: "Cascade-native reads",
      detail: "Live campaign data is available to Cascade just like file reads.",
    },
    {
      label: "Wasted-spend diagnosis",
      detail: "Negative keyword sweeps, search-term cleanups, structural audits.",
    },
    {
      label: "Approval-gated writes",
      detail: "Every Google Ads write needs explicit approval from you.",
    },
    {
      label: "Undo + audit log",
      detail: "Every approved write is recorded with provenance and undo metadata.",
    },
  ],
  workflows: [
    {
      title: "Landing-page health",
      prompt:
        "For every active ad in my account, check the final URL. Tell me which are returning 4xx/5xx and which campaigns to pause until I fix them.",
      outcome:
        "Cascade hits each URL, returns a sorted health report, and offers to pause the affected ads.",
    },
    {
      title: "Underperforming-campaign triage",
      prompt:
        "Find campaigns spending >$500 last 30 days with CPA above target. For each, tell me the most likely structural cause and the highest-leverage fix.",
      outcome:
        "Ranked diagnosis with proposed fixes you can approve in Cascade's sidebar.",
    },
    {
      title: "Search-term hygiene",
      prompt:
        "Sweep search terms for the last 30 days. Find the worst offenders and propose negatives. Skip any term that would also negative-out a converter.",
      outcome:
        "Safety-aware negative-keyword proposal with conversion-aware filtering.",
    },
  ],
  whyNotfair: {
    title: "Why NotFair for Windsurf operators",
    body:
      "Windsurf already gives you a flow-state coding agent. NotFair extends that flow to your Google Ads work — same surface, same approval model, same speed.",
    bullets: [
      "Same Cascade UI you already use",
      "MCP-native — no separate Google Ads dashboard tab needed",
      "Approval gate keeps every write reviewable",
      "Typed tools mean reliable behavior across sessions",
    ],
  },
  faq: [
    {
      question: "Does Cascade support tool approval prompts?",
      answer:
        "Yes. Cascade will surface NotFair's write tools as approval-required steps, so nothing applies to Google Ads without your explicit yes.",
    },
    sharedFaq.trust,
    sharedFaq.cost,
    sharedFaq.official,
  ],
  relatedSlugs: ["cursor-google-ads", "claude-code-google-ads", "gemini-cli-google-ads"],
};

const geminiCliIntegration: IntegrationContent = {
  slug: "gemini-cli-google-ads",
  client: "Gemini CLI",
  status: "supported",
  title: "Gemini CLI + Google Ads | NotFair",
  description:
    "Use Google's Gemini CLI with NotFair to read and act on your Google Ads account through MCP. Diagnose campaigns, draft optimizations, ship approved fixes.",
  keywords: [
    "Gemini CLI Google Ads",
    "Google Ads Gemini",
    "Gemini MCP Google Ads",
    "Gemini ads agent",
    "ads MCP for Gemini",
  ],
  heroEyebrow: "Integration · Gemini CLI × Google Ads",
  heroTitle: "Run a Google Ads agent inside Gemini CLI",
  heroDescription:
    "Gemini CLI ships with MCP support out of the box. NotFair adds Google Ads as a typed tool surface so your Gemini-driven workflows can read live campaign data and propose safe writes.",
  highlights: [
    "Configure NotFair as an MCP server in Gemini CLI's settings",
    "Live campaign reads — performance, search terms, change history",
    "Approval-gated writes with full provenance and undo",
  ],
  setupIntro:
    "Gemini CLI configures MCP servers in its settings file. NotFair slots in as one entry.",
  setupSteps: [
    {
      title: "Open Gemini CLI's settings",
      body: "Edit your Gemini CLI mcp settings file (typically ~/.gemini/settings.json).",
    },
    {
      title: "Add NotFair",
      body: "Register NotFair under mcpServers.",
      code: `{
  "mcpServers": {
    "${MCP_CONNECTOR_NAME}": {
      "httpUrl": "${MCP_SERVER_URL}"
    }
  }
}`,
    },
    {
      title: "Authorize Google Ads",
      body: "Visit notfair.co/connect, grant Google Ads access, and your Gemini CLI session has live data.",
    },
  ],
  capabilities: [
    {
      label: "Live account context",
      detail: "Performance, search terms, change history, conversion status pulled fresh each prompt.",
    },
    {
      label: "Typed primitives",
      detail: "No GAQL guesswork — the model uses stable, documented tool calls.",
    },
    {
      label: "Approval-gated writes",
      detail: "Bids, negatives, budgets, ad copy, campaign state — every write goes through approval.",
    },
    {
      label: "Audit trail",
      detail: "Every action is logged so you can review or undo later.",
    },
  ],
  workflows: [
    {
      title: "Account-wide audit",
      prompt:
        "Audit my Google Ads account end-to-end. Surface the top 5 issues by spend impact. Cite specific campaigns and search terms.",
      outcome:
        "Structured audit with cost-weighted prioritization and concrete recommendations.",
    },
    {
      title: "Search-term cleanup",
      prompt:
        "Find search terms with >$10 spend and zero conversions in the last 30 days. Propose negatives, grouped by campaign.",
      outcome:
        "Triaged negative-keyword proposal with safety checks for converter overlap.",
    },
    {
      title: "Budget pacing review",
      prompt:
        "Which campaigns ran out of budget yesterday and lost impression share? What's the lost-revenue estimate?",
      outcome:
        "Budget-constrained campaign report with impression-share-to-budget loss estimates.",
    },
  ],
  whyNotfair: {
    title: "Why NotFair for Gemini operators",
    body:
      "Gemini's strength is multi-modal reasoning. NotFair gives it the structured Google Ads tool layer it needs to turn that reasoning into real account improvements.",
    bullets: [
      "Typed tools complement Gemini's reasoning model",
      "Safe writes — no destructive actions without approval",
      "Operation log makes every change reviewable",
      "Built to play well with multi-step Gemini agent loops",
    ],
  },
  faq: [
    {
      question: "Does Gemini CLI handle MCP approval prompts?",
      answer:
        "Yes. Write tools surface as approval-required steps. NotFair also enforces the approval gate server-side as a defense in depth.",
    },
    sharedFaq.trust,
    sharedFaq.cost,
    sharedFaq.official,
  ],
  relatedSlugs: ["codex-google-ads", "claude-code-google-ads", "cursor-google-ads"],
};

const openclawIntegration: IntegrationContent = {
  slug: "openclaw-google-ads",
  client: "OpenClaw",
  status: "supported",
  title: "OpenClaw + Google Ads | NotFair",
  description:
    "Use OpenClaw with NotFair to run a Google Ads agent that reads live campaigns, drafts negatives, and ships approved writes through MCP.",
  keywords: [
    "OpenClaw Google Ads",
    "Google Ads OpenClaw",
    "OpenClaw MCP Google Ads",
    "OpenClaw ads agent",
  ],
  heroEyebrow: "Integration · OpenClaw × Google Ads",
  heroTitle: "Run a Google Ads agent inside OpenClaw",
  heroDescription:
    "OpenClaw is an open-source agent runtime that speaks MCP. NotFair adds Google Ads as a typed tool surface so OpenClaw-built agents can diagnose and optimize live campaigns.",
  highlights: [
    "Open-source friendly — works with OpenClaw out of the box",
    "Typed Google Ads primitives for predictable agent behavior",
    "Approval-gated writes plus full audit log",
  ],
  setupIntro:
    "OpenClaw consumes MCP servers via standard config. NotFair drops in like any other server.",
  setupSteps: [
    {
      title: "Open OpenClaw's MCP config",
      body: "Edit the mcp section of your OpenClaw config (typically openclaw.json or your runner's config).",
    },
    {
      title: "Add NotFair",
      body: "Register NotFair under mcpServers.",
      code: `{
  "mcpServers": {
    "${MCP_CONNECTOR_NAME}": {
      "url": "${MCP_SERVER_URL}"
    }
  }
}`,
    },
    {
      title: "Authorize Google Ads",
      body: "Run notfair.co/connect, complete Google OAuth, and OpenClaw can call NotFair tools immediately.",
    },
  ],
  capabilities: [
    {
      label: "Open-source friendly",
      detail: "NotFair speaks vanilla MCP — no proprietary client SDK required.",
    },
    {
      label: "Typed primitives",
      detail: "Read tools, write tools, freshness metadata — all documented and stable.",
    },
    {
      label: "Approval gates",
      detail: "Even in fully autonomous OpenClaw loops, writes require approval by default.",
    },
    {
      label: "Audit log",
      detail: "Every write is logged with provenance so you can review what the agent did.",
    },
  ],
  workflows: [
    {
      title: "Autonomous weekly audit",
      prompt:
        "Run my weekly Google Ads health check. Diagnose performance, surface wasted spend, propose negatives. Wait for my approval before applying writes.",
      outcome:
        "OpenClaw schedules and runs the workflow weekly; you get a report and an approval queue.",
    },
    {
      title: "Multi-account ops",
      prompt:
        "For each connected Google Ads account, surface the top 3 issues. Group by account, rank by spend impact.",
      outcome:
        "Cross-account snapshot useful for agencies and operators managing multiple accounts.",
    },
    {
      title: "Conversion-tracking sweep",
      prompt:
        "Audit conversion tracking on every campaign. Flag any campaign optimizing for a conversion action that hasn't fired in 30 days.",
      outcome:
        "Surfaces broken conversion setups that quietly destroy automated-bidding effectiveness.",
    },
  ],
  whyNotfair: {
    title: "Why NotFair for OpenClaw operators",
    body:
      "OpenClaw is the open-source path to running agents on your own infra. NotFair complements that with the open Google Ads tool surface — no vendor lock-in, no proprietary protocol.",
    bullets: [
      "Standard MCP — no proprietary OpenClaw plugin required",
      "Typed primitives that survive model upgrades",
      "Approval gate even in fully autonomous loops",
      "Operation log integrates with whatever observability you already run",
    ],
  },
  faq: [
    {
      question: "Does NotFair require a paid plan for OpenClaw use?",
      answer:
        "No. The MCP server is free during open beta and the free tier is planned to remain generous for solo and small-team OpenClaw operators.",
    },
    sharedFaq.trust,
    sharedFaq.cost,
    sharedFaq.official,
  ],
  relatedSlugs: ["claude-code-google-ads", "codex-google-ads", "gemini-cli-google-ads"],
};

export const integrations: Record<string, IntegrationContent> = {
  [chatgptIntegration.slug]: chatgptIntegration,
  [claudeCodeIntegration.slug]: claudeCodeIntegration,
  [cursorIntegration.slug]: cursorIntegration,
  [codexIntegration.slug]: codexIntegration,
  [windsurfIntegration.slug]: windsurfIntegration,
  [geminiCliIntegration.slug]: geminiCliIntegration,
  [openclawIntegration.slug]: openclawIntegration,
};

export function getIntegration(slug: string): IntegrationContent | null {
  return integrations[slug] ?? null;
}

export const allIntegrationSlugs = Object.keys(integrations);

export const integrationHubEntries: IntegrationHubEntry[] = [
  {
    href: "/google-ads-claude",
    client: "Claude (Desktop, Web, Cowork)",
    status: "supported",
    blurb:
      "Custom connector for Claude.ai and Claude Desktop. OAuth in two minutes, live campaign data in chat.",
    badge: "Most popular",
  },
  {
    href: "/integrations/claude-code-google-ads",
    client: "Claude Code",
    status: "supported",
    blurb:
      "One CLI command. Live Google Ads tools inside any Claude Code workspace.",
  },
  {
    href: "/integrations/chatgpt-google-ads",
    client: "ChatGPT",
    status: "via-bridge",
    blurb:
      "Use NotFair with ChatGPT-style workflows through Codex CLI, Custom GPTs, or any OpenAI-compatible MCP client.",
  },
  {
    href: "/integrations/codex-google-ads",
    client: "OpenAI Codex CLI",
    status: "supported",
    blurb:
      "Native MCP support — drop NotFair in and start auditing accounts from your terminal.",
  },
  {
    href: "/integrations/cursor-google-ads",
    client: "Cursor",
    status: "supported",
    blurb:
      "Manage Google Ads from inside the editor you already write code in.",
  },
  {
    href: "/integrations/windsurf-google-ads",
    client: "Windsurf",
    status: "supported",
    blurb:
      "Cascade gets typed Google Ads tools for diagnosis and approval-gated writes.",
  },
  {
    href: "/integrations/gemini-cli-google-ads",
    client: "Gemini CLI",
    status: "supported",
    blurb:
      "Google's Gemini CLI plus a structured Google Ads tool layer for safe writes.",
  },
  {
    href: "/integrations/openclaw-google-ads",
    client: "OpenClaw",
    status: "supported",
    blurb:
      "Open-source agent runtime, standard MCP — no proprietary plugin required.",
  },
];
