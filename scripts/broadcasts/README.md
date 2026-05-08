# Broadcasts

Each `.ts` file in this folder defines one product-update broadcast.
The send script loads it by slug:

```bash
# Dry run — preview audience size + the rendered email, no sends
npx tsx scripts/send-broadcast.ts <slug> --dry-run

# Test — send only to one email so you can sanity-check rendering
npx tsx scripts/send-broadcast.ts <slug> --test you@notfair.co

# Live — send to the full audience
npx tsx scripts/send-broadcast.ts <slug>
```

Re-running after a partial send is safe: the
`broadcast_recipients (broadcast_id, user_id)` unique index makes inserts
idempotent and we skip recipients that already have a `resend_id`.

## File shape

```ts
// scripts/broadcasts/<slug>.ts
import type { BroadcastDefinition } from "../send-broadcast-types";

export const broadcast: BroadcastDefinition = {
  slug: "release-2026-05-08-meta-ads-beta",
  subject: "Meta Ads beta is live in NotFair",
  preheader: "Connect Meta the same way you did Google. Here's what's new.",
  content: {
    heading: "Meta Ads beta is live",
    greeting: "Hey,",
    paragraphs: [
      "We just shipped the first cut of NotFair for Meta Ads...",
      "It's the same flow as Google Ads — connect once, then talk to your account through Claude.",
    ],
    cta: { label: "Connect Meta Ads", href: "https://www.notfair.co/connect/meta-ads" },
    signature: "— Tong",
  },
};
```
