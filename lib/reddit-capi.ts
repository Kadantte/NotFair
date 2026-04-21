const REDDIT_CAPI_BASE = "https://ads-api.reddit.com/api/v3/pixels";

export const REDDIT_SIGNUP_ID_COOKIE = "reddit_signup_id";

export type RedditTrackingType =
  | "PageVisit"
  | "ViewContent"
  | "Search"
  | "AddToCart"
  | "AddToWishlist"
  | "Purchase"
  | "Lead"
  | "SignUp"
  | "Custom";

export type RedditActionSource =
  | "WEBSITE"
  | "APP"
  | "EMAIL"
  | "PHONE_CALL"
  | "CHAT"
  | "PHYSICAL_STORE"
  | "SYSTEM_GENERATED"
  | "OTHER";

export type RedditConversionInput = {
  trackingType: RedditTrackingType;
  customEventName?: string;
  conversionId: string;
  email?: string | null;
  externalId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  uuid?: string | null;
  clickId?: string | null;
  actionSource?: RedditActionSource;
  valueDecimal?: number;
  currency?: string;
};

export async function sendRedditConversion(event: RedditConversionInput): Promise<void> {
  const pixelId = process.env.REDDIT_PIXEL_ID ?? process.env.NEXT_PUBLIC_REDDIT_PIXEL_ID;
  const token = process.env.REDDIT_CONVERSION_ACCESS_TOKEN;

  if (!pixelId || !token) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[reddit-capi] REDDIT_PIXEL_ID or REDDIT_CONVERSION_ACCESS_TOKEN not set; skipping");
    }
    return;
  }

  const user: Record<string, string> = {};
  if (event.email) user.email = event.email.trim().toLowerCase();
  if (event.externalId) user.external_id = event.externalId;
  if (event.ipAddress) user.ip_address = event.ipAddress;
  if (event.userAgent) user.user_agent = event.userAgent;
  if (event.uuid) user.uuid = event.uuid;

  if (Object.keys(user).length === 0 && !event.clickId) {
    console.warn("[reddit-capi] no attribution signals; Reddit requires at least one");
    return;
  }

  const metadata: Record<string, unknown> = { conversion_id: event.conversionId };
  if (event.valueDecimal !== undefined) metadata.value = event.valueDecimal;
  if (event.currency) metadata.currency = event.currency;

  const body = {
    data: {
      events: [
        {
          event_at: Date.now(),
          action_source: event.actionSource ?? "WEBSITE",
          type: {
            tracking_type: event.trackingType,
            ...(event.customEventName ? { custom_event_name: event.customEventName } : {}),
          },
          ...(event.clickId ? { click_id: event.clickId } : {}),
          ...(Object.keys(user).length > 0 ? { user } : {}),
          metadata,
        },
      ],
    },
    ...(process.env.REDDIT_CAPI_TEST_MODE === "1" ? { test_mode: true } : {}),
  };

  try {
    const res = await fetch(
      `${REDDIT_CAPI_BASE}/${encodeURIComponent(pixelId)}/conversion_events`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      },
    );
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error("[reddit-capi] failed", { status: res.status, body: text.slice(0, 500) });
    }
  } catch (err) {
    console.error("[reddit-capi] exception", err);
  }
}
