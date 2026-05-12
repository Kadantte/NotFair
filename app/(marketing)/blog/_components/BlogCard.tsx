import Image from "next/image";
import Link from "next/link";

import type { BlogCardData } from "../_lib/blog-card";
import { formatDate } from "../_lib/format";

type Props = {
  card: BlogCardData;
};

const BlogCard = ({ card }: Props) => {
  return (
    <Link href={card.href} prefetch className="group block h-full">
      <article className="flex h-full flex-col overflow-hidden rounded-lg border border-[#3D3C36] bg-[#24231F] transition-colors hover:border-[#4CAF6E]/40">
        {card.imageUrl ? (
          <div className="relative aspect-[16/9] overflow-hidden bg-[#2E2D28]">
            <Image
              src={card.imageUrl}
              alt={card.title}
              fill
              sizes="(min-width: 1024px) 33vw, 100vw"
              className="object-cover transition duration-500 group-hover:scale-[1.02]"
            />
          </div>
        ) : null}
        <div className="flex flex-1 flex-col p-6">
          {card.tags.length ? (
            <div className="mb-4 flex flex-wrap gap-2">
              {card.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full border border-[#3D3C36] bg-[#2E2D28] px-2.5 py-0.5 text-xs font-medium text-[#C4C0B6]"
                >
                  {tag}
                </span>
              ))}
            </div>
          ) : null}
          <h2 className="text-lg font-semibold leading-tight text-[#E8E4DD] transition-colors group-hover:text-[#4CAF6E]">
            {card.title}
          </h2>
          <p className="mt-3 line-clamp-3 text-sm leading-6 text-[#C4C0B6]">
            {card.description}
          </p>
          <div className="mt-auto flex items-center justify-between gap-4 pt-6 text-xs font-medium text-[#C4C0B6]">
            <time dateTime={card.date}>{formatDate(card.date)}</time>
            <span>{card.footerRight}</span>
          </div>
        </div>
      </article>
    </Link>
  );
};

export default BlogCard;
