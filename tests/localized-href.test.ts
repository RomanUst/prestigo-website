// @vitest-environment node
/**
 * 75-11 Task 1 (tracer): unit coverage for lib/localized-href.ts's
 * behavior contract — every case from the plan's <behavior> block, plus the
 * T-75-23 protocol-relative-URL negative case that proves it is NEVER
 * treated as internal.
 */
import { describe, it, expect } from "vitest";
import { localizedHref } from "@/lib/localized-href";

describe("localizedHref()", () => {
  it("prefixes an internal root-relative href for a non-default locale", () => {
    expect(localizedHref("ru", "/book")).toBe("/ru/book");
  });

  it("leaves an internal root-relative href unprefixed for the default locale (en)", () => {
    expect(localizedHref("en", "/book")).toBe("/book");
  });

  it("prefixes a multi-segment internal href (template-literal route link)", () => {
    expect(localizedHref("ar", "/routes/prague-vienna")).toBe(
      "/ar/routes/prague-vienna"
    );
  });

  it("leaves an absolute external URL unchanged", () => {
    expect(localizedHref("ru", "https://wa.me/1")).toBe("https://wa.me/1");
  });

  it("leaves a mailto: link unchanged", () => {
    expect(localizedHref("ru", "mailto:a@b.c")).toBe("mailto:a@b.c");
  });

  it("leaves a tel: link unchanged", () => {
    expect(localizedHref("ru", "tel:+420")).toBe("tel:+420");
  });

  it("leaves a hash-only anchor unchanged", () => {
    expect(localizedHref("ru", "#faq")).toBe("#faq");
  });

  it("leaves a static asset path (has a file extension) unchanged", () => {
    expect(localizedHref("ru", "/hero.webp")).toBe("/hero.webp");
  });

  it("T-75-23: never treats a protocol-relative URL as internal", () => {
    expect(localizedHref("ru", "//evil.com")).toBe("//evil.com");
  });

  it("returns the empty string unchanged (no '/ru' fabricated from nothing)", () => {
    expect(localizedHref("ru", "")).toBe("");
  });

  it("returns undefined unchanged", () => {
    expect(localizedHref("ru", undefined)).toBe(undefined);
  });
});
