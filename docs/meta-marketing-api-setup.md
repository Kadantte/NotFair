# Meta Marketing API Setup

End-to-end guide for getting NotFair approved on Meta's Marketing API so users can OAuth their Facebook/Instagram ad accounts and have NotFair read + manage them — mirroring our existing Google Ads MCP flow.

## Phase 0: Prerequisites

Reviewers reject apps that lack these. Don't skip.

### 0.1 Live URLs on www.notfair.co

| URL | Required content |
|---|---|
| `https://www.notfair.co/privacy` | Privacy policy mentioning: data collected from Meta (ad account info, campaign data, Page IDs), how we store it (encrypted), retention, deletion process, third-party sharing |
| `https://www.notfair.co/terms` | Terms of Service for using NotFair |
| `https://www.notfair.co/data-deletion` | Instructions for users to delete their data, OR a callback endpoint (`/api/meta/data-deletion`) Meta calls and our server processes |

If these pages don't exist, build them first. Everything downstream fails review without them.

### 0.2 Business Manager account

`https://business.facebook.com`

If we don't have one: click **Create Account** (top right), fill in business name `NotFair`, founder name, business email. Confirm via email link.

---

## Phase 1: Create the Meta App

### 1.1 Sign into the developer portal

`https://developers.facebook.com/apps/`

Sign in with the founder's personal Facebook account (Meta requires a real person as app admin). First-time users will be prompted to register as a developer — accept the terms.

### 1.2 Create the app

- **Create App** (top-right green button)
- Use case → **Other** → Next
- App type → **Business** → Next
- Details:
  - App name: `NotFair`
  - Contact email: a real, monitored inbox (Meta sends review notifications here)
  - Business Account: select the Business Manager from 0.2
- **Create App** → re-enter password to confirm

### 1.3 Capture App ID and Secret

Sidebar: **App settings → Basic**

- Copy **App ID** → store as `META_APP_ID`
- Click **Show** next to **App secret**, enter password, copy → store as `META_APP_SECRET`

---

## Phase 2: Add products

### 2.1 Marketing API

Sidebar **+ Add Product** → **Marketing API** → **Set Up**

### 2.2 Facebook Login for Business

Sidebar **+ Add Product** → **Facebook Login for Business** → **Set Up**

### 2.3 Configure Facebook Login for Business

Sidebar: **Facebook Login for Business → Configurations → Create configuration**

- Configuration name: `NotFair Ads OAuth`
- Login type: **Business login**
- Permissions:
  - `email`
  - `public_profile`
  - `ads_management`
  - `ads_read`
  - `business_management`
  - `pages_show_list` (surface the user's Page list when a new ad
    creative needs `object_story_spec.page_id` — *not* Page management)
  - `pages_read_engagement` (Meta-required sibling of `ads_management`;
    used by `getPagePostInsights` for paid-vs-organic comparison on
    boosted-post ads)
  - `instagram_basic`
- Assets to request:
  - Ad accounts (read + manage)
  - Pages (read — identity + aggregate post engagement; no management)
  - Instagram accounts (read)

Save. Note the **Configuration ID** — required in the OAuth URL.

### 2.4 OAuth redirect URIs

Sidebar: **Facebook Login for Business → Settings**

Valid OAuth Redirect URIs:

```
https://www.notfair.co/api/auth/meta/callback
https://notfair.co/api/auth/meta/callback
http://localhost:3000/api/auth/meta/callback
```

Allowed Domains for the JavaScript SDK: `notfair.co` (only if using JS SDK).

Save changes.

---

## Phase 3: App Settings → Basic

Fill every field — reviewers check.

| Field | Value |
|---|---|
| App icon | 1024×1024 PNG (NotFair logo) |
| Display name | `NotFair` |
| Namespace | blank |
| App domains | `notfair.co` |
| Privacy Policy URL | `https://www.notfair.co/privacy` |
| Terms of Service URL | `https://www.notfair.co/terms` |
| User data deletion | **Data Deletion Instructions URL** → `https://www.notfair.co/data-deletion` (or Callback URL if endpoint exists) |
| Category | Business and Pages |
| Business use | Support my own business |

Bottom: **+ Add Platform** → **Website** → Site URL `https://www.notfair.co`. Save.

---

## Phase 4: Data Use Checkup

Sidebar: **App Review → Data use checkup**

For each requested permission, declare:
- **Usage**: e.g., "Display user's ad account list and campaigns inside NotFair so they can analyze and edit campaigns via natural-language instructions"
- **Storage**: encrypted at rest, encrypted in transit (TLS)
- **Sharing**: not shared with third parties (or list honestly)
- **Retention**: until user disconnects or deletes account

Submit. Must be green-checked before App Review.

---

## Phase 5: Business Verification (start ASAP — 1–10 business days)

`https://business.facebook.com/settings/security` → **Start Verification**

### Required

1. Legal business name (matching incorporation docs)
2. Business address
3. Phone number Meta can call/text on the business domain
4. Website: `https://www.notfair.co`
5. Documents (one or more):
   - Articles of incorporation / certificate of formation
   - Business license, OR
   - IRS form (W-9, EIN confirmation)
6. Domain verification:
   - Business Settings → Brand Safety → Domains → Add `notfair.co`
   - Choose **DNS TXT verification**
   - Meta provides a TXT record (e.g., `facebook-domain-verification=abc123...`)
   - Add the TXT record in Vercel: Project Settings → Domains → DNS records → Add TXT
   - Wait ~10 min, click **Verify**

Submit. Move to Phase 6 in parallel.

---

## Phase 6: System User token (parallel with Phase 5)

Lets us develop and test against our own ad accounts immediately, without waiting on review.

### 6.1 Create the System User

`https://business.facebook.com/settings/system-users` → **Add**

- Name: `NotFair Backend`
- Role: **Admin**
- Create

### 6.2 Assign to ad account

Click the System User → **Add Assets** → **Ad Accounts** → select our ad account → **Manage ad account** → Save.

### 6.3 Generate token

- **Generate New Token**
- App: select the app from Phase 1
- Expiration: **Never**
- Permissions: `ads_management`, `ads_read`, `business_management`
- Generate

**Copy immediately** — Meta won't show it again. Store as `META_SYSTEM_USER_TOKEN`.

### 6.4 Verify

```bash
curl -G \
  -d "access_token=$META_SYSTEM_USER_TOKEN" \
  "https://graph.facebook.com/v22.0/me/adaccounts"
```

Should return our ad accounts. If yes, Marketing API is live for our own use.

---

## Phase 7: App Review (after Business Verification clears)

App dashboard → **App Review → Permissions and Features**

Request **advanced access** for each:
- `ads_management`
- `ads_read`
- `business_management`
- `pages_show_list`
- `pages_read_engagement` (Meta-required sibling of `ads_management`)
- `instagram_basic`

> Page-level *management* permissions (`pages_manage_ads`,
> `pages_manage_posts`) are intentionally **not** requested — Page-level
> writes are out of scope for the NotFair MCP. `pages_read_engagement`
> is the lone Page-side scope kept because Meta enforces it as a sibling
> of `ads_management`. See `docs/meta-app-review.md` for the scope
> decision.

### 7.1 Use case writeup (per permission)

Bad: "We use this to manage ads." → instant rejection.

Template:

> NotFair is an AI agent for Google Ads and Meta Ads management. After a user signs into NotFair and clicks "Connect Meta Ads," they're redirected to Facebook Login for Business. Once authorized, NotFair calls `GET /me/adaccounts?fields=id,name,currency` using `ads_read` to populate the user's ad account selector at https://www.notfair.co/connect.
>
> When the user issues a natural-language instruction like "pause my underperforming campaigns," our agent calls `POST /act_<id>/campaigns?status=PAUSED` using `ads_management`. All actions are user-initiated and visible in our change log.
>
> Data is stored encrypted (AES-256 at rest, TLS in transit) and only retained while the user has Meta connected. On disconnect or account deletion, all Meta data is purged within 24 hours via our data deletion endpoint.

### 7.2 Screencast (60–180s)

Record (QuickTime or Loom):
1. Open `https://www.notfair.co`
2. Sign up / sign in
3. Navigate to Connect page
4. Click **Connect Meta Ads**
5. Show the Facebook OAuth dialog with the permission name VISIBLE
6. Click Continue
7. Show return to NotFair
8. Show the feature actually using that permission (listing ad accounts, creating a campaign)

Upload to App Review submission.

### 7.3 Reproduction steps

Reviewers literally repeat these. Be exact:

```
1. Open https://www.notfair.co
2. Click "Sign in" → email: review@example.com, password: <provided>
3. Click "Connect Meta Ads" on the dashboard
4. Login with test Facebook account: <provided>
5. Approve the OAuth permissions
6. After redirect, click "View ad accounts" — list appears (uses ads_read)
7. Click "Create test campaign" — campaign created (uses ads_management)
```

### 7.4 Test credentials

- Apps Dashboard → Roles → Test Users → Add
- Give the test user a role on a test ad account
- Provide test user's email + password to reviewers

Submit. Initial response: 3–7 business days. Expect 1–2 rejection rounds — common rejections are screencast not showing the permission, or repro steps not working.

---

## After approval

Standard → Advanced Access flips automatically. Any OAuth user works.

### Token exchange for users

Short-lived token (~1 hr) → long-lived (~60 days):

```
GET https://graph.facebook.com/v22.0/oauth/access_token
  ?grant_type=fb_exchange_token
  &client_id={META_APP_ID}
  &client_secret={META_APP_SECRET}
  &fb_exchange_token={short-lived-token}
```

Store encrypted. Refresh proactively before expiry by re-running the exchange on any active session.

### API base

`https://graph.facebook.com/v22.0/` — pin a specific version, don't use `latest` (Meta deprecates versions every ~2 years).

---

## Timeline

| Day | Milestone |
|---|---|
| 0 | Privacy/ToS/Data-deletion pages live; Business Manager + verification queued; App created; Marketing API + Facebook Login for Business added |
| 0–10 | Business Verification in flight (parallel) |
| 1–14 | Build OAuth + core integration on Standard Access using System User token |
| 14 | Submit App Review |
| 17–28 | 1–2 review iterations |
| 28–35 | Advanced Access approved → ship to users |

## Critical path blockers

1. **Privacy/ToS/Data Deletion pages** — without them, App Review auto-rejects
2. **Business Verification** — slowest step (1–10 days), start day 0

Everything else is fast once those clear.

---

## Environment variables

| Var | Source | Purpose |
|---|---|---|
| `META_APP_ID` | Phase 1.3 | OAuth client ID, API calls |
| `META_APP_SECRET` | Phase 1.3 | Token exchange (server-side only) |
| `META_LOGIN_CONFIG_ID` | Phase 2.3 | Pass in OAuth URL to load our permission set |
| `META_SYSTEM_USER_TOKEN` | Phase 6.3 | Dev/testing against our own accounts |
| `META_GRAPH_API_VERSION` | Hardcode | `v22.0` (or current) |
| `META_REDIRECT_URI` | Phase 2.4 | OAuth callback (env-specific) |

## References

- Meta for Developers: https://developers.facebook.com/
- Marketing API docs: https://developers.facebook.com/docs/marketing-api/
- Facebook Login for Business: https://developers.facebook.com/docs/facebook-login/facebook-login-for-business
- Business Verification: https://www.facebook.com/business/help/2058515294227817
- Permissions reference: https://developers.facebook.com/docs/permissions
