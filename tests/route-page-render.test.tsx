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

    expect(container.innerHTML).toMatchSnapshot();
  });
});
