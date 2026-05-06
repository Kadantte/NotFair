import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { LanguageSwitcher } from "@/components/language-switcher";

vi.mock("next/link", () => ({
  default: ({
    href,
    prefetch,
    children,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
    href: string;
    prefetch?: boolean;
  }) => (
    <a href={href} data-prefetch={String(prefetch)} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/de",
}));

vi.mock("next-intl", () => ({
  useLocale: () => "de",
  useTranslations: () => (key: string) => (key === "label" ? "Language" : "Current language"),
}));

describe("LanguageSwitcher", () => {
  it("does not prefetch locale home links because locale prefetches mutate NEXT_LOCALE", () => {
    const markup = renderToStaticMarkup(<LanguageSwitcher />);

    expect(markup).toContain('href="/"');
    expect(markup).toContain('href="/es"');
    expect(markup).not.toContain('data-prefetch="true"');
    expect(markup).toContain('data-prefetch="false"');
  });
});
