import Link from "next/link";
import type { MarketingLink } from "@/lib/marketing-pages";

export function LandingLinksSection({
  title,
  intro,
  links,
}: {
  title: string;
  intro?: string;
  links: MarketingLink[];
}) {
  return (
    <section className="px-4 pb-20">
      <div className="container mx-auto max-w-5xl">
        <div className="mb-10 max-w-2xl">
          <h2 className="text-3xl font-semibold tracking-tight text-[#E8E4DD] md:text-4xl">
            {title}
          </h2>
          {intro ? (
            <p className="mt-4 text-base leading-relaxed text-[#C4C0B6]">{intro}</p>
          ) : null}
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-3xl border border-[#3D3C36] bg-[#24231F] p-6 transition-colors hover:border-[#4CAF6E]/60"
            >
              <h3 className="text-lg font-semibold text-[#E8E4DD]">{link.title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-[#C4C0B6]">
                {link.description}
              </p>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
