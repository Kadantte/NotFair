import { notFound } from "next/navigation";
import { BlogPostPage } from "@/components/marketing/blog-post";
import { getBlogPost, allBlogPosts } from "@/lib/blog-posts";
import { buildFaqJsonLd, buildMetadata, SITE_URL, SITE_NAME } from "@/lib/seo";

export function generateStaticParams() {
  return allBlogPosts.map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = getBlogPost(slug);

  if (!post) {
    return {};
  }

  return buildMetadata({
    title: post.seoTitle,
    description: post.description,
    path: `/blog/${post.slug}`,
    keywords: post.keywords,
  });
}

function buildBlogJsonLd(post: NonNullable<ReturnType<typeof getBlogPost>>) {
  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.description,
    datePublished: post.publishedAt,
    dateModified: post.updatedAt,
    author: {
      "@type": "Organization",
      name: post.author.name,
      url: SITE_URL,
    },
    publisher: {
      "@type": "Organization",
      name: SITE_NAME,
      url: SITE_URL,
    },
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": new URL(`/blog/${post.slug}`, SITE_URL).toString(),
    },
    keywords: post.keywords.join(", "),
  };
}

export default async function BlogPostRoute({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = getBlogPost(slug);

  if (!post) {
    notFound();
  }

  const blogJsonLd = buildBlogJsonLd(post);
  const faqJsonLd = buildFaqJsonLd(post.faq);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(blogJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <BlogPostPage post={post} />
    </>
  );
}
