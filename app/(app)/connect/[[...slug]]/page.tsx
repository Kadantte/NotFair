import { redirect } from "next/navigation";

type Props = {
  params: Promise<{ slug?: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * Backward-compat redirect. Google Ads MCP lives at /connect/google-ads now
 * (parallel to /connect/meta-ads). Old `/connect` and `/connect/<tab>` URLs
 * — bookmarks, marketing copy, OAuth callback fallbacks — forward to the
 * new path with their slug + query string preserved.
 *
 * Note: /connect/meta-ads/* is matched by the literal segment route; Next
 * gives static segments precedence over the catch-all here, so this only
 * fires for paths that aren't under meta-ads.
 */
export default async function LegacyConnectRedirect({ params, searchParams }: Props) {
  const { slug } = await params;
  const sp = await searchParams;
  const tail = slug && slug.length > 0 ? `/${slug.join("/")}` : "";
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (Array.isArray(v)) v.forEach((x) => qs.append(k, x));
    else if (typeof v === "string") qs.set(k, v);
  }
  const query = qs.toString();
  redirect(`/connect/google-ads${tail}${query ? `?${query}` : ""}`);
}
