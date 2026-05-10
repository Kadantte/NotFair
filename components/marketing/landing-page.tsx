import Link from "next/link";
import type { LandingPageContent } from "@/lib/marketing-pages";
import { FaqSection } from "@/components/marketing/faq-section";
import { LandingLinksSection } from "@/components/marketing/landing-links-section";

export function LandingPage({ page }: { page: LandingPageContent }) {
  return (
    <>
      <section className="px-4 pb-16 pt-24">
        <div className="container mx-auto max-w-5xl">
          <div className="max-w-3xl">
            <p className="text-sm font-medium uppercase tracking-[0.22em] text-[#4CAF6E]">
              NotFair
            </p>
            <h1 className="mt-4 text-4xl font-semibold tracking-tight text-[#E8E4DD] md:text-6xl">
              {page.heroTitle}
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-relaxed text-[#C4C0B6]">
              {page.heroDescription}
            </p>
          </div>

          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {page.highlights.map((highlight) => (
              <div
                key={highlight}
                className="rounded-3xl border border-[#3D3C36] bg-[#24231F] p-6 text-sm leading-relaxed text-[#C4C0B6]"
              >
                {highlight}
              </div>
            ))}
          </div>

          <div className="mt-10 flex flex-col gap-3 rounded-3xl border border-[#3D3C36] bg-[#201F1B] p-6 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-[#E8E4DD]">
                Ready to connect your Google Ads account?
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[#C4C0B6]">
                Start with the main product flow, then use your preferred AI client to
                inspect campaigns and review optimization ideas.
              </p>
            </div>
            <Link
              href="/connect"
              className="inline-flex items-center text-sm font-medium text-[#E8E4DD] underline underline-offset-4 transition-colors hover:text-[#4CAF6E]"
            >
              Connect Google Ads
            </Link>
          </div>
        </div>
      </section>

      <section className="px-4 pb-20">
        <div className="container mx-auto max-w-5xl">
          <div className="grid gap-4 md:grid-cols-2">
            {page.sections.map((section) => (
              <div
                key={section.title}
                className="rounded-3xl border border-[#3D3C36] bg-[#24231F] p-6"
              >
                <h2 className="text-xl font-semibold text-[#E8E4DD]">
                  {section.title}
                </h2>
                <p className="mt-4 text-sm leading-relaxed text-[#C4C0B6]">
                  {section.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {page.deepSections?.length ? (
        <section className="px-4 pb-20">
          <div className="container mx-auto max-w-5xl">
            <div className="space-y-12">
              {page.deepSections.map((section) => (
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
                      <ul className="mt-5 grid gap-3 text-sm leading-relaxed text-[#C4C0B6] md:grid-cols-2">
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
      ) : null}

      {page.workflows?.length ? (
        <section className="px-4 pb-20">
          <div className="container mx-auto max-w-5xl">
            <div className="mb-8 max-w-2xl">
              <p className="text-sm font-medium uppercase tracking-[0.22em] text-[#4CAF6E]">
                Example workflows
              </p>
              <h2 className="mt-3 text-3xl font-semibold text-[#E8E4DD]">
                Prompts that lead to real account work
              </h2>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              {page.workflows.map((workflow) => (
                <div
                  key={workflow.title}
                  className="rounded-3xl border border-[#3D3C36] bg-[#24231F] p-6"
                >
                  <h3 className="text-lg font-semibold text-[#E8E4DD]">
                    {workflow.title}
                  </h3>
                  <p className="mt-4 text-sm leading-relaxed text-[#C4C0B6]">
                    &ldquo;{workflow.prompt}&rdquo;
                  </p>
                  <p className="mt-4 border-t border-[#3D3C36] pt-4 text-sm leading-relaxed text-[#C4C0B6]">
                    {workflow.outcome}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      <FaqSection
        title="FAQ"
        intro="Short answers to the most common questions around this workflow."
        items={page.faq}
      />

      <LandingLinksSection
        title="Related pages"
        intro="Use these pages to move from the exact search intent into the broader NotFair workflow."
        links={page.relatedLinks}
      />
    </>
  );
}
