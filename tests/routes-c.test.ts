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
    "prague-plzen",
    "prague-regensburg",
    "prague-salzburg",
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

  it("prague-plzen: byte-parity spot-check", () => {
    assertRouteParity("prague-plzen", {
      "hero.intro":
        "90 km west on the D5. Home of Pilsner Urquell, West Bohemia's industrial capital, and a Republic Square that demands a slow coffee. One hour, one vehicle, one fixed price.",
      "inclusions.0":
        "A black Mercedes — E-Class, S-Class, or V-Class depending on group size and preference. Every vehicle under three years old.",
      "faqs.1.a":
        "Fixed fare from €485 in Mercedes E-Class (up to 3 passengers), €590 in V-Class (up to 6 passengers), or €650 in S-Class. Prices include fuel, all tolls, the Czech vignette, and driver time. No hidden charges.",
      "cta.headingItalic": "From €485, fixed.",
      "metadata.title": "Prague to Plzeň Chauffeur — From €485",
    });
  });

  it("prague-plzen: has no day-trip section (page never rendered one)", () => {
    const content = getRouteContent("prague-plzen", "en");
    expect(content.dayTripLabel).toBe("");
    expect(content.dayTrip.configurations).toEqual([]);
  });

  it("prague-regensburg: byte-parity spot-check", () => {
    assertRouteParity("prague-regensburg", {
      "hero.intro":
        "285 km southwest into Bavaria's most perfectly preserved medieval city. A UNESCO old town, a 12th-century stone bridge, and the Danube flowing beneath — three hours, one fixed price.",
      "inclusions.0":
        "A black Mercedes — E-Class, S-Class, or V-Class depending on group size and preference. Every vehicle under three years old.",
      "faqs.1.a":
        "Fixed fare from €485 in Mercedes E-Class (up to 3 passengers), €590 in V-Class (up to 6 passengers), or €650 in S-Class. Prices include fuel, the Czech vignette, the German toll vignette, and driver time. No hidden charges.",
      "cta.headingItalic": "From €485, fixed.",
      "metadata.title": "Prague to Regensburg Chauffeur — From €485",
    });
  });

  it("prague-regensburg: keeps its own 'Day Trips from Prague' label (not shared chrome)", () => {
    const content = getRouteContent("prague-regensburg", "en");
    expect(content.dayTripLabel).toBe("Day Trips from Prague");
  });

  it("prague-salzburg: byte-parity spot-check", () => {
    assertRouteParity("prague-salzburg", {
      "hero.intro":
        "305 km south through Bohemia and Austria to the Salzach, the Hohensalzburg fortress, and the birthplace of Mozart. Three and a half hours, one fixed price.",
      "inclusions.0":
        "A black Mercedes — E-Class, S-Class, or V-Class depending on group size and preference. Every vehicle under three years old.",
      "faqs.1.a":
        "A fixed fare from €485 in a Mercedes E-Class for up to 3 passengers, €590 in the V-Class for up to 6, or €650 in the S-Class. The price covers fuel, both the Czech and Austrian vignettes, all tolls, and driver time. No hidden charges at drop-off.",
      "cta.headingItalic": "From €485, fixed.",
      "metadata.title": "Prague to Salzburg Chauffeur — From €485",
    });
  });

  it("prague-salzburg: keeps its own 'Day Trips from Prague' label (not shared chrome)", () => {
    const content = getRouteContent("prague-salzburg", "en");
    expect(content.dayTripLabel).toBe("Day Trips from Prague");
  });
});
