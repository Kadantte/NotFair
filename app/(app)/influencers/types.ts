/**
 * Shared constants for the influencer reachout feature. Lives in its own file
 * (not actions.ts) so client components can import without pulling in
 * `"use server"` boundaries.
 */

export const CONTACT_KIND_INFLUENCER = "influencer" as const;

export const PLATFORMS = [
  "youtube",
  "instagram",
  "tiktok",
  "twitter",
  "linkedin",
  "threads",
  "substack",
  "podcast",
  "blog",
] as const;
export type Platform = (typeof PLATFORMS)[number];

export const PLATFORM_LABELS: Record<Platform, string> = {
  youtube: "YouTube",
  instagram: "Instagram",
  tiktok: "TikTok",
  twitter: "X / Twitter",
  linkedin: "LinkedIn",
  threads: "Threads",
  substack: "Substack",
  podcast: "Podcast",
  blog: "Blog",
};

export type DiscoveredBy = "agent" | "manual";

/** Affiliate-target follower range. The view filters and the stats card both use this. */
export const FOLLOWER_MIN = 500;
export const FOLLOWER_MAX = 50_000;

export function isInFollowerRange(n: number | null | undefined): boolean {
  return n != null && n >= FOLLOWER_MIN && n <= FOLLOWER_MAX;
}
