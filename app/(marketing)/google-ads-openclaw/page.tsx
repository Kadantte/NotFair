import Link from "next/link";
import { Terminal, ShieldCheck, Search, Settings, ArrowRight } from "lucide-react";
import { buildMetadata, buildFaqJsonLd, SITE_URL } from "@/lib/seo";
import { MCP_SERVER_URL } from "@/lib/brand";

export const metadata = buildMetadata({
  title: "OpenClaw Google Ads Agent - NotFair OpenClaw Plugin",
  description:
    "Install the NotFair OpenClaw plugin to diagnose Google Ads, find wasted spend, review search terms, and approve campaign fixes from OpenClaw.",
  path: "/google-ads-openclaw",
  keywords: [
    "openclaw google ads",
    "openclaw google ads plugin",
    "notfair openclaw plugin",
    "google ads openclaw",
    "openclaw mcp google ads",
    "openclaw ads agent",
    "google ads agent openclaw",
  ],
});

const faqItems = [
  {
    question: "What is the NotFair OpenClaw plugin?",
    answer:
      "It is an OpenClaw plugin that connects OpenClaw to NotFair's hosted Google Ads MCP server. It lets OpenClaw inspect live Google Ads data, run read-only analysis scripts, and propose approval-gated campaign fixes.",
  },
  {
    question: "How do I install it?",
    answer:
      "Run openclaw plugins install clawhub:openclaw-notfair, enable the plugin, then run openclaw notfair setup.",
  },
  {
    question: "Can it change my Google Ads account?",
    answer:
      "Only after approval. Read operations can run directly. Budget changes, campaign state changes, keyword changes, and other writes must be reviewed and confirmed before they reach Google Ads.",
  },
  {
    question: "What MCP endpoint does it use?",
    answer: "The plugin defaults to " + MCP_SERVER_URL + ", the platform-explicit NotFair Google Ads MCP endpoint.",
  },
];

const jsonLd = [
  buildFaqJsonLd(faqItems),
  {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "NotFair OpenClaw Google Ads Plugin",
    applicationCategory: "BusinessApplication",
    applicationSubCategory: "Google Ads Management Software",
    operatingSystem: "macOS, Linux, Windows",
    description:
      "OpenClaw plugin for NotFair's hosted Google Ads MCP server. Diagnose campaigns, audit wasted spend, review search terms, and approve Google Ads fixes.",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
    },
    url: new URL("/google-ads-openclaw", SITE_URL).toString(),
    featureList: [
      "OpenClaw plugin install flow",
      "OAuth login through NotFair",
      "Live Google Ads account diagnostics",
      "Read-only Google Ads scripting",
      "Approval-gated campaign writes",
    ],
  },
];

const capabilities = [
  {
    icon: Search,
    title: "Diagnose wasted spend",
    body: "Ask OpenClaw to inspect campaigns, keywords, search terms, and budget pacing using live Google Ads data from NotFair.",
  },
  {
    icon: Terminal,
    title: "Run account analysis scripts",
    body: "Use NotFair's read-only script sandbox for custom reports without exporting CSVs or writing one-off Google Ads scripts.",
  },
  {
    icon: ShieldCheck,
    title: "Review before writes",
    body: "Treat bid edits, negative keywords, campaign pauses, and budget changes as approval-gated actions instead of silent automation.",
  },
  {
    icon: Settings,
    title: "Use any NotFair MCP tool",
    body: "The plugin exposes a generic NotFair tool caller so OpenClaw can reach the full Google Ads MCP surface as it evolves.",
  },
];

export default function Page() {
  return (
    <main className="bg-[#1A1917] text-[#E8E4DD]">
      {jsonLd.map((schema, i) => (
        <script
          key={i}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
        />
      ))}

      <section className="px-4 pb-20 pt-20 md:pt-28">
        <div className="mx-auto grid max-w-6xl gap-12 md:grid-cols-[1.05fr_0.95fr] md:items-center">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.22em] text-[#4CAF6E]">
              OpenClaw Google Ads plugin
            </p>
            <h1 className="font-display mt-4 text-4xl font-bold leading-tight tracking-tight md:text-5xl">
              Run Google Ads diagnostics from OpenClaw.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-relaxed text-[#C4C0B6]">
              Install NotFair in OpenClaw to audit campaigns, find wasted spend,
              review search terms, draft fixes, and approve Google Ads changes
              without switching into the Google Ads dashboard.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/connect"
                className="inline-flex items-center justify-center gap-2 rounded-md bg-[#4CAF6E] px-5 py-3 text-sm font-semibold text-[#10100E] transition hover:bg-[#5DBE7D]"
              >
                Connect Google Ads
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/google-ads-mcp"
                className="inline-flex items-center justify-center rounded-md border border-[#3D3C36] px-5 py-3 text-sm font-semibold text-[#E8E4DD] transition hover:border-[#4CAF6E]"
              >
                See MCP server
              </Link>
            </div>
          </div>

          <div className="rounded-lg border border-[#3D3C36] bg-[#24231F] p-5">
            <div className="mb-4 flex items-center gap-2 border-b border-[#3D3C36] pb-3">
              <Terminal className="h-4 w-4 text-[#4CAF6E]" />
              <span className="font-mono text-xs text-[#C4C0B6]">install</span>
            </div>
            <pre className="overflow-x-auto rounded-md bg-[#11100E] p-4 text-sm leading-7 text-[#E8E4DD]">
              {"openclaw plugins install clawhub:openclaw-notfair\nopenclaw plugins enable openclaw-notfair\nopenclaw notfair setup"}
            </pre>
            <p className="mt-4 text-sm leading-relaxed text-[#C4C0B6]">
              The plugin defaults to {MCP_SERVER_URL}. It stores OpenClaw plugin
              config locally and authenticates through NotFair OAuth.
            </p>
          </div>
        </div>
      </section>

      <section className="border-t border-[#3D3C36] px-4 py-20">
        <div className="mx-auto max-w-6xl">
          <div className="mb-10 max-w-2xl">
            <p className="text-sm font-medium uppercase tracking-[0.22em] text-[#4CAF6E]">
              What OpenClaw can do
            </p>
            <h2 className="font-display mt-3 text-3xl font-semibold tracking-tight">
              Live Google Ads work, with guardrails.
            </h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {capabilities.map(({ icon: Icon, title, body }) => (
              <div key={title} className="rounded-lg border border-[#3D3C36] bg-[#24231F] p-6">
                <div className="mb-4 flex h-9 w-9 items-center justify-center rounded border border-[#3D3C36] bg-[#2E2D28]">
                  <Icon className="h-4 w-4 text-[#4CAF6E]" />
                </div>
                <h3 className="text-base font-semibold">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-[#C4C0B6]">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-[#3D3C36] px-4 py-20">
        <div className="mx-auto max-w-4xl">
          <h2 className="font-display text-3xl font-semibold tracking-tight">
            OpenClaw tools
          </h2>
          <div className="mt-6 overflow-hidden rounded-lg border border-[#3D3C36]">
            {[
              ["notfair_list_connected_accounts", "List connected Google Ads accounts."],
              ["notfair_run_script", "Run read-only Google Ads analysis scripts."],
              ["notfair_google_ads_tool", "Call any NotFair Google Ads MCP tool by name."],
              ["notfair_connect", "Show setup instructions before authentication."],
            ].map(([name, description]) => (
              <div key={name} className="grid gap-2 border-b border-[#3D3C36] bg-[#24231F] p-4 last:border-b-0 md:grid-cols-[260px_1fr]">
                <code className="text-sm text-[#4CAF6E]">{name}</code>
                <p className="text-sm text-[#C4C0B6]">{description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
