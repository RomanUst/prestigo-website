/**
 * 75-11: proves the services hub, the 7 service pages, and the static
 * pages (about, terms, privacy, faq, blog index, data-deletion) keep every
 * visitor in their locale on every internal link, and that the hero image
 * alt on the 7 service pages + about renders from content.hero.imageAlt
 * (never a hardcoded string).
 *
 * Task 1 (tracer): airport-transfer only, en + ru.
 * Task 2: extends coverage to the other 13 pages + an all-touched-pages
 * 'ar' href-prefix sweep, mirroring tests/route-locale-links.test.tsx's
 * pattern from 75-10.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { getLocale } from "next-intl/server";
import { getPageContent } from "@/lib/page-content";

vi.mock("next-intl/server", () => ({
  getLocale: vi.fn(async () => "en"),
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
vi.mock("@/components/Divider", () => ({ default: () => null }));
vi.mock("@/components/Reveal", () => ({
  default: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/components/BookingSection", () => ({ default: () => null }));
vi.mock("@/components/HourlyBookingSection", () => ({ default: () => null }));
vi.mock("@/components/ContactForm", () => ({ default: () => null }));
vi.mock("@/app/[locale]/corporate/CorporateForm", () => ({
  default: () => null,
}));
// BlogCard's own href (`/blog/${slug}`) is a real, unrelated locale-dropping
// defect owned by plan 75-13 (75-EN-LEAK-AUDIT.md) — out of this plan's
// scope. Mocked out so the blog index page's own hrefs (emptyState/CTA)
// aren't drowned out by BlogCard's unfixed links in the 'ar' sweep below.
vi.mock("@/components/BlogCard", () => ({ default: () => null }));

beforeEach(() => {
  // jsdom does not implement IntersectionObserver — Reveal (mocked above,
  // but some pages import it directly without going through the mock path
  // in every build) can still construct one; a minimal stub covers it.
  class MockIntersectionObserver {
    observe = vi.fn();
    disconnect = vi.fn();
    unobserve = vi.fn();
  }
  vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);
});

function collectSingleSlashHrefs(html: string): string[] {
  return Array.from(html.matchAll(/href="(\/[^"]*)"/g)).map((m) => m[1]);
}

// React/DOM HTML-escapes '&' -> '&amp;' inside rendered attribute values —
// content strings containing a literal '&' (e.g. "meet & greet") never
// appear byte-identical in container.innerHTML.
function escapeAmp(s: string): string {
  return s.replace(/&/g, "&amp;");
}

// ---------------------------------------------------------------------------
// Task 1 tracer: airport-transfer, en + ru
// ---------------------------------------------------------------------------
describe("AirportTransferPage — locale-aware links + content-driven hero alt (75-11 Task 1 tracer)", () => {
  it("locale:'en' renders hrefs unprefixed and the hero alt equals today's EN alt", async () => {
    vi.mocked(getLocale).mockResolvedValueOnce("en");

    const { default: AirportTransferPage } = await import(
      "@/app/[locale]/services/airport-transfer/page"
    );
    const { render } = await import("@testing-library/react");

    const PageElement = await AirportTransferPage();
    const { container } = render(PageElement);
    const html = container.innerHTML;

    const hrefs = collectSingleSlashHrefs(html);
    expect(hrefs.length).toBeGreaterThan(0);
    for (const href of hrefs) {
      expect(href.startsWith("/ru/")).toBe(false);
      expect(href.startsWith("/en/")).toBe(false);
    }
    expect(hrefs).toContain("/book");
    expect(hrefs).toContain("/services");

    const enContent = getPageContent("services/airport-transfer", "en") as {
      hero: { imageAlt: string };
    };
    expect(enContent.hero.imageAlt).toBe(
      "Prague Airport meet & greet chauffeur transfer — PRESTIGO"
    );
    expect(html).toContain(`alt="${escapeAmp(enContent.hero.imageAlt)}"`);
  });

  it("locale:'ru' prefixes every single-slash href with /ru/ and renders the ru hero alt", async () => {
    vi.mocked(getLocale).mockResolvedValueOnce("ru");

    const { default: AirportTransferPage } = await import(
      "@/app/[locale]/services/airport-transfer/page"
    );
    const { render } = await import("@testing-library/react");

    const PageElement = await AirportTransferPage();
    const { container } = render(PageElement);
    const html = container.innerHTML;

    const hrefs = collectSingleSlashHrefs(html);
    expect(hrefs.length).toBeGreaterThan(0);
    for (const href of hrefs) {
      expect(href.startsWith("/ru/")).toBe(true);
    }
    expect(hrefs).toContain("/ru/book");
    expect(hrefs).toContain("/ru/services");

    const ruContent = getPageContent("services/airport-transfer", "ru") as {
      hero: { imageAlt: string };
    };
    expect(ruContent.hero.imageAlt).toBeTruthy();
    expect(ruContent.hero.imageAlt).not.toBe(
      "Prague Airport meet & greet chauffeur transfer — PRESTIGO"
    );
    expect(html).toContain(`alt="${escapeAmp(ruContent.hero.imageAlt)}"`);
  });
});

// ---------------------------------------------------------------------------
// Task 2: remaining 13 pages + hero.imageAlt coverage + D-09 content fixes
// + an all-touched-pages 'ar' href-prefix sweep.
// ---------------------------------------------------------------------------

// The 8 hero.imageAlt units this plan moved into the content model (7
// service pages + about). EN value recorded verbatim from the hardcoded
// alt="..." attribute that lived on each page.tsx BEFORE this plan's
// refactor — the byte-parity proof that content.hero.imageAlt for 'en' is
// unchanged from what was live.
const HERO_ALT_UNITS: { page: string; enAlt: string }[] = [
  {
    page: "services/airport-transfer",
    enAlt: "Prague Airport meet & greet chauffeur transfer — PRESTIGO",
  },
  { page: "services/city-rides", enAlt: "Prague City Rides — PRESTIGO" },
  {
    page: "services/concierge",
    enAlt: "Concierge chauffeur service in Prague — PRESTIGO",
  },
  {
    page: "services/corporate-accounts",
    enAlt: "Corporate Chauffeur Accounts Prague — PRESTIGO",
  },
  {
    page: "services/group-transfers",
    enAlt: "Group Transfers Prague — PRESTIGO",
  },
  {
    page: "services/intercity-routes",
    enAlt: "Intercity Routes from Prague — PRESTIGO",
  },
  {
    page: "services/vip-events",
    enAlt: "VIP & Events Chauffeur Prague — PRESTIGO",
  },
  {
    page: "about",
    enAlt: "About PRESTIGO — Prague's Premium Chauffeur Service",
  },
];

const NON_EN_LOCALES = ["ru", "es", "fr", "ar", "hi", "zh"] as const;

describe("hero.imageAlt content-model rollout — 7 service pages + about x 7 locales (D-07)", () => {
  it.each(HERO_ALT_UNITS)(
    "$page: EN is byte-identical to the pre-change alt; every locale has a non-empty imageAlt",
    ({ page, enAlt }) => {
      const en = getPageContent(page, "en") as { hero: { imageAlt: string } };
      expect(en.hero.imageAlt).toBe(enAlt);

      for (const locale of NON_EN_LOCALES) {
        const content = getPageContent(page, locale) as {
          hero: { imageAlt: string };
        };
        expect(content.hero.imageAlt).toBeTruthy();
      }
    }
  );
});

describe("D-09 content-fix units — hi/zh corporate.json usagePatterns.headingItalic, hi data-deletion.json section3.facebookLinkLabel", () => {
  it("hi corporate.json usagePatterns.headingItalic no longer equals the EN string", () => {
    const en = getPageContent("corporate", "en") as {
      usagePatterns: { headingItalic: string };
    };
    const hi = getPageContent("corporate", "hi") as {
      usagePatterns: { headingItalic: string };
    };
    expect(hi.usagePatterns.headingItalic).not.toBe(
      en.usagePatterns.headingItalic
    );
    expect(hi.usagePatterns.headingItalic).toBeTruthy();
  });

  it("zh corporate.json usagePatterns.headingItalic no longer equals the EN string", () => {
    const en = getPageContent("corporate", "en") as {
      usagePatterns: { headingItalic: string };
    };
    const zh = getPageContent("corporate", "zh") as {
      usagePatterns: { headingItalic: string };
    };
    expect(zh.usagePatterns.headingItalic).not.toBe(
      en.usagePatterns.headingItalic
    );
    expect(zh.usagePatterns.headingItalic).toBeTruthy();
  });

  it("hi data-deletion.json section3.facebookLinkLabel no longer equals the EN string, and keeps the Facebook token in Latin", () => {
    const en = getPageContent("data-deletion", "en") as {
      section3: { facebookLinkLabel: string };
    };
    const hi = getPageContent("data-deletion", "hi") as {
      section3: { facebookLinkLabel: string };
    };
    expect(hi.section3.facebookLinkLabel).not.toBe(
      en.section3.facebookLinkLabel
    );
    expect(hi.section3.facebookLinkLabel).toContain("Facebook");
  });
});

describe("ServicesPage (hub) and AboutPage — locale:'en' hrefs stay unchanged (regression backstop)", () => {
  it("ServicesPage 'en' hrefs are unprefixed", async () => {
    vi.mocked(getLocale).mockResolvedValueOnce("en");
    const { default: ServicesPage } = await import(
      "@/app/[locale]/services/page"
    );
    const { render } = await import("@testing-library/react");

    const PageElement = await ServicesPage();
    const { container } = render(PageElement);
    const hrefs = collectSingleSlashHrefs(container.innerHTML);
    expect(hrefs.length).toBeGreaterThan(0);
    for (const href of hrefs) {
      expect(href.startsWith("/ru/")).toBe(false);
      expect(href.startsWith("/en/")).toBe(false);
    }
    expect(hrefs).toContain("/book");
  });

  it("AboutPage 'en' hrefs are unprefixed and the hero alt matches the pre-change EN alt", async () => {
    const { default: AboutPage } = await import("@/app/[locale]/about/page");
    const { render } = await import("@testing-library/react");

    const PageElement = await AboutPage({
      params: Promise.resolve({ locale: "en" }),
    });
    const { container } = render(PageElement);
    const html = container.innerHTML;
    const hrefs = collectSingleSlashHrefs(html);
    expect(hrefs.length).toBeGreaterThan(0);
    for (const href of hrefs) {
      expect(href.startsWith("/ru/")).toBe(false);
      expect(href.startsWith("/en/")).toBe(false);
    }
    expect(hrefs).toContain("/book");
    expect(hrefs).toContain("/corporate");

    const en = getPageContent("about", "en") as { hero: { imageAlt: string } };
    expect(html).toContain(`alt="${escapeAmp(en.hero.imageAlt)}"`);
  });
});

// Every touched page rendered with locale:'ar' — proves the getPathname()
// bridge landed on all 14 pages. Two invocation shapes exist across this
// set: getLocale()-based pages (no args) and params-based pages
// (Promise.resolve({ locale })).
type PageUnderTest = {
  name: string;
  importPath: string;
  usesParams: boolean;
  usesSearchParams?: boolean;
};

const PAGES_UNDER_TEST: PageUnderTest[] = [
  { name: "services hub", importPath: "@/app/[locale]/services/page", usesParams: false },
  { name: "city-rides", importPath: "@/app/[locale]/services/city-rides/page", usesParams: false },
  { name: "concierge", importPath: "@/app/[locale]/services/concierge/page", usesParams: false },
  { name: "corporate-accounts", importPath: "@/app/[locale]/services/corporate-accounts/page", usesParams: true },
  { name: "group-transfers", importPath: "@/app/[locale]/services/group-transfers/page", usesParams: true },
  { name: "intercity-routes", importPath: "@/app/[locale]/services/intercity-routes/page", usesParams: false },
  { name: "vip-events", importPath: "@/app/[locale]/services/vip-events/page", usesParams: true },
  { name: "about", importPath: "@/app/[locale]/about/page", usesParams: true },
  { name: "terms", importPath: "@/app/[locale]/terms/page", usesParams: true },
  { name: "privacy", importPath: "@/app/[locale]/privacy/page", usesParams: true },
  { name: "faq", importPath: "@/app/[locale]/faq/page", usesParams: true },
  { name: "blog index", importPath: "@/app/[locale]/blog/page", usesParams: true },
  { name: "data-deletion", importPath: "@/app/[locale]/data-deletion/page", usesParams: false, usesSearchParams: true },
];

describe("All touched pages — locale:'ar' renders every single-slash href prefixed with /ar/ (75-11 Task 2)", () => {
  it.each(PAGES_UNDER_TEST)(
    "$name",
    async ({ importPath, usesParams, usesSearchParams }) => {
      vi.mocked(getLocale).mockResolvedValueOnce("ar");

      const pageModule = await import(/* @vite-ignore */ importPath);
      const { render } = await import("@testing-library/react");

      const props: Record<string, unknown> = {};
      if (usesParams) props.params = Promise.resolve({ locale: "ar" });
      if (usesSearchParams) props.searchParams = Promise.resolve({});

      const PageElement = await pageModule.default(props);
      const { container } = render(PageElement);
      const html = container.innerHTML;

      const hrefs = collectSingleSlashHrefs(html);
      expect(hrefs.length).toBeGreaterThan(0);
      for (const href of hrefs) {
        expect(href.startsWith("/ar/")).toBe(true);
      }
    }
  );
});
