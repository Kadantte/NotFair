---
question: "Which page converts better — home page or free Google Ads audit page — and where does the funnel leak?"
date: 2026-04-08 00:20 PST
data_sources: PostHog project 368485 — $pageview, account_connected, oauth_credentials_generated, $rageclick, $exception — Apr 4–8, 2026
html: docs/analysis/2026-04-08_00-20_homepage-audit-conversion.html
---

## Audit page converts 6x better than homepage (50% vs 8.5% to /connect) — fix OAuth dropout and drive traffic there

**Data quality note:** Audit page launched Apr 7 — only 6 total visitors. All audit page findings are directional (n<30).

**Funnel (last 4 days, unique users):**
- Home page visitors: 82 (46 desktop, 29 mobile, 7 unknown)
- Audit page visitors: 6 (launched Apr 7, all from Reddit/direct)
- Home → /connect: 7 users (8.5%; desktop-adjusted: 15.2%)
- Audit → /connect: 3 users (50%)
- Started OAuth: 10
- account_connected: 6 (40% OAuth dropout)

**Findings:**
1. **Audit page converts 6x better** — 50% vs 8.5% to /connect. Specific value prop ("see your score") outperforms broad homepage pitch. **(Medium — n=6)**
2. **39% of home traffic is mobile** — structurally unable to convert (CLI product). Real desktop conversion rate is 15.2%, not 8.5%. **(High)**
3. **40% OAuth dropout** — 10 started, 6 completed. 4 rage clicks on /connect confirm specific friction blocking motivated users. **(High)**
4. **No sustainable traffic channel** — 95% from Reddit/email launch spike. Google organic = 4 users. Apr 4 spike (50 visitors) collapsed to 4–19 after. **(High)**
5. **Rage clicks on /audit app (5)** — post-conversion frustration in audit results UI. **(High)**
6. **Zero CTA click tracking** — completely blind to button click rate vs. page view rate on either page. **(Data gap)**

**Actions (priority order):**
1. **Fix OAuth dropout** — debug /connect rage clicks + exception logs. 40% dropout at highest-intent step = highest ROI fix. Estimated: +2-3 accounts at current traffic.
2. **Drive traffic to /google-ads-audit** — Reddit post to r/PPC/r/googleads, Google Ads targeting 'Google Ads audit'. 6x conversion lift means same spend = 6x more accounts.
3. **Add CTA click tracking** — one tracking call on "Audit Now" button on both pages. Unblocks all future A/B testing.
4. **Mobile email capture on homepage** — "Get setup guide sent to your desktop". Recovers 39% of otherwise-lost home traffic.
