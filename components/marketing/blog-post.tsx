import Link from "next/link";
import type { BlogPost, BlogSection } from "@/lib/blog-posts";
import { FaqSection } from "@/components/marketing/faq-section";
import { LandingLinksSection } from "@/components/marketing/landing-links-section";

function SectionContent({ section }: { section: BlogSection }) {
  switch (section.type) {
    case "heading":
      return (
        <h2 className="mt-12 text-2xl font-semibold tracking-tight text-[#E8E4DD] md:text-3xl">
          {section.content}
        </h2>
      );
    case "subheading":
      return (
        <h3 className="mt-8 text-xl font-semibold text-[#E8E4DD]">
          {section.content}
        </h3>
      );
    case "text":
      return (
        <p className="mt-5 text-base leading-relaxed text-[#C4C0B6]">
          {section.content}
        </p>
      );
    case "list":
      return (
        <ul className="mt-5 space-y-3">
          {section.items?.map((item, i) => {
            const dashIndex = item.indexOf(" — ");
            return (
              <li
                key={i}
                className="flex gap-3 text-base leading-relaxed text-[#C4C0B6]"
              >
                <span className="mt-2 block h-1.5 w-1.5 flex-shrink-0 rounded-full bg-[#4CAF6E]" />
                <span>
                  {dashIndex > -1 ? (
                    <>
                      <strong className="font-semibold text-[#E8E4DD]">
                        {item.slice(0, dashIndex)}
                      </strong>
                      {" — "}
                      {item.slice(dashIndex + 3)}
                    </>
                  ) : (
                    item
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      );
    case "callout":
      return (
        <div className="mt-6 rounded-lg border-l-2 border-[#4CAF6E] bg-[#24231F] p-6">
          {section.content.split("\n\n").map((block, i) => (
            <p
              key={i}
              className={`text-sm leading-relaxed ${
                block.startsWith("You:")
                  ? "font-medium text-[#E8E4DD]"
                  : "text-[#C4C0B6]"
              } ${i > 0 ? "mt-4" : ""}`}
            >
              {block}
            </p>
          ))}
        </div>
      );
    case "code":
      return (
        <pre className="mt-6 overflow-x-auto rounded-lg bg-[#24231F] p-6 text-sm leading-relaxed text-[#C4C0B6]">
          <code>{section.content}</code>
        </pre>
      );
    default:
      return null;
  }
}

export function BlogPostPage({ post }: { post: BlogPost }) {
  return (
    <>
      <article className="px-4 pb-16 pt-24">
        <div className="container mx-auto max-w-3xl">
          <div className="mb-8">
            <Link
              href="/blog"
              className="text-sm font-medium text-[#C4C0B6] transition-colors hover:text-[#4CAF6E]"
            >
              &larr; Blog
            </Link>
          </div>

          <header>
            <p className="text-sm font-medium uppercase tracking-[0.22em] text-[#4CAF6E]">
              {post.author.role}
            </p>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-[#E8E4DD] md:text-5xl">
              {post.title}
            </h1>
            <p className="mt-4 text-base leading-relaxed text-[#C4C0B6]">
              {post.description}
            </p>
            <div className="mt-4 flex items-center gap-3 text-sm text-[#C4C0B6]">
              <span>{post.author.name}</span>
              <span className="text-[#3D3C36]">|</span>
              <time dateTime={post.publishedAt}>
                {new Date(post.publishedAt).toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </time>
            </div>
          </header>

          <div className="mt-2 h-px bg-[#3D3C36]" />

          <div className="prose-custom">
            {post.content.map((section, i) => (
              <SectionContent key={i} section={section} />
            ))}
          </div>

          <div className="mt-16 flex flex-col gap-3 rounded-lg border border-[#3D3C36] bg-[#201F1B] p-6 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-[#E8E4DD]">
                Move from article to live account work
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[#C4C0B6]">
                Connect your account first, then use an MCP client to turn the
                article workflow into a reviewed account action.
              </p>
            </div>
            <div className="flex flex-col gap-3 text-sm md:items-end">
              <Link
                href="/connect"
                className="inline-flex items-center justify-center rounded-lg bg-[#E8E4DD] px-4 py-2 font-medium text-[#1A1917] transition-colors hover:bg-[#4CAF6E]"
              >
                Connect Google Ads
              </Link>
              <Link
                href="/google-ads-mcp"
                className="font-medium text-[#C4C0B6] underline underline-offset-4 transition-colors hover:text-[#4CAF6E]"
              >
                Google Ads MCP Server
              </Link>
              <Link
                href="/google-ads-ai-tool"
                className="font-medium text-[#C4C0B6] underline underline-offset-4 transition-colors hover:text-[#4CAF6E]"
              >
                Google Ads AI tool
              </Link>
            </div>
          </div>
        </div>
      </article>

      <FaqSection
        title="FAQ"
        intro="Common questions about Model Context Protocol."
        items={post.faq}
      />

      <LandingLinksSection
        title="Related pages"
        intro="Explore MCP in action with Google Ads."
        links={post.relatedLinks}
      />
    </>
  );
}
