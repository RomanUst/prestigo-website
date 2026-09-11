// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  getAllPosts,
  resolveLocalizedMdx,
  blogCanonical,
} from "@/lib/blog";
import { getPageContent } from "@/lib/page-content";

describe("getAllPosts() locale fallback (D-07)", () => {
  it("getAllPosts('ru') deep-equals getAllPosts('en') (no ru content yet)", () => {
    const en = getAllPosts("en");
    const ru = getAllPosts("ru");
    expect(ru).toEqual(en);
  });

  it("all 3 JSX_POSTS slugs are present in getAllPosts('fr') (D-08 — EN-only, merged regardless of locale)", () => {
    const slugs = getAllPosts("fr").map((p) => p.slug);
    expect(slugs).toContain("prague-airport-to-city-center");
    expect(slugs).toContain("prague-airport-taxi-vs-chauffeur");
    expect(slugs).toContain("prague-vienna-transfer-vs-train");
  });
});

describe("resolveLocalizedMdx()", () => {
  const EN_SLUG = "premium-airport-transfer-prague-shortcut";

  it("returns { dir: 'en', isFallback: true } for a locale with no localized MDX", () => {
    expect(resolveLocalizedMdx(EN_SLUG, "ru")).toEqual({
      dir: "en",
      isFallback: true,
    });
  });

  it("returns { dir: 'en', isFallback: false } for the en locale itself", () => {
    expect(resolveLocalizedMdx(EN_SLUG, "en")).toEqual({
      dir: "en",
      isFallback: false,
    });
  });

  it("rejects path-traversal slugs — returns null", () => {
    expect(resolveLocalizedMdx("../etc", "en")).toBeNull();
  });

  it("rejects an invalid/unconfigured locale — returns null", () => {
    expect(resolveLocalizedMdx(EN_SLUG, "xx")).toBeNull();
  });

  it("returns null for a slug that has no MDX file in any locale", () => {
    expect(resolveLocalizedMdx("this-slug-does-not-exist", "en")).toBeNull();
  });
});

describe("blogCanonical()", () => {
  const SLUG = "premium-airport-transfer-prague-shortcut";

  it("returns the absolute EN URL when isFallback is true", () => {
    expect(blogCanonical(SLUG, true)).toBe(
      `https://rideprestigo.com/blog/${SLUG}`
    );
  });

  it("returns the current locale-relative /blog/<slug> form when isFallback is false (en)", () => {
    expect(blogCanonical(SLUG, false)).toBe(`/blog/${SLUG}`);
  });
});

describe("blog listing content (content/pages/en/blog.json)", () => {
  type BlogListingContent = {
    metadata: { title: string; description: string };
    hero: { label: string; headlineLine1: string; headlineItalic: string; intro: string };
    emptyState: { heading: string; body: string; ctaLabel: string };
    cta: {
      headingLine1: string;
      headingItalic: string;
      body: string;
      primaryLabel: string;
      secondaryLabel: string;
    };
  };

  it("getPageContent('blog', 'ru') deep-equals getPageContent('blog', 'en') (EN fallback, no ru content yet)", () => {
    const en = getPageContent("blog", "en");
    const ru = getPageContent("blog", "ru");
    expect(ru).toEqual(en);
  });

  it("spot-checks 2 known EN strings from the pre-refactor literals", () => {
    const content = getPageContent("blog", "en") as BlogListingContent;
    expect(content.metadata.title).toBe(
      "Prague Chauffeur Blog — Airport, Routes & Transfer Guides"
    );
    expect(content.cta.headingItalic).toBe("Fixed price, door-to-door.");
  });
});
