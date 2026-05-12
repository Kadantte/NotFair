import { describe, expect, it } from "vitest";

import { buildMetadata } from "@/lib/seo";

describe("buildMetadata", () => {
  it("uses a supplied image for Open Graph and Twitter metadata", () => {
    const metadata = buildMetadata({
      title: "Article title",
      description: "Article description",
      path: "/blog/article",
      imageUrl: "https://cdnimg.co/example/article.jpg",
      imageAlt: "Article title",
    });

    expect(metadata.openGraph?.images).toEqual([
      {
        url: "https://cdnimg.co/example/article.jpg",
        alt: "Article title",
      },
    ]);
    expect(metadata.twitter?.images).toEqual([
      "https://cdnimg.co/example/article.jpg",
    ]);
  });
});
