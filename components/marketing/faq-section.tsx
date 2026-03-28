import type { FaqItem } from "@/lib/seo";

export function FaqSection({
  title,
  intro,
  items,
}: {
  title: string;
  intro?: string;
  items: FaqItem[];
}) {
  return (
    <section className="px-4 pb-20">
      <div className="container mx-auto max-w-5xl">
        <div className="mb-10 max-w-2xl">
          <h2 className="text-3xl font-semibold tracking-tight text-[#E8E4DD] md:text-4xl">
            {title}
          </h2>
          {intro ? (
            <p className="mt-4 text-base leading-relaxed text-[#9B9689]">{intro}</p>
          ) : null}
        </div>

        <div className="grid gap-4">
          {items.map((item) => (
            <div
              key={item.question}
              className="rounded-3xl border border-[#3D3C36] bg-[#24231F] p-6"
            >
              <h3 className="text-lg font-semibold text-[#E8E4DD]">
                {item.question}
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-[#9B9689]">
                {item.answer}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
