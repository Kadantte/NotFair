import crypto from "crypto";

const X_CAPI_BASE = "https://ads-api.twitter.com/12/measurement/conversions";

export type XConversionInput = {
  conversionId: string;
  email?: string | null;
  valueDecimal?: number;
  currency?: string;
};

export async function sendXConversion(event: XConversionInput): Promise<void> {
  // Provided pixel id: q27qa, event id: tw-q27qa-q27qc
  const pixelId = process.env.X_PIXEL_ID ?? "q27qa";
  const eventId = process.env.X_EVENT_ID ?? "tw-q27qa-q27qc";
  const token = process.env.X_CONVERSION_ACCESS_TOKEN;

  if (!token) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[x-capi] X_CONVERSION_ACCESS_TOKEN not set; skipping server-side X event");
    }
    return;
  }

  const identifiers: Array<{ [key: string]: string }> = [];

  if (event.email) {
    const hashedEmail = crypto
      .createHash("sha256")
      .update(event.email.trim().toLowerCase())
      .digest("hex");
    identifiers.push({ hashed_email: hashedEmail });
  }

  if (identifiers.length === 0) {
    console.warn("[x-capi] no attribution signals (email); X requires at least one for CAPI");
    return;
  }

  const body = {
    conversions: [
      {
        conversion_time: new Date().toISOString(),
        event_id: eventId,
        identifiers: identifiers,
        conversion_id: event.conversionId,
        ...(event.valueDecimal !== undefined ? { value: event.valueDecimal.toString() } : {}),
        ...(event.currency ? { currency: event.currency } : {}),
      },
    ],
  };

  try {
    const res = await fetch(`${X_CAPI_BASE}/${encodeURIComponent(pixelId)}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });
    
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error("[x-capi] failed", { status: res.status, body: text.slice(0, 500) });
    }
  } catch (err) {
    console.error("[x-capi] exception", err);
  }
}
