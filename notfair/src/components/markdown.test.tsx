// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { Markdown } from "@/components/markdown";

describe("Markdown", () => {
  it("renders headings, lists, and emphasis", () => {
    render(
      <Markdown>
        {"# Title\n## Section\n### Sub\n#### Deep\n\n- one\n- two\n\n1. first\n2. second\n\n**bold** and *italic*"}
      </Markdown>,
    );
    expect(screen.getByRole("heading", { level: 1, name: "Title" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Section" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: "Sub" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 4, name: "Deep" })).toBeInTheDocument();
    expect(screen.getAllByRole("list")).toHaveLength(2);
    expect(screen.getAllByRole("listitem")).toHaveLength(4);
    expect(screen.getByText("bold").tagName).toBe("STRONG");
    expect(screen.getByText("italic").tagName).toBe("EM");
  });

  it("opens links in a new tab with safe rel", () => {
    render(<Markdown>{"[NotFair](https://notfair.co)"}</Markdown>);
    const link = screen.getByRole("link", { name: "NotFair" });
    expect(link).toHaveAttribute("href", "https://notfair.co");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("distinguishes inline code from fenced blocks", () => {
    const { container } = render(
      <Markdown>{"Use `pnpm test` here.\n\n```json\n{\"ok\":true}\n```"}</Markdown>,
    );
    const inline = screen.getByText("pnpm test");
    expect(inline.tagName).toBe("CODE");
    expect(inline.className).toContain("bg-muted");

    const pre = container.querySelector("pre");
    expect(pre).not.toBeNull();
    const fenced = pre!.querySelector("code")!;
    expect(fenced.className).toContain("language-json");
    expect(fenced.textContent).toContain('{"ok":true}');
  });

  it("renders GFM tables inside a horizontal scroll container", () => {
    const { container } = render(
      <Markdown>{"| Col A | Col B |\n| --- | --- |\n| a1 | b1 |"}</Markdown>,
    );
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Col A" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "b1" })).toBeInTheDocument();
    expect(container.querySelector(".overflow-x-auto table")).not.toBeNull();
  });

  it("renders blockquotes and horizontal rules", () => {
    const { container } = render(
      <Markdown>{"> quoted advice\n\n---\n\nafter the rule"}</Markdown>,
    );
    expect(container.querySelector("blockquote")).toHaveTextContent(
      "quoted advice",
    );
    expect(container.querySelector("hr")).not.toBeNull();
    expect(screen.getByText("after the rule")).toBeInTheDocument();
  });

  it("does not render raw HTML", () => {
    render(<Markdown>{'<script>alert("x")</script> plain text'}</Markdown>);
    expect(document.querySelector("script")).toBeNull();
    expect(screen.getByText(/plain text/)).toBeInTheDocument();
  });
});
