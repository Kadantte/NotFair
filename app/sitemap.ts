import type { MetadataRoute } from "next";
import { allLandingPages } from "@/lib/marketing-pages";
import { SITE_URL } from "@/lib/seo";

// Blog routes live in /blog/sitemap.xml (app/(marketing)/blog/sitemap.ts).
const publicMarketingRoutes = [
  "/",
  "/mcp",
  "/google-ads-claude",
  "/google-ads-claude-connector-setup-guide",
  "/google-ads-claude-code-plugin-setup-guide",
  "/google-ads-codex",
  "/google-ads-codex-mcp-setup-guide",
  "/google-ads-openclaw",
  "/google-ads-mcp",
  "/meta-ads-claude-connector-setup-guide",
  "/meta-ads-claude-code-plugin-setup-guide",
  "/meta-ads-codex-mcp-setup-guide",
  "/meta-ads-mcp",
  "/impact",
  "/privacy",
  "/terms",
  ...allLandingPages
    .filter((page) => page.index !== false)
    .map((page) => `/${page.slug}`),
];

const highPriorityRoutes = new Set([
  "/",
  "/mcp",
  "/google-ads-claude",
  "/google-ads-claude-connector-setup-guide",
  "/google-ads-claude-code-plugin-setup-guide",
  "/google-ads-codex",
  "/google-ads-codex-mcp-setup-guide",
  "/google-ads-openclaw",
  "/google-ads-mcp",
  "/meta-ads-claude-connector-setup-guide",
  "/meta-ads-claude-code-plugin-setup-guide",
  "/meta-ads-codex-mcp-setup-guide",
]);
const seoLandingRoutes = new Set([
  "/ai-google-ads-agent",
  "/google-ads-mcp",
  "/google-ads-openclaw",
  "/google-ads-connector",
  "/google-ads-ai-tool",
  "/google-ads-optimization-tool",
  "/meta-ads-mcp",
]);
const marketingPagesLastModified = new Date("2026-05-08");
const homepageLastModified = new Date("2026-04-07");

export default function sitemap(): MetadataRoute.Sitemap {
  return publicMarketingRoutes.map((route) => ({
    url: new URL(route, SITE_URL).toString(),
    lastModified: route === "/" ? homepageLastModified : marketingPagesLastModified,
    changeFrequency: route === "/" ? "weekly" : "monthly",
    priority: highPriorityRoutes.has(route)
      ? 1
      : seoLandingRoutes.has(route)
        ? 0.8
        : 0.6,
  }));
}
