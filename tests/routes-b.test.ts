// @vitest-environment node
import { describe, it, expect } from "vitest";
import { getRouteContent } from "@/lib/route-content";
import {
  assertRouteContentShape,
  assertRouteParity,
} from "./helpers/route-content-parity";

describe("Group B route content (71-03)", () => {
  describe.each([
    "prague-karlovy-vary",
    "prague-krakow",
    "prague-kutna-hora",
    "prague-leipzig",
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

  it("prague-karlovy-vary: byte-parity spot-check", () => {
    assertRouteParity("prague-karlovy-vary", {
      "hero.intro":
        "130 km west on the D6, through the Bohemian highlands. The most celebrated spa town in Central Europe — film festival, thermal colonnades, and Becherovka. One vehicle, one fixed price.",
      "inclusions.0":
        "A black Mercedes — E-Class, S-Class, or V-Class depending on group size and preference. Every vehicle under three years old.",
      "faqs.1.a":
        "Fixed fare from €485 in Mercedes E-Class (up to 3 passengers), €590 in V-Class (up to 6 passengers), or €650 in S-Class. Prices include fuel, the Czech vignette, and driver time. No hidden charges.",
      "cta.headingItalic": "From €485, fixed.",
      "metadata.title": "Prague to Karlovy Vary Chauffeur — From €485",
    });
  });

  it("prague-krakow: byte-parity spot-check", () => {
    assertRouteParity("prague-krakow", {
      "hero.intro":
        "385 km northeast to Poland's cultural capital. Wawel Castle, the Rynek market square, Jewish Kazimierz, and salt mines at Wieliczka — four hours, one fixed price.",
      "inclusions.0":
        "A black Mercedes — E-Class, S-Class, or V-Class depending on group size and preference. Every vehicle under three years old.",
      "faqs.1.a":
        "Fixed fare from €485 in Mercedes E-Class (up to 3 passengers), €590 in V-Class (up to 6 passengers), or €650 in S-Class. Prices include fuel, the Czech vignette, and all Polish toll sections including the A4. No hidden charges.",
      "cta.headingItalic": "From €485, fixed.",
      "metadata.title": "Prague to Kraków Chauffeur — From €485",
    });
  });

  it("prague-kutna-hora: byte-parity spot-check", () => {
    assertRouteParity("prague-kutna-hora", {
      "hero.intro":
        "70 km east of Prague, the medieval silver-mining capital of Bohemia awaits. UNESCO old town, the haunting Sedlec Ossuary, and the Cathedral of St. Barbara. One hour, one vehicle, one fixed price.",
      "inclusions.0":
        "A black Mercedes — E-Class, S-Class, or V-Class depending on group size and preference. Every vehicle under three years old.",
      "faqs.1.a":
        "Fixed fare from €485 in Mercedes E-Class (up to 3 passengers), €590 in V-Class (up to 6 passengers), or €650 in S-Class. This is the lowest fare of any route in the Prestigo Green tier. Prices include fuel, tolls, and driver time. No hidden charges.",
      "cta.headingItalic": "From €485, fixed.",
      "metadata.title": "Prague to Kutná Hora Chauffeur — From €485",
    });
  });

  it("prague-leipzig: byte-parity spot-check", () => {
    assertRouteParity("prague-leipzig", {
      "hero.intro":
        "North into Saxony to the city of Bach and Schiller, the Gewandhaus, and one of Germany's great trade fair centres. Two hours, one fixed price, door to door.",
      "inclusions.0":
        "A black Mercedes — E-Class, S-Class, or V-Class depending on group size and preference. Every vehicle under three years old.",
      "faqs.1.a":
        "Fixed fare from €485 in Mercedes E-Class (up to 3 passengers), €590 in V-Class (up to 6 passengers), or €650 in S-Class. Prices include fuel, all tolls, and driver time. No hidden charges.",
      "cta.headingItalic": "From €485, fixed.",
      "metadata.title": "Prague to Leipzig Chauffeur — From €485",
    });
  });
});
