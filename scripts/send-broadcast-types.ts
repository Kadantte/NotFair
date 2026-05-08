import type { BroadcastContent } from "../lib/email/broadcast-content";

export type BroadcastDefinition = {
  /** URL-safe slug, e.g. "release-2026-05-08-meta-ads-beta". Unique forever. */
  slug: string;
  subject: string;
  preheader?: string;
  content: BroadcastContent;
};
