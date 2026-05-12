# NotFair

NotFair is a Next.js app for connecting Google Ads and Meta Ads accounts to AI agents through MCP. The app includes the marketing site, OAuth/connect flows, account-management UI, MCP server routes, developer dashboards, and shared tooling for campaign reads and writes.

## Getting Started

Use pnpm for all local commands. The repo enforces this in `preinstall`.

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

Useful commands:

```bash
pnpm lint
pnpm test
pnpm test:live
pnpm build
pnpm db:generate
pnpm db:migrate
```

## Blog (Outrank integration)

The `/blog` route renders hand-curated posts from `lib/blog-posts.ts` and AI-generated articles from the [Outrank](https://outrank.so) Next.js Blog integration. Curated slugs win when they collide with Outrank slugs.

To enable Outrank articles, add a server-only API key to `.env.local`:

```env
OUTRANK_BLOG_API_KEY=your_outrank_blog_api_key
```

Get the key from the Outrank dashboard → Integrations → Next.js Blog. Never expose it with a `NEXT_PUBLIC_` prefix.

Without the key, `/blog` still renders curated posts; Outrank fetches return empty lists.

Submit `https://www.notfair.co/blog/sitemap.xml` to Google Search Console — it includes both curated posts and Outrank articles.

## Internationalization

The app uses `next-intl` with these locales:

- `en` - English
- `fr` - French
- `de` - German
- `th` - Thai
- `pt-BR` - Brazilian Portuguese
- `es` - Spanish
- `ru` - Russian

Translation messages live in `messages/*.json`. Locale configuration lives in `i18n/locales.ts`, `i18n/routing.ts`, and `i18n/request.ts`.

Localized home pages are available at `/fr`, `/de`, `/th`, `/pt-BR`, `/es`, and `/ru`. Non-home public pages and app routes stay on canonical paths while the proxy preserves the user's locale preference in the `NEXT_LOCALE` cookie.

## Documentation

- [AGENTS.md](AGENTS.md) - repository instructions for coding agents.
- [CLAUDE.md](CLAUDE.md) - project-specific agent conventions, frontend performance rules, and deploy configuration.
- [CHANGELOG.md](CHANGELOG.md) - release history.
- [DESIGN.md](DESIGN.md) - visual system and product aesthetic.
- [TODOS.md](TODOS.md) - deferred work and follow-ups.
- [docs/anthropic-review.md](docs/anthropic-review.md) - Anthropic MCP review credentials and setup copy.
- [docs/data-request-policy.md](docs/data-request-policy.md) - operational data request policy.
- [docs/event-registry.md](docs/event-registry.md) - analytics event registry.
- [docs/mcp-10x-redesign-prompt.md](docs/mcp-10x-redesign-prompt.md) - MCP dashboard redesign execution prompt.
- [docs/meta-app-review.md](docs/meta-app-review.md) - Meta App Review submission copy.
- [docs/meta-marketing-api-setup.md](docs/meta-marketing-api-setup.md) - Meta Marketing API setup guide.
- [docs/multi-platform-mcp-design.md](docs/multi-platform-mcp-design.md) - multi-platform MCP architecture.
- [docs/north-stars.md](docs/north-stars.md) - Weekly Active Writers and D0 Write Users metric definitions.

## Deploy on Vercel

Production deploys automatically from `main` through Vercel Git integration.

Production URL: [https://www.notfair.co](https://www.notfair.co)

Health check: [https://www.notfair.co/api/health](https://www.notfair.co/api/health)
