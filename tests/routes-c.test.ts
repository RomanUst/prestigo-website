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
    "prague-warsaw",
    "prague-wroclaw",
    "prague-zlin",
  ])("%s", (slug) => {
    it("passes assertRouteContentShape", () => {
      const content = getRouteContent(slug, "en");
      assertRouteContentShape(content);
    });

    it("ru content exists, keeps the EN structure, and is translated (Phase 72)", () => {
      const en = getRouteContent(slug, "en");
      const ru = getRouteContent(slug, "ru");
      assertRouteContentShape(ru);
      expect(Object.keys(ru)).toEqual(Object.keys(en));
      expect(ru).not.toEqual(en);
    });

    it("ar still falls back to EN (no ar file yet — Phase 73)", () => {
      expect(getRouteContent(slug, "ar")).toEqual(getRouteContent(slug, "en"));
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

  it("prague-warsaw: byte-parity spot-check", () => {
    assertRouteParity("prague-warsaw", {
      "hero.intro":
        "660 km north through Moravia and across Poland to the Vistula. The rebuilt Old Town, the Palace of Culture, Łazienki Park, and Poland's economic heart — seven hours, one fixed price.",
      "inclusions.0":
        "A black Mercedes — E-Class, S-Class, or V-Class depending on group size and preference. Every vehicle under three years old.",
      "faqs.1.a":
        "A fixed fare from €485 in a Mercedes E-Class for up to 3 passengers, €590 in the V-Class for up to 6, or €650 in the S-Class. The price covers fuel, the Czech vignette, Polish motorway tolls, and driver time. No hidden charges.",
      "cta.headingItalic": "From €485, fixed.",
      "metadata.title": "Prague to Warsaw Chauffeur — From €485",
    });
  });

  it("prague-warsaw: has no day-trip section (page never rendered one)", () => {
    const content = getRouteContent("prague-warsaw", "en");
    expect(content.dayTripLabel).toBe("");
    expect(content.dayTrip.configurations).toEqual([]);
  });

  it("prague-wroclaw: byte-parity spot-check", () => {
    assertRouteParity("prague-wroclaw", {
      "hero.intro":
        "285 km northeast to Poland's city of dwarfs and one of Central Europe's most vibrant market squares. Three hours, one fixed price, door to door across the border.",
      "inclusions.0":
        "A black Mercedes — E-Class, S-Class, or V-Class depending on group size and preference. Every vehicle under three years old.",
      "faqs.1.a":
        "A fixed fare from €485 in a Mercedes E-Class for up to 3 passengers, €590 in the V-Class for up to 6, or €650 in the S-Class. The price covers fuel, the Czech vignette, Polish motorway tolls, and driver time. No hidden charges.",
      "cta.headingItalic": "From €485, fixed.",
      "metadata.title": "Prague to Wrocław Chauffeur — From €485",
    });
  });

  it("prague-wroclaw: has no day-trip section (page never rendered one)", () => {
    const content = getRouteContent("prague-wroclaw", "en");
    expect(content.dayTripLabel).toBe("");
    expect(content.dayTrip.configurations).toEqual([]);
  });

  it("prague-zlin: byte-parity spot-check", () => {
    assertRouteParity("prague-zlin", {
      "hero.intro":
        "310 km east to Moravia's functionalist city. Built by the Baťa shoe empire, Zlín is a rare monument to 20th-century industrial urbanism — three and a half hours, one fixed price.",
      "inclusions.0":
        "A black Mercedes — E-Class, S-Class, or V-Class depending on group size and preference. Every vehicle under three years old.",
      "faqs.1.a":
        "A fixed fare from €485 in a Mercedes E-Class for up to 3 passengers, €590 in the V-Class for up to 6, or €650 in the S-Class. Fuel, the Czech motorway vignette, and driver time are all included — nothing is added at drop-off.",
      "cta.headingItalic": "From €485, fixed.",
      "metadata.title": "Prague to Zlín Chauffeur — From €485",
    });
  });

  it("prague-zlin: has no day-trip section (page never rendered one)", () => {
    const content = getRouteContent("prague-zlin", "en");
    expect(content.dayTripLabel).toBe("");
    expect(content.dayTrip.configurations).toEqual([]);
  });
});
