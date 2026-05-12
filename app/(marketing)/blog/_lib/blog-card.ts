import type { BlogPost } from "@/lib/blog-posts";

import type { OutrankArticle } from "../_types/blog";
import { BLOG_CARD_TAG_LIMIT } from "./constants";

export type BlogCardData = {
  href: string;
  title: string;
  description: string;
  tags: string[];
  imageUrl?: string | null;
  date: string;
  footerRight: string;
};

const CURATED_BADGE = "Guide";

export function curatedBlogPostToCard(post: BlogPost): BlogCardData {
  return {
    href: `/blog/${post.slug}`,
    title: post.title,
    description: post.description,
    tags: [CURATED_BADGE],
    imageUrl: null,
    date: post.publishedAt,
    footerRight: post.author.name,
  };
}

export function outrankArticleToCard(article: OutrankArticle): BlogCardData {
  return {
    href: `/blog/${article.slug}`,
    title: article.title,
    description: article.meta_description,
    tags: article.tags.slice(0, BLOG_CARD_TAG_LIMIT),
    imageUrl: article.image_url,
    date: article.created_at,
    footerRight: `${article.reading_time_minutes} min read`,
  };
}
