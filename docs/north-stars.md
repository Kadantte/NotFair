# AdsAgent North Star Metrics

AdsAgent has **two** north-star metrics, agreed 2026-04-19. Both anchor on the **successful write op** because writes are the only first-session behavior that causally predicts retention (+30pp gap in the Apr 19 retention analysis) and because writes are the product's value promise (AI takes action on Google Ads).

**1. Growth north star — Weekly Active Writers (WAW)**
- Definition: unique users with ≥1 `operations` row where `op_type=1 AND success=1` in a rolling 7-day window.
- Baseline (week of 2026-04-13): **34 WAW**.

**2. Activation north star — D0 Write Users**
- Definition: of new signups in week W, the count (and %) who executed ≥1 successful write within 24h of their first `mcp_sessions` row.
- Baseline (week of 2026-04-13): **20 / 43 = 46.5%** D0 write rate.

**Guardrails (monitored, not replaced):**
- Net impactful changes = writes not undone within 7d (uses `undoChange` / `reviewChangeImpact`)
- Writer WoW retention = WAW this week ∩ WAW last week (today 35%)
- D0 → D7 write-retention = % of this week's D0 writers who write again in the next 7 days

**Why:** See `docs/analysis/2026-04-19_15-00_north-star-recommendation.md` for full justification and the rejected alternatives (WAU any-op, total write ops, revenue, $ spend managed, WoW retention as a standalone NS).

**How to apply in future analyses:**
- When the user asks an open-ended "how are we doing" / "what should we focus on" / "is this working" question, frame impact in terms of WAW and D0 Write Users by default.
- When evaluating a feature or change, check: does it plausibly move WAW or D0 Write Users? If not, flag that to the user — the change may be off-strategy.
- When a growth lever is proposed, compute the expected lift in WAW (e.g., "if we convert half the non-writers, that's +10 D0 writers/week → ~+10 WAW/week at current retention").
- Do NOT frame analyses around WAU-any-op as the headline — that metric has been explicitly rejected (read-only dilution).
