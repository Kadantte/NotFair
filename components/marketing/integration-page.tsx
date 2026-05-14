import Link from "next/link";
import { FaqSection } from "@/components/marketing/faq-section";
import { LandingLinksSection } from "@/components/marketing/landing-links-section";
import {
  INTEGRATION_STATUS_LABEL,
  INTEGRATION_STATUS_TONE,
  integrations,
  type IntegrationContent,
} from "@/lib/integrations";

const STEP_COUNT_WORD = ["zero", "one", "two", "three", "four", "five", "six"] as const;

export function IntegrationPage({ page }: { page: IntegrationContent }) {
  const clientShort = page.clientShort ?? page.client;
  const related = page.relatedSlugs
    .map((slug) => integrations[slug])
    .filter((entry): entry is IntegrationContent => Boolean(entry));

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
            <div className="mt-6">
              <span
                className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium ${INTEGRATION_STATUS_TONE[page.status]}`}
              >
                {INTEGRATION_STATUS_LABEL[page.status]}
              </span>
            </div>
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

          <div className="mt-10 flex flex-col gap-3 rounded-3xl border border-[#3D3C36] bg-[#201F1B] p-6 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-[#E8E4DD]">
                Connect your Google Ads account
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[#C4C0B6]">
                Authorize once at notfair.co — then open {clientShort} and start
                asking real questions about your account.
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
          <div className="mb-8 max-w-2xl">
            <p className="text-sm font-medium uppercase tracking-[0.22em] text-[#4CAF6E]">
              Setup
            </p>
            <h2 className="mt-3 text-3xl font-semibold text-[#E8E4DD]">
              Connect {clientShort} in {STEP_COUNT_WORD[page.setupSteps.length] ?? page.setupSteps.length} steps
            </h2>
            <p className="mt-3 text-base leading-relaxed text-[#C4C0B6]">
              {page.setupIntro}
            </p>
          </div>
          <ol className="space-y-6">
            {page.setupSteps.map((step, index) => (
              <li
                key={step.title}
                className="rounded-3xl border border-[#3D3C36] bg-[#24231F] p-6"
              >
                <h3 className="text-lg font-semibold text-[#E8E4DD]">
                  {index + 1}. {step.title}
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-[#C4C0B6]">
                  {step.body}
                </p>
                {step.code ? (
                  <pre className="mt-4 overflow-x-auto rounded-2xl border border-[#3D3C36] bg-[#1A1917] p-4 font-mono text-xs leading-relaxed text-[#E8E4DD]">
                    <code>{step.code}</code>
                  </pre>
                ) : null}
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="px-4 pb-20">
        <div className="container mx-auto max-w-5xl">
          <div className="mb-8 max-w-2xl">
            <p className="text-sm font-medium uppercase tracking-[0.22em] text-[#4CAF6E]">
              Capabilities
            </p>
            <h2 className="mt-3 text-3xl font-semibold text-[#E8E4DD]">
              What {clientShort} can do with NotFair
            </h2>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {page.capabilities.map((capability) => (
              <div
                key={capability.label}
                className="rounded-3xl border border-[#3D3C36] bg-[#24231F] p-6"
              >
                <h3 className="text-lg font-semibold text-[#E8E4DD]">
                  {capability.label}
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-[#C4C0B6]">
                  {capability.detail}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

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
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
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

      <section className="px-4 pb-20">
        <div className="container mx-auto max-w-5xl">
          <div className="grid gap-6 border-t border-[#3D3C36] pt-12 md:grid-cols-[0.85fr_1.15fr]">
            <h2 className="text-2xl font-semibold text-[#E8E4DD]">
              {page.whyNotfair.title}
            </h2>
            <div>
              <p className="text-sm leading-relaxed text-[#C4C0B6]">
                {page.whyNotfair.body}
              </p>
              <ul className="mt-5 grid grid-cols-1 gap-3 text-sm leading-relaxed text-[#C4C0B6] md:grid-cols-2">
                {page.whyNotfair.bullets.map((bullet) => (
                  <li
                    key={bullet}
                    className="rounded-2xl border border-[#3D3C36] bg-[#24231F] p-4"
                  >
                    {bullet}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      <FaqSection
        title="FAQ"
        intro={`Common questions about using ${page.client} with Google Ads through NotFair.`}
        items={page.faq}
      />

      {related.length ? (
        <LandingLinksSection
          title="Other integrations"
          intro="Switching clients, or curious how this compares?"
          links={related.map((entry) => ({
            href: `/integrations/${entry.slug}`,
            title: `${entry.client} + Google Ads`,
            description: entry.heroDescription,
          }))}
        />
      ) : null}
    </>
  );
}
