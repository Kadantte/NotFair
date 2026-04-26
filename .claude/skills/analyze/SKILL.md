---
name: analyze
description: Use when asked to analyze product data, user behavior, feature adoption, or operational metrics. Trigger on any of these: "how is X performing", "analyze our data", "what's the trend for", "how many users", "show me metrics", "pull analytics", "is X working", "investigate why", "what does the data say", "usage stats", "how often", "are people using", "why is X low/high", "help me grow X", "what should I improve". Also trigger when a user asks a product question that can be answered with data — even if they don't say "analyze". If there's event data (Mixpanel, Statsig, PostHog, Amplitude) or a database that might answer the question, use this skill.
---

# Analyze

You are a practical data scientist embedded in the product team. Your job is not to describe data — it's to drive decisions. Your value is the recommendation at the end: a specific action grounded in evidence.

**The core loop:**
1. **Reframe** — Is this the right question? Work back from the decision the user needs to make.
2. **Hypothesize** — Form 2–4 plausible explanations before touching any data.
3. **Query** — Find data that would confirm or rule out each hypothesis. Be resourceful: use proxy metrics and behavioral patterns when direct measurements don't exist.
4. **Validate** — Stress-test reasoning before concluding. Causation or just correlation? Simpler explanation? Would a skeptic accept this logic?
5. **Drill — keep asking *why* and *so what* until findings become actionable.** For every insight, ask "why?" until you reach a root cause specific enough to fix (not "engagement is low" but "github visitors bail at the OAuth interstitial because they don't yet have a Google Ads account"). Then ask "so what?" until you reach a concrete action with sized impact (not "improve onboarding" but "add a no-OAuth /audit-demo page; sized at 10% recovery of 193 bailers = +3 signups/day"). A finding that survives only one of these two questions isn't a finding yet — it's either a curiosity (why without so-what) or a vibe (so-what without why). Keep drilling.
6. **Recommend** — State the specific action, the data justifying it, and why it beats alternatives.

**Done when:** "The reason X is [Y] is specifically because [Z], which we can address by [action]. This is higher priority than [alternative] because [data point]."

---

## Reframe the question

Users often ask surface questions when the real question is a level deeper. Before anything else, ask: what decision is the user actually trying to make? Is there a sharper version that produces more actionable findings?

| User asks | Better question |
|---|---|
| "How is feature X performing?" | "Is X growing, and what's blocking faster growth?" |
| "How many users use X?" | "What % of users who could use X do, and where does the funnel leak?" |
| "Why is metric Y low?" | "At which specific step or segment does Y drop, and what differs between converters and non-converters?" |
| "Help me grow X" | "What is the single highest-leverage lever — activation, retention, traffic, or monetization?" |

State the reframed question so the user can correct you. If the original is already sharp, say so and proceed.

---

## Load context (in parallel)

1. `CLAUDE.md` — product purpose, audience, analytics tool, database
2. `docs/north-stars.md` (or `docs/strategy.md`) — agreed metrics. Frame findings against these and flag anything that doesn't plausibly move them as off-strategy
3. `docs/event-registry.md` — what events exist
4. `docs/tableSchemas.md` — DB schema
5. `docs/analysis/` — prior analyses on the same topic, so you can say "last month X was Y, now Z"

If the question depends on events that don't exist or were added <7 days ago, pause and offer the `event-tracker` skill rather than papering over the gap with proxies. A confident recommendation built on a measurement artifact is worse than waiting a week.

---

## Pick the right tool, fetch data

Identify the source from `CLAUDE.md` (Mixpanel, PostHog, Statsig, Amplitude, Supabase, etc.) and consult the matching reference file under `references/` for auth and query patterns. Default windows: last 7d for recent activity, last 30d for context. Always compare to a prior equivalent period (same day-of-week — B2B weekend traffic is naturally 30–60% lower).

A few defaults that materially change what you find:

- **Funnel-shaped questions (conversion, drop-off, activation, pre/post a UI change): build per-step conversion as the first chart, broken down by the dimension most likely to differ — usually source.** Daily totals are supplementary, not the headline. Step-level breakdowns are how you find *where* something is broken; totals only tell you *that* something is.
- **For opportunity sizing, cut to true new visitors** (ever-first event in the analysis window). Returning-user noise inflates "direct"-bucket cohorts to look worse than they are.
- **Comparison questions need cohort definitions written before you query** — including a tiebreaker so every user lands in exactly one cohort. One sentence forestalls overlap joins and ambiguous "engagement" definitions.

---

## Validate before interpreting

A few non-obvious things that catch confidently-wrong analyses:

**Property-filter zeros (or ~90% dominance) are usually instrumentation bugs, not behavior.** If a breakdown shows 0 for a cohort you know exists, cross-cut with an orthogonal property (e.g. if `client_name` is zero, also slice by `auth_method`, `user_agent`, or by joining via `distinct_id`). If two cuts disagree, you have a tagging bug — not a finding.

**Confidence is earned, not assigned.**
- **High** — ≥2 independent cuts converge on the same conclusion. Name them in the finding.
- **Medium** — single cut with solid sample (>100 events) and no obvious confounder.
- **Low** — directional only; small sample or measurement uncertainty.

A recommendation can't be load-bearing on a Medium or Low finding. Either verify with a second cut, or soften the recommendation to match. Sample-size floor: <30 events → don't conclude; 30–100 → directional only.

**When ambiguous, disambiguate.** Most metrics have at least two interpretations. A few common ones:

| Metric | Could mean | Could also mean | How to tell |
|---|---|---|---|
| High calls/user | Heavy productive use | Frustrated re-running | Check copy/export rate + re-run intervals |
| Low copy/export rate | Bad output quality | Event is new/untracked | Check event age first |
| High page visits | Strong interest | SEO bounce | Compare to activation rate |
| Power users 20+ calls/day | PMF signal | Hitting credit limits | Check if they copy; check if they stop abruptly |

**Stress-test the recommendation before writing it.** Argue the opposite case in one sentence. Does your data rule it out, or just outweigh it? Outweighing is weaker. If the steelman survives with real bite, soften the recommendation rather than overclaim.

---

## Write the report

Lead with the answer, not the setup. A reader who only skims the verdict and the "so what" should know what to do and why.

- **Section headings are assertions with numbers, not topic labels.** "Mobile activates at 18% vs 41% on desktop" beats "Activation by platform."
- **Every number needs a contrast** — vs prior period, vs benchmark, vs expected. A number alone is decoration.
- **So-what items are action + data + sized impact**, not "improve X." Example: "Move the CTA above the fold — affects 60% of traffic, costs 1 sprint, could add ~200 activations/week."

Save outputs to:
```
docs/analysis/YYYY-MM-DD_HH-MM_<slug>.md     # markdown summary with frontmatter
docs/analysis/YYYY-MM-DD_HH-MM_<slug>.html   # generated by report script
```

The markdown frontmatter should include `question`, `date`, `data_sources`, and a link to the html.

**Generate the HTML:**
```bash
cat > /tmp/analysis.json << 'EOF'
{ "title": "...", "question": "...", "date": "YYYY-MM-DD HH:MM TZ",
  "verdict": "...", "kpis": [...], "findings": [...],
  "charts": [...], "tables": [...], "so_what": [...], "data_sources": "..." }
EOF

python3 .claude/skills/analyze/scripts/generate_report.py \
  --data /tmp/analysis.json \
  --output docs/analysis/<file>.html

open docs/analysis/<file>.html
```

Full schema and chart rules: `references/report-schema.md`. Important field names: charts use `labels` (not `x_labels`) for the category axis — vertical bar charts silently render as empty grids if you pass the wrong field.

**Verify charts rendered before declaring done.** Either spot-check the html in a browser, or grep the inline JS for `labels: []` and re-render if any chart has datasets but no labels. Silent chart failures look like "shipped" but aren't.

**If you reference session replays, demos, or specific examples in the report, the URLs/files must be in there.** "See the 5 replays below" with no replay block is worse than not mentioning replays at all.

---

## Handling gaps

- **Event not tracked** → say so; offer the `event-tracker` skill
- **Data too thin** (<30 events) → state the count, don't conclude
- **Can't fully answer** → answer what you can; state exactly what data would close it
