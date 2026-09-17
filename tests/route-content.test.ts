// @vitest-environment node
import { describe, it, expect } from "vitest";
import { getRouteContent } from "@/lib/route-content";
import {
  assertRouteContentShape,
  assertRouteParity,
} from "./helpers/route-content-parity";

describe("getRouteContent()", () => {
  it("passes assertRouteContentShape for prague-vienna (en)", () => {
    const content = getRouteContent("prague-vienna", "en");
    assertRouteContentShape(content);
  });

  it("prague-vienna ru content exists, keeps the EN structure, and is translated (Phase 72)", () => {
    const en = getRouteContent("prague-vienna", "en");
    const ru = getRouteContent("prague-vienna", "ru");
    assertRouteContentShape(ru);
    expect(Object.keys(ru)).toEqual(Object.keys(en));
    expect(ru).not.toEqual(en);
  });

  it("prague-vienna ar still falls back to EN (no ar file yet — Phase 73)", () => {
    expect(getRouteContent("prague-vienna", "ar")).toEqual(getRouteContent("prague-vienna", "en"));
  });

  it("path-traversal: getRouteContent('../secrets', 'en') throws", () => {
    expect(() => getRouteContent("../secrets", "en")).toThrow();
  });

  it("path-traversal: getRouteContent('../etc/passwd', 'en') throws", () => {
    expect(() => getRouteContent("../etc/passwd", "en")).toThrow();
  });

  it("invalid-locale: getRouteContent('prague-vienna', 'xx') throws", () => {
    expect(() => getRouteContent("prague-vienna", "xx")).toThrow();
  });

  it("assertRouteParity spot-checks prague-vienna's five representative fields", () => {
    assertRouteParity("prague-vienna", {
      "hero.intro":
        "Prague to Vienna by private chauffeur is a 330 km door-to-door transfer via the D1 and A5, around 3h 30min drive time. Prestigo’s fixed fare starts at €485 in a Mercedes-Benz E-Class, all tolls and both Czech and Austrian vignettes included. Pickup from any Prague address, drop-off anywhere in Vienna.",
      "inclusions.0":
        "A black Mercedes — E-Class, S-Class, or V-Class depending on group size and preference. Every vehicle under three years old.",
      "faqs.1.a":
        "A fixed fare from €485 in a Mercedes E-Class for up to 3 passengers, €590 in the V-Class for up to 6, or €650 in the S-Class. The price covers fuel, all tolls, the Czech and Austrian vignettes, and driver time. No hidden charges.",
      "cta.headingItalic": "From €485, fixed.",
      "metadata.title": "Prague to Vienna Chauffeur — From €485",
    });
  });
});
