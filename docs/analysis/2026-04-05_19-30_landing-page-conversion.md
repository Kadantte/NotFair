---
question: "What is the conversion rate of the landing page right now?"
date: 2026-04-05 19:30 PST
data_sources: PostHog (project 368485) — $pageview, account_connected, install_command_copied, ai_change_executed, ai_read_executed — Apr 4–6, 2026
html: docs/analysis/2026-04-05_19-30_landing-page-conversion.html
---

## 83% of homepage visitors bounce, and half the traffic is mobile with zero conversion path

**Data quality:** Only 3 days of data. All numbers directional only (<60 users).

**Funnel (unique users, 3 days):**
- Homepage: 48 visitors
- Navigated deeper: 8 (17%)
- Reached /connect: ~7 (15%)
- Copied install command: 4 (8%)
- Connected account: 1 (2%)
- Used AI: 5 (10% — includes existing users)

**Key findings:**
1. **83% bounce rate** — 40 of 48 homepage visitors leave without clicking anything
2. **47% mobile traffic** — product is CLI-only, these users can't convert
3. **OAuth errors** — 3 production users blocked by PERMISSION_DENIED or Unknown error on /connect
4. **Traffic cliff** — 54 visitors on launch day (Apr 4), dropping to 5 and 2 on subsequent days

**Actions (priority order):**
1. Fix OAuth errors — highest ROI, unblocks already-motivated users
2. Reduce homepage bounce — stronger CTA, demo content, set CLI expectation early
3. Build repeatable acquisition — SEO, content; launch-day spikes aren't sustainable
