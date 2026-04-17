import { PostHog } from "posthog-node";

let client: PostHog | null = null;

function getClient(): PostHog | null {
  if (client) return client;
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) return null;
  client = new PostHog(key, {
    host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com",
    flushAt: 1,
    flushInterval: 0,
  });
  return client;
}

export function trackServerEvent(
  userId: string | null | undefined,
  event: string,
  properties?: Record<string, unknown>,
) {
  const ph = getClient();
  if (!ph) return;
  ph.capture({
    distinctId: userId ?? "anonymous",
    event,
    properties,
  });
}

/**
 * Flush queued PostHog events. Call from `after(flushServerEvents)` in route
 * handlers so the Vercel Lambda stays alive long enough for the async POST to
 * complete — without this, posthog-node's flush races the Lambda freezing and
 * drops events (verified Apr 2026: 43% of user_signed_up events missing vs DB).
 */
export async function flushServerEvents() {
  if (!client) return;
  try {
    await client.flush();
  } catch (err) {
    console.error("[analytics-server] flush failed:", err);
  }
}
