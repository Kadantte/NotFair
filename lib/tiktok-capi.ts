import { createHash } from "crypto";

const TIKTOK_EVENTS_API = "https://business-api.tiktok.com/open_api/v1.3/pixel/track/";
const DEFAULT_PIXEL_ID = "D84CM1JC77U42GL8VQ50";

function sha256(value: string): string {
  return createHash("sha256").update(value.trim().toLowerCase()).digest("hex");
}

export type TiktokEvent = "CompleteRegistration" | "Subscribe" | "ViewContent" | "InitiateCheckout";

export type TiktokConversionInput = {
  event: TiktokEvent;
  eventId: string;
  email?: string | null;
  externalId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  pageUrl?: string | null;
  valueDecimal?: number;
  currency?: string;
};

/**
 * Fires a server-side event to TikTok Events API. PII (email, external_id)
 * is SHA-256 hashed before sending. `eventId` should match the browser pixel's
 * event_id for deduplication.
 */
export async function sendTiktokConversion(input: TiktokConversionInput): Promise<void> {
  const pixelCode = process.env.TIKTOK_PIXEL_ID ?? process.env.NEXT_PUBLIC_TIKTOK_PIXEL_ID ?? DEFAULT_PIXEL_ID;
  const token = process.env.TIKTOK_ACCESS_TOKEN;

  if (!token) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[tiktok-capi] TIKTOK_ACCESS_TOKEN not set; skipping");
    }
    return;
  }

  const user: Record<string, string> = {};
  if (input.email) user.email = sha256(input.email);
  if (input.externalId) user.external_id = sha256(input.externalId);
  if (input.ipAddress) user.ip = input.ipAddress;
  if (input.userAgent) user.user_agent = input.userAgent;

  const body = {
    pixel_code: pixelCode,
    event: input.event,
    event_id: input.eventId,
    timestamp: new Date().toISOString(),
    context: {
      ...(Object.keys(user).length > 0 ? { user } : {}),
      ...(input.pageUrl ? { page: { url: input.pageUrl } } : {}),
    },
    properties: {
      currency: input.currency ?? "USD",
      value: String(input.valueDecimal ?? 1.0),
    },
  };

  try {
    const res = await fetch(TIKTOK_EVENTS_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Access-Token": token,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error("[tiktok-capi] failed", { event: input.event, status: res.status, body: text.slice(0, 500) });
    } else {
      const json = await res.json().catch(() => null);
      if (json?.code !== 0) {
        console.error("[tiktok-capi] API error", { event: input.event, code: json?.code, message: json?.message });
      }
    }
  } catch (err) {
    console.error("[tiktok-capi] exception", { event: input.event, err });
  }
}

/**
 * Back-compat: existing callers pass the old signup-specific shape.
 * Delegates to `sendTiktokConversion` with event="CompleteRegistration".
 */
export async function sendTiktokSignupConversion(
  input: Omit<TiktokConversionInput, "event">,
): Promise<void> {
  return sendTiktokConversion({ event: "CompleteRegistration", ...input });
}
