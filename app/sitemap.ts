import type { MetadataRoute } from "next";
import { allLandingPages } from "@/lib/marketing-pages";
import { allBlogPosts } from "@/lib/blog-posts";
import { SITE_URL } from "@/lib/seo";

const publicMarketingRoutes = [
  "/",
  "/google-ads-audit",
  "/impact",
  "/privacy",
  "/terms",
  "/blog",
  ...allLandingPages.map((page) => `/${page.slug}`),
];

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  const highPriorityRoutes = new Set(["/", "/google-ads-audit"]);
  const marketingEntries: MetadataRoute.Sitemap = publicMarketingRoutes.map(
    (route) => ({
      url: new URL(route, SITE_URL).toString(),
      lastModified: now,
      changeFrequency: route === "/" ? "weekly" : "monthly",
      priority: highPriorityRoutes.has(route) ? 1 : 0.6,
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
