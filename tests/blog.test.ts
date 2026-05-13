import { describe, it, expect } from "vitest";
import { getAllPosts, type BlogPost } from "@/lib/blog";

describe("getAllPosts()", () => {
  const posts = getAllPosts();

  it("returns a non-empty array", () => {
    expect(Array.isArray(posts)).toBe(true);
    expect(posts.length).toBeGreaterThan(0);
  });

  it("includes all 3 JSX_POSTS slugs", () => {
    const slugs = posts.map((p) => p.slug);
    expect(slugs).toContain("prague-airport-to-city-center");
    expect(slugs).toContain("prague-airport-taxi-vs-chauffeur");
    expect(slugs).toContain("prague-vienna-transfer-vs-train");
  });

  it("marks all 3 legacy entries with source: 'jsx'", () => {
    const jsxSlugs = [
      "prague-airport-to-city-center",
      "prague-airport-taxi-vs-chauffeur",
      "prague-vienna-transfer-vs-train",
    ];
    for (const slug of jsxSlugs) {
      const post = posts.find((p) => p.slug === slug);
      expect(post, `missing JSX post: ${slug}`).toBeDefined();
      expect(post!.source).toBe("jsx");
    }
  });

  it("includes at least one MDX-sourced entry", () => {
    const mdxEntries = posts.filter((p) => p.source === "mdx");
    expect(mdxEntries.length).toBeGreaterThan(0);
  });

  it("includes the test MDX article from plan 01", () => {
    const test = posts.find(
      (p) => p.slug === "premium-airport-transfer-prague-shortcut"
    );
    expect(test).toBeDefined();
    expect(test!.source).toBe("mdx");
  });

  it("is sorted newest-first by date", () => {
    for (let i = 0; i < posts.length - 1; i++) {
      const a = new Date(posts[i].date).getTime();
      const b = new Date(posts[i + 1].date).getTime();
      expect(a, `posts[${i}] date >= posts[${i + 1}] date`).toBeGreaterThanOrEqual(
        b
      );
    }
  });

  it("every entry has all required BlogPost fields populated", () => {
    const required: Array<keyof BlogPost> = [
      "slug",
      "title",
      "description",
      "date",
      "coverImage",
      "category",
      "author",
      "source",
    ];
    for (const post of posts) {
      for (const field of required) {
        expect(post[field], `${post.slug}.${field}`).toBeTruthy();
      }
    }
  });

  it("every author resolves to 'roman-ustyugov' (only valid AuthorSlug today)", () => {
    for (const post of posts) {
      expect(post.author).toBe("roman-ustyugov");
    }
  });
});
