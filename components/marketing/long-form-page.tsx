import Link from "next/link";
import { FaqSection } from "@/components/marketing/faq-section";
import { LandingLinksSection } from "@/components/marketing/landing-links-section";
import type { LongFormContent } from "@/lib/long-form-pages";
import { SITE_NAME } from "@/lib/seo";

export function LongFormPage({ page }: { page: LongFormContent }) {
  return (
    <>
      <section className="px-4 pb-16 pt-24">
        <div className="container mx-auto max-w-5xl">
          <div className="max-w-3xl">
            <p className="text-sm font-medium uppercase tracking-[0.22em] text-[#4CAF6E]">
              {page.heroEyebrow}
            </p>
            <h1 className="mt-4 text-4xl font-semibold tracking-tight text-[#E8E4DD] md:text-6xl">
              {page.heroTitle}
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-relaxed text-[#C4C0B6]">
              {page.heroDescription}
            </p>
          </div>

          <div className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-3">
            {page.highlights.map((highlight) => (
              <div
                key={highlight}
                className="rounded-3xl border border-[#3D3C36] bg-[#24231F] p-6 text-sm leading-relaxed text-[#C4C0B6]"
              >
                {highlight}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 pb-20">
        <div className="container mx-auto max-w-5xl">
          <div className="space-y-12">
            {page.sections.map((section) => (
              <div
                key={section.title}
                className="grid gap-6 border-t border-[#3D3C36] pt-8 md:grid-cols-[0.85fr_1.15fr]"
              >
                <h2 className="text-2xl font-semibold text-[#E8E4DD]">
                  {section.title}
                </h2>
                <div>
                  <p className="text-sm leading-relaxed text-[#C4C0B6]">
                    {section.body}
                  </p>
                  {section.bullets?.length ? (
                    <ul className="mt-5 grid grid-cols-1 gap-3 text-sm leading-relaxed text-[#C4C0B6] md:grid-cols-2">
                      {section.bullets.map((bullet) => (
                        <li
                          key={bullet}
                          className="rounded-2xl border border-[#3D3C36] bg-[#24231F] p-4"
                        >
                          {bullet}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {page.comparisonTable ? (
        <section className="px-4 pb-20">
          <div className="container mx-auto max-w-5xl">
            <div className="mb-8 max-w-2xl">
              <p className="text-sm font-medium uppercase tracking-[0.22em] text-[#4CAF6E]">
                Side by side
              </p>
              <h2 className="mt-3 text-3xl font-semibold text-[#E8E4DD]">
                {page.comparisonTable.title}
              </h2>
              {page.comparisonTable.intro ? (
                <p className="mt-3 text-base leading-relaxed text-[#C4C0B6]">
                  {page.comparisonTable.intro}
                </p>
              ) : null}
            </div>
            <div className="overflow-hidden rounded-3xl border border-[#3D3C36] bg-[#24231F]">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-[#3D3C36] text-[10px] font-medium uppercase tracking-wider text-[#C4C0B6]">
                    <th className="px-6 py-4">Feature</th>
                    <th className="px-6 py-4 text-[#4CAF6E]">{SITE_NAME}</th>
                    <th className="px-6 py-4">
                      {page.comparisonTable.alternativeLabel}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {page.comparisonTable.rows.map((row) => (
                    <tr
                      key={row.feature}
                      className="border-b border-[#3D3C36] text-sm text-[#C4C0B6] last:border-0"
                    >
                      <td className="px-6 py-4 font-medium text-[#E8E4DD]">
                        {row.feature}
                      </td>
                      <td className="px-6 py-4">{row.notfair}</td>
                      <td className="px-6 py-4">{row.alternative}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      ) : null}

      <section className="px-4 pb-20">
        <div className="container mx-auto max-w-5xl">
          <div className="flex flex-col gap-4 rounded-3xl border border-[#3D3C36] bg-[#201F1B] p-8 md:flex-row md:items-center md:justify-between md:p-10">
            <div>
              <h2 className="text-2xl font-semibold text-[#E8E4DD]">
                {page.cta.title}
              </h2>
              <p className="mt-3 max-w-2xl text-base leading-relaxed text-[#C4C0B6]">
                {page.cta.body}
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link
                href={page.cta.primaryHref}
                className="rounded-full bg-[#4CAF6E] px-5 py-2.5 text-sm font-medium text-[#1A1917] transition-colors hover:bg-[#3D9A5C]"
              >
                {page.cta.primaryLabel}
              </Link>
              {page.cta.secondaryHref && page.cta.secondaryLabel ? (
                <Link
                  href={page.cta.secondaryHref}
                  className="rounded-full border border-[#3D3C36] px-5 py-2.5 text-sm font-medium text-[#E8E4DD] transition-colors hover:border-[#4CAF6E]/60"
                >
                  {page.cta.secondaryLabel}
                </Link>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      <FaqSection
        title="FAQ"
        intro="Short answers to the most common questions."
        items={page.faq}
      />

      <LandingLinksSection
        title="Related pages"
        intro="Keep exploring."
        links={page.related}
      />
    </>
  );
}
