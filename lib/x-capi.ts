import crypto from "crypto";

const X_CAPI_BASE = "https://ads-api.x.com/12/measurement/conversions";

export type XConversionInput = {
  conversionId: string;
  email?: string | null;
  valueDecimal?: number;
  currency?: string;
};

// RFC3986 percent encoding — stricter than encodeURIComponent (encodes ! * ' ( )).
function rfc3986(value: string): string {
  return encodeURIComponent(value).replace(
    /[!*'()]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

// Build OAuth 1.0a Authorization header for a JSON POST. JSON body bytes are
// intentionally excluded from the signature base string — Twitter Ads API
// signs only OAuth params + URL query params for non-form-encoded requests.
function oauth1Header(params: {
  method: string;
  url: string;
  consumerKey: string;
  consumerSecret: string;
  accessToken: string;
  accessTokenSecret: string;
}): string {
  const oauthParams: Record<string, string> = {
    oauth_consumer_key: params.consumerKey,
    oauth_nonce: crypto.randomBytes(16).toString("hex"),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: params.accessToken,
    oauth_version: "1.0",
  };

  const paramString = Object.keys(oauthParams)
    .sort()
    .map((k) => `${rfc3986(k)}=${rfc3986(oauthParams[k])}`)
    .join("&");

  const baseString = [
    params.method.toUpperCase(),
    rfc3986(params.url),
    rfc3986(paramString),
  ].join("&");

  const signingKey = `${rfc3986(params.consumerSecret)}&${rfc3986(params.accessTokenSecret)}`;
  const signature = crypto
    .createHmac("sha1", signingKey)
    .update(baseString)
    .digest("base64");

  const headerParams: Record<string, string> = { ...oauthParams, oauth_signature: signature };
  return (
    "OAuth " +
    Object.keys(headerParams)
      .sort()
      .map((k) => `${rfc3986(k)}="${rfc3986(headerParams[k])}"`)
      .join(", ")
  );
}

export async function sendXConversion(event: XConversionInput): Promise<void> {
  const pixelId = process.env.X_PIXEL_ID ?? "q27qa";
  const eventId = process.env.X_EVENT_ID ?? "tw-q27qa-q27qc";
  const consumerKey = process.env.X_CONSUMER_KEY;
  const consumerSecret = process.env.X_CONSUMER_SECRET;
  const accessToken = process.env.X_ACCESS_TOKEN;
  const accessTokenSecret = process.env.X_ACCESS_TOKEN_SECRET;

  if (!consumerKey || !consumerSecret || !accessToken || !accessTokenSecret) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        "[x-capi] X OAuth 1.0a credentials missing; skipping server-side X event",
      );
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
        ...(event.currency ? { price_currency: event.currency } : {}),
      },
    ],
  };

  const url = `${X_CAPI_BASE}/${encodeURIComponent(pixelId)}`;
  const authorization = oauth1Header({
    method: "POST",
    url,
    consumerKey,
    consumerSecret,
    accessToken,
    accessTokenSecret,
  });

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authorization,
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
