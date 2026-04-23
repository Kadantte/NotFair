# AdsAgent MCP Server — Anthropic Review Credentials

Ready-to-paste answers for the MCP server review form at
<https://buildwith.anthropic.com/directory>.

## Testing Account Credentials

Use the fixed demo OAuth client below. It's backed by a simulated
Google Ads account (**Threadline Apparel** — 5 campaigns × 30 days of
seeded data). All writes are no-ops: nothing is sent to Google Ads and
no real account is touched.

```
client_id:     adsagent_demo_anthropic_review
client_secret: demo_f49b2e1c7a084d63ab3fc8e519d6a2f0b0f3c6d94e7158eaa210c4d2c6f3b971
```

No 2FA, no Google account, no sign-up required.

## Test Account Server URL

Same as production:

```
https://adsagent.org/api/mcp
```

## Test Account Setup Instructions

1. Open <https://claude.ai/customize/connectors>.
2. Click **+ → Add custom connector**.
3. Fill in the form:
   - **Name**: `AdsAgent Demo`
   - **Remote MCP Server URL**: `https://adsagent.org/api/mcp`
   - Expand **Advanced Settings** and paste the `client_id` + `client_secret` above.
4. Click **Add**. Claude will complete the OAuth handshake automatically —
   no browser redirect, no Google account required.
5. In a new Claude chat, open **+ → Connectors** and toggle **AdsAgent Demo** on.
6. Try any of these prompts to exercise the server:
   - *"List all campaigns in my Google Ads account."* → `listCampaigns`
   - *"Show me the daily performance for Threadline — Brand Search over the last 14 days."* → `getCampaignPerformance`
   - *"Which search terms have wasted the most money without converting?"* → `getSearchTermReport` + analysis
   - *"Audit the account and tell me the top 3 issues."* → `audit` / `runAudit`
   - *"Pause campaign 900000000002."* → `pauseCampaign` (returns success; no real write)

### What reviewers will see

- **5 campaigns** covering Search (Brand / Men's / Women's), Shopping, and Performance Max.
- **30 days of deterministic daily metrics** — same numbers on every call, so screenshots reproduce.
- **Populated issue + opportunity signals**: one campaign is budget-capped
  (high budget-lost impression share), one has wasted spend (zero-conversion
  search terms). The audit + dashboard tools surface these directly.
- **Writes return `success: true` with realistic `before`/`after` values**
  but never touch Google Ads.

## Notes for the review team

- The demo client credentials are **intentionally public**. They only unlock
  the simulated account. Real user accounts are isolated behind per-user
  OAuth clients generated during Google sign-in.
- If a tool isn't explicitly covered by demo fixtures (e.g. `getPmaxAssets`,
  `getKeywordIdeas`, some reporting views), it degrades gracefully and
  returns an empty result rather than erroring.
- Source: <https://github.com/nowork-studio/adsagent>
- Contact: tong@adsagent.org

## For maintainers — running the seed locally

The demo row is lazily created when Anthropic first uses the credentials, but
you can provision it eagerly (for example when bootstrapping a new database):

```bash
npx tsx scripts/seed-demo-oauth.ts
```

Safe to re-run — the function is idempotent.
