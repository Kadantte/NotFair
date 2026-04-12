---
name: user-outreach
description: "Draft personalized outreach emails to AdsAgent users who connected their Google Ads accounts. Uses real audit data from their accounts to write hyper-relevant emails. Invoke this skill whenever the user wants to email new signups, reach out to connected users, draft onboarding emails, write welcome emails based on account data, or says things like 'email new users', 'reach out to signups', 'draft outreach for connected accounts', 'onboard new users', or 'who haven't I emailed yet'. Also trigger when the user asks to check which users need outreach."
---

# User Outreach: Personalized Emails from Real Audit Data

This skill drafts outreach emails to AdsAgent users who have connected their Google Ads accounts. Unlike cold outreach to strangers, these emails are hyper-relevant because you have access to their actual account data via the adsagent MCP tools.

The goal: make the user feel like a senior Google Ads expert personally reviewed their account and found something worth sharing. Because that's exactly what's happening.

## Tong's Voice

Every email comes from Tong. Here's who he is — use this naturally, not as a template:

- Former Meta data scientist
- Quit to buy a dog daycare in Seattle, now runs 3 locations (pawsvip.com)
- Built AdsAgent because he needed it for his own business
- Manages his own Google Ads — speaks from experience, not theory
- Casual, direct, no fluff. Writes like a founder texting a friend, not a salesperson drafting a pitch.

## Step 1: Find Users Who Need Outreach

First, identify who to email. Two approaches depending on what's available:

**Option A — Check the dev customers list:**
Use the `/api/dev/customers` endpoint or query `mcp_sessions` directly to get all connected users with their `googleEmail` and account IDs.

**Option B — Use adsagent MCP tools:**
Call `listConnectedAccounts` to see available accounts, then `getAccountInfo` for each.

Then cross-reference against sent emails in Gmail:
```
Search Gmail: "in:sent from:tongchen92@gmail.com" 
```
Compare recipient emails against connected user emails. Anyone not in sent = needs outreach.

## Step 2: Pull Account Data

You have THREE data sources, in priority order:

### Source 1: `audit_snapshots` table (best — has actionable findings)
```sql
SELECT account_id, overall_score, category, waste_rate, demand_captured,
  cpa, wasted_spend, total_spend, campaign_count, top_actions, created_at
FROM audit_snapshots WHERE account_id = '{id}' ORDER BY created_at DESC LIMIT 1
```
Fields: `overall_score` (0-100), `category` (OK/Good/etc), `waste_rate`, `demand_captured` (impression share %), `cpa`, `wasted_spend`, `total_spend`, `campaign_count`, and critically `top_actions` — a JSON array of specific recommended actions with impact estimates. This is gold for personalization.

### Source 2: `performance_snapshots` table (good — has real metrics)
```sql
SELECT account_id, count(distinct campaign_id) as campaigns,
  sum(impressions) as impressions, sum(clicks) as clicks,
  sum(cost_micros)/1000000.0 as spend, sum(conversions) as conversions,
  CASE WHEN sum(conversions)>0 THEN sum(cost_micros)/1000000.0/sum(conversions) END as cpa,
  CASE WHEN sum(impressions)>0 THEN round(sum(clicks)::numeric/sum(impressions)*100,2) END as ctr
FROM performance_snapshots WHERE account_id = '{id}' GROUP BY account_id
```
This gives you real impressions, clicks, CTR, spend, conversions, and CPA.

### Source 3: `accounts` table (basic — just budget/campaign counts)
```sql
SELECT daily_budget, active_campaigns, currency_code FROM accounts WHERE account_id = '{id}'
```

### Source 4: adsagent MCP tools (only works for Tong's connected accounts)
Use `listCampaigns`, `getCampaignPerformance`, `getConversionActions`, `getImpressionShare`, `getKeywords` — but these only work for accounts in the current session. For other users' accounts, rely on the database tables above.

### What to look for
Pick the ONE finding that matters most. Don't stack multiple issues. Key signals:
- **0 conversions with real spend** → conversion tracking is the problem
- **Very low CTR (<1%)** → ad copy or keyword relevance issue
- **High CPA** → wasted spend on wrong keywords
- **0 spend / 0 impressions** → account is dormant, offer setup help
- **Good metrics** → compliment them genuinely, then suggest the next level

## Step 3: Classify the Account

Based on the audit, classify into one of three tiers:

### Tier 1: Raw / Empty
**Signals:** All campaigns paused, no active spend, no conversion tracking, brand new account, or only Smart Campaigns with no manual setup.

**Email approach:**
- Empathetic, not salesy. They might be overwhelmed or had a bad experience.
- Offer free setup help — "happy to walk through it together"
- Ask what happened — "were there any issues?"
- Keep it SHORT (3-5 sentences). Don't overwhelm someone who's already overwhelmed.
- Subject should reference their situation gently

**Example (Luke — all paused):**
```
Subject: Figuring out google ads?

Hey Luke,

Thanks for signing up for AdsAgent!

I'm Tong, founder — former Meta data scientist, now running a multi-location dog daycare in Seattle.

I took a look at your account and noticed all your campaigns are paused. It looks like you've run them before — were there any issues? Happy to answer any questions.

Let me know if you'd like to walk through it together.

Best,

Tong
```

### Tier 2: Exists But Needs Work
**Signals:** Active campaigns but problems — too many conversion events, no conversion tracking, poor keyword structure, high wasted spend, low quality scores, missing negatives, broad match bleeding money.

**Email approach:**
- Lead with the SPECIFIC finding — the one thing that would make the biggest impact
- Explain WHY it matters (not just what's wrong, but the consequence)
- Show you understand their business context
- Offer to share what you found or help fix it
- Medium length (5-8 sentences). Enough to be credible, not so much they tune out.
- Subject should reference the specific issue + their business name

**Example (Fix Fireplace — conversion tracking mess):**
```
Subject: Fix Fireplace conversion tracking for google ads

Hey there, I built AdsAgent. Saw you connected your account so I took a look.

I think one of the biggest opportunities for you is cleaning up your conversion tracking. You have too many conversion events right now, and Google doesn't know which one to optimize for. That leads to a misleading cost per conversion, which hides the true performance of your campaigns and makes it hard to optimize.

A bit about me — I was a data scientist at Meta, quit my job and bought a dog daycare in Seattle in 2025, and since then it's grown to 3 locations (pawsvip.com). Almost all my traffic comes from organic and Google Ads, so I've spent a lot of time figuring out what actually moves the needle — happy to walk you through how I think about picking the right conversion events and structuring the funnel around them.

Let me know if you'd like me to share what I found in your account.

Tong
```

**Example (Plumbing Army — no conversion tracking):**
```
Subject: Conversion tracking for plumbingarmy

Hey there,

Thanks for signing up for AdsAgent! Quick intro — I'm Tong, the founder. I also run a multi-location dog daycare business here in Seattle, so I know firsthand how important it is to get real leads from Google Ads without overpaying for clicks that go nowhere.

I took a look at your account — your campaigns are still early, and Google Ads is definitely the right channel for plumbing services.

The biggest thing I'd recommend right now: set up conversion tracking. This tells Google which clicks actually turned into real leads, so it can find you more of them. It's the foundation everything else builds on.

Quick note on how AdsAgent works — we're not a traditional agency. We turn Claude into your Google Ads manager. With a Claude subscription, it can audit your account, set up conversions, manage campaigns, and more. AdsAgent itself is free for most users, and based on your current setup, the free tier should cover you easily.

Happy to help you get conversion tracking set up — just let me know.

Tong
```

### Tier 3: Strong Account
**Signals:** Good campaign structure, meaningful spend, reasonable conversion rates, decent impression share (20%+), active management.

**Email approach:**
- Compliment first — genuinely. "Top 10% of accounts we've audited" if true.
- Then identify the ONE opportunity they're likely missing (quality score, impression share loss, automation gaps)
- Position AdsAgent as a power tool, not a fix — they're already doing well
- Include demo video link if relevant: https://www.youtube.com/watch?v=PQNZUdRsUDM
- Offer cal.com link for a walkthrough: https://cal.com/tong-chen-uuovdl/30min
- Subject can be more forward — "use claude to manage google ads"

**Example (Manu — strong account, quality score opportunity):**
```
Subject: use claude to manage google ads

Hey Manu,

I'm Tong, founder of AdsAgent — former Meta data scientist, now running a multi-location dog daycare in Seattle.

I reviewed your account and honestly, it looks strong — easily top 10% of the accounts we've audited. 31% of search impression is huge. Nice work.

Your biggest opportunity right now is quality score. Your budget is solid, but your top keywords have low quality scores, meaning Google isn't serving them as often as it could. You're losing about 62% of impressions to rank alone.

AdsAgent isn't an agency — it turns Claude into your Google Ads manager. You can ask Claude to find your lowest-scoring keywords, diagnose why, and fix them on the spot with your approval.

Here's a quick demo: https://www.youtube.com/watch?v=PQNZUdRsUDM

Interested? I can help you get set up to try it yourself.

Tong
```

## Step 4: Draft the Email

For each user, compose the email with:

**Subject line rules:**
- Reference their business name or specific issue
- Lowercase is fine, casual
- NOT generic ("welcome to adsagent" is terrible)
- NOT self-referential about tool usage ("you've been busy on adsagent" sounds fake)
- Safe default when unsure: "AdsAgent + {company name}"
- Good: "Figuring out google ads?", "Conversion tracking for {business}", "{name} — your google ads"
- Great: references the specific finding like "Fix {company} conversion tracking for google ads"

**Body rules:**
- Open with something specific to THEIR account. Never generic.
- Include Tong's background naturally — it builds credibility
- Reference specific numbers from the audit (impression share %, number of conversion events, etc.)
- Explain AdsAgent's value prop briefly — "not an agency, turns Claude into your ads manager"
- End with a low-friction CTA — "let me know", "happy to walk through it", or cal.com link
- Plain text, no HTML formatting
- Sign off with just "Tong" or "Best,\n\nTong"

**What NOT to do:**
- Don't stack multiple findings. Pick the ONE biggest opportunity.
- Don't use marketing language ("revolutionary", "game-changing", "unlock")
- Don't send the same email template with names swapped
- Don't include screenshots unless the finding truly benefits from one
- Don't oversell — if their account is a mess, say so gently. If it's great, say so honestly.

## Step 5: Create Gmail Draft

Use `gmail_create_draft` to save each email as a draft. This lets Tong review and send from Gmail.

```
to: {user's google email}
subject: {personalized subject}
body: {plain text body}
```

Report to the user:
- How many drafts created
- For each: recipient, subject, tier classification, key finding
- Any accounts you couldn't audit (errors, access issues)

## Batch Processing

When processing multiple users, work through them one at a time since each requires MCP tool calls to audit. For each user:
1. Audit (3-5 MCP calls)
2. Classify tier
3. Draft email
4. Create Gmail draft
5. Report and move to next

Show progress as you go so Tong can course-correct early.
