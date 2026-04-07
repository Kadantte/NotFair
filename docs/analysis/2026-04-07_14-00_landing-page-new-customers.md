---
question: "Is the landing page converting visitors into new customers?"
date: 2026-04-07 14:00 PST
data_sources: PostHog — $pageview, account_connected, install_command_copied, ai_change_executed, ai_read_executed — Mar 24 – Apr 7, 2026
html: docs/analysis/2026-04-07_14-00_landing-page-new-customers.html
---

## Landing page is attracting new visitors but converting almost none — 5 accounts from 79 unique visitors in 4 days

**Verdict:** 71 first-time users visited since launch (Apr 4). Only 5 connected a Google Ads account (6.3%). Traffic depends on one-off spikes (Reddit, email blast) with no sustainable channel. 36% of traffic is mobile where conversion is impossible (CLI product). Users who do convert are highly engaged (55 AI changes per active user).

**Findings:**
1. **Traffic crashed 90% after launch then partially recovered** — 51→5→8→15. Reddit (14 user-days) and email (9) drove the spike. Google organic: only 4 user-days. **(High)**
2. **5 users connected accounts — conversion improved to 6.3%** — up from 2% at prior analysis. Connections happening daily (1,1,1,2). **(Medium, n=5)**
3. **36% mobile traffic with zero conversion path** — CLI product, mobile users bounce. **(High)**
4. **90% first-time visitors, almost none return** — 71/79 new. No retention for non-converters. **(High)**
5. **Active users highly engaged** — 220 changes + 401 reads from ~4 users = real value delivery. **(High)**
6. **Homepage bounce is biggest leak** — 84% never reach /connect. **(High)**

**Actions:**
1. **Build SEO content** for 'Google Ads MCP', 'Google Ads AI agent' — zero competition, 5-15 visitors/day in 4-6 weeks
2. **Reduce homepage bounce** — demo/video above the fold for desktop users, could double /connect visits
3. **Mobile email capture** — 'Get setup instructions sent to desktop' to recover 36% of lost traffic
4. **Celebrate** — users who convert love it. 621 AI actions from 5 users in 4 days. Distribution is the bottleneck, not product.
