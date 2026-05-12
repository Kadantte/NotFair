export const BLOG_DEFAULT_PAGE = 1;
export const BLOG_ARTICLES_PER_PAGE = 12;
export const BLOG_SITEMAP_PAGE_SIZE = 100;
export const BLOG_REVALIDATE_SECONDS =
  process.env.NODE_ENV === "development" ? 1 : 60;
export const BLOG_CARD_TAG_LIMIT = 3;
// Featured curated cards shown on page 1 of the listing. Subsequent curated
// posts remain reachable via direct URL, sitemap, and internal cross-links —
// they don't disappear, they just stop competing with Outrank for grid space.
export const BLOG_CURATED_LEAD_LIMIT = 3;
