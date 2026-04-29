# NotFair Impact Monitor — Build Spec

## Core thesis

**Ship Impact Monitor first.**

The real operator problem is not:
- attributing lift to an individual keyword edit
- pretending every write can be scored like an A/B test

The real operator problem is:
- “I made a set of changes to this campaign”
- “show me those changes as one intervention”
- “watch the campaign after the intervention”
- “tell me if performance likely improved, worsened, or is still too noisy to call”

That is the honest, useful product.

Native Google Ads experiments are still important, but they should be the **next layer**, not the first shipped product.

---

## Why this is the right product

### 1) It matches the real workflow
NotFair users are making:
- keyword packages
- negative keyword cleanup
- bid changes
- budget changes
- ad/copy/asset updates
- campaign setting changes

Those usually happen as **bundles of work**, not isolated atomic edits.

The right unit is not “one keyword changed.”
The right unit is **one intervention on one campaign**.

### 2) It matches production data
Real production analysis showed:
- many campaign-scoped writes
- very few isolated before/after windows
- heavy overlap from other writes in the same campaign
- only campaign-level daily snapshots for measurement

So NotFair should **not** promise causal attribution per micro-change.
It should promise **conservative observational monitoring at the intervention level**.

### 3) It creates the right wedge for later experiments
Impact Monitor teaches NotFair:
- what kinds of interventions recur
- which campaigns are stable enough to test
- which hypotheses are clean vs messy
- where operators want more rigor

That becomes the input to future **pre-flight experimentability checks** and **native Google Ads experiment launch**.

---

## Product definition

## What Impact Monitor is
Impact Monitor is a campaign-level intervention tracking system.

It groups approved writes into a named intervention, captures the intended hypothesis, tracks campaign performance before and after the intervention, detects confounders, and returns a conservative readout.

## What Impact Monitor is not
It is not:
- a true randomized experiment system
- individual keyword causal inference
- a guaranteed attribution engine
- a replacement for native Google Ads Experiments

## User promise
For every meaningful change bundle, NotFair should answer:
1. **What changed?**
2. **When did it change?**
3. **What were we trying to improve?**
4. **What happened after?**
5. **How confident should we be, given confounders?**

---

## Primary jobs to be done

### JTBD 1 — After making changes, I want a clean monitoring object
Instead of a pile of low-level ops rows, I want:
- one intervention card
- one campaign context
- one summary of what changed
- one hypothesis

### JTBD 2 — I want to know when an intervention is worth reviewing
I do not want to manually remember:
- when enough days have passed
- whether there were too many overlapping edits
- which interventions deserve attention

### JTBD 3 — I want an honest performance readout
I want NotFair to say:
- likely improved
- likely worsened
- inconclusive
- too new
- highly confounded
- rolled back

Not:
- fake winner/loser certainty
- overfit keyword-level stories

### JTBD 4 — I want to learn what kinds of changes work in this account
Over time I want a memory layer:
- negative cleanup often helps here
- broad keyword expansion usually hurts here
- landing page swaps tend to be inconclusive here

That is downstream, but Impact Monitor is the data foundation.

---

## Core product objects

## 1) Change Intervention
The central object.

Definition:
A **campaign-scoped, time-bounded bundle of writes** intended to produce one main outcome.

Examples:
- “Pause low-intent keywords + add negatives in Brand Search"
- “Switch campaign to Max Conversions"
- “Trim search terms and tighten match types"
- “Raise budget after budget-limited diagnosis"

Rules:
- v1 should be **one intervention = one campaign**
- one intervention may contain many operations
- one intervention should have one primary hypothesis

### Fields
- `id`
- `account_id`
- `campaign_id`
- `request_id` nullable
- `name`
- `change_summary`
- `hypothesis` nullable
- `primary_metric` nullable
- `secondary_metrics` jsonb nullable
- `goal_direction` (`increase`, `decrease`, `stabilize`) nullable
- `trigger_source` (`manual`, `write_flow_auto`, `claude_suggested`, `backfilled`) 
- `status` (`draft`, `watching`, `ready_for_review`, `reviewed`, `archived`, `rolled_back`)
- `started_at`
- `ended_at` nullable
- `created_by_user_id` nullable
- `created_at`
- `updated_at`

## 2) Change Intervention Operations
Maps low-level writes to the intervention.

### Fields
- `id`
- `change_intervention_id`
- `operation_id`
- `operation_order`
- `change_type`
- `entity_type`
- `entity_ref`
- `before_json` nullable
- `after_json` nullable
- `created_at`

## 3) Change Intervention Daily Metrics
Stores daily campaign performance snapshots associated with the intervention.

### Fields
- `id`
- `change_intervention_id`
- `snapshot_date`
- `impressions`
- `clicks`
- `cost_micros`
- `conversions`
- `conversions_value`
- `ctr` nullable
- `cpc_micros` nullable
- `cvr` nullable
- `cpa_micros` nullable
- `roas` nullable
- `period_role` (`baseline`, `change_day`, `after`, `excluded`)
- `created_at`

## 4) Change Intervention Evaluation
Stores a point-in-time review outcome.

### Fields
- `id`
- `change_intervention_id`
- `evaluation_version`
- `baseline_window_days`
- `after_window_days`
- `days_since_start`
- `confounder_count_internal`
- `confounder_count_external` nullable
- `confidence` (`low`, `medium`, `high`)
- `result_label` (`likely_improved`, `inconclusive`, `likely_worsened`, `too_new`, `highly_confounded`, `rolled_back`)
- `primary_metric_name`
- `primary_metric_before`
- `primary_metric_after`
- `primary_metric_delta_pct` nullable
- `supporting_metrics_json` jsonb
- `reason_summary`
- `reason_codes` jsonb
- `created_at`

## 5) Confounder Events
Optional but valuable.

### Fields
- `id`
- `change_intervention_id`
- `source` (`internal_write`, `google_change_event`)
- `event_at`
- `summary`
- `campaign_id`
- `metadata_json` jsonb nullable
- `created_at`

---

## Intervention grouping model

This is the most important product decision.

### Unit of analysis
**Intervention**, not operation row.

### Default grouping heuristic for v1
Auto-create one intervention when all are true:
- same `campaign_id`
- same `request_id`, if present
- operations occur within one short execution session
- writes are part of one Claude/user action

### Fallback grouping heuristic
If `request_id` is missing or noisy, group by:
- same campaign
- same actor/session
- close timestamps
- compatible change intent

### Intervention boundary rules
Start a new intervention when:
- campaign changes
- there is a large time gap
- the hypothesis clearly changes
- the operator explicitly asks for a separate intervention

### v1 opinion
Be conservative.

It is better to create:
- two smaller clean interventions

than:
- one giant messy intervention that cannot be interpreted

---

## Hypothesis capture

Impact Monitor gets much better if we capture intent at write time.

### Ideal write-time capture
When Claude proposes writes, capture:
- `hypothesis`
- `primary_metric`
- `expected_direction`
- optional `notes`

Example:
- Hypothesis: “Adding negatives and pausing low-intent terms should reduce CPA.”
- Primary metric: `cpa`
- Expected direction: `decrease`

### If hypothesis is missing
Infer a lightweight hypothesis from change type.

Examples:
- negative cleanup → lower wasted spend / lower CPA
- bid increase → more volume, maybe worse efficiency
- budget increase → more spend and more conversions
- landing page update → better CVR

Mark inferred hypotheses clearly so the UI does not overstate certainty.

---

## Measurement model

## Current measurement constraints
Current known constraints:
- campaign-level daily snapshots only
- current review logic uses roughly **7d before vs 7d after**
- exclude the change day
- require at least **3 after-days** before any readout

The product should be honest about these limits.

## Primary comparison frame
For v1, compare:
- baseline window before intervention
- post-change window after intervention
- at campaign daily level

## Recommended default metrics
Always compute and display rates, not just raw counts.

### Efficiency metrics
- `cpa = cost / conversions`
- `roas = conversion_value / cost`
- `cvr = conversions / clicks`
- `ctr = clicks / impressions`
- `cpc = cost / clicks`

### Volume metrics
- impressions
- clicks
- conversions
- cost
- conversion value

### Product rule
Do not lead with raw counts when denominator drift matters.
Lead with:
- CPA
- ROAS
- CVR
- CTR

Then show volume context underneath.

## Baseline handling
### v1 baseline
- 7 full days before intervention
- exclude intervention day
- compare with after window

### v2 baseline
Upgrade to weekday-aware expected baseline so Monday is compared against prior Mondays, etc.

---

## Evaluation logic

Impact Monitor should return conservative observational verdicts.

## Result labels
- `likely_improved`
- `inconclusive`
- `likely_worsened`
- `too_new`
- `highly_confounded`
- `rolled_back`

## Output shape
Each evaluation should answer:
- primary metric before vs after
- directional change
- whether supporting metrics agree
- confounder burden
- confidence level
- concise reason summary

## Example summaries
- “CPA improved 18%, but confidence is low because 4 other campaign changes occurred during the watch window.”
- “ROAS worsened 22% with stable click volume and no major internal confounders. Likely worsened.”
- “Only 2 after-days available. Too new.”
- “Results are noisy because 6 additional same-campaign write bundles landed after the intervention. Highly confounded.”

## Confidence model
### High
- enough after-days
- few or no confounders
- clear primary metric move
- supporting metrics align

### Medium
- enough days
- some noise/confounders
- signal present but not fully clean

### Low
- limited data
- mixed metrics
- many confounders
- recent intervention

---

## Confounder detection

This is core to honesty.

## Internal confounders
Use existing `operations` data to count:
- other writes in same campaign during after-window
- other write bundles in same campaign during after-window
- rollbacks or reversals

## External confounders
Where feasible, use Google Ads `change_event` to detect:
- manual UI edits
- edits from outside NotFair
- campaign changes not represented in internal ops

### Product behavior
Confounders should not be buried.
They should be prominent in the UI:
- count
- timing
- short summary
- effect on confidence

---

## Core surfaces

## 1) Impact Monitor feed
This is the main home.

Recommended route:
- `/impact-monitor`

If Tong wants one combined surface later, it can sit under `/experiments`, but product clarity is better if Impact Monitor has its own home first.

### Feed sections
#### Watching
Interventions currently collecting after-data.

#### Ready for review
Interventions with enough data for an initial call.

#### Needs attention
Interventions with:
- likely worsened
- highly confounded
- rolled back

#### Reviewed / archive
Past interventions and their outcomes.

### Feed card fields
- campaign name
- intervention name
- change summary
- primary metric
- age since change
- current status
- current result label
- confidence
- confounder count
- quick sparkline or delta summary

---

## 2) Intervention detail page
This is where the product becomes truly useful.

### Header
- intervention name
- campaign
- status
- current verdict
- confidence

### Section A — What changed
- natural-language summary
- low-level operation list
- before/after payload snippets where useful

### Section B — What we expected
- hypothesis
- primary metric
- expected direction

### Section C — What happened
- baseline vs after comparison
- primary metric chart
- supporting metrics table
- raw volume context

### Section D — Confounders
- internal writes during watch window
- external changes if detected
- confidence explanation

### Section E — Timeline
- intervention start
- subsequent write bundles
- review milestones
- rollback markers

### Section F — Claude explanation
One concise paragraph explaining the current readout in operator language.

---

## 3) Campaign timeline overlay
Useful after feed + detail are working.

Show:
- performance chart
- intervention markers
- confounder markers
- hover summary

This helps users visually understand overlapping changes.

---

## Write flow integration

Impact Monitor should be built directly into the write system.

## Desired flow
1. Claude proposes write bundle.
2. User approves.
3. Writes execute.
4. NotFair auto-creates or updates a `change_intervention`.
5. Hypothesis/metric are captured or inferred.
6. Intervention enters `watching` state.
7. Evaluation job updates the intervention as more data arrives.

## Why this matters
Without write-flow integration, Impact Monitor becomes a manual reporting tool.
With integration, it becomes the **memory layer for changes**.

---

## MCP tool spec

## Core tools
### `createChangeIntervention`
Create a monitoring object explicitly.

Input:
- `accountId`
- `campaignId`
- `name?`
- `changeSummary`
- `hypothesis?`
- `primaryMetric?`
- `goalDirection?`
- `operationIds?`

Output:
- `changeInterventionId`
- `status`

### `suggestChangeIntervention`
Given a recent write bundle, propose a grouped intervention.

Input:
- `requestId?`
- `campaignId?`
- `timeRange?`

Output:
- `suggestedGrouping`
- `changeSummary`
- `hypothesis?`
- `primaryMetric?`
- `operationIds[]`

### `listChangeInterventions`
Filter by:
- account
- campaign
- status
- result label
- date range

### `getChangeIntervention`
Return full detail object.

### `evaluateChangeIntervention`
Run or rerun evaluation.

Input:
- `changeInterventionId`
- `baselineWindowDays?`
- `afterWindowDays?`

Output:
- `resultLabel`
- `confidence`
- `primaryMetricBefore`
- `primaryMetricAfter`
- `primaryMetricDeltaPct`
- `confounderCount`
- `reasonSummary`

## Optional later tools
### `renameChangeIntervention`
### `mergeChangeInterventions`
### `splitChangeIntervention`
### `rollbackChangeIntervention`
### `listInterventionLearnings`

---

## UI language rules

This matters a lot.

### Allowed language
- likely improved
- likely worsened
- inconclusive
- too new
- highly confounded
- monitor only
- observational readout

### Avoid
- winner
- loser
- proven
- caused
- statistically significant

unless the underlying product actually supports that standard.

---

## MVP scope

## Must-have
- intervention creation from approved writes
- campaign-scoped grouping
- baseline vs after comparison
- conservative result labels
- confounder counting from internal writes
- feed + detail page

## Nice-to-have
- external confounder detection via `change_event`
- explicit hypothesis capture at write time
- timeline visualization
- intervention editing/merge/split

## Not in MVP
- keyword-level causal attribution
- randomized test claims
- multi-campaign intervention analysis
- formal experiment orchestration

---

## Recommended implementation order

## Phase 1 — Schema + write capture
Add:
- `change_interventions`
- `change_intervention_operations`
- `change_intervention_daily_metrics`
- `change_intervention_evaluations`
- optional `change_intervention_confounders`

Touch likely areas:
- `lib/db/schema.ts`
- `lib/db/impact.ts`
- `lib/mcp/write-tools.ts`
- write execution path where `operations` are finalized

## Phase 2 — Evaluation engine
Build:
- intervention grouping logic
- baseline/after metric loader
- confounder counter
- result-label evaluator

Touch likely areas:
- `lib/db/impact.ts`
- `lib/db/tracking.ts`
- `lib/google-ads/audit/queries.ts`
- existing impact review helpers

## Phase 3 — Read tools + UI
Build:
- `listChangeInterventions`
- `getChangeIntervention`
- `evaluateChangeIntervention`
- feed page
- detail page

Touch likely areas:
- `lib/mcp/read-tools.ts`
- `lib/mcp/code-mode/index.ts`
- app routes/components for the monitor surface

## Phase 4 — Smarter monitoring
Add:
- weekday-aware baselines
- external change_event confounders
- better hypothesis inference
- campaign timeline overlay

## Phase 5 — Experimentability adjacency
After Impact Monitor is working well:
- identify interventions that are clean experiment candidates
- add pre-flight experimentability check
- later add native Google Ads experiment launch

---

## Product recommendation

If you want the sharpest v1 framing, call it:
- **Impact Monitor**

Not:
- Experiment Mode

Because the thing you are actually shipping first is:
- post-change observational tracking
- intervention grouping
- confidence-aware readouts
- learning from real operator behavior

Then later you can layer on:
- **Experimentability Check**
- **Run as Google Experiment**

That gives a clean ladder:
1. **Impact Monitor** — what changed and what likely happened
2. **Experimentability Check** — can this next change become a real test?
3. **Native Experiments** — launch and track formal Google Ads experiments

---

## Bottom line

Build Impact Monitor as the first-class product.

The core abstraction should be:
- **campaign-scoped intervention**
- not individual change rows

The core promise should be:
- **honest observational readouts with confounder-aware confidence**
- not fake A/B certainty

That is the right product for the data you actually have, and it is the best foundation for everything that comes next.