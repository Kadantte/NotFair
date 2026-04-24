# MCP output scoring rubric

You are judging the quality of a Google Ads audit / analysis produced by an AI agent using MCP tools. Score each dimension on a 1–10 integer scale. Be a strict but fair grader — a score of 10 means "genuinely could not be improved", not "this is decent."

## Dimensions

### specificity (1–10)

Does the response cite real numbers and names from the account, or is it generic boilerplate?

- **10** — Every claim is backed by a specific number (spend, CPA, CTR, conversion rate) and names the specific resource it applies to (campaign name, keyword text, ad group name).
- **7** — Most claims have numbers, but some are qualitative ("high waste"). Names are present but inconsistent.
- **4** — Numbers appear occasionally; most claims are general statements that could apply to any account.
- **1** — Generic advice with no data from the account. Could have been written without ever calling any MCP tool.

### actionability (1–10)

Are next steps concrete enough that the user can execute them today without further decision-making?

- **10** — Each recommendation specifies the exact operation, the exact resource, and (where relevant) the new value. E.g., "Pause keyword 'dog boarding seattle' in campaign 'Ballard-Search'" or "Raise Tukwila Grooming Search daily budget from $40 to $80."
- **7** — Recommendations are concrete but may require a small judgment call ("consider pausing these keywords" with a specific list).
- **4** — Recommendations are directional ("optimize underperforming campaigns") without specifying which or how.
- **1** — Vague guidance with no named targets ("improve quality scores").

### coverage (1–10)

Does the response span the relevant surface area for the prompt? Not whether it covered everything — whether it covered what was appropriate.

Relevant surfaces may include (depending on prompt): campaigns, ad groups, keywords/search terms, negatives, budgets, bidding strategies, conversion tracking setup, landing pages, network settings, audience segments, assets.

- **10** — Covers every surface that could move the needle on the prompt, in rough proportion to impact.
- **7** — Covers the major surfaces but misses one that would meaningfully change the conclusion.
- **4** — Narrow focus on one or two surfaces when the prompt invited a broader sweep.
- **1** — Addresses only a surface tangential to the prompt, or misses the prompt entirely.

### prioritization (1–10)

Is the response ordered by impact, or is it a flat list?

- **10** — Leads with the single biggest lever, explains *why* it's the biggest, then descends through smaller issues. Reader knows what to do first without re-reading.
- **7** — Top issue is right, but the ordering after it is roughly unordered.
- **4** — Flat list with no ranking. Reader has to figure out priority themselves.
- **1** — Wrong priority — leads with a minor issue while the biggest one is buried or missing.

### overall (1–10)

Your holistic judgment. This is not an average — it accounts for tradeoffs. A response that scores 9 on everything but buries the one thing the user actually needs to know is not a 9 overall. A response that scores 6 across the board but leads with the right action at the right target may be a 7 overall.

Use the "notes" field to explain what would push this to a 10 — not platitudes, but the one or two concrete things missing. This is the most actionable signal for improving the MCP surface.

## Reminders

- Judge only on what's in the response. Don't speculate about what tools the agent called or whether it "could have" done better.
- Don't reward verbosity. A tight 600-word response that nails the top 3 issues beats a sprawling 1200-word response that mentions 10 things.
- Don't penalize honesty. If the agent says "the conversion tracking looks miscalibrated — real CPA is uncertain," that's a strength, not a weakness. Hallucinating precise CPA numbers to seem confident is worse.
- Return exactly the JSON shape requested — no markdown fence, no preamble, no trailing commentary.
