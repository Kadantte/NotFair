import { notFound } from "next/navigation";
import { GoHighLevelMcpPage } from "@/components/marketing/gohighlevel-mcp-page";
import { buildMetadata, buildFaqJsonLd } from "@/lib/seo";
import { checkGhlDevAccess } from "@/lib/gohighlevel/dev-gate";

export const metadata = buildMetadata({
  title: "GoHighLevel MCP Server — Connect Claude or Codex to Your HighLevel CRM",
  description:
    "NotFair's remote MCP server for GoHighLevel. Read-only typed tools over CRM records, calendars, custom fields, forms, workflows, invoices, payments, and products. OAuth 2.0 for Claude.ai connectors, bearer-token PATs for CLI clients.",
  path: "/gohighlevel-mcp",
  // Belt-and-suspenders: dev-only surface, see the connector setup guide
  // page for the full rationale. `noindex` so any leaked link doesn't get
  // indexed even if the gate is later relaxed.
  index: false,
  keywords: [
    "gohighlevel mcp",
    "gohighlevel mcp server",
    "highlevel mcp",
    "ghl mcp",
    "model context protocol gohighlevel",
    "claude gohighlevel",
    "codex gohighlevel",
    "highlevel api ai",
    "notfair gohighlevel",
  ],
});

const faqItems = [
  {
    question: "What is the NotFair GoHighLevel MCP server?",
    answer:
      "It's a remote MCP server at https://www.notfair.co/api/mcp/gohighlevel that exposes your HighLevel CRM as a typed tool surface for AI agents. Claude Desktop, Claude.ai Web, Claude Cowork, Claude Code, and Codex can all connect to it; tools are read-only in the current release.",
  },
  {
    question: "How does authentication work?",
    answer:
      "Two paths. Claude.ai's Add custom connector flow uses OAuth 2.0 with PKCE — no Client ID or Secret to copy. CLI clients use a personal access token (PAT) you mint from the connect page. Tokens are scoped to a single HighLevel connection (Company or Location) and are revocable.",
  },
];

const jsonLd = [
  buildFaqJsonLd(faqItems),
];

export default async function Page() {
  // Dev-only surface — 404 for non-dev viewers. See
  // `lib/gohighlevel/dev-gate.ts` for the policy and rationale.
  const access = await checkGhlDevAccess();
  if (!access.allowed) notFound();

  return (
    <>
      {jsonLd.map((schema, i) => (
        <script
          key={i}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
        />
      ))}
      <GoHighLevelMcpPage />
    </>
  );
}
