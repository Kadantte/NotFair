# SEO/AEO matrix — first slice report

Built to match Adspirer's structural pattern (AI client × ad platform integrations + comparison content + use-case pages + machine-readable index). Emulates structure and intent coverage, not copy. All content is original.

## URL matrix shipped

### Integrations hub (AI client × Google Ads)

| URL                                          | Status      | Primary keyword                    | Secondary keywords                                              |
|----------------------------------------------|-------------|-------------------------------------|------------------------------------------------------------------|
| `/integrations`                              | new (hub)   | Google Ads MCP integrations         | AI client Google Ads, Google Ads connector matrix               |
| `/integrations/chatgpt-google-ads`           | new         | ChatGPT Google Ads                  | ChatGPT Google Ads automation, ChatGPT MCP Google Ads           |
| `/integrations/claude-code-google-ads`       | new         | Claude Code Google Ads              | Claude Code MCP Google Ads, Claude Code ads agent               |
| `/integrations/codex-google-ads`             | new         | Codex Google Ads                    | Codex CLI Google Ads, OpenAI Codex MCP Google Ads               |
| `/integrations/cursor-google-ads`            | new         | Cursor Google Ads                   | Cursor MCP Google Ads, ads MCP for Cursor                       |
| `/integrations/windsurf-google-ads`          | new         | Windsurf Google Ads                 | Windsurf Cascade Google Ads                                     |
| `/integrations/gemini-cli-google-ads`        | new         | Gemini CLI Google Ads               | Google Ads Gemini, Gemini MCP Google Ads                        |
| `/integrations/openclaw-google-ads`          | new         | OpenClaw Google Ads                 | OpenClaw MCP Google Ads, open-source ads agent                  |

Existing canonical pages preserved (no duplication):

- `/google-ads-claude` (Claude Desktop / Web / Cowork) — hub links to it for Claude intent
- `/google-ads-codex` — hub links to it for Codex CLI broad-intent (alongside new `/integrations/codex-google-ads` which targets the matrix variant)

### Comparison / objection content

| URL                                            | Primary keyword                          | Intent                                        |
|------------------------------------------------|-------------------------------------------|------------------------------------------------|
| `/compare`                                     | NotFair comparison                        | hub                                            |
| `/compare/google-ads-scripts`                  | Google Ads scripts alternative            | "scripts vs AI agent"                          |
| `/compare/google-ads-native-automation`        | Performance Max alternative               | "Performance Max / Smart Bidding alternative"  |
| `/compare/google-ads-dashboard`                | Google Ads dashboard alternative          | "Google Ads dashboard vs AI agent"             |
| `/compare/google-ads-agencies`                 | Google Ads agency alternative             | "in-house + AI vs agency retainer"             |
| `/compare/best-ai-tools-google-ads`            | best AI tools for Google Ads              | landscape / 2026 round-up                      |

### Use-case / pain content

| URL                                            | Primary keyword                            | Intent                                       |
|------------------------------------------------|---------------------------------------------|-----------------------------------------------|
| `/use-cases`                                   | Google Ads AI use cases                     | hub                                           |
| `/use-cases/google-ads-wasted-spend`           | Google Ads wasted spend AI                  | diagnosis workflow                            |
| `/use-cases/google-ads-negative-keywords`      | Google Ads negative keyword automation      | automation workflow                           |
| `/use-cases/google-ads-policy-errors`          | Google Ads policy error fixer               | disapproval triage                            |
| `/use-cases/google-ads-conversion-audit`       | Google Ads conversion tracking audit AI     | tracking integrity                            |
| `/use-cases/google-ads-search-terms`           | weekly Google Ads search term review        | recurring hygiene                             |
| `/use-cases/google-ads-cross-platform-roas`    | cross-platform ROAS comparison              | multi-platform synthesis                      |

### Machine-readable surfaces

- `/llms.txt` — text/plain summary for AI crawlers (LLM-readable inventory of product, integrations, comparisons, use-cases, key concepts, setup, and sitemap pointer)
- `/sitemap.xml` — all new routes added with priority 0.8 (matches SEO landing tier)

## Internal-linking design

Each new page links along three axes so a crawler reaches everything from any entry point:

**Integration page (e.g. `/integrations/chatgpt-google-ads`) → links to:**
- `/connect` (primary CTA)
- 3 sibling integrations via `relatedSlugs` (the "related integrations" section)
- `/integrations` (back to hub from sibling section context)

**Integrations hub (`/integrations`) → links to:**
- All 8 client pages (5 new + Claude + Codex on existing pages + Claude Code on new page)
- `/connect`, `/google-ads-mcp` (CTAs)

**Compare page (e.g. `/compare/google-ads-scripts`) → links to:**
- `/connect` (primary CTA)
- `/integrations` (secondary CTA)
- 1 sibling compare page + 1 use-case + integrations hub (related section)

**Use-case page (e.g. `/use-cases/google-ads-wasted-spend`) → links to:**
- `/connect` (primary CTA)
- `/integrations` (secondary CTA)
- 2 sibling use-cases + integrations hub (related section)

**Hub-of-hubs path:**
`/llms.txt` lists all four hubs (`/`, `/integrations`, `/compare`, `/use-cases`) plus every leaf URL → AI crawlers (Perplexity, ChatGPT browse, Claude search) get the full inventory in one fetch.

## Implementation pattern (reuse)

Three typed registries drive everything:

- `lib/integrations.ts` — `IntegrationContent[]` + `IntegrationHubEntry[]`
- `lib/long-form-pages.ts` — `LongFormContent[]` for both compare and use-case pages

Three pages render from registries:

- `app/(marketing)/integrations/[slug]/page.tsx` → `components/marketing/integration-page.tsx`
- `app/(marketing)/compare/[slug]/page.tsx` → `components/marketing/long-form-page.tsx`
- `app/(marketing)/use-cases/[slug]/page.tsx` → `components/marketing/long-form-page.tsx`

Adding a new integration or comparison is one entry in the registry — no new React, no new route handler.

## JSON-LD coverage

Every new page emits structured data:

- All integration pages: `FAQPage` + `HowTo` (setup steps) + `SoftwareApplication`
- All compare/use-case pages: `FAQPage` + `Article`
- Hubs: `CollectionPage` with `hasPart` enumeration

All JSON-LD is rendered via `safeJsonLd` (escapes `</`, U+2028/2029) — XSS-safe.

## Metadata coverage

Every new page has full metadata via `buildMetadata`:

- Title, description, keywords, canonical URL, OpenGraph, Twitter card, robots.

No `noindex` — all new pages are indexable.

## Acceptance criteria check

| Criterion                                                | Status                                                                 |
|----------------------------------------------------------|------------------------------------------------------------------------|
| No thin duplicate pages — each has a specific JTBD angle | ✅ Each integration page has setup snippet + capabilities + workflows + why-NotFair specific to that client. Each compare/use-case has unique scope. |
| Every page has a clear CTA into NotFair signup/demo      | ✅ Primary CTA `/connect` on every page. Integration pages also link from hub.            |
| Pages are crawlable without JS-only content              | ✅ Server-rendered Next.js App Router pages; static prerender via `generateStaticParams`. |
| Build/typecheck before handing back                      | ✅ `pnpm typecheck` clean; `pnpm build` succeeded; new pages appear in the build manifest. |

## Files added / changed

Added:

- `lib/integrations.ts`
- `lib/long-form-pages.ts`
- `components/marketing/integration-page.tsx`
- `components/marketing/long-form-page.tsx`
- `app/(marketing)/integrations/page.tsx`
- `app/(marketing)/integrations/[slug]/page.tsx`
- `app/(marketing)/compare/page.tsx`
- `app/(marketing)/compare/[slug]/page.tsx`
- `app/(marketing)/use-cases/page.tsx`
- `app/(marketing)/use-cases/[slug]/page.tsx`
- `app/llms.txt/route.ts`
- `docs/seo-matrix-report.md` (this file)

Changed:

- `app/sitemap.ts` — added all new routes, marked as SEO-landing priority.

## Follow-up suggestions (deferred)

These are out of scope for this slice but worth queueing:

1. **Migrate `/google-ads-claude` and `/google-ads-codex`** into the integrations registry pattern so all client pages share one template. Currently they're bespoke React components with custom hero/setup variations. Migrating would unlock A/B copy iteration and remove ~3 bespoke files.
2. **Long-form blog posts mirroring `/compare/*` and `/use-cases/*`** — Adspirer ships long-form blog posts (e.g. `/blog/best-ad-mcp-servers-2026`) alongside the page matrix. The compare/use-case pages cover the search intent; blog posts add link-bait surface.
3. **Add `/integrations` link to homepage hero and footer** — currently relies on sitemap discovery + cross-page linking. A direct nav link would compound internal authority. Skipped here to avoid touching the i18n translation files for the footer.
4. **Meta Ads matrix mirroring Google Ads** — `/integrations/<client>-meta-ads` once Meta beta stabilizes. Schema and template already support this — just add registry entries.
5. **Add a "Pick your client" matrix table to `/integrations` hub** — a vertical table comparing the supported set (read tools, write tools, schedulable, plan mode, subagents) would help operators choose. Skipped because the per-page detail already covers this; add if hub engagement metrics warrant it.
