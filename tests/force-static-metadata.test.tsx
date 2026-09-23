/**
 * SEO-02 regression pin: the confirmed EN-leak bug on force-static pages
 * (RESEARCH Pitfall 1, WINDOWS #7, 73-RTL-QA.md / deferred-items.md).
 *
 * `dynamic = 'force-static'` pages resolved a request-time locale accessor
 * (`getLocale()` from `next-intl/server`) to the default locale (`en`) at
 * static-generation time, regardless of which locale URL is being built —
 * silently serving English content on every non-EN locale. The fix forwards
 * `{ locale } = await params` explicitly into both `generateMetadata` and
 * the page body instead of the bare request-time accessor.
 *
 * This suite exercises `generateMetadata` directly for `about` (ru) and
 * `faq` (es) — both source `content.metadata.title/description` straight
 * from `getPageContent()`, so a correct params-forward is provable by
 * comparing the returned metadata against the locale content JSON on disk.
 *
 * `corporate` has no `generateMetadata` of its own — its title/description
 * are a separate, pre-existing static export in `./layout.tsx`, outside
 * this plan's `files_modified` scope (see 74-04-SUMMARY.md Deviations). Its
 * real EN-leak bug lives in the page BODY (`getPageContent('corporate',
 * locale)` driving `content.hero.*`), so the third case renders the page
 * component itself with a French `params` and asserts the rendered DOM
 * shows French copy instead of the English fallback — this directly
 * exercises the literal defect Task 2 fixes for `corporate`.
 */
import { describe, it, expect, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";

function readContentJson(locale: string, page: string): Record<string, unknown> {
  const file = path.join(process.cwd(), "content", "pages", locale, `${page}.json`);
  return JSON.parse(fs.readFileSync(file, "utf-8"));
}

vi.mock("@/components/Nav", () => ({ default: () => null }));
vi.mock("@/components/Footer", () => ({ default: () => null }));

describe("force-static pages — generateMetadata resolves the params locale, not the default (SEO-02)", () => {
  it("about: locale='ru' returns metadata sourced from content/pages/ru/about.json, not the EN file", async () => {
    const { generateMetadata } = await import("@/app/[locale]/about/page");
    const ru = readContentJson("ru", "about") as { metadata: { title: string; description: string } };
    const en = readContentJson("en", "about") as { metadata: { title: string; description: string } };

    const metadata = await generateMetadata({ params: Promise.resolve({ locale: "ru" }) });

    expect((metadata.title as { absolute: string }).absolute).toBe(ru.metadata.title);
    expect(metadata.description).toBe(ru.metadata.description);
    // The bug this test pins: a broken params-forward resolves to the
    // default locale regardless of the URL — assert the RU result actually
    // differs from EN (not merely present), so a silent EN passthrough
    // cannot accidentally satisfy the assertions above.
    expect((metadata.title as { absolute: string }).absolute).not.toBe(en.metadata.title);
    expect(metadata.description).not.toBe(en.metadata.description);
  });

  it("about: locale='en' returns the EN metadata unchanged", async () => {
    const { generateMetadata } = await import("@/app/[locale]/about/page");
    const en = readContentJson("en", "about") as { metadata: { title: string; description: string } };

    const metadata = await generateMetadata({ params: Promise.resolve({ locale: "en" }) });

    expect((metadata.title as { absolute: string }).absolute).toBe(en.metadata.title);
    expect(metadata.description).toBe(en.metadata.description);
  });

  it("faq: locale='es' returns metadata sourced from content/pages/es/faq.json, not the EN file", async () => {
    const { generateMetadata } = await import("@/app/[locale]/faq/page");
    const es = readContentJson("es", "faq") as { metadata: { title: string; description: string } };
    const en = readContentJson("en", "faq") as { metadata: { title: string; description: string } };

    const metadata = await generateMetadata({ params: Promise.resolve({ locale: "es" }) });

    expect(metadata.title).toBe(es.metadata.title);
    expect(metadata.description).toBe(es.metadata.description);
    expect(metadata.title).not.toBe(en.metadata.title);
    expect(metadata.description).not.toBe(en.metadata.description);
  });

  it("faq: locale='en' returns the EN metadata unchanged", async () => {
    const { generateMetadata } = await import("@/app/[locale]/faq/page");
    const en = readContentJson("en", "faq") as { metadata: { title: string; description: string } };

    const metadata = await generateMetadata({ params: Promise.resolve({ locale: "en" }) });

    expect(metadata.title).toBe(en.metadata.title);
    expect(metadata.description).toBe(en.metadata.description);
  });
});

describe("force-static pages — page body resolves the params locale (SEO-02, corporate body case)", () => {
  it("corporate: locale='fr' renders French hero copy from content/pages/fr/corporate.json, not the EN fallback", async () => {
    const { default: CorporatePage } = await import("@/app/[locale]/corporate/page");
    const { render } = await import("@testing-library/react");
    const fr = readContentJson("fr", "corporate") as { hero: { headlineLine1: string } };
    const en = readContentJson("en", "corporate") as { hero: { headlineLine1: string } };

    class MockIntersectionObserver {
      observe = vi.fn();
      disconnect = vi.fn();
      unobserve = vi.fn();
    }
    vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);

    const PageElement = await CorporatePage({ params: Promise.resolve({ locale: "fr" }) });
    const { container } = render(PageElement);

    expect(container.innerHTML).toContain(fr.hero.headlineLine1);
    expect(container.innerHTML).not.toContain(en.hero.headlineLine1);
  });

  it("corporate: locale='en' renders the EN hero copy unchanged", async () => {
    const { default: CorporatePage } = await import("@/app/[locale]/corporate/page");
    const { render } = await import("@testing-library/react");
    const en = readContentJson("en", "corporate") as { hero: { headlineLine1: string } };

    class MockIntersectionObserver {
      observe = vi.fn();
      disconnect = vi.fn();
      unobserve = vi.fn();
    }
    vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);

    const PageElement = await CorporatePage({ params: Promise.resolve({ locale: "en" }) });
    const { container } = render(PageElement);

    expect(container.innerHTML).toContain(en.hero.headlineLine1);
  });
});
