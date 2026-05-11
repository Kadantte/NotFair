# Google Ads API Landmines

Empirical traps in the Google Ads API + the `google-ads-api` Node library. Each entry is something we either got bitten by or verified through code review. Append on every new bug found — the value compounds.

Format: `[surface] one-line rule — Why it bites — How to verify`

---

## GAQL — view-vs-resource semantics

- **`keyword_view` returns BOTH positive and negative ad-group-level keyword criteria.** Filter to positives with `WHERE ad_group_criterion.negative = FALSE`. Reason: `keyword_view` is a thin lens over `ad_group_criterion` of type KEYWORD; it filters by type but NOT by negative. **A "find zero-conversion keywords" query without this filter sweeps up every ad-group negative** because negatives block serving and have 0 impressions/clicks/cost/conversions by definition. Verify: `listKeywords` adds the filter; assertion at [tool-registration.test.ts:258](../lib/mcp/__tests__/tool-registration.test.ts:258).
- **`metrics.*` is NOT selectable from `FROM conversion_action`.** That resource carries dimensional fields only. To break down metric counts by conversion action, query `FROM campaign` (or `ad_group`) and SELECT `segments.conversion_action_name`.
- **`search_term_view` requires a finite `segments.date` filter.** Either `DURING` literal or explicit `BETWEEN`.
- **Local Services conversion actions are segment-only.** LSA / `local_services_*` conversion names appear in `segments.conversion_action_name` but not as mutable rows. If absent from `getConversionActions` or marked `mutable: false`, treat as Google-managed/read-only.
- **`segments.conversion_action_name` doesn't pair with `metrics.cost_micros`.** Cost is reported at the campaign/ad_group level, not per conversion action (`query_error=53`). Compute per-action cost-per-conversion in-script.

## GAQL — syntax and predicates

- **Fields used in WHERE must also be in SELECT (`query_error=16`).** Server auto-injects `campaign.status`/`ad_group.status` for REMOVED-parent filters and promotes non-date `segments.*` predicate fields. **Other fields are NOT auto-injected** — including `ad_group_criterion.negative`. Add it to SELECT alongside the WHERE.
- **Enums in WHERE are STRING names, not numbers.** `WHERE campaign.status = 'PAUSED'`, never `= 3`. Same for `ad_group.status`, `ad_group_ad.status`, `ad_group_criterion.status`, `conversion_action.status`, `asset_group.status`.
- **`change_event` REQUIRES `change_event.change_date_time` in WHERE.** `segments.date DURING ...` does NOT work for this resource (`change_event_error=3`). Window cap is 30 rolling days.

## GAQL — date literals

- **Valid `DURING` literals are a fixed set.** `TODAY, YESTERDAY, LAST_7_DAYS, LAST_14_DAYS, LAST_30_DAYS, THIS_MONTH, LAST_MONTH, LAST_BUSINESS_WEEK, LAST_WEEK_MON_SUN, LAST_WEEK_SUN_SAT, THIS_WEEK_MON_TODAY, THIS_WEEK_SUN_TODAY`.
- **Preset date literals use `DURING`, not equality.** `segments.date = YESTERDAY` fails with GAQL syntax errors; use `segments.date DURING YESTERDAY` or `segments.date = 'YYYY-MM-DD'`. Server rewrites TODAY/YESTERDAY equality; verify in `lib/__tests__/google-ads-gaql.test.ts`.
- **There is NO `LAST_60_DAYS`, `LAST_90_DAYS`, `LAST_180_DAYS`, `THIS_YEAR`, `LAST_YEAR`.** For windows >30 days, use `BETWEEN 'YYYY-MM-DD' AND 'YYYY-MM-DD'`.
- **`segments.date BETWEEN` takes explicit ISO dates only.** Never `BETWEEN 'LAST_30_DAYS' AND 'undefined'`.

## Enums — common landmines

- **`BiddingStrategyType` integers**: 9=`TARGET_SPEND` (a.k.a. Maximize Clicks), 10=`MAXIMIZE_CONVERSIONS`, 11=`MAXIMIZE_CONVERSION_VALUE`, 15=`TARGET_IMPRESSION_SHARE`. Easy to swap if you read the integer. Use the `_name` sibling, never the integer.
- **`_name` and `_value` siblings are post-fetch augmentations**, NOT real GAQL fields. Do NOT put them in SELECT or WHERE — they appear automatically when the corresponding raw field is selected.
- **`AssetFieldType.CALL = 16`** (not 4; `MANDATORY_AD_TEXT = 4`). Easy to mis-guess since CALL semantically feels like it should be low-numbered. Verified against the library proto JSON. Use `FIELD_TYPES.CALL.fieldTypeInt` — never hardcode the integer.

## Library — `google-ads-api` wire format

- **`mutateResources` generates field masks at the top-level keys of the resource object** (excluding `resource_name`). For nested sub-messages like `responsive_search_ad`, this means **the mask is the parent path (`responsive_search_ad`), not nested paths (`responsive_search_ad.headlines`).** Google treats parent-level masks as "replace the entire sub-message." **Omitting any sub-field (path1, path2, pinned positions, etc.) from a partial update may silently wipe it.** Verify against [all-tools-proto-validation.test.ts:106](../__tests__/all-tools-proto-validation.test.ts:106) — that's our mock's mask-generation logic. To safely partial-update an RSA, either (a) read full sub-message state and re-send unchanged fields, or (b) construct an explicit nested `update_mask`.

## Mutations — RSA-specific

- **`ResponsiveSearchAdInfo` supports `path1` and `path2`** (15 chars each, optional, mutable). Shown after the domain in the display URL.
- **AUTOMATICALLY_CREATED assets aren't advertiser-linkable.** Query `asset.source` first; if `AUTOMATICALLY_CREATED`, create a fresh asset instead of trying to reuse.
- **Field-mask wipe risk**: see "Library — `google-ads-api` wire format" above. Especially relevant for `updateAdAssets`, which today only sends headlines+descriptions in its replace payload.

## Hallucinated fields (the validator will reject these)

- `metrics.average_cpc_micros` — not a field. Use `metrics.average_cpc`.
- `metrics.conversion_rate` — not a field. Calculate from `metrics.conversions / metrics.clicks`.
- `asset.sitelink_asset.final_urls` — not a field. Call `getResourceMetadata('asset')` to discover correct asset URL fields.

## Assets — immutability and link semantics

- **Google Ads has NO asset deletion.** `AssetService` exposes Create + Mutate (update only); there is no Remove operation. Asset rows remain permanently in the account; the only way to make an asset stop serving is to remove every link (`customer_asset` / `campaign_asset` / `ad_group_asset` / `asset_group_asset`) that references it. The MCP surface deliberately omits a `removeAsset` tool — agents call `getAssetLinks` + `unlinkAssetLinks` instead. Verify in `lib/google-ads/asset-links.ts:unlinkAssetLinks` (no `asset` entity in the entity-by-path table).
- **A single asset can have many links** at multiple levels and field types. `getAssetLinks(assetId)` aggregates across all 4 link entities; pass the resulting `linkResourceName`s to `unlinkAssetLinks` for atomic bulk removal.
- **Field type vs asset type for images.** Image assets have `asset.type = IMAGE` regardless of how they're being served. The link's `field_type` (`MARKETING_IMAGE` = 5 for 1.91:1, `SQUARE_MARKETING_IMAGE` = 19 for 1:1) is what controls serving. Filtering by `asset.type = MARKETING_IMAGE` will return zero rows — use `asset.type = IMAGE` and filter the link's `field_type` instead. Verified by `FIELD_TYPES.MARKETING_IMAGE.assetTypeName === "IMAGE"` in `lib/google-ads/asset-links.ts`.
- **`asset_group_asset` is its own link entity** (Performance Max only). Image assets support all 4 link levels; callout/sitelink/structured-snippet support only customer/campaign/ad_group. `linkAsset` enforces this from the `FIELD_TYPES` registry; passing an unsupported level returns an actionable error. Verified at `lib/__tests__/google-ads-asset-links.test.ts` ("rejects unsupported levels").
- **Field-type enums in WHERE clauses are bare names, not integers.** GAQL uses `customer_asset.field_type = CALLOUT`, never `= 11`. Same for image links: `WHERE customer_asset.field_type = MARKETING_IMAGE`. The asset-link primitive uses the bare enum name in its discovery queries.
- **`AD_IMAGE` (field_type 26) is Search/Display "image extensions" on RSAs, supported at `campaign` and `ad_group` link levels only — NOT `customer` or `asset_group`.** Image assets uploaded with `MARKETING_IMAGE`/`SQUARE_MARKETING_IMAGE` dims cannot be linked to a Search campaign via those field types — the API returns `asset_link_error=5 / FIELD_TYPE_INCOMPATIBLE_WITH_CAMPAIGN_TYPE`. Use field_type `AD_IMAGE` instead. The underlying asset is field-type-agnostic (`asset.type = IMAGE`); a single image can be linked as `MARKETING_IMAGE` to a Display campaign and `AD_IMAGE` to a Search campaign. `AD_IMAGE` link slots accept BOTH 1.91:1 landscape (min 600×314) and 1:1 square (min 300×300) source bytes — Google ranks which slot to fill. Conservative scope: the v22 proto only defines per-resource limits `AD_IMAGE_CAMPAIGN_ASSETS_PER_CAMPAIGN` and `AD_IMAGE_AD_GROUP_ASSETS_PER_AD_GROUP`, so customer/asset_group support is treated as unsupported until proven otherwise. Verified in `lib/__tests__/google-ads-asset-links.test.ts` AD_IMAGE registry assertions + level-rejection cases; wire format covered at `__tests__/all-tools-proto-validation.test.ts` ("linkAsset (AD_IMAGE, campaign level…)").

---

## Surface manifest — where landmines tend to leak

When fixing a GAQL pattern or library quirk, sweep these surfaces. A single bug usually has multiple homes.

### Implementation surfaces (the source of truth)
- `lib/google-ads/audit/queries.ts` — pre-built audit GAQL builders (Q3, Q7, etc.)
- `lib/google-ads/audit/views.ts` — view-specific projections
- `lib/google-ads/reads.ts` — dedicated read tool implementations
- `lib/google-ads/writes.ts`, `lib/google-ads/bulk.ts` — write paths
- `lib/google-ads/campaign-ops.ts` — campaign-scope mutations (createAd, updateAdAssets, etc.)

### Prompt + example surfaces (where agents copy patterns from)
- `lib/mcp/code-mode/index.ts` — the runScript system prompt + COMMON GOTCHAS section
- `lib/mcp/code-mode/ads-client.ts` — `ads.queries.*` host bindings exposed to runScript
- `lib/mcp/playbooks/index.ts` — canned examples
- `lib/mcp/platforms/google.ts` — MCP server-level instructions
- `lib/mcp/read-tools.ts`, `lib/mcp/write-tools.ts` — Zod schemas + tool descriptions
- `lib/google-ads-chat.ts` — legacy chat path (assess if still user-facing)

### Test surfaces (likely to break / good for verification)
- `__tests__/all-tools-proto-validation.test.ts` — proto + mask shape assertions
- `__tests__/mutate-e2e-format.test.ts` — end-to-end mutation format
- `__tests__/mutate-operations.test.ts` — operation-level assertions
- `lib/google-ads/audit/queries.test.ts` — snapshot tests for GAQL builders
- `lib/__tests__/google-ads-gaql.test.ts` — GAQL validator/auto-rewrite logic
- `lib/mcp/__tests__/tool-registration.test.ts` — tool schema registration + GAQL filter assertions

---

## Adding to this file

When you find a new landmine, append a one-liner. Include:
1. The surface it bites on (GAQL, library, enums, etc.)
2. The rule (one sentence)
3. Why it bites (the failure mode)
4. How to verify (a file path or test name to anchor the claim)

Keep entries empirical. "Google docs say X" is weaker than "we have a test at file:line that proves X." If you can't anchor a claim to a file or test, write the verification step you'd run.
