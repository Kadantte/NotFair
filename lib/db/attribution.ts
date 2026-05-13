import { sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import {
  attributionToUserMetadata,
  paidTouchToUserMetadata,
  referrerDomain,
  type FirstTouchAttribution,
  type PaidTouchAttribution,
} from "@/lib/utm";

export type RecordUserAttributionInput = {
  userId: string | null | undefined;
  email?: string | null;
  signupMethod?: string | null;
  attribution?: FirstTouchAttribution | null;
  paidTouch?: PaidTouchAttribution | null;
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

function cleanPaidSource(attribution: PaidTouchAttribution | null | undefined): string | null {
  const metadata = paidTouchToUserMetadata(attribution);
  return typeof metadata.paid_source === "string" ? metadata.paid_source : null;
}

export function buildUserAttributionRecord(input: RecordUserAttributionInput) {
  if (!input.userId) return null;

  const attribution = input.attribution ?? null;
  const paidTouch = input.paidTouch ?? null;
  const rawAttribution = attributionToUserMetadata(attribution);
  const latestPaidTouch = paidTouchToUserMetadata(paidTouch);
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
    twclid: attribution?.twclid ?? null,
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
    paidSource: cleanPaidSource(paidTouch),
    paidMedium: paidTouch?.utm_medium ?? null,
    paidCampaign: paidTouch?.utm_campaign ?? null,
    paidTerm: paidTouch?.utm_term ?? null,
    paidContent: paidTouch?.utm_content ?? null,
    paidGclid: paidTouch?.gclid ?? null,
    paidFbclid: paidTouch?.fbclid ?? null,
    paidRdtCid: paidTouch?.rdt_cid ?? null,
    paidTwclid: paidTouch?.twclid ?? null,
    paidLandingUrl: paidTouch?.first_landing_url ?? null,
    paidLandingPath: paidTouch?.first_landing_path ?? null,
    paidCapturedAt: parseTimestamp(paidTouch?.attribution_captured_at),
    latestPaidTouch,
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
          twclid: sql`coalesce(${schema.userAttribution.twclid}, excluded.twclid)`,
          firstLandingUrl: sql`coalesce(${schema.userAttribution.firstLandingUrl}, excluded.first_landing_url)`,
          firstLandingPath: sql`coalesce(${schema.userAttribution.firstLandingPath}, excluded.first_landing_path)`,
          signupReferrer: sql`coalesce(${schema.userAttribution.signupReferrer}, excluded.signup_referrer)`,
          signupReferrerDomain: sql`coalesce(${schema.userAttribution.signupReferrerDomain}, excluded.signup_referrer_domain)`,
          attributionCapturedAt: sql`coalesce(${schema.userAttribution.attributionCapturedAt}, excluded.attribution_captured_at)`,
          attributionSource: sql`case when ${schema.userAttribution.attributionSource} = 'unknown' then excluded.attribution_source else ${schema.userAttribution.attributionSource} end`,
          attributionVersion: sql`greatest(${schema.userAttribution.attributionVersion}, excluded.attribution_version)`,
          rawAttribution: sql`case when ${schema.userAttribution.rawAttribution} = '{}'::jsonb then excluded.raw_attribution else ${schema.userAttribution.rawAttribution} || excluded.raw_attribution end`,
          paidSource: sql`coalesce(${schema.userAttribution.paidSource}, excluded.paid_source)`,
          paidMedium: sql`coalesce(${schema.userAttribution.paidMedium}, excluded.paid_medium)`,
          paidCampaign: sql`coalesce(${schema.userAttribution.paidCampaign}, excluded.paid_campaign)`,
          paidTerm: sql`coalesce(${schema.userAttribution.paidTerm}, excluded.paid_term)`,
          paidContent: sql`coalesce(${schema.userAttribution.paidContent}, excluded.paid_content)`,
          paidGclid: sql`coalesce(${schema.userAttribution.paidGclid}, excluded.paid_gclid)`,
          paidFbclid: sql`coalesce(${schema.userAttribution.paidFbclid}, excluded.paid_fbclid)`,
          paidRdtCid: sql`coalesce(${schema.userAttribution.paidRdtCid}, excluded.paid_rdt_cid)`,
          paidTwclid: sql`coalesce(${schema.userAttribution.paidTwclid}, excluded.paid_twclid)`,
          paidLandingUrl: sql`coalesce(${schema.userAttribution.paidLandingUrl}, excluded.paid_landing_url)`,
          paidLandingPath: sql`coalesce(${schema.userAttribution.paidLandingPath}, excluded.paid_landing_path)`,
          paidCapturedAt: sql`coalesce(${schema.userAttribution.paidCapturedAt}, excluded.paid_captured_at)`,
          latestPaidTouch: sql`case when ${schema.userAttribution.latestPaidTouch} = '{}'::jsonb then excluded.latest_paid_touch else ${schema.userAttribution.latestPaidTouch} end`,
          updatedAt: new Date(),
        },
      });
  } catch (err) {
    console.error("[attribution] Failed to record user attribution:", err);
  }
}
