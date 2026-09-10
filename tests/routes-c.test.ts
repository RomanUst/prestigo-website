// @vitest-environment node
import { describe, it, expect } from "vitest";
import { getRouteContent } from "@/lib/route-content";
import {
  assertRouteContentShape,
  assertRouteParity,
} from "./helpers/route-content-parity";

describe("Group C route content (71-04)", () => {
  describe.each([
    "prague-ostrava",
    "prague-pardubice",
    "prague-passau",
  ])("%s", (slug) => {
    it("passes assertRouteContentShape", () => {
      const content = getRouteContent(slug, "en");
      assertRouteContentShape(content);
    });

    it("EN-fallback: getRouteContent(slug, 'ru') deep-equals the 'en' result (no ru file exists yet)", () => {
      const en = getRouteContent(slug, "en");
      const ru = getRouteContent(slug, "ru");
      expect(ru).toEqual(en);
    });
  });

  it("prague-ostrava: byte-parity spot-check", () => {
    assertRouteParity("prague-ostrava", {
      "hero.intro":
        "370 km east to the Czech Republic's steel city on the Polish border. Colours of Ostrava, the Dolní Vítkovice ironworks, and a city in creative transformation — four hours, one fixed price.",
      "inclusions.0":
        "A black Mercedes — E-Class, S-Class, or V-Class depending on group size and preference. Every vehicle under three years old.",
      "faqs.1.a":
        "Fixed fare from €485 in Mercedes E-Class (up to 3 passengers), €590 in V-Class (up to 6 passengers), or €650 in S-Class. Prices include fuel, the Czech motorway vignette, driver time, and every toll. No meter, no surge, no hidden charges.",
      "cta.headingItalic": "From €485, fixed.",
      "metadata.title": "Prague to Ostrava Chauffeur — From €485",
    });
  });

  it("prague-ostrava: has no day-trip section (page never rendered one)", () => {
    const content = getRouteContent("prague-ostrava", "en");
    expect(content.dayTripLabel).toBe("");
    expect(content.dayTrip.configurations).toEqual([]);
  });

  it("prague-pardubice: byte-parity spot-check", () => {
    assertRouteParity("prague-pardubice", {
      "hero.intro":
        "110 km east on the D11 to East Bohemia's equestrian city. The Grand Steeplechase, chemical industry, and a well-preserved Old Town. One and a half hours, one fixed price.",
      "inclusions.0":
        "A black Mercedes — E-Class, S-Class, or V-Class depending on group size and preference. Every vehicle under three years old.",
      "faqs.1.a":
        "Fixed fare from €485 in Mercedes E-Class (up to 3 passengers), €590 in V-Class (up to 6 passengers), or €650 in S-Class. Prices include fuel, the Czech motorway vignette, and driver time. No hidden charges.",
      "cta.headingItalic": "From €485, fixed.",
      "metadata.title": "Prague to Pardubice Chauffeur — From €485",
    });
  });

  it("prague-pardubice: has no day-trip section (page never rendered one)", () => {
    const content = getRouteContent("prague-pardubice", "en");
    expect(content.dayTripLabel).toBe("");
    expect(content.dayTrip.configurations).toEqual([]);
  });

  it("prague-passau: byte-parity spot-check", () => {
    assertRouteParity("prague-passau", {
      "hero.intro":
        "220 km south into Bavaria to where the Danube, Inn, and Ilz converge. A medieval cathedral city, a starting point for Danube cruises, and a gateway between Bohemia and Bavaria.",
      "inclusions.0":
        "A black Mercedes — E-Class, S-Class, or V-Class depending on group size and preference. Every vehicle under three years old.",
      "faqs.1.a":
        "Fixed fare from €485 in Mercedes E-Class (up to 3 passengers), €590 in V-Class (up to 6 passengers), or €650 in S-Class. Prices include fuel, all tolls, the German vignette, and driver time. No hidden charges.",
      "cta.headingItalic": "From €485, fixed.",
      "metadata.title": "Prague to Passau Chauffeur — From €485",
    });
  });

  it("prague-passau: keeps its own 'Day Trips from Prague' label (not shared chrome)", () => {
    const content = getRouteContent("prague-passau", "en");
    expect(content.dayTripLabel).toBe("Day Trips from Prague");
  });
});
