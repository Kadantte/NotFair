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
5. **Recommend** — State the specific action, the data justifying it, and why it beats alternatives.

**Done when:** "The reason X is [Y] is specifically because [Z], which we can address by [action]. This is higher priority than [alternative] because [data point]."

---

## Step 0: Reframe the question

Before anything else, assess whether the user's question is the right one to answer. Users often ask surface questions when the real question is a level deeper.

Ask yourself: What decision is the user actually trying to make? Is there a sharper version of this question that produces more actionable findings?

**Common reframes:**

| User asks | Better question |
|---|---|
| "How is feature X performing?" | "Is X growing, and what's blocking faster growth?" |
| "How many users use X?" | "What % of users who could use X do, and where does the funnel leak?" |
| "Why is metric Y low?" | "At which specific step or segment does Y drop, and what differs between converters and non-converters?" |
| "Help me grow X" | "What is the single highest-leverage lever — activation, retention, traffic, or monetization?" |

State the reframed question(s) you'll answer and briefly explain why. If the original is already sharp, say so and proceed. Always show your reframe so the user can correct it.

---

## Step 1: Load context (parallel)

Read simultaneously:
1. **`CLAUDE.md`** — product purpose, features, audience, analytics tool, database
2. **`docs/event-registry.md`** — what events exist (if present)
3. **`docs/tableSchemas.md`** — database schema (if present)
4. **`docs/analysis/`** — prior analyses on the same topic (enables "last month X was Y, now it's Z")

---

## Step 2: Generate hypotheses and measurable queries

**First, enumerate 2–4 hypotheses** based on what you know about the product. Each hypothesis implies a different fix — identifying the right one is the entire value of the analysis.

> "Activation is low" → (a) visitors don't understand the feature, (b) CTA is below the fold on mobile, (c) input is intimidating, (d) SEO traffic has low intent. These require completely different interventions.

**Then map each hypothesis to a query** — what data would confirm or rule it out?

**Be resourceful:** You rarely have the perfect direct measurement.
- No time-on-page? → Use calls/user ratio and re-run rate as engagement proxies.
- No copy event? → Check share, export, or download events.
- No segment data? → Compare behavioral cohorts (paid vs. free, first session vs. returning).

**Growth questions always need a quality sub-question.** Before recommending acquisition or activation fixes, ask: do users keep the output? Quality problems and distribution problems look identical in top-line metrics.

---

## Step 3: Fetch data

**Pick the right source** (from CLAUDE.md): Mixpanel, Statsig, PostHog, Amplitude, Supabase, DynamoDB, etc.

### Mixpanel (primary tool for this project)

Always use the REST API directly — the MCP has unreliable project-level access. Full reference: `references/mixpanel-api.md`.

```bash
source <(grep -E '^MIXPANEL_' /Users/tongchen/Documents/Projects/docheroai/.env.local | sed 's/ *= */=/')
MP="$MIXPANEL_SERVICE_ACCOUNT_USERNAME:$MIXPANEL_SERVICE_ACCOUNT_SECRET"
PID="$MIXPANEL_PROJECT_ID"
```

**Key rules:**
- Use `on=properties%5B%22feature%22%5D` breakdowns instead of N separate per-value queries
- Fire up to 5 queries in parallel (`&` background processes, then `wait`)
- Always use the retry wrapper (`mp_query`) from `references/mixpanel-api.md`
- JQL: `event.time` is milliseconds — divide durations by `86400000`, not `86400`
- Events returning all zeros may be newly added — note this explicitly

### Other tools
- **Statsig:** `references/statsig-api.md` + `scripts/fetch_statsig.py`
- **PostHog:** `references/posthog-api.md` — use multi-event trend queries and breakdowns
- **Amplitude:** `references/amplitude-api.md` — rate limit: max 3 parallel, `sleep 2` between batches
- **Supabase:** `mcp__supabase__execute_sql` — targeted, date-filtered, aggregated queries only

**Default windows:** Last 7d for recent activity; last 30d for trend context; always compare to prior equivalent period.

---

## Step 3.5: Validate before interpreting

Before drawing any conclusions, ask: is this data actually trustworthy?

**Hierarchy of explanations** — work through these in order before calling something a real finding:
1. **Data quality** (most likely) — tracking bug, recently added event, instrumentation change
2. **Seasonality** — weekday/weekend pattern, holiday, month-length effect
3. **External factor** — marketing campaign, competitor launch, app store featuring
4. **Product change** — deploy, feature flag, A/B test
5. **Real behavioral shift** (rarest) — requires the strongest evidence

**Data quality checks (run automatically):**
- Any day showing <10% of average daily volume → flag as potential tracking outage
- Metric that jumps 3× overnight → almost certainly instrumentation, not behavior; check git history
- Events with fewer than 7 days of data → tag **[NEW EVENT — N days of data]** in every finding; exclude from verdict and So What
- Breakdown returning null/undefined/empty values → filter out before calculating percentages

**Ambiguous metrics — always disambiguate:**

| Metric | Could mean | Could also mean | How to tell |
|---|---|---|---|
| High calls/user | Heavy productive use | Frustrated re-running | Check copy/export rate + re-run intervals |
| Low copy/export rate | Bad output quality | Event is new/untracked | Check event age first |
| High page visits | Strong interest | SEO bounce | Compare to activation rate |
| Power users 20+ calls/day | PMF signal | Hitting credit limits | Check if they copy; check if they stop abruptly |

**Seasonality:** Compare same day-of-week to same day-of-week. B2B weekend traffic is 30–60% lower — not a drop. February naturally has fewer days than January.

**Confidence tags:**
- **High** — multiple independent data points converge
- **Medium** — data supports conclusion, alternative explanations exist
- **Low** — directional only; sample <100 or single data point
- **Data quality concern** — the number itself may not be reliable

**Sample size floor:** <30 events → don't conclude. 30–100 → directional only.

---

## Step 3.75: Investigate — choose depth

**Simple questions** (counting, trends, rankings) → **Path A**
**Investigative questions** (why did X drop?, is something broken?) → **Path B**
**Escalation:** If initial data shows >30% change, unexpected zero, or contradicting signals → escalate to Path B even if the question seemed simple.

### Path A: Inline Why Loop

For each significant finding:
1. State the finding with a number and comparison
2. Ask Why — form a specific hypothesis
3. Identify which query or investigation would test it
4. Run it
5. Got a causal answer? Record and move on. No? Form a new hypothesis and repeat.

### Path B: Parallel Hypothesis Investigation

Spawn 3 agents simultaneously. Read `references/investigation-agents.md` for the full prompts.

**Before spawning, write a shared investigation brief:**
```
Question / Product / Analytics tool / Credentials / Project ID /
Initial data (what's surprising) / Time window / Known events / Codebase path
```

**The 3 agents:**
- **Agent 1 — Data Quality:** tracking gaps, overnight discontinuities, git history, property cardinality, event age
- **Agent 2 — Seasonality:** prior 4 equivalent periods, holiday effects, weekday/weekend pattern, cyclicality
- **Agent 3 — Product Changes:** git log, UI changes, feature flags, A/B tests, marketing changes

Apply synthesis hierarchy: data quality → seasonality → product changes → real shift. Then spawn the skeptic from `references/skeptic-agent.md` to challenge your conclusions.

### Investigation methods reference

| What you want to know | How |
|---|---|
| Where did traffic stop coming from? | Breakdown by `source`, `referrer`, `utm_source` |
| New vs. returning drop? | Breakdown by `user_type` |
| What does the user see here? | `/browse` the live page on mobile + desktop |
| Funnel shape? | Query each step (view → interact → complete) as unique users |
| Specific segment problem? | Breakdown by platform, country, device, plan |
| Recent product change? | `git log` + read relevant component |
| Why stop at this step? | Look at the UI — hidden, below fold, unclear? |
| Quality signal? | Check copy/save/export rate; check re-run intervals |

---

## Step 4: Write the report

Lead with the answer — not the setup. A reader who skims only the verdict and So What should understand what to do and why.

**Storytelling checklist:**
1. **Governing thought first** — one sentence: "[Subject] should [action] because [data-backed reason]." If you're tempted to write a title instead of a sentence, rewrite it.
2. **Situation → Complication → Resolution** — shared ground → what's wrong → your recommendation. The complication creates the tension that makes the resolution land.
3. **Sections are assertions, not topics** — "Mobile activates at half the rate of desktop — 18% vs 41%" not "Activation by platform." If your heading is a noun phrase, add a verb and a number.
4. **Every number needs a contrast** — vs. prior period, vs. benchmark, vs. expected. A number alone is decoration.
5. **Quantify everything** — never "significant", "substantial", "notable" — replace with the actual number.
6. **So What = action + data + impact** — "Improve mobile" fails. "Move the CTA above the fold — affects 60% of traffic, costs 1 sprint, could add ~200 activations/week" passes.

**Report template:**
```markdown
## [Governing thought — cause + action in one sentence]

**Data quality notes:** [Only if tracking issues materially affect interpretation. Omit if clean.]

**Findings:**
- [Assertion] — [number vs. prior/benchmark] — because [cause] **(Confidence: High/Medium/Low)**

**So what:**
1. [Specific action] — because [data] — expected impact: [quantified]
2. [Second action, lower priority because...]

**Data sources:** [Tool: event_name, last Nd]
```

---

## Step 5: Generate the HTML report

```bash
cat > /tmp/analysis.json << 'EOF'
{ "title": "...", "question": "...", "date": "YYYY-MM-DD HH:MM TZ",
  "verdict": "...", "kpis": [...], "findings": [...],
  "charts": [...], "tables": [...], "so_what": [...], "data_sources": "..." }
EOF

python3 /Users/tongchen/.claude/skills/analyze/scripts/generate_report.py \
  --data /tmp/analysis.json \
  --output docs/analysis/YYYY-MM-DD_HH-MM_<slug>.html

open docs/analysis/YYYY-MM-DD_HH-MM_<slug>.html
```

Full schema and examples: `references/report-schema.md`.

**Chart rules:**
- Titles are assertions ("Tuesday spike drove 35% of volume") not topic labels ("Daily uploads")
- `subtitle` = data context; `insight` = one-line callout annotation
- Add `reference_line` (average, target, baseline) so readers calibrate without mental math
- Second dataset auto-renders grey — use this for prior-period comparison
- Types: `line` for trends, `bar` for category comparison, `horizontal_bar` for rankings >5, `doughnut` for composition (max 5 slices)

---

## Step 6: Save MD summary

```
docs/analysis/YYYY-MM-DD_HH-MM_<slug>.md
```

```markdown
---
question: "..."
date: YYYY-MM-DD HH:MM TZ
data_sources: ...
html: docs/analysis/YYYY-MM-DD_HH-MM_<slug>.html
---
[verdict → findings → so what]
```

---

## Handling gaps

- **Event not tracked** → say so; offer the `event-tracker` skill
- **Data too thin** (<30 events) → state the count, don't conclude
- **Can't fully answer** → answer what you can; state exactly what data would complete the picture
