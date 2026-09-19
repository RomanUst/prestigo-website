/**
 * Byte-parity proof-of-concept: render the awaited PragueViennaPage() Server
 * Component and snapshot container.innerHTML as the golden EN baseline. This
 * demonstrates the render-parity technique Wave 2 route plans reuse as their
 * backstop for "EN output stays byte-for-byte unchanged" (Success Criterion 4).
 *
 * next-intl/server mock note: the project's established pattern (see
 * tests/account-trips.test.tsx) redirects to next-intl's real
 * server.react-server.js build via a relative `../node_modules/...` path.
 * That relative path assumes the test file's own node_modules is populated
 * (true in the main checkout). Inside a git worktree the local node_modules
 * can be a near-empty stub (dependencies resolve only via Node's upward
 * directory walk for bare specifiers), so a literal relative path into
 * node_modules is not portable across worktree/main-checkout execution
 * contexts. This file instead mocks getLocale/getTranslations directly
 * against the real messages/en.json RoutePage namespace — sufficient
 * fidelity for byte-parity purposes (plain string/nested-key lookups, no
 * ICU features used by RoutePage) without depending on internal package
 * paths.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import enMessages from "../messages/en.json";
import { FIXTURE_PRICES } from "./helpers/route-content-parity";
import { getLocale } from "next-intl/server";

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

const getRoutePriceMock = vi.fn(async () => ({
  slug: "prague-vienna",
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

describe("PragueViennaPage — render byte-parity proof", () => {
  it("renders and matches the golden EN snapshot", async () => {
    const { default: PragueViennaPage } = await import(
      "@/app/[locale]/routes/prague-vienna/page"
    );
    const { render } = await import("@testing-library/react");

    const PageElement = await PragueViennaPage();
    const { container } = render(PageElement);

    // `priceValidUntil` is a dynamic today+365 value (lib/jsonld.ts
    // futureIsoDate) emitted into the Service JSON-LD. It is identical in
    // behavior before and after the content-externalization refactor, so it is
    // NOT part of what "byte-for-byte EN unchanged" must prove. Normalize it to
    // a placeholder so the golden snapshot stays date-stable across days.
    const html = container.innerHTML.replace(
      /("priceValidUntil":")\d{4}-\d{2}-\d{2}(")/g,
      "$1<DYNAMIC>$2"
    );

    expect(html).toMatchSnapshot();
  });
});

// CR-02 / D-11 backstop (gap-closure plan 73-08): confirm the DNT price
// bidi-isolation fix actually lands in the rendered /ar markup for
// prague-berlin — the page that pulls real, AI-translated Arabic content
// (content/routes/ar/prague-berlin.json) and interpolates live prices into
// it. This does NOT touch the en/ru/es/fr byte-parity snapshot above (D-12)
// — it is a separate, non-snapshot assertion against a locale that
// snapshot never covers.
describe("PragueBerlinPage — /ar DNT price bidi-isolation (CR-02 backstop)", () => {
  it("wraps every rendered price token in <bdi>, without wrapping surrounding prose", async () => {
    vi.mocked(getLocale).mockResolvedValueOnce("ar");

    const { default: PragueBerlinPage } = await import(
      "@/app/[locale]/routes/prague-berlin/page"
    );
    const { render } = await import("@testing-library/react");

    const PageElement = await PragueBerlinPage();
    const { container } = render(PageElement);
    const html = container.innerHTML;

    // At least one <bdi> isolate is present in the rendered /ar markup.
    expect(html).toContain("<bdi>");

    // The sentence-level render site (content.cta.headingItalic, fixed via
    // interpolateBidi at the render call) isolates ONLY the substituted
    // price digits — the surrounding Arabic prose ("ابتداءً من" / "، بسعر
    // ثابت.") stays outside the <bdi>, unlike the WR-05 anti-pattern the
    // review flagged (wrapping the whole sentence). FIXTURE_PRICES.ePrice
    // is 485; the literal "€" in the content string sits outside the
    // {ePrice} token boundary, so only the digits are isolated.
    const ctaExact = `ابتداءً من €<bdi>${FIXTURE_PRICES.ePrice}</bdi>، بسعر ثابت.`;
    expect(html).toContain(ctaExact);
    // The prose immediately preceding/following the isolate is never
    // itself inside the <bdi> — confirmed by the exact substring above
    // matching with the prose OUTSIDE the tag.
    expect(html).not.toContain(
      `<bdi>ابتداءً من €${FIXTURE_PRICES.ePrice}، بسعر ثابت.</bdi>`
    );

    // Collect every <bdi> isolate present and confirm none of them is a
    // full multi-clause sentence (a defensive backstop against the same
    // over-wrapping regression, independent of the exact prose above).
    const bdiContents = Array.from(html.matchAll(/<bdi>([^<]*)<\/bdi>/g)).map(
      (m) => m[1]
    );
    expect(bdiContents.length).toBeGreaterThan(0);
    for (const content of bdiContents) {
      // A full translated sentence ends in terminal punctuation; a price
      // isolate never does.
      expect(content).not.toMatch(/[.،؛]\s*$/);
    }
  });
});
