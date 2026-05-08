import type { BroadcastDefinition } from "../send-broadcast-types";

/**
 * Example/template product-update broadcast.
 *
 * Copy this file to a new slug (e.g. `release-2026-05-08-meta-ads-beta.ts`)
 * and fill in the real copy before sending.
 */
export const broadcast: BroadcastDefinition = {
  slug: "example-product-update",
  subject: "What's new in NotFair this week",
  preheader: "A short, scannable update on what just shipped.",
  content: {
    heading: "What's new in NotFair this week",
    greeting: "Hey,",
    paragraphs: [
      "Quick update on what shipped this week — nothing for you to do, just keeping you in the loop.",
      "Replace this paragraph with the real change. Keep it concrete: one feature per email beats a roundup nobody reads.",
    ],
    cta: {
      label: "Try it now",
      href: "https://www.notfair.co/dashboard",
    },
    signature: "— Tong, NotFair",
  },
};
