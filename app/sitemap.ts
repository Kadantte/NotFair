import type { MetadataRoute } from "next";
import { allLandingPages } from "@/lib/marketing-pages";
import { allBlogPosts } from "@/lib/blog-posts";
import { SITE_URL } from "@/lib/seo";

const publicMarketingRoutes = [
  "/",
  "/google-ads-audit",
  "/google-ads-claude",
  "/google-ads-mcp-server",
  "/impact",
  "/privacy",
  "/terms",
  "/blog",
  ...allLandingPages.map((page) => `/${page.slug}`),
];

const highPriorityRoutes = new Set(["/", "/google-ads-audit", "/google-ads-claude", "/google-ads-mcp-server"]);
const seoLandingRoutes = new Set([
  "/ai-google-ads-agent",
  "/google-ads-mcp",
  "/connect-google-ads-to-claude",
  "/connect-google-ads-to-chatgpt",
  "/ai-google-ads-optimization",
]);
const marketingPagesLastModified = new Date("2026-04-07");

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const marketingEntries: MetadataRoute.Sitemap = publicMarketingRoutes.map(
    (route) => ({
      url: new URL(route, SITE_URL).toString(),
      lastModified: route === "/" ? now : marketingPagesLastModified,
      changeFrequency: route === "/" ? "weekly" : "monthly",
      priority: highPriorityRoutes.has(route) ? 1 : seoLandingRoutes.has(route) ? 0.8 : 0.6,
    })
  );

  const blogEntries: MetadataRoute.Sitemap = allBlogPosts.map((post) => ({
    url: new URL(`/blog/${post.slug}`, SITE_URL).toString(),
    lastModified: new Date(post.updatedAt),
    changeFrequency: "monthly",
    priority: 0.7,
  }));

  return [...marketingEntries, ...blogEntries];
}
