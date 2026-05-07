import { sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import {
  attributionToUserMetadata,
  referrerDomain,
  type FirstTouchAttribution,
} from "@/lib/utm";

export type RecordUserAttributionInput = {
  userId: string | null | undefined;
  email?: string | null;
  signupMethod?: string | null;
  attribution?: FirstTouchAttribution | null;
  attributionSource: string;
};

function parseTimestamp(value: unknown): Date | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function cleanSource(attribution: FirstTouchAttribution | null | undefined): string | null {
  return attribution?.utm_source
    ?? attribution?.signup_referrer_domain
    ?? referrerDomain(attribution?.signup_referrer)
    ?? null;
}

export function buildUserAttributionRecord(input: RecordUserAttributionInput) {
  if (!input.userId) return null;

  const attribution = input.attribution ?? null;
  const rawAttribution = attributionToUserMetadata(attribution);
  return {
    userId: input.userId,
    email: input.email ?? null,
    signupMethod: input.signupMethod ?? null,
    source: cleanSource(attribution),
    medium: attribution?.utm_medium ?? null,
    campaign: attribution?.utm_campaign ?? null,
    term: attribution?.utm_term ?? null,
    content: attribution?.utm_content ?? null,
    gclid: attribution?.gclid ?? null,
    fbclid: attribution?.fbclid ?? null,
    rdtCid: attribution?.rdt_cid ?? null,
    firstLandingUrl: attribution?.first_landing_url ?? null,
    firstLandingPath: attribution?.first_landing_path ?? null,
    signupReferrer: attribution?.signup_referrer ?? null,
    signupReferrerDomain:
      attribution?.signup_referrer_domain
      ?? referrerDomain(attribution?.signup_referrer)
      ?? null,
    attributionCapturedAt: parseTimestamp(attribution?.attribution_captured_at),
    attributionSource: input.attributionSource,
    attributionVersion: attribution?.version ?? 1,
    rawAttribution,
    updatedAt: new Date(),
  };
}

/**
 * Upsert first-touch attribution without breaking auth if analytics logging
 * fails. Existing non-null first-touch fields win; later auth reconnects only
 * fill gaps and refresh support fields like email/updatedAt.
 */
export async function recordUserAttribution(input: RecordUserAttributionInput): Promise<void> {
  const record = buildUserAttributionRecord(input);
  if (!record) return;

  try {
    await db()
      .insert(schema.userAttribution)
      .values(record)
      .onConflictDoUpdate({
        target: schema.userAttribution.userId,
        set: {
          email: sql`coalesce(excluded.email, ${schema.userAttribution.email})`,
          signupMethod: sql`coalesce(${schema.userAttribution.signupMethod}, excluded.signup_method)`,
          source: sql`coalesce(${schema.userAttribution.source}, excluded.source)`,
          medium: sql`coalesce(${schema.userAttribution.medium}, excluded.medium)`,
          campaign: sql`coalesce(${schema.userAttribution.campaign}, excluded.campaign)`,
          term: sql`coalesce(${schema.userAttribution.term}, excluded.term)`,
          content: sql`coalesce(${schema.userAttribution.content}, excluded.content)`,
          gclid: sql`coalesce(${schema.userAttribution.gclid}, excluded.gclid)`,
          fbclid: sql`coalesce(${schema.userAttribution.fbclid}, excluded.fbclid)`,
          rdtCid: sql`coalesce(${schema.userAttribution.rdtCid}, excluded.rdt_cid)`,
          firstLandingUrl: sql`coalesce(${schema.userAttribution.firstLandingUrl}, excluded.first_landing_url)`,
          firstLandingPath: sql`coalesce(${schema.userAttribution.firstLandingPath}, excluded.first_landing_path)`,
          signupReferrer: sql`coalesce(${schema.userAttribution.signupReferrer}, excluded.signup_referrer)`,
          signupReferrerDomain: sql`coalesce(${schema.userAttribution.signupReferrerDomain}, excluded.signup_referrer_domain)`,
          attributionCapturedAt: sql`coalesce(${schema.userAttribution.attributionCapturedAt}, excluded.attribution_captured_at)`,
          attributionSource: sql`case when ${schema.userAttribution.attributionSource} = 'unknown' then excluded.attribution_source else ${schema.userAttribution.attributionSource} end`,
          attributionVersion: sql`greatest(${schema.userAttribution.attributionVersion}, excluded.attribution_version)`,
          rawAttribution: sql`case when ${schema.userAttribution.rawAttribution} = '{}'::jsonb then excluded.raw_attribution else ${schema.userAttribution.rawAttribution} || excluded.raw_attribution end`,
          updatedAt: new Date(),
        },
      });
  } catch (err) {
    console.error("[attribution] Failed to record user attribution:", err);
  }
}
