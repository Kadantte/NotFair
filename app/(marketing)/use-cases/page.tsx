import Link from "next/link";
import { buildCollectionPageJsonLd, buildMetadata, safeJsonLd } from "@/lib/seo";
import { useCasePages } from "@/lib/long-form-pages";

export const metadata = buildMetadata({
  title: "Google Ads + AI use cases | NotFair",
  description:
    "Concrete Google Ads workflows operators run with NotFair and their AI client — wasted spend, negatives, policy errors, conversion audits, weekly search-term review, cross-platform ROAS.",
  path: "/use-cases",
  keywords: [
    "Google Ads AI use cases",
    "AI Google Ads workflows",
    "Google Ads agent workflows",
    "Google Ads optimization use cases",
  ],
});

const entries = Object.values(useCasePages);

const collectionJsonLd = buildCollectionPageJsonLd({
  path: "/use-cases",
  name: "NotFair use cases",
  itemType: "Article",
  items: entries.map((page) => ({
    name: page.title,
    path: `/use-cases/${page.slug}`,
    description: page.description,
  })),
});

export default function UseCasesHub() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(collectionJsonLd) }}
      />
      <section className="px-4 pb-16 pt-24">
        <div className="container mx-auto max-w-5xl">
          <div className="max-w-3xl">
            <p className="text-sm font-medium uppercase tracking-[0.22em] text-[#4CAF6E]">
              Use cases
            </p>
            <h1 className="mt-4 text-4xl font-semibold tracking-tight text-[#E8E4DD] md:text-6xl">
              What operators actually use NotFair for
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-relaxed text-[#C4C0B6]">
              Six concrete Google Ads workflows that benefit most from an AI
              agent plus typed tool access. Each page covers the prompt, the
              expected output, and the approval flow.
            </p>
          </div>
        </div>
      </section>

      <section className="px-4 pb-24">
        <div className="container mx-auto max-w-5xl">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {entries.map((entry) => (
              <Link
                key={entry.slug}
                href={`/use-cases/${entry.slug}`}
                className="group rounded-3xl border border-[#3D3C36] bg-[#24231F] p-6 transition-colors hover:border-[#4CAF6E]/60"
              >
                <h2 className="text-xl font-semibold text-[#E8E4DD]">
                  {entry.heroTitle}
                </h2>
                <p className="mt-3 text-sm leading-relaxed text-[#C4C0B6]">
                  {entry.description}
                </p>
                <p className="mt-4 text-sm font-medium text-[#E8E4DD] underline underline-offset-4 transition-colors group-hover:text-[#4CAF6E]">
                  See the workflow
                </p>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
