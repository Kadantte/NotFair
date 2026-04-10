/**
 * Landing Page Fetcher & Analyzer
 *
 * Fetches ad final URLs and extracts signals relevant to Google Ads
 * quality scoring: title, meta description, forms/CTAs, mobile viewport,
 * HTTPS, and basic load health.
 *
 * Runs server-side only — called from audit actions during Phase 2.
 */

export type LandingPageAnalysis = {
  url: string;
  ok: boolean;
  https: boolean;
  statusCode: number | null;
  title: string | null;
  metaDescription: string | null;
  h1: string | null;
  hasForm: boolean;
  hasMobileViewport: boolean;
  loadTimeMs: number | null;
  errorReason: string | null;
};

const FETCH_TIMEOUT_MS = 8_000;

/**
 * Analyze a single landing page URL.
 * Returns structured signals without requiring a full browser/DOM parser —
 * uses regex on the raw HTML, which is sufficient for meta tags and forms.
 */
export async function analyzeLandingPage(url: string): Promise<LandingPageAnalysis> {
  const base: LandingPageAnalysis = {
    url,
    ok: false,
    https: url.startsWith("https://"),
    statusCode: null,
    title: null,
    metaDescription: null,
    h1: null,
    hasForm: false,
    hasMobileViewport: false,
    loadTimeMs: null,
    errorReason: null,
  };

  const start = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; AdsAgentAudit/1.0; +https://www.adsagent.org)",
        Accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
    });

    clearTimeout(timeout);
    base.loadTimeMs = Date.now() - start;
    base.statusCode = res.status;
    base.ok = res.ok;

    if (!res.ok) {
      base.errorReason = `HTTP ${res.status}`;
      return base;
    }

    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
      base.errorReason = `Non-HTML content-type: ${contentType}`;
      return base;
    }

    // Read a limited amount of HTML (first 200KB is plenty for <head> + first <form>)
    const reader = res.body?.getReader();
    if (!reader) {
      base.errorReason = "No response body";
      return base;
    }

    let html = "";
    const decoder = new TextDecoder();
    const MAX_BYTES = 200 * 1024;
    let bytesRead = 0;

    while (bytesRead < MAX_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      bytesRead += value.byteLength;
      html += decoder.decode(value, { stream: true });
    }
    reader.cancel().catch(() => {});

    // Extract signals from raw HTML via regex
    base.title = extractTag(html, "title");
    base.metaDescription = extractMeta(html, "description");
    base.h1 = extractTag(html, "h1");
    base.hasForm = /<form[\s>]/i.test(html);
    base.hasMobileViewport =
      /meta[^>]+name=["']viewport["'][^>]+content=["'][^"']*width\s*=/i.test(html);
  } catch (err: unknown) {
    base.loadTimeMs = Date.now() - start;
    if (err instanceof Error) {
      if (err.name === "AbortError") {
        base.errorReason = `Timeout after ${FETCH_TIMEOUT_MS}ms`;
      } else {
        base.errorReason = err.message;
      }
    } else {
      base.errorReason = "Unknown fetch error";
    }
  }

  return base;
}

/**
 * Deduplicate ad final URLs and analyze up to `limit` unique pages in parallel.
 */
export async function analyzeAdLandingPages(
  ads: Array<{ finalUrls: string[] }>,
  limit = 10,
): Promise<LandingPageAnalysis[]> {
  const uniqueUrls = [...new Set(ads.flatMap((a) => a.finalUrls).filter(Boolean))];
  const urls = uniqueUrls.slice(0, limit);

  if (urls.length === 0) return [];

  // Fetch all in parallel with individual error isolation
  const results = await Promise.all(urls.map((u) => analyzeLandingPage(u)));
  return results;
}

// ─── HTML extraction helpers ──────────────────────────────────────────

function extractTag(html: string, tag: string): string | null {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i");
  const m = html.match(re);
  if (!m) return null;
  // Strip inner tags and collapse whitespace
  const text = m[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
  return text || null;
}

function extractMeta(html: string, name: string): string | null {
  // Match <meta name="description" content="..."> in either order
  const re = new RegExp(
    `<meta[^>]+(?:name=["']${name}["'][^>]+content=["']([^"']+)["']|content=["']([^"']+)["'][^>]+name=["']${name}["'])`,
    "i",
  );
  const m = html.match(re);
  return m?.[1] ?? m?.[2] ?? null;
}
