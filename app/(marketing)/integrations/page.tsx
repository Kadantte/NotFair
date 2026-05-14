import Link from "next/link";
import { SUPPORT_EMAIL } from "@/lib/brand";
import { buildCollectionPageJsonLd, buildMetadata, safeJsonLd } from "@/lib/seo";
import {
  INTEGRATION_STATUS_LABEL,
  INTEGRATION_STATUS_TONE,
  integrationHubEntries,
} from "@/lib/integrations";

export const metadata = buildMetadata({
  title: "Google Ads × AI client integrations | NotFair",
  description:
    "NotFair connects Google Ads to every major AI client through MCP — Claude, Claude Code, ChatGPT, Codex, Cursor, Windsurf, Gemini CLI, and OpenClaw. Pick your client and ship.",
  path: "/integrations",
  keywords: [
    "Google Ads MCP integrations",
    "AI client Google Ads",
    "Claude Google Ads",
    "ChatGPT Google Ads",
    "Cursor Google Ads",
    "Codex Google Ads",
    "Windsurf Google Ads",
    "Gemini Google Ads",
    "OpenClaw Google Ads",
  ],
});

const collectionJsonLd = buildCollectionPageJsonLd({
  path: "/integrations",
  name: "NotFair × AI client integrations",
  items: integrationHubEntries.map((entry) => ({
    name: `${entry.client} + Google Ads`,
    path: entry.href,
    description: entry.blurb,
  })),
});

export default function IntegrationsHub() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(collectionJsonLd) }}
      />
      <section className="px-4 pb-16 pt-24">
        <div className="container mx-auto max-w-5xl">
          <div className="max-w-3xl">
            <p className="text-sm font-medium uppercase tracking-[0.22em] text-[#4CAF6E]">
              Integrations · Google Ads
            </p>
            <h1 className="mt-4 text-4xl font-semibold tracking-tight text-[#E8E4DD] md:text-6xl">
              Connect Google Ads to the AI client you already use
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-relaxed text-[#C4C0B6]">
              NotFair is the Google Ads tool layer for every major MCP-compatible AI
              client. Pick your client, follow the two-minute setup, and turn your
              agent into a Google Ads operator with approval-gated writes.
            </p>
          </div>
        </div>
      </section>

      <section className="px-4 pb-20">
        <div className="container mx-auto max-w-5xl">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {integrationHubEntries.map((entry) => (
              <Link
                key={entry.href}
                href={entry.href}
                className="group rounded-3xl border border-[#3D3C36] bg-[#24231F] p-6 transition-colors hover:border-[#4CAF6E]/60"
              >
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-xl font-semibold text-[#E8E4DD]">
                    {entry.client} + Google Ads
                  </h2>
                  <span
                    className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider ${INTEGRATION_STATUS_TONE[entry.status]}`}
                  >
                    {INTEGRATION_STATUS_LABEL[entry.status]}
                  </span>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-[#C4C0B6]">
                  {entry.blurb}
                </p>
                {entry.badge ? (
                  <p className="mt-4 text-xs font-medium uppercase tracking-wider text-[#4CAF6E]">
                    {entry.badge}
                  </p>
                ) : null}
                <p className="mt-4 text-sm font-medium text-[#E8E4DD] underline underline-offset-4 transition-colors group-hover:text-[#4CAF6E]">
                  See setup
                </p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 pb-24">
        <div className="container mx-auto max-w-5xl">
          <div className="rounded-3xl border border-[#3D3C36] bg-[#201F1B] p-8 md:p-10">
            <h2 className="text-2xl font-semibold text-[#E8E4DD]">
              Don&apos;t see your client?
            </h2>
            <p className="mt-3 max-w-2xl text-base leading-relaxed text-[#C4C0B6]">
              If your client speaks MCP, NotFair works with it. Use the generic
              MCP setup snippet on the connect page, or email{" "}
              <a
                className="text-[#E8E4DD] underline underline-offset-4 hover:text-[#4CAF6E]"
                href={`mailto:${SUPPORT_EMAIL}`}
              >
                {SUPPORT_EMAIL}
              </a>{" "}
              and we&apos;ll help you wire it up.
            </p>
            <div className="mt-6 flex flex-wrap gap-4">
              <Link
                href="/connect"
                className="rounded-full bg-[#4CAF6E] px-5 py-2.5 text-sm font-medium text-[#1A1917] transition-colors hover:bg-[#3D9A5C]"
              >
                Connect Google Ads
              </Link>
              <Link
                href="/google-ads-mcp"
                className="rounded-full border border-[#3D3C36] px-5 py-2.5 text-sm font-medium text-[#E8E4DD] transition-colors hover:border-[#4CAF6E]/60"
              >
                What is the Google Ads MCP server?
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
