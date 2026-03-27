# Toprank

**Open-source Claude Code skills for SEO and SEM.**

Toprank is a collection of AI agent skills that give you the leverage of a search marketing expert — pulling real data from Google Search Console, auditing technical SEO, finding quick wins, and diagnosing traffic drops. Works inside Claude Code with no extra tooling beyond a `gcloud` install.

---

## Skills

### [`seo-analysis`](skills/seo-analysis/) — SEO Audit & Search Console Analysis

A full SEO audit in one command. Connects to Google Search Console, auto-detects your site, and produces a prioritized action plan.

**What it does:**
- Guides you through GSC API setup if needed (one `gcloud` command)
- Auto-detects your site URL if you're inside a website repo
- Pulls 90 days of query/page performance data
- Surfaces **quick wins**: position 4–10 queries, high-impression low-CTR pages
- Flags **traffic drops** with period-over-period comparison
- **Technical audit**: indexability, meta tags, headings, structured data, canonical URLs
- Outputs a structured report with a 30-day action plan

**How to trigger:**
> "analyze my SEO", "SEO audit", "why is my traffic down", "what keywords am I ranking for", "check my search console", "improve my rankings", "technical SEO audit"

---

## Installation

**Install a single skill:**
```bash
cp -r skills/seo-analysis ~/.claude/skills/
```

**Install all skills:**
```bash
cp -r skills/* ~/.claude/skills/
```

Restart Claude Code and the skills are available immediately.

## Requirements

- [Claude Code](https://claude.ai/code) CLI
- Python 3.8+
- `gcloud` CLI for Google Search Console skills — `brew install google-cloud-sdk`

---

## How Skills Work

Each skill is a `SKILL.md` file that Claude Code loads as an instruction set. Claude reads the skill and follows its workflow — calling scripts, crawling pages, querying APIs — to produce a structured output.

Skills live in `~/.claude/skills/` and are discovered automatically. No configuration needed.

```
skills/
└── seo-analysis/
    ├── SKILL.md          ← workflow instructions Claude follows
    ├── scripts/          ← Python scripts for API calls and data processing
    └── references/       ← guides and docs loaded as needed
```

---

## Contributing

Contributions are very welcome. If you've built a skill that helps with SEO, SEM, content strategy, or search analytics — open a PR.

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

**Ideas for new skills:**
- `keyword-research` — find keyword gaps from GSC data + competitor analysis
- `gsc-monitor` — daily/weekly GSC health check with alerts
- `technical-seo-fix` — audit + auto-fix common technical issues in a Next.js/Astro repo
- `sem-audit` — Google Ads quality score analysis and bid recommendations
- `content-gap` — find queries you rank 11–30 for and generate content briefs

---

## License

[MIT](LICENSE)
