import Link from "next/link";
import { allBlogPosts } from "@/lib/blog-posts";
import { buildMetadata } from "@/lib/seo";

export const metadata = buildMetadata({
  title: "Blog — AdsAgent",
  description:
    "Guides and explainers on MCP, Google Ads automation, and AI-driven campaign management from the AdsAgent team.",
  path: "/blog",
  keywords: [
    "AdsAgent blog",
    "MCP guides",
    "Google Ads AI",
    "Google Ads MCP",
  ],
});

export default function BlogIndex() {
  const posts = allBlogPosts.sort(
    (a, b) =>
      new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
  );

  return (
    <section className="px-4 pb-20 pt-24">
      <div className="container mx-auto max-w-5xl">
        <div className="max-w-3xl">
          <p className="text-sm font-medium uppercase tracking-[0.22em] text-[#4CAF6E]">
            Blog
          </p>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight text-[#E8E4DD] md:text-5xl">
            Guides and explainers
          </h1>
          <p className="mt-4 text-base leading-relaxed text-[#C4C0B6]">
            Practical content on MCP, Google Ads automation, and building
            AI-driven ad workflows.
          </p>
        </div>

        <div className="mt-12 grid gap-4">
          {posts.map((post) => (
            <Link
              key={post.slug}
              href={`/blog/${post.slug}`}
              prefetch
              className="group rounded-lg border border-[#3D3C36] bg-[#24231F] p-6 transition-colors hover:border-[#4CAF6E]/40"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-[#E8E4DD] group-hover:text-[#4CAF6E] transition-colors">
                    {post.title}
                  </h2>
                  <p className="mt-2 text-sm leading-relaxed text-[#C4C0B6]">
                    {post.description}
                  </p>
                </div>
                <time
                  dateTime={post.publishedAt}
                  className="flex-shrink-0 text-sm text-[#C4C0B6]"
                >
                  {new Date(post.publishedAt).toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                  })}
                </time>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
