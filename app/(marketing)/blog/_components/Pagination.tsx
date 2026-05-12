import Link from "next/link";

import { getPageHref, getPaginationItems } from "../_lib/pagination";

type Props = {
  basePath: string;
  currentPage: number;
  totalPages: number;
};

const linkBase =
  "rounded-md border px-3.5 py-2 text-sm font-medium transition-colors";
const inactiveLink =
  "border-[#3D3C36] bg-[#24231F] text-[#E8E4DD] hover:border-[#4CAF6E]/40 hover:text-[#4CAF6E]";
const activeLink =
  "border-[#4CAF6E] bg-[#4CAF6E] text-[#1A1917] hover:border-[#3D9A5C] hover:bg-[#3D9A5C]";

const Pagination = ({ basePath, currentPage, totalPages }: Props) => {
  if (totalPages <= 1) return null;

  const items = getPaginationItems(currentPage, totalPages);

  return (
    <nav
      className="mt-12 flex flex-wrap items-center justify-center gap-2"
      aria-label="Pagination"
    >
      {currentPage > 1 ? (
        <Link
          href={getPageHref(basePath, currentPage - 1)}
          className={`${linkBase} ${inactiveLink}`}
        >
          Previous
        </Link>
      ) : null}
      {items.map((item) =>
        item.type === "ellipsis" ? (
          <span
            key={item.key}
            className="px-2 text-sm text-[#C4C0B6]"
            aria-hidden="true"
          >
            ...
          </span>
        ) : (
          <Link
            key={item.page}
            href={getPageHref(basePath, item.page)}
            aria-current={item.page === currentPage ? "page" : undefined}
            className={`${linkBase} ${item.page === currentPage ? activeLink : inactiveLink}`}
          >
            {item.page}
          </Link>
        ),
      )}
      {currentPage < totalPages ? (
        <Link
          href={getPageHref(basePath, currentPage + 1)}
          className={`${linkBase} ${inactiveLink}`}
        >
          Next
        </Link>
      ) : null}
    </nav>
  );
};

export default Pagination;
