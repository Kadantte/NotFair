import type { MarketingLink } from "@/lib/marketing-pages";
import { SHARED_FAQ } from "@/lib/marketing-faqs";
import type { FaqItem } from "@/lib/seo";

export type LongFormSection = {
  title: string;
  body: string;
  bullets?: string[];
};

export type ComparisonRow = {
  feature: string;
  notfair: string;
  alternative: string;
};

export type LongFormContent = {
  slug: string;
  kind: "compare" | "use-case";
  title: string;
  description: string;
  keywords: string[];
  heroEyebrow: string;
  heroTitle: string;
  heroDescription: string;
  highlights: string[];
  sections: LongFormSection[];
  comparisonTable?: {
    title: string;
    intro?: string;
    alternativeLabel: string;
    rows: ComparisonRow[];
  };
  cta: {
    title: string;
    body: string;
    primaryHref: string;
    primaryLabel: string;
    secondaryHref?: string;
    secondaryLabel?: string;
  };
  faq: FaqItem[];
  related: MarketingLink[];
};

const sharedCta = {
  title: "Connect Google Ads in two minutes",
  body: "Authorize once at notfair.co. Then open your AI client and ask real questions about your account.",
  primaryHref: "/connect",
  primaryLabel: "Connect Google Ads",
  secondaryHref: "/integrations",
  secondaryLabel: "Browse AI client integrations",
};

const sharedFaq = SHARED_FAQ;

const compareScripts: LongFormContent = {
  slug: "google-ads-scripts",
  kind: "compare",
  title: "NotFair vs Google Ads scripts | When to use each",
  description:
    "Google Ads scripts are powerful but brittle. Compare scripts with NotFair's MCP-driven AI agent approach — when each makes sense, and where each one falls down.",
  keywords: [
    "Google Ads scripts vs AI agent",
    "Google Ads scripts alternative",
    "NotFair vs Google Ads scripts",
    "AI Google Ads agent",
    "Google Ads automation alternative",
  ],
  heroEyebrow: "Compare · scripts",
  heroTitle: "NotFair vs Google Ads scripts",
  heroDescription:
    "Google Ads scripts run on Google's servers and can do almost anything. They're also brittle, schedule-bound, and hard to evolve. NotFair gives an AI agent typed, live Google Ads tools — diagnose in plain English, draft fixes, and approve writes from any MCP client.",
  highlights: [
    "Scripts: powerful, schedule-driven, JavaScript-only, brittle when the API changes",
    "NotFair: AI-driven, on-demand diagnosis, typed primitives, approval gates",
    "Many teams keep critical scripts and let NotFair handle ad-hoc analysis and writes",
  ],
  sections: [
    {
      title: "Where Google Ads scripts shine",
      body:
        "Scripts are excellent when you have a stable, repeatable job that should run on a schedule with no human in the loop — daily anomaly detection, budget pacing alerts, bulk pause-when-broken automations.",
      bullets: [
        "Run on Google's servers, no infrastructure",
        "Stable cron-style scheduling",
        "Tight access to the JavaScript Google Ads API",
      ],
    },
    {
      title: "Where Google Ads scripts fall down",
      body:
        "Scripts are written once and discovered later. They drift with API changes. Every new piece of logic needs a developer who knows the JavaScript surface. Debugging requires reading raw logs in the UI.",
      bullets: [
        "Brittle: API deprecations break scripts silently",
        "JavaScript-only: not all marketers can read or fix them",
        "Schedule-bound: hard to use for ad-hoc diagnosis",
        "No agent loop: can't reason, propose, or ask follow-up questions",
      ],
    },
    {
      title: "Where NotFair shines",
      body:
        "NotFair turns Google Ads into a typed tool surface for AI agents. Operators can ask Claude / Codex / Cursor what's wrong, get a real diagnosis pulling live data, and approve writes — without code.",
      bullets: [
        "Plain-English diagnosis, structured output",
        "Live data per prompt — no stale dashboards",
        "Approval-gated writes with audit log",
        "Works with the AI client you already use",
      ],
    },
    {
      title: "How teams actually combine them",
      body:
        "The cleanest pattern: keep your stable, schedule-driven scripts for what they're good at (alerts, pacing automations, nightly cleanups). Use NotFair for ad-hoc diagnosis, weekly audits, and one-off optimization passes that don't justify writing a script.",
    },
  ],
  comparisonTable: {
    title: "At a glance",
    alternativeLabel: "Google Ads scripts",
    rows: [
      {
        feature: "Trigger",
        notfair: "On-demand from any MCP client",
        alternative: "Scheduled / event-based only",
      },
      {
        feature: "Interface",
        notfair: "Plain English in your AI client",
        alternative: "JavaScript code",
      },
      {
        feature: "Reasoning",
        notfair: "Agent loop — can ask follow-ups",
        alternative: "Static — runs the same logic every time",
      },
      {
        feature: "Writes",
        notfair: "Approval-gated, logged, undoable",
        alternative: "Direct, depends on script author",
      },
      {
        feature: "Best for",
        notfair: "Ad-hoc diagnosis, audits, one-off optimization",
        alternative: "Stable recurring automations and alerts",
      },
    ],
  },
  cta: sharedCta,
  faq: [
    {
      question: "Can NotFair replace Google Ads scripts entirely?",
      answer:
        "Sometimes. For ad-hoc diagnosis and optimization, NotFair is usually better. For stable scheduled jobs (alerts, pacing, nightly cleanups), keep your scripts. Many teams run both.",
    },
    {
      question: "Can my agent write a Google Ads script for me?",
      answer:
        "Yes — and that's a great use case. Ask Claude/Codex/Cursor to draft a Google Ads script while NotFair provides the live context. The agent can then walk you through deploying it in the Google Ads UI.",
    },
    sharedFaq.trust,
    sharedFaq.scope,
  ],
  related: [
    {
      href: "/compare/google-ads-native-automation",
      title: "NotFair vs Google's native automation",
      description: "When to trust Performance Max and Smart Bidding — and when not to.",
    },
    {
      href: "/use-cases/google-ads-wasted-spend",
      title: "Use case: wasted spend diagnosis",
      description: "The most common first prompt teams run after connecting.",
    },
    {
      href: "/integrations",
      title: "All AI client integrations",
      description: "Pick your AI client and see the two-minute setup.",
    },
  ],
};

const compareNativeAutomation: LongFormContent = {
  slug: "google-ads-native-automation",
  kind: "compare",
  title: "NotFair vs Google's native automation | When to trust each",
  description:
    "Performance Max, Smart Bidding, and auto-applied recommendations — when they work, when they don't, and how NotFair fills the gaps with AI-driven diagnosis and approval-gated writes.",
  keywords: [
    "Performance Max vs AI agent",
    "Smart Bidding alternative",
    "Google Ads auto-apply recommendations",
    "Google Ads native automation",
    "NotFair vs Performance Max",
  ],
  heroEyebrow: "Compare · native automation",
  heroTitle: "NotFair vs Google's native automation",
  heroDescription:
    "Google's automation works for the average advertiser. Anyone managing real money learns its failure modes the hard way. NotFair adds the diagnosis, transparency, and human-in-the-loop control Google's automation lacks.",
  highlights: [
    "Performance Max and Smart Bidding are black-box bidders optimized for Google's revenue, not yours",
    "Auto-applied recommendations make changes you didn't approve and can't easily audit",
    "NotFair gives you the diagnosis + the approval gate — keep Google's automation, but supervise it",
  ],
  sections: [
    {
      title: "Why Google's native automation isn't enough",
      body:
        "It works well at median. For anyone above median or below median — niche verticals, tight budgets, complex funnels — it tends to overspend, underperform, or hide structural problems. Operators rarely know which is happening without external tooling.",
      bullets: [
        "Performance Max hides search-term data behind aggregate categories",
        "Smart Bidding doesn't know your true business CPA target",
        "Auto-applied recommendations apply changes silently",
        "No agent loop — you can't ask Google's UI why CPA jumped",
      ],
    },
    {
      title: "Where NotFair adds the most value",
      body:
        "NotFair doesn't replace Google's automation — it supervises it. You can ask an AI agent why Performance Max is overspending, whether Smart Bidding is undertuning a campaign, and which auto-apply changes hurt last week.",
      bullets: [
        "Diagnose Performance Max campaigns despite restricted search-term visibility",
        "Audit Smart Bidding against your true business targets",
        "Review every auto-applied recommendation in one place",
        "Get a clear weekly report on what Google's automation actually did",
      ],
    },
    {
      title: "How operators run them together",
      body:
        "Use Google's automation as the default bidding layer. Use NotFair to supervise it: weekly diagnosis, structural audits, search-term scrubbing on the non-PMax surfaces, and approval gates before any structural change.",
    },
  ],
  comparisonTable: {
    title: "At a glance",
    alternativeLabel: "Google's native automation",
    rows: [
      {
        feature: "Visibility",
        notfair: "Live data + structured diagnosis",
        alternative: "Aggregated reports, restricted search terms",
      },
      {
        feature: "Reasoning",
        notfair: "Plain-English agent loop",
        alternative: "Black-box ML",
      },
      {
        feature: "Goal",
        notfair: "Your business outcome",
        alternative: "Google's revenue + your aggregate CPA",
      },
      {
        feature: "Writes",
        notfair: "Approval-gated, logged, undoable",
        alternative: "Auto-applied without explicit approval",
      },
      {
        feature: "Best for",
        notfair: "Operators who need visibility and control",
        alternative: "Median advertisers with simple funnels",
      },
    ],
  },
  cta: sharedCta,
  faq: [
    {
      question: "Should I turn off Performance Max?",
      answer:
        "Not necessarily. PMax often does its job for branded and aggregate demand. Where it tends to underperform is niche verticals and tight-CPA scenarios. Ask an agent through NotFair to audit your PMax accounts and decide.",
    },
    {
      question: "Should I turn off auto-applied recommendations?",
      answer:
        "Yes for most operators above $1k/day. They make silent changes that can be hard to attribute. Use NotFair to surface recommendations and approve them explicitly instead.",
    },
    sharedFaq.trust,
    sharedFaq.scope,
  ],
  related: [
    {
      href: "/compare/google-ads-scripts",
      title: "NotFair vs Google Ads scripts",
      description: "When scripts beat agents, and when agents beat scripts.",
    },
    {
      href: "/use-cases/google-ads-wasted-spend",
      title: "Use case: wasted spend diagnosis",
      description: "Catch the spend Google's automation is happy to bleed.",
    },
    {
      href: "/integrations",
      title: "All AI client integrations",
      description: "Pick your client and start auditing.",
    },
  ],
};

const compareDashboard: LongFormContent = {
  slug: "google-ads-dashboard",
  kind: "compare",
  title: "Google Ads dashboard vs AI agent | NotFair",
  description:
    "The Google Ads UI is a dashboard built for navigation, not diagnosis. NotFair adds an AI agent that pulls the same data, diagnoses issues, and ships approved fixes.",
  keywords: [
    "Google Ads dashboard vs AI agent",
    "Google Ads UI alternative",
    "Google Ads AI agent",
    "Google Ads diagnostic tool",
    "NotFair vs Google Ads dashboard",
  ],
  heroEyebrow: "Compare · the dashboard",
  heroTitle: "Google Ads dashboard vs an AI agent",
  heroDescription:
    "The Google Ads UI is built for navigation and reporting. It doesn't tell you what to do. NotFair adds the agent layer on top so you spend less time clicking through tabs and more time shipping fixes.",
  highlights: [
    "Dashboards show data. Agents tell you what matters.",
    "NotFair pulls the same Google Ads API the dashboard does — but with structured, agent-readable tools",
    "Use both: dashboard for visual review, NotFair for diagnosis and approved writes",
  ],
  sections: [
    {
      title: "Why the dashboard alone isn't enough",
      body:
        "The dashboard is excellent at showing data once you know where to look. The problem: knowing where to look is the actual skill. Operators end up running the same five reports every week to manually find what an agent could surface in one prompt.",
      bullets: [
        "Reports are static — no follow-up questions",
        "No cross-tab synthesis — you assemble the picture yourself",
        "Auto-applied changes are easy to miss",
        "No bulk approve-and-apply flow for the changes you actually want",
      ],
    },
    {
      title: "What an AI agent adds",
      body:
        "Agents do the synthesis. Ask one question, get an answer that pulls from search-term reports, change history, conversion tracking, and landing-page status. Then approve writes inline.",
      bullets: [
        "One prompt replaces five reports",
        "Cross-tab synthesis built in",
        "Follow-up questions on the same context",
        "Approval-gated writes happen in the same conversation",
      ],
    },
    {
      title: "How operators use them together",
      body:
        "Keep the dashboard for visual review and high-trust manual edits. Use NotFair (via Claude / Codex / Cursor / Windsurf / Gemini CLI) for diagnosis, weekly audits, and bulk fixes. The two never conflict because NotFair uses the same Google Ads API the UI does.",
    },
  ],
  cta: sharedCta,
  faq: [
    {
      question: "Will NotFair changes show up in the Google Ads dashboard?",
      answer:
        "Yes. NotFair uses the official Google Ads API, so every approved write appears in the Google Ads change history and is visible in the dashboard just like any manual edit.",
    },
    {
      question: "Can I undo a write I made through NotFair?",
      answer:
        "Yes. Every approved write is logged with undo metadata, and most write types have an inverse operation. Reversals are also reflected in Google's change history.",
    },
    sharedFaq.trust,
    sharedFaq.scope,
  ],
  related: [
    {
      href: "/compare/google-ads-agencies",
      title: "NotFair vs a Google Ads agency",
      description: "When in-house + AI beats an agency retainer.",
    },
    {
      href: "/use-cases/google-ads-search-terms",
      title: "Use case: search-term review",
      description: "The weekly job everyone should run but no one does.",
    },
    {
      href: "/integrations",
      title: "All AI client integrations",
      description: "Pick your client and start auditing.",
    },
  ],
};

const compareAgencies: LongFormContent = {
  slug: "google-ads-agencies",
  kind: "compare",
  title: "NotFair vs a Google Ads agency | Which makes sense for SMBs",
  description:
    "Agencies charge $2-10k/month for a junior account manager. NotFair gives you an AI agent that does the diagnostic and optimization work for a fraction of the cost.",
  keywords: [
    "NotFair vs Google Ads agency",
    "Google Ads agency alternative",
    "AI Google Ads management",
    "in-house Google Ads with AI",
    "self-managed Google Ads",
  ],
  heroEyebrow: "Compare · agencies",
  heroTitle: "NotFair vs hiring a Google Ads agency",
  heroDescription:
    "Most SMB agencies bill $2-10k/month for what is, honestly, a junior account manager running a checklist. NotFair gives you that same checklist as an AI agent — supervised by you, on your schedule, for a fraction of the cost.",
  highlights: [
    "Agencies: fixed retainer, slow turn-around, generic checklist, often a junior account lead",
    "NotFair: live diagnosis on demand, approval-gated writes, transparent operation log",
    "Best for: SMB founders willing to run ads themselves with AI as the optimization layer",
  ],
  sections: [
    {
      title: "When an agency is the right call",
      body:
        "If you don't want to touch the account, an agency is the right answer. They'll handle creative, landing pages, reporting, and account hygiene. You pay for the convenience.",
      bullets: [
        "You don't want to operate the account directly",
        "You need creative + landing-page production bundled in",
        "You want a single accountable contact",
      ],
    },
    {
      title: "When NotFair beats an agency",
      body:
        "If you're a founder spending your own money and want the optimization done well without a $5k/month retainer, NotFair is the better answer. AI agents do the boring diagnostic work — search-term scrubbing, structural audits, budget pacing — that agencies bill the most for.",
      bullets: [
        "You manage your own spend and want speed + transparency",
        "You can describe what you want in plain English",
        "You want the audit log of every change",
        "You don't want to wait until next Tuesday's sync to fix something",
      ],
    },
    {
      title: "The in-house + AI pattern",
      body:
        "The team-of-one + NotFair model is increasingly viable for SMBs spending $1k-30k/month on ads. Founders run weekly audits with the agent, approve writes inline, and reserve agencies for one-off creative or scale-up phases.",
    },
  ],
  comparisonTable: {
    title: "At a glance",
    alternativeLabel: "SMB Google Ads agency",
    rows: [
      {
        feature: "Cost",
        notfair: "Free during beta, usage-priced later",
        alternative: "$2k-10k/month retainer",
      },
      {
        feature: "Turn-around",
        notfair: "Minutes — ask, approve, ship",
        alternative: "Days — wait for next sync",
      },
      {
        feature: "Transparency",
        notfair: "Operation log on every write",
        alternative: "Monthly report PDF",
      },
      {
        feature: "Strategy",
        notfair: "You + your AI client",
        alternative: "Account manager",
      },
      {
        feature: "Best for",
        notfair: "Founders managing their own spend",
        alternative: "Owners who want to outsource entirely",
      },
    ],
  },
  cta: sharedCta,
  faq: [
    {
      question: "Can I run my Google Ads entirely with NotFair, no agency?",
      answer:
        "Yes — many of NotFair's users do exactly that. Pair NotFair with a competent AI client (Claude, Codex, Cursor, Windsurf) and a willingness to spend an hour a week reviewing the account.",
    },
    {
      question: "Is NotFair for agencies too?",
      answer:
        "Yes. Agencies use NotFair to accelerate the boring parts of account management — search-term scrubbing, audits, weekly reports — so their team time goes to strategy and creative.",
    },
    sharedFaq.trust,
    sharedFaq.scope,
  ],
  related: [
    {
      href: "/compare/best-ai-tools-google-ads",
      title: "Best AI tools for Google Ads operators (2026)",
      description: "Field guide to the AI tooling SMB operators are actually using.",
    },
    {
      href: "/use-cases/google-ads-wasted-spend",
      title: "Use case: wasted spend diagnosis",
      description: "The fastest way to recover $1-5k/month most SMB accounts are bleeding.",
    },
    {
      href: "/integrations",
      title: "All AI client integrations",
      description: "Pick the AI client you already use.",
    },
  ],
};

const compareBestAiTools: LongFormContent = {
  slug: "best-ai-tools-google-ads",
  kind: "compare",
  title: "Best AI tools for Google Ads operators (2026) | NotFair",
  description:
    "Field guide to the AI tooling SMB Google Ads operators are actually using in 2026 — agent runtimes, MCP servers, and the surfaces that connect them.",
  keywords: [
    "best AI tools for Google Ads",
    "best AI Google Ads tools 2026",
    "Google Ads AI tools comparison",
    "AI Google Ads management tools",
    "Google Ads MCP server comparison",
  ],
  heroEyebrow: "Compare · landscape",
  heroTitle: "Best AI tools for Google Ads operators (2026)",
  heroDescription:
    "The Google-Ads-with-AI stack has three layers: an AI client (Claude / Codex / Cursor / Windsurf / Gemini), a tool server that exposes Google Ads (NotFair, free MCP servers, vendor scripts), and the operator workflow that glues them together. Here's how to pick.",
  highlights: [
    "Layer 1 — the AI client: pick the one you already use daily",
    "Layer 2 — the tool server: pick for safety, freshness, and typed primitives",
    "Layer 3 — the workflow: weekly audits + on-demand diagnosis beats one-off prompts",
  ],
  sections: [
    {
      title: "Picking the AI client",
      body:
        "Use whatever your team already uses. Claude (Desktop / Web / Cowork) for non-developers. Claude Code / Codex CLI / Cursor / Windsurf for developer operators. Gemini CLI if you're already deep in Google's ecosystem.",
      bullets: [
        "Claude — best general-purpose ads agent surface",
        "Claude Code — best for terminal-native operators",
        "Codex CLI — best for OpenAI-native teams",
        "Cursor / Windsurf — best for founder-engineers who also write code",
        "Gemini CLI — best for Google-native shops",
      ],
    },
    {
      title: "Picking the Google Ads tool server",
      body:
        "Free Google Ads MCP servers exist. Most are thin GAQL wrappers — they hand the model raw access to a poorly-documented query language and hope. NotFair is the typed, safety-gated alternative: documented tools, freshness metadata, approval-gated writes, undo, audit log.",
      bullets: [
        "Free GAQL-only MCP — fine for hobby use, fragile for real accounts",
        "NotFair — typed primitives, freshness, approval, audit",
        "Vendor scripts (Optmyzr, etc.) — full SaaS, no AI agent layer",
      ],
    },
    {
      title: "The workflow that actually works",
      body:
        "Three habits compound. Weekly audit (the agent diagnoses everything that moved). Daily ad-hoc diagnosis (ask the agent any question on demand). Pre-launch checklist (audit before any new campaign or budget bump).",
    },
  ],
  cta: sharedCta,
  faq: [
    {
      question: "Is there a single “best” AI tool for Google Ads?",
      answer:
        "Best is the wrong frame. Pick the AI client your team already uses, then add NotFair as the tool layer. Most teams get further from picking the right workflow than picking the right client.",
    },
    {
      question: "Where do free Google Ads MCP servers fall short?",
      answer:
        "Most are GAQL wrappers — the agent has to write raw queries against an undocumented API, and writes are unguarded. They're fine for experimenting, dangerous on real spend.",
    },
    sharedFaq.trust,
    sharedFaq.scope,
  ],
  related: [
    {
      href: "/compare/google-ads-agencies",
      title: "NotFair vs a Google Ads agency",
      description: "When the in-house + AI pattern beats an agency retainer.",
    },
    {
      href: "/integrations",
      title: "All AI client integrations",
      description: "Pick your client and follow the two-minute setup.",
    },
    {
      href: "/use-cases/google-ads-wasted-spend",
      title: "Use case: wasted spend diagnosis",
      description: "The first useful workflow after you connect.",
    },
  ],
};

const useCaseWastedSpend: LongFormContent = {
  slug: "google-ads-wasted-spend",
  kind: "use-case",
  title: "Google Ads wasted-spend diagnosis with AI | NotFair",
  description:
    "Find the search terms, campaigns, and structural issues silently bleeding your Google Ads budget. AI-driven diagnosis through your MCP client, with approval-gated fixes.",
  keywords: [
    "Google Ads wasted spend",
    "Google Ads wasted spend AI",
    "find Google Ads wasted spend",
    "Google Ads spend audit AI",
    "wasted ad spend audit",
  ],
  heroEyebrow: "Use case · wasted spend",
  heroTitle: "Find the spend your Google Ads account is quietly bleeding",
  heroDescription:
    "Most SMB Google Ads accounts waste 15-35% of spend on search terms with zero conversion intent, broken landing pages, and structurally weak campaigns. NotFair gives your AI agent the tools to find it — and approve the fixes inline.",
  highlights: [
    "Spot high-cost, zero-conversion search terms in seconds",
    "Catch broken landing pages and conversion tracking gaps",
    "Approve negative-keyword and pause-campaign writes inline",
  ],
  sections: [
    {
      title: "The four kinds of wasted spend",
      body:
        "Wasted spend is rarely one thing. It's usually a mix: irrelevant search-term match, broken or slow landing pages, conversion tracking gaps that make Smart Bidding misfire, and structurally weak campaigns that should have been paused or restructured.",
      bullets: [
        "Search-term mismatch — broad-match drift, missing negatives",
        "Landing page failures — 4xx/5xx URLs still serving ads",
        "Conversion tracking gaps — Smart Bidding optimizes against nothing",
        "Structural waste — orphan ad groups, single-keyword campaigns gone stale",
      ],
    },
    {
      title: "How NotFair finds each one",
      body:
        "Ask your AI agent (Claude, Codex, Cursor, Windsurf, Gemini CLI) to run the diagnosis. NotFair's tools pull live search-term data, validate landing-page status, check conversion tracking on every campaign, and surface structural anomalies — all in one conversation.",
      bullets: [
        "“Find search terms with >$5 spend and zero conversions last 30 days”",
        "“Crawl every active ad's final URL. Tell me which are broken.”",
        "“Audit conversion tracking. Flag any campaign optimizing against a stale action.”",
        "“Find ad groups with one keyword that has no conversions in 60 days.”",
      ],
    },
    {
      title: "What the fix looks like",
      body:
        "Once the diagnosis is in, the agent drafts the writes — negatives at the right level, ad pauses, conversion-action remappings. Each write surfaces in NotFair's approval queue. You approve once; the writes hit Google Ads with full provenance.",
    },
  ],
  cta: sharedCta,
  faq: [
    {
      question: "How much wasted spend does the average account have?",
      answer:
        "Across NotFair's beta cohort, the typical SMB account has 15-35% of spend on search terms with zero conversions. The high end of that range usually has landing-page or conversion-tracking issues compounding.",
    },
    {
      question: "Can the agent apply negatives without my approval?",
      answer:
        "No. Negative-keyword writes — and every other Google Ads write — pass through NotFair's approval gate. The agent proposes, you approve.",
    },
    {
      question: "Will NotFair negative-keyword a search term that has converted?",
      answer:
        "By default it warns and asks for confirmation. The wasted-spend workflow filters out converters first to avoid throwing away signal.",
    },
    sharedFaq.trust,
  ],
  related: [
    {
      href: "/use-cases/google-ads-negative-keywords",
      title: "Use case: negative-keyword automation",
      description: "The follow-up workflow after the first wasted-spend pass.",
    },
    {
      href: "/use-cases/google-ads-search-terms",
      title: "Use case: weekly search-term review",
      description: "The recurring habit that keeps waste under 5%.",
    },
    {
      href: "/integrations",
      title: "All AI client integrations",
      description: "Connect your AI client in two minutes.",
    },
  ],
};

const useCaseNegativeKeywords: LongFormContent = {
  slug: "google-ads-negative-keywords",
  kind: "use-case",
  title: "Google Ads negative-keyword automation with AI | NotFair",
  description:
    "Stop manually scrubbing search-term reports. NotFair lets your AI agent surface waste, group by intent, and apply approved negative keywords at the right scope.",
  keywords: [
    "Google Ads negative keyword automation",
    "AI Google Ads negative keywords",
    "Google Ads negative keyword tool",
    "automate Google Ads negatives",
    "negative keyword scrubber",
  ],
  heroEyebrow: "Use case · negative keywords",
  heroTitle: "Negative-keyword automation that doesn't throw away converters",
  heroDescription:
    "The boring weekly job everyone skips. NotFair lets your AI agent run it in minutes — group by intent, propose negatives at the right scope, and approve writes inline with safety checks against converters.",
  highlights: [
    "Group similar wasted-spend terms into clean negative sets",
    "Pick the right scope: campaign, ad group, or shared list",
    "Safety check: warn before negativizing a term that has converted",
  ],
  sections: [
    {
      title: "Why automated negatives usually go wrong",
      body:
        "Naive automation negativizes anything below a CPA threshold — and accidentally kills a future converter. NotFair's workflow filters out terms that have converted, groups by linguistic similarity, and chooses the right scope based on which campaigns the term appears in.",
      bullets: [
        "Filter out converters before proposing",
        "Group by intent — “free”, “jobs”, “tutorial”, “reviews”",
        "Choose scope intelligently — shared list for cross-campaign noise, ad-group scope for one-offs",
        "Match type: phrase or exact, never broad",
      ],
    },
    {
      title: "The prompt that works",
      body:
        "“Run a negative-keyword sweep. Find every search term last 30 days with >$5 spend and zero conversions. Skip terms where the root has converted in the last 90 days. Group by intent. Propose negatives at the right scope.” That single prompt collapses what used to be a 90-minute weekly job.",
    },
    {
      title: "How the approval flow works",
      body:
        "The agent prepares a structured proposal: term, group, proposed scope, proposed match type, supporting cost/conversion data. You approve the batch (or per-row); NotFair applies the writes through the Google Ads API and logs the operation.",
    },
  ],
  cta: sharedCta,
  faq: [
    {
      question: "Will NotFair negativize a high-volume keyword by mistake?",
      answer:
        "No — the workflow warns before negativizing any term that has converted in the lookback window. Approval is per-batch and per-row.",
    },
    {
      question: "Can I undo a negative keyword I approved?",
      answer:
        "Yes. The operation log captures every write with undo metadata. You can reverse a batch or a single row.",
    },
    sharedFaq.trust,
  ],
  related: [
    {
      href: "/use-cases/google-ads-wasted-spend",
      title: "Use case: wasted spend diagnosis",
      description: "The full diagnostic pass that precedes the negative sweep.",
    },
    {
      href: "/use-cases/google-ads-search-terms",
      title: "Use case: weekly search-term review",
      description: "Keep waste low by making this a recurring habit.",
    },
    {
      href: "/integrations",
      title: "All AI client integrations",
      description: "Pick your client and start.",
    },
  ],
};

const useCasePolicyErrors: LongFormContent = {
  slug: "google-ads-policy-errors",
  kind: "use-case",
  title: "Google Ads policy error fixer (AI) | NotFair",
  description:
    "Use an AI agent to diagnose disapproved ads, suggest compliant rewrites, and ship approved fixes. Stop losing impression share to slow policy-error triage.",
  keywords: [
    "Google Ads policy errors",
    "Google Ads disapproved ads",
    "AI Google Ads policy fixer",
    "Google Ads policy violation",
    "Google Ads ad disapproval",
  ],
  heroEyebrow: "Use case · policy errors",
  heroTitle: "Stop losing impression share to disapproved ads",
  heroDescription:
    "Disapproved ads silently leak impression share. NotFair lets your AI agent triage policy errors, propose compliant rewrites, and ship approved fixes through MCP — without you copy-pasting Google's policy strings into a doc.",
  highlights: [
    "Pull every disapproved ad in one query",
    "Get plain-English explanations and proposed rewrites",
    "Approve the rewritten ad copy inline",
  ],
  sections: [
    {
      title: "Why policy errors are so painful",
      body:
        "Google's policy strings are short and unhelpful (“Personalized advertising”, “Misleading content”). Operators waste hours reading policy docs to figure out which two words tripped the system. AI agents are way better at this triage.",
    },
    {
      title: "The NotFair workflow",
      body:
        "Ask the agent: “Pull every ad with policy disapproval in the last 30 days. For each, explain the most likely cause and propose a compliant rewrite.” The agent calls NotFair's tools, gets the full ad copy + the policy strings, and returns a structured rewrite list.",
      bullets: [
        "Plain-English explanation of why each ad was disapproved",
        "Compliant rewrite proposal keeping the original intent",
        "Approval per-ad or per-batch",
        "Operation log entry on every write",
      ],
    },
    {
      title: "Edge cases that matter",
      body:
        "Some policy errors aren't copy issues — they're destination URL or category issues. The agent flags those for manual review instead of attempting an autofix that won't solve the root cause.",
    },
  ],
  cta: sharedCta,
  faq: [
    {
      question: "Can the agent re-write ad copy without my approval?",
      answer:
        "No. Every ad-copy write passes through NotFair's approval gate. Per-ad or batch approval, whichever you prefer.",
    },
    {
      question: "What if the policy error is a destination URL problem?",
      answer:
        "The agent will flag it and ask you to fix the destination instead of rewriting copy.",
    },
    sharedFaq.trust,
  ],
  related: [
    {
      href: "/use-cases/google-ads-conversion-audit",
      title: "Use case: conversion tracking audit",
      description: "The other silent killer of Google Ads performance.",
    },
    {
      href: "/use-cases/google-ads-wasted-spend",
      title: "Use case: wasted spend diagnosis",
      description: "Find waste once policy fires are out.",
    },
    {
      href: "/integrations",
      title: "All AI client integrations",
      description: "Pick your client and start.",
    },
  ],
};

const useCaseConversionAudit: LongFormContent = {
  slug: "google-ads-conversion-audit",
  kind: "use-case",
  title: "Google Ads conversion tracking audit with AI | NotFair",
  description:
    "Smart Bidding optimizes against your conversion actions. If they're broken or stale, your campaigns waste money. NotFair's AI agent finds the gaps and proposes fixes.",
  keywords: [
    "Google Ads conversion tracking audit",
    "Google Ads conversion audit AI",
    "Google Ads conversion tracking issues",
    "AI Google Ads conversion check",
    "conversion tracking audit Claude ChatGPT",
  ],
  heroEyebrow: "Use case · conversion tracking",
  heroTitle: "Audit conversion tracking before Smart Bidding wastes another month",
  heroDescription:
    "If Smart Bidding is optimizing against a stale conversion action, every campaign tied to it bleeds slowly. NotFair lets your AI agent audit every conversion action, every campaign's bidding setup, and flag what's broken.",
  highlights: [
    "Check every conversion action and when it last fired",
    "Audit every campaign's bid strategy and selected conversion goal",
    "Get a prioritized list of fixes, ranked by spend at risk",
  ],
  sections: [
    {
      title: "What conversion-tracking gaps actually look like",
      body:
        "The most common failure modes: a conversion action that hasn't fired in 30+ days, a Smart Bidding campaign tied to an action that no longer exists, duplicate conversion definitions counting the same event twice, or Enhanced Conversions never fully configured.",
      bullets: [
        "Stale conversion actions — last fire >30 days ago",
        "Campaigns optimizing against deleted/inactive actions",
        "Duplicate conversion definitions inflating reported numbers",
        "Enhanced Conversions configured but not firing",
      ],
    },
    {
      title: "The NotFair workflow",
      body:
        "Ask the agent for a conversion-tracking audit. NotFair pulls conversion actions, fire history, and per-campaign bidding configuration. The agent ranks issues by spend at risk and proposes fixes.",
    },
    {
      title: "Why this is one of the highest-leverage audits",
      body:
        "Conversion-tracking issues are invisible in normal reporting because Google still reports clicks and cost — just not the conversions that justify them. Operators spend months trying to optimize accounts that were silently flying blind.",
    },
  ],
  cta: sharedCta,
  faq: [
    {
      question: "Can the agent fix the conversion tracking itself?",
      answer:
        "It can fix the Google Ads side — re-pointing a campaign at the right conversion action, fixing the bidding strategy, marking duplicates inactive. The tag-level fixes (gtag, GTM) still require a developer.",
    },
    sharedFaq.trust,
  ],
  related: [
    {
      href: "/use-cases/google-ads-wasted-spend",
      title: "Use case: wasted spend diagnosis",
      description: "Often the conversion audit explains the waste.",
    },
    {
      href: "/use-cases/google-ads-cross-platform-roas",
      title: "Use case: cross-platform ROAS",
      description: "Once conversions are clean, you can compare across platforms.",
    },
    {
      href: "/integrations",
      title: "All AI client integrations",
      description: "Pick your client and start.",
    },
  ],
};

const useCaseSearchTerms: LongFormContent = {
  slug: "google-ads-search-terms",
  kind: "use-case",
  title: "Weekly Google Ads search-term review with AI | NotFair",
  description:
    "The weekly habit that keeps Google Ads waste under 5%. NotFair lets your AI agent run search-term review in minutes — group, propose negatives, approve inline.",
  keywords: [
    "Google Ads search term review",
    "weekly Google Ads search terms",
    "AI Google Ads search term audit",
    "Google Ads search term report AI",
    "search term scrubbing automation",
  ],
  heroEyebrow: "Use case · search terms",
  heroTitle: "Weekly search-term review without the dread",
  heroDescription:
    "Search-term review is the highest-leverage weekly job in Google Ads — and the one most often skipped because it's tedious. NotFair turns it into a 10-minute agent loop you actually run.",
  highlights: [
    "Pull last week's search-term report through your AI client",
    "Agent groups noise, surfaces converters, proposes negatives",
    "Approve inline with full safety checks",
  ],
  sections: [
    {
      title: "Why the weekly habit beats one-off cleanups",
      body:
        "Search-term drift compounds. Five new junk terms a week becomes 250 a year, and Smart Bidding learns to chase them. Operators who run weekly reviews keep waste under 5%. Operators who don't hit 25-40% by month six.",
    },
    {
      title: "The 10-minute workflow",
      body:
        "Ask the agent: “Run a search-term sweep on last week. Group by intent. Filter out converters. Propose negatives at the right scope.” The agent does the boring work; you approve the batch.",
      bullets: [
        "Filter to last 7 days",
        "Filter out converters and root-keyword converters",
        "Group by linguistic intent",
        "Propose scope + match type",
        "One approval, batch applied",
      ],
    },
    {
      title: "What changes after three weeks",
      body:
        "Most accounts see waste drop into the 5-10% band by week three. Smart Bidding gets cleaner signal, CPA tightens, and the agent starts running out of obvious negatives — which is exactly when it's time to look at structural fixes instead.",
    },
  ],
  cta: sharedCta,
  faq: [
    {
      question: "Can this run on a schedule?",
      answer:
        "Yes, with OpenClaw or any agent runtime that supports scheduled MCP calls. Many operators prefer to keep a human in the loop on the weekly approval step, though.",
    },
    sharedFaq.trust,
  ],
  related: [
    {
      href: "/use-cases/google-ads-negative-keywords",
      title: "Use case: negative-keyword automation",
      description: "The deeper sweep that runs less often.",
    },
    {
      href: "/use-cases/google-ads-wasted-spend",
      title: "Use case: wasted spend diagnosis",
      description: "The first pass before weekly hygiene kicks in.",
    },
    {
      href: "/integrations",
      title: "All AI client integrations",
      description: "Pick your client and start.",
    },
  ],
};

const useCaseCrossPlatform: LongFormContent = {
  slug: "google-ads-cross-platform-roas",
  kind: "use-case",
  title: "Cross-platform ROAS comparison with AI | NotFair",
  description:
    "Compare ROAS across Google Ads, Meta Ads, and other channels through a single AI agent. NotFair surfaces apples-to-apples performance data — no PDF dashboards needed.",
  keywords: [
    "cross-platform ROAS comparison",
    "Google Ads vs Meta ROAS",
    "AI marketing ROAS",
    "compare Google Ads and Meta Ads",
    "multi-platform ads agent",
  ],
  heroEyebrow: "Use case · cross-platform ROAS",
  heroTitle: "Compare ROAS across Google, Meta, and beyond — through your agent",
  heroDescription:
    "Most SMB operators have spend across two or three platforms. Cross-platform ROAS comparison usually means a Looker dashboard and a quarterly review. NotFair lets your AI agent pull live data from each connected platform and synthesize on demand.",
  highlights: [
    "Connect Google Ads (live) and Meta Ads (beta) through NotFair",
    "Single-agent view of cost, conversions, and ROAS per channel",
    "Ask the agent to recommend a reallocation",
  ],
  sections: [
    {
      title: "Why cross-platform comparison is so hard manually",
      body:
        "Each platform exposes different attribution windows, different conversion definitions, and different reporting cadences. Synthesizing them by hand takes hours and the answer is stale by the time it's ready.",
    },
    {
      title: "The NotFair workflow",
      body:
        "Ask the agent: “Compare last 30 days ROAS across my Google Ads and Meta Ads accounts. Surface the platform with the worst marginal ROAS and tell me what's dragging it down.” The agent pulls live data from each connected platform and synthesizes.",
    },
    {
      title: "What to do with the answer",
      body:
        "Reallocation is the obvious lever, but cheap. The deeper move is identifying whether the underperforming platform has a fixable structural issue (broken tracking, weak creative rotation, bad geo targeting) before reallocating budget.",
    },
  ],
  cta: sharedCta,
  faq: [
    {
      question: "Does NotFair support Meta Ads?",
      answer:
        "Yes — Meta Ads is in beta. See /meta-ads-mcp. The same approval-gated write model applies.",
    },
    sharedFaq.trust,
    sharedFaq.scope,
  ],
  related: [
    {
      href: "/use-cases/google-ads-conversion-audit",
      title: "Use case: conversion tracking audit",
      description: "Required before cross-platform ROAS is reliable.",
    },
    {
      href: "/compare/google-ads-agencies",
      title: "NotFair vs a Google Ads agency",
      description: "Why in-house + AI is increasingly viable.",
    },
    {
      href: "/integrations",
      title: "All AI client integrations",
      description: "Pick your client and start.",
    },
  ],
};

export const comparePages: Record<string, LongFormContent> = {
  [compareScripts.slug]: compareScripts,
  [compareNativeAutomation.slug]: compareNativeAutomation,
  [compareDashboard.slug]: compareDashboard,
  [compareAgencies.slug]: compareAgencies,
  [compareBestAiTools.slug]: compareBestAiTools,
};

export const useCasePages: Record<string, LongFormContent> = {
  [useCaseWastedSpend.slug]: useCaseWastedSpend,
  [useCaseNegativeKeywords.slug]: useCaseNegativeKeywords,
  [useCasePolicyErrors.slug]: useCasePolicyErrors,
  [useCaseConversionAudit.slug]: useCaseConversionAudit,
  [useCaseSearchTerms.slug]: useCaseSearchTerms,
  [useCaseCrossPlatform.slug]: useCaseCrossPlatform,
};

export function getComparePage(slug: string): LongFormContent | null {
  return comparePages[slug] ?? null;
}

export function getUseCasePage(slug: string): LongFormContent | null {
  return useCasePages[slug] ?? null;
}

export const allCompareSlugs = Object.keys(comparePages);
export const allUseCaseSlugs = Object.keys(useCasePages);
