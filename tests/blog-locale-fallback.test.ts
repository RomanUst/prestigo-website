// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  getAllPosts,
  resolveLocalizedMdx,
  blogCanonical,
} from "@/lib/blog";
import { getPageContent } from "@/lib/page-content";

describe("getAllPosts() locale fallback (D-07)", () => {
  it("getAllPosts('ru') is translated but keeps the EN slug set (Phase 72)", () => {
    const en = getAllPosts("en");
    const ru = getAllPosts("ru");
    expect(ru).not.toEqual(en);
    expect(ru.map((p) => p.slug).sort()).toEqual(en.map((p) => p.slug).sort());
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

  it("returns { dir: 'ar', isFallback: false } now that ar MDX exists (Phase 73)", () => {
    expect(resolveLocalizedMdx(EN_SLUG, "ar")).toEqual({
      dir: "ar",
      isFallback: false,
    });
  });

  it("returns { dir: 'ru', isFallback: false } now that ru MDX exists (Phase 72)", () => {
    expect(resolveLocalizedMdx(EN_SLUG, "ru")).toEqual({
      dir: "ru",
      isFallback: false,
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

  // CR-01: locale is threaded through so a genuinely localized post
  // self-references its own locale-prefixed URL.
  it("returns the ru-prefixed URL when isFallback is false and locale='ru' (CR-01)", () => {
    expect(blogCanonical(SLUG, false, "ru")).toBe(`/ru/blog/${SLUG}`);
  });

  it("locale='en' is byte-identical to the 2-arg default", () => {
    expect(blogCanonical(SLUG, false, "en")).toBe(blogCanonical(SLUG, false));
  });

  it("falls back to 'en' for an invalid/unconfigured locale", () => {
    expect(blogCanonical(SLUG, false, "xx")).toBe(`/blog/${SLUG}`);
  });

  it("isFallback:true ignores locale — always the absolute EN URL", () => {
    expect(blogCanonical(SLUG, true, "ru")).toBe(
      `https://rideprestigo.com/blog/${SLUG}`
    );
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

  it("getPageContent('blog', 'ru') is translated, not an EN copy (Phase 72)", () => {
    const en = getPageContent("blog", "en");
    const ru = getPageContent("blog", "ru");
    expect(ru).not.toEqual(en);
    expect(Object.keys(ru as object)).toEqual(Object.keys(en as object));
  });

  it("spot-checks 2 known EN strings from the pre-refactor literals", () => {
    const content = getPageContent("blog", "en") as BlogListingContent;
    expect(content.metadata.title).toBe(
      "Prague Chauffeur Blog — Airport, Routes & Transfer Guides"
    );
    expect(content.cta.headingItalic).toBe("Fixed price, door-to-door.");
  });
});
