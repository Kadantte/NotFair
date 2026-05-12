import { BLOG_DEFAULT_PAGE } from "./constants";

export type PaginationItem =
  | { type: "page"; page: number }
  | { type: "ellipsis"; key: "start-ellipsis" | "end-ellipsis" };

const SIBLING_COUNT = 1;

export function getPaginationItems(
  currentPage: number,
  totalPages: number,
): PaginationItem[] {
  const pages = new Set<number>([BLOG_DEFAULT_PAGE, totalPages]);

  for (
    let page = currentPage - SIBLING_COUNT;
    page <= currentPage + SIBLING_COUNT;
    page += 1
  ) {
    if (page > BLOG_DEFAULT_PAGE && page < totalPages) {
      pages.add(page);
    }
  }

  return Array.from(pages)
    .sort((a, b) => a - b)
    .reduce<PaginationItem[]>((items, page, index, sorted) => {
      const prev = sorted[index - 1];
      if (prev && page - prev > 1) {
        items.push({
          type: "ellipsis",
          key: prev === BLOG_DEFAULT_PAGE ? "start-ellipsis" : "end-ellipsis",
        });
      }
      items.push({ type: "page", page });
      return items;
    }, []);
}

export function getPageHref(basePath: string, page: number): string {
  return page === BLOG_DEFAULT_PAGE ? basePath : `${basePath}?page=${page}`;
}
