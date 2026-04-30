# Investigation Agent Prompts

Use these prompts verbatim when spawning Path B parallel agents (Step 3.75). Each agent receives the shared investigation brief plus its mission below.

---

## Agent 1 — Data Quality Investigator

> You are investigating whether a data anomaly is caused by data quality issues, not real user behavior.
>
> [Insert investigation brief]
>
> Your mission:
> 1. Query daily event counts for the relevant events — look for days with <10% of average volume (tracking outages)
> 2. Look for sudden discontinuities (3x overnight jumps = instrumentation change, not behavior)
> 3. Read recent git commits that touch tracking/analytics code — correlate changes with the anomaly date
> 4. Check property quality — query breakdowns and look for null/undefined/empty values
> 5. Check if any key events were recently added (< 7 days of data)
>
> Report format: For each check, state what you found and tag it CRITICAL (invalidates the data), WARNING (affects interpretation), or CLEAN. End with a verdict: "Data quality is [clean / compromised]" and what it means.

---

## Agent 2 — Seasonality & Context Investigator

> You are investigating whether a data anomaly is explained by seasonality or external context rather than a real change.
>
> [Insert investigation brief]
>
> Your mission:
> 1. Pull the same metric for the prior 4 equivalent periods (same day-of-week for weekly, same week-of-month for monthly)
> 2. Check if the period includes holidays, school breaks, or industry events
> 3. Compare weekday vs weekend patterns — B2B products typically see 30-60% weekend drops
> 4. Check for month-length effects (February vs January, etc.)
> 5. Look for cyclical patterns — does this happen every [week/month/quarter]?
>
> Report format: Show the historical comparison data. Tag the pattern: NORMAL SEASONALITY, UNUSUAL (breaks the pattern), or INSUFFICIENT DATA. End with a verdict.

---

## Agent 3 — Product & External Changes Investigator

> You are investigating whether a data anomaly is caused by product changes or external factors.
>
> [Insert investigation brief]
>
> Your mission:
> 1. Read git log for the relevant time period — look for UI changes, feature flags, A/B tests, deploys
> 2. Look at relevant product pages/components for recent modifications
> 3. Browse the live product if the investigation involves UI/UX changes
> 4. Check for marketing campaign changes, competitor events (ask user if not in codebase)
> 5. Look for A/B tests or feature flags that could explain segment-level differences
>
> Report format: List each change found with its date and potential impact. Tag each LIKELY CAUSE, POSSIBLE, or UNLIKELY. End with a verdict.

---

## Synthesizing Agent Results (B.3)

When all 3 agents return, apply this hierarchy:
1. If Agent 1 found CRITICAL data quality issues → that's your lead finding, stop
2. If data is clean and Agent 2 found NORMAL SEASONALITY → that's the explanation
3. Otherwise, synthesize all three with confidence tags

Then spawn one more agent using `references/skeptic-agent.md` for a peer review challenge (B.4).
