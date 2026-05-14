import Link from "next/link";
import { buildCollectionPageJsonLd, buildMetadata, safeJsonLd } from "@/lib/seo";
import { comparePages } from "@/lib/long-form-pages";

export const metadata = buildMetadata({
  title: "NotFair compared | Google Ads scripts, agencies, native automation",
  description:
    "How NotFair stacks up against Google Ads scripts, the Google Ads dashboard, native automation, agencies, and the broader AI-Google-Ads tool landscape.",
  path: "/compare",
  keywords: [
    "NotFair comparison",
    "Google Ads scripts alternative",
    "Google Ads agency alternative",
    "Google Ads dashboard alternative",
    "best AI tools Google Ads",
  ],
});

const entries = Object.values(comparePages);

const collectionJsonLd = buildCollectionPageJsonLd({
  path: "/compare",
  name: "NotFair comparisons",
  itemType: "Article",
  items: entries.map((page) => ({
    name: page.title,
    path: `/compare/${page.slug}`,
    description: page.description,
  })),
});

export default function CompareHub() {
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
              Compare
            </p>
            <h1 className="mt-4 text-4xl font-semibold tracking-tight text-[#E8E4DD] md:text-6xl">
              How NotFair compares
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-relaxed text-[#C4C0B6]">
              Honest comparisons against Google Ads scripts, the dashboard, native
              automation, agencies, and the broader AI-Google-Ads tool landscape.
              No vague feature checklists — these explain when each option wins.
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
                href={`/compare/${entry.slug}`}
                className="group rounded-3xl border border-[#3D3C36] bg-[#24231F] p-6 transition-colors hover:border-[#4CAF6E]/60"
              >
                <h2 className="text-xl font-semibold text-[#E8E4DD]">
                  {entry.heroTitle}
                </h2>
                <p className="mt-3 text-sm leading-relaxed text-[#C4C0B6]">
                  {entry.description}
                </p>
                <p className="mt-4 text-sm font-medium text-[#E8E4DD] underline underline-offset-4 transition-colors group-hover:text-[#4CAF6E]">
                  Read the comparison
                </p>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
