## Engineering Philosophy

Optimize for **long-term maintainability** and **user experience**. The
marginal cost of writing code is near zero; the cost of carrying bad
architecture forward is not. When the choice is "small patch with hidden
maintenance cost" vs "larger change with cleaner result," choose the cleaner
result. Diff size is not a constraint — future-reader pain is.

This overrides a few harness defaults:

- **Root-cause fixes beat band-aids.** If a bug points at a structural problem
  (wrong abstraction boundary, leaky data contract, ad-hoc state scattered
  across files), fix the structure even when a one-line workaround would
  silence the symptom. Band-aids compound — every one makes the next change
  harder. Name the structural issue explicitly when you propose the fix, so
  the choice is visible.
- **Refactor when architecture demands it.** "Don't refactor beyond what the
  task requires" does NOT apply when the surrounding code is the reason the
  task is hard. Clean it up first, then make the change. Two clean commits
  (refactor, then feature) beat one tangled commit.
- **Abstractions are allowed when they reflect real semantic duplication or
  clarify intent.** Premature abstraction is still bad; leaving genuine
  duplication across 5+ sites because "three similar lines beats an
  abstraction" is worse — that rule is about 3, not 30.
- **Comments are allowed when they help future readers** — non-obvious
  invariants, domain quirks, API landmines, the "why" behind a non-obvious
  choice. Self-evident code still doesn't need a comment.
- **UX is a first-class constraint, not polish to defer.** Loading states,
  error states, perceived performance, empty states, and interaction feedback
  are part of "done." If you can't test the UX in a browser, say so — don't
  declare done.

What does NOT change from harness defaults:
- Don't design for hypothetical requirements that aren't on the roadmap.
- Don't add fallbacks for scenarios that genuinely can't happen.
- No half-finished implementations.
- Don't write comments that just restate the code.
- Validate at system boundaries (user input, external APIs), not between
  trusted internal callers.

**Test for any judgment call:** would a competent engineer reading this in 6
months thank you for the choice, or curse you for it? If the cleaner
architecture wins that test, take it — even if the diff is bigger.

## North Star Metrics
Always read `docs/north-stars.md` before any growth, activation, or retention analysis.
Frame findings around Weekly Active Writers (WAW) and D0 Write Users by default.
Flag anything that doesn't plausibly move those metrics as off-strategy.

## Design System
Always read DESIGN.md before making any visual or UI decisions.
All font choices, colors, spacing, and aesthetic direction are defined there.
Do not deviate without explicit user approval.
In QA mode, flag any code that doesn't match DESIGN.md.

## NotFair MCP Product Principle
NotFair MCP should be boring infrastructure for smart agents.

The MCP layer should provide reliable Google Ads primitives: clean data contracts,
robust GAQL/runScript behavior, freshness/staleness metadata, operation provenance,
guardrails, approvals, undo, and bulk-safe writes.

The AI agent using MCP should handle the intelligence layer: diagnosing performance,
prioritizing fixes, forming hypotheses, explaining tradeoffs, and deciding what
actions to propose.

Default bias: improve MCP as a trustworthy data/execution substrate, not as an
over-opinionated "smart marketer" workflow app.

## Code safety

Before any change to `lib/google-ads/**` or `lib/mcp/**`, any Google Ads API
behavior fix, or any new ads MCP tool or GAQL builder, invoke `ads-mcp-plan`
first. The Google Ads API has empirical landmines that don't show up in
casual code-reading; the cost of skipping verification is shipping silent
data bugs (negatives mistaken for positives, RSA sub-fields wiped by
parent-level field masks, etc.).

## Deploy Configuration (configured by /setup-deploy)
- Platform: Vercel
- Production URL: https://www.notfair.co
- Deploy workflow: auto-deploy on push (Vercel Git integration)
- Deploy status command: HTTP health check
- Merge method: squash
- Project type: web app (Next.js)
- Post-deploy health check: https://www.notfair.co/api/health

### Custom deploy hooks
- Pre-merge: none
- Deploy trigger: automatic on push to main (Vercel)
- Deploy status: poll https://www.notfair.co/api/health for 200
- Health check: https://www.notfair.co/api/health

