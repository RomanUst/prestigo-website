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
