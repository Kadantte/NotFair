---
question: "Where are the most recent new users coming from?"
date: 2026-04-09 15:00 PDT
data_sources: PostHog HogQL $pageview (last 30d) | Supabase auth.users (last 30d)
html: docs/analysis/2026-04-09_15-00_user-acquisition-sources.html
---

**Verdict:** Reddit is driving today's signup spike (8+ visitors from Reddit since midnight). The Apr 4 spike was an IBM Acoustic email newsletter (9 unique visitors from a single send). GitHub is a steady organic channel (11 users, 4 new today).

**Findings:**
- Reddit: 30 users (30d) — today's spike driver, referrer is reddit.com homepage feed
- GitHub: 11 users — developers landing directly on /connect after reading README
- IBM Acoustic email (Apr 4): 9 users from single newsletter send — unknown sender
- Google organic: 10 users landing on /audit and /connect
- Direct/dark social: 64 users — unattributable without UTM links

**So what:**
1. Find the Reddit post today — search for 'adsagent' in r/PPC, r/googleads, r/marketing
2. Add UTM to GitHub README link (11 users/mo with zero attribution)
3. Identify the IBM Acoustic newsletter author and pursue dedicated feature
4. Add UTM params to all shared links — 64 "direct" users would become attributed
