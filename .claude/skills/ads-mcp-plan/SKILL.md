---
name: ads-mcp-plan
description: Plan a change to the NotFair Google Ads MCP — read-tools, write-tools, GAQL builders, mutation logic, or system prompts. Forces upfront verification against known API landmines, sweeps prompt/example surfaces for the same pattern, and inventories tests that will break. Invoke before editing anything in lib/google-ads/** or lib/mcp/**, or when the user says "I want to change X in the ads MCP", "add a new tool for Y", "fix this Google Ads behavior", "/ads-mcp-plan".
---

# ads-mcp-plan

You are planning a change to the NotFair Google Ads MCP. The Google Ads API is full of empirical landmines that don't show up in casual code-reading. This skill forces verification BEFORE implementation, so reviews land on something already checked.

The cost of skipping this skill: you implement, ship, then learn from a user that you wiped data, included negatives in an audit, or labeled paused entities as enabled. We've already paid that cost — that's why this skill exists.

## When to invoke

- Editing anything in `lib/google-ads/**` or `lib/mcp/**`.
- Adding/changing a GAQL query, a runScript example, or a mutation tool.
- Fixing a Google Ads API behavior bug.
- Anything that touches `responsive_search_ad`, `keyword_view`, `change_event`, or any GAQL view resource.

If the change is purely cosmetic (renaming a variable, fixing a typo in a description), skip this skill.

## Phase 0 — Load landmines

Read `docs/ads-api-landmines.md` in full. Identify which entries are relevant to the proposed change. State them back to the user as a 1-3 line summary.

If the change involves a class of landmine NOT yet documented (e.g., a new resource we haven't worked with before), call out that gap explicitly. Plan to append a new entry to `ads-api-landmines.md` before this skill ends.

## Phase 1 — Claim audit

Write the proposed plan as a numbered list of claims. Tag each one:

- `ASSUMED` — needs verification before proceeding
- `DOCS` — backed by Google Ads API documentation (still suspect for library quirks)
- `LIBRARY` — verified against `node_modules/google-ads-api` source
- `TESTED` — verified against a project test at `__tests__/**` or `lib/**/__tests__/**`

**Hard rule: no claim on the critical path may stay `ASSUMED` when this skill ends.** Either upgrade it (read library source, run a test, write a new test) or explicitly defer it as a known unknown with a documented verification step.

Common claims that need a `LIBRARY` or `TESTED` tag, not `DOCS`:
- "This field-mask covers only the fields I send" — the library may emit parent-level masks. Verify with the proto-validation tests.
- "This GAQL filter is sufficient" — the view may include rows the filter doesn't cover (see `keyword_view`/negative landmine).
- "Omitting this optional field preserves existing value" — depends on field-mask shape, not API docs.

## Phase 2 — Surface sweep

For any change to a GAQL pattern, mutation shape, or field handling, run grep across the surface manifest in `docs/ads-api-landmines.md` ("Surface manifest" section). The same bug usually has multiple homes.

Concrete sweeps for the most common patterns:

```bash
# GAQL pattern bugs (e.g., missing predicate, wrong enum form)
grep -rn "FROM <resource>" lib/google-ads/audit lib/mcp/code-mode lib/mcp/playbooks lib/mcp/platforms lib/google-ads-chat.ts

# Mutation/RSA bugs
grep -rn "responsive_search_ad" lib/google-ads lib/mcp __tests__

# Tool-schema or description bugs
grep -rn "<tool name>" lib/mcp/read-tools.ts lib/mcp/write-tools.ts lib/mcp/code-mode lib/mcp/platforms
```

For each hit, decide:
- Patch it (same bug, same fix)
- Document why it's exempt (different context, intentional difference)
- Add it to the change scope

**If the same bug pattern shows up in 3+ places, that's a signal the
abstraction is wrong, not that you should patch 3+ sites.** Per the
Engineering Philosophy in CLAUDE.md, prefer fixing the underlying contract
(a shared GAQL builder, a typed mutation helper, a centralized field-mask
utility) over scattering patches. Call the structural issue out in the plan
so the user can approve the larger refactor before you start.

## Phase 3 — Test impact

Identify tests that reference the pattern being changed. They will break and need updates BEFORE implementation, not after.

```bash
grep -rn "<pattern>" __tests__ lib/**/__tests__ lib/__tests__
```

Pay special attention to:
- Snapshot tests (will fail loudly — usually `*.snap` or inline `toMatchInlineSnapshot`).
- Schema-shape tests in `lib/mcp/__tests__/tool-registration.test.ts` (assertions on tool descriptions, input schemas, GAQL strings).
- Proto-validation tests in `__tests__/all-tools-proto-validation.test.ts` and `__tests__/mutate-e2e-format.test.ts`.

For each affected test, plan whether to update the assertion (intentional behavior change) or expect it to keep passing (the change should not regress what the test guards). Write that plan into the claim list before implementing.

## Phase 4 — Verification scripts (when needed)

If Phase 1 left any claim that needs a runtime check, write a focused test or run a one-off probe BEFORE the implementation, not after.

For mutation/field-mask claims:
```bash
# Find the existing proto-validation test for the entity you're mutating
grep -rn "<entity>" __tests__/all-tools-proto-validation.test.ts __tests__/mutate-e2e-format.test.ts
```

Add a new test case that asserts the wire format (operations array, update_mask paths, resource shape). The test failing IS the verification — it tells you what the library actually emits.

For GAQL claims, write the query into a test that uses `expectQueryToContain` or similar. If the query has empirical row behavior (e.g., includes negatives), the test alone isn't enough — note it as a "verify against a real account" step.

## Phase 5 — Optional second-opinion gauntlet

After Phases 0-4, the plan should be on solid ground. If the change is high-stakes (mutations, field-mask logic, anything user-visible), invoke `/codex` and `/toprank:gemini` for cross-model review. By this point, reviewers are pressure-testing a verified plan, not doing primary research — much higher signal.

## Phase 6 — Update landmines doc

Before declaring done, append any new landmines you discovered to `docs/ads-api-landmines.md`. The skill's value compounds only if discoveries get captured.

Also update CLAUDE.md or relevant prompt sections (`lib/mcp/code-mode/index.ts`, `lib/mcp/platforms/google.ts`) if the landmine should reach the agent at runtime, not just the next builder.

## Output format

When you finish this skill, the deliverable is:

1. **Landmines applicable** — short list of entries from `ads-api-landmines.md` relevant to this change.
2. **Claims with verification status** — every assertion tagged `TESTED`, `LIBRARY`, `DOCS`, or (only with explicit deferral) `ASSUMED`.
3. **Surface sweep results** — every file/line where the pattern lives, classified into "patch / exempt / new scope."
4. **Test impact** — every test that needs updating, with planned assertion changes.
5. **Verification probes run** — for any claim upgraded from `ASSUMED` to `TESTED`/`LIBRARY` during this skill.
6. **Open questions** — anything still uncertain, with a concrete verification step.
7. **Final plan** — the implementation steps, in order, with file paths and line numbers.

If the user asks for a second-opinion review (`/codex` or `/toprank:gemini`), run it AFTER producing this output, not before.

## Anti-patterns

- ❌ "Google's docs say X, so it must be true" — docs lie about library behavior. Tag `DOCS` and verify against the library or a test.
- ❌ Patching one surface and shipping — the same bug usually lives in 2-5 prompt/example sites.
- ❌ Writing tests after implementation — tests written after the fact tend to assert what the code does, not what the contract should be.
- ❌ Skipping the landmines doc — it exists because we've already paid for these lessons. Reading it costs 60 seconds; not reading it costs a re-roll of the whole conversation.
- ❌ Treating `/codex` and `/toprank:gemini` as primary discovery. They're quality control. Verification happens in this skill, not in the review.
