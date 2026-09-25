/**
 * 75-10 Task 1 (tracer): proves the content-driven hero alt + locale-aware
 * link pattern on prague-vienna before it is mechanically repeated across
 * the other 29 route pages in Task 2 (which extends this file with an
 * all-30-slugs x 'ar' href-prefix loop).
 *
 * Reuses the same next-intl/server, next/image, Nav/Footer, and
 * IntersectionObserver mocking approach as tests/route-page-render.test.tsx
 * (see that file's header comment for why getLocale/getTranslations are
 * mocked directly rather than redirected into next-intl's server build).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import enMessages from "../messages/en.json";
import { getLocale } from "next-intl/server";
import { getRouteContent } from "@/lib/route-content";
import { FIXTURE_PRICES } from "./helpers/route-content-parity";

function getNamespace(namespace: string): Record<string, unknown> {
  return namespace
    .split(".")
    .reduce<Record<string, unknown>>(
      (acc, key) => (acc?.[key] as Record<string, unknown>) ?? {},
      enMessages as unknown as Record<string, unknown>
    );
}

vi.mock("next-intl/server", () => ({
  getLocale: vi.fn(async () => "en"),
  getTranslations: vi.fn(async (namespace: string) => {
    const ns = getNamespace(namespace);
    const t = (key: string): string => {
      const value = key
        .split(".")
        .reduce<unknown>(
          (acc, k) => (acc as Record<string, unknown>)?.[k],
          ns
        );
      if (typeof value !== "string") {
        throw new Error(`Missing translation for ${namespace}.${key}`);
      }
      return value;
    };
    return t;
  }),
}));

vi.mock("next/image", () => ({
  default: ({
    src,
    alt,
    fill: _fill,
    priority: _priority,
    ...rest
  }: {
    src: string;
    alt: string;
    fill?: boolean;
    priority?: boolean;
    [key: string]: unknown;
  }) => {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={alt} {...rest} />;
  },
}));

vi.mock("@/components/Nav", () => ({ default: () => null }));
vi.mock("@/components/Footer", () => ({ default: () => null }));

const getRoutePriceMock = vi.fn(async (slug: string) => ({
  slug,
  fromLabel: "Prague",
  toLabel: "Vienna",
  distanceKm: 330,
  eClassEur: FIXTURE_PRICES.ePrice,
  sClassEur: FIXTURE_PRICES.sPrice,
  vClassEur: FIXTURE_PRICES.vPrice,
  displayOrder: 1,
  placeIds: [],
}));

vi.mock("@/lib/route-prices", () => ({
  getRoutePrice: getRoutePriceMock,
}));

beforeEach(() => {
  // jsdom does not implement IntersectionObserver — Reveal (used throughout
  // the page) creates one in a useEffect. A minimal stub is enough here.
  class MockIntersectionObserver {
    observe = vi.fn();
    disconnect = vi.fn();
    unobserve = vi.fn();
  }
  vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);
});

// Every single-slash href in the rendered page (hero CTAs, vehicle-card
// "Book Online", the related-route template-literal card links, the final
// CTA's "Book Now"/"All Routes") — used to assert locale-prefix behavior
// without hardcoding each anchor's position in the markup.
function collectSingleSlashHrefs(html: string): string[] {
  return Array.from(html.matchAll(/href="(\/[^"]*)"/g)).map((m) => m[1]);
}

describe("PragueViennaPage — locale-aware links + content-driven hero alt (75-10 Task 1 tracer)", () => {
  it("locale:'en' renders hrefs unprefixed (/book, /contact, /routes/<slug>, /routes) — matches pre-refactor behavior", async () => {
    vi.mocked(getLocale).mockResolvedValueOnce("en");

    const { default: PragueViennaPage } = await import(
      "@/app/[locale]/routes/prague-vienna/page"
    );
    const { render } = await import("@testing-library/react");

    const PageElement = await PragueViennaPage();
    const { container } = render(PageElement);
    const html = container.innerHTML;

    const hrefs = collectSingleSlashHrefs(html);
    expect(hrefs.length).toBeGreaterThan(0);
    for (const href of hrefs) {
      expect(href.startsWith("/ru/")).toBe(false);
      expect(href.startsWith("/en/")).toBe(false);
    }
    expect(hrefs).toContain("/book");
    expect(hrefs).toContain("/contact");
    expect(hrefs).toContain("/routes");
    expect(hrefs.some((h) => h.startsWith("/routes/prague-"))).toBe(true);

    const enContent = getRouteContent("prague-vienna", "en");
    expect(html).toContain(`alt="${enContent.hero.imageAlt}"`);
  });

  it("locale:'ru' renders every single-slash href prefixed with /ru/, and the hero alt equals the ru content file's hero.imageAlt", async () => {
    vi.mocked(getLocale).mockResolvedValueOnce("ru");

    const { default: PragueViennaPage } = await import(
      "@/app/[locale]/routes/prague-vienna/page"
    );
    const { render } = await import("@testing-library/react");

    const PageElement = await PragueViennaPage();
    const { container } = render(PageElement);
    const html = container.innerHTML;

    const hrefs = collectSingleSlashHrefs(html);
    expect(hrefs.length).toBeGreaterThan(0);
    for (const href of hrefs) {
      expect(href.startsWith("/ru/")).toBe(true);
    }
    expect(hrefs).toContain("/ru/book");
    expect(hrefs).toContain("/ru/contact");
    expect(hrefs).toContain("/ru/routes");
    expect(hrefs.some((h) => h.startsWith("/ru/routes/prague-"))).toBe(true);

    const ruContent = getRouteContent("prague-vienna", "ru");
    expect(ruContent.hero.imageAlt).toBeTruthy();
    expect(html).toContain(`alt="${ruContent.hero.imageAlt}"`);
  });
});

// 75-10 Task 2: the same locale-prefix proof as the tracer above, generalized
// across all 30 route slugs against 'ar' (an RTL locale, the widest possible
// distance from the 'ru' tracer check) -- confirms the getPathname()
// mechanical repeat (Task 2's codemod) landed identically on every page.
const ALL_SLUGS = [
  "prague-berlin",
  "prague-bratislava",
  "prague-brno",
  "prague-budapest",
  "prague-ceske-budejovice",
  "prague-cesky-krumlov",
  "prague-dresden",
  "prague-frantiskovy-lazne",
  "prague-graz",
  "prague-hradec-kralove",
  "prague-karlovy-vary",
  "prague-krakow",
  "prague-kutna-hora",
  "prague-leipzig",
  "prague-liberec",
  "prague-linz",
  "prague-marianske-lazne",
  "prague-munich",
  "prague-nuremberg",
  "prague-olomouc",
  "prague-ostrava",
  "prague-pardubice",
  "prague-passau",
  "prague-plzen",
  "prague-regensburg",
  "prague-salzburg",
  "prague-vienna",
  "prague-warsaw",
  "prague-wroclaw",
  "prague-zlin",
];

describe("All 30 route pages — locale:'ar' renders every single-slash href prefixed with /ar/ (75-10 Task 2)", () => {
  it.each(ALL_SLUGS)("%s", async (slug) => {
    vi.mocked(getLocale).mockResolvedValueOnce("ar");

    const pageModule = await import(`@/app/[locale]/routes/${slug}/page.tsx`);
    const { render } = await import("@testing-library/react");

    const PageElement = await pageModule.default();
    const { container } = render(PageElement);
    const html = container.innerHTML;

    const hrefs = collectSingleSlashHrefs(html);
    expect(hrefs.length).toBeGreaterThan(0);
    for (const href of hrefs) {
      expect(href.startsWith("/ar/")).toBe(true);
    }
    expect(hrefs).toContain("/ar/book");
    expect(hrefs).toContain("/ar/contact");
    expect(hrefs).toContain("/ar/routes");
    expect(hrefs.some((h) => h.startsWith("/ar/routes/prague-"))).toBe(true);

    const arContent = getRouteContent(slug, "ar");
    expect(arContent.hero.imageAlt).toBeTruthy();
    expect(html).toContain(`alt="${arContent.hero.imageAlt}"`);
  });
});
