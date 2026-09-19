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
    "prague-liberec",
    "prague-linz",
    "prague-marianske-lazne",
    "prague-munich",
    "prague-nuremberg",
    "prague-olomouc",
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

    it("ar content exists, keeps the EN structure, and is translated (Phase 73)", () => {
      const en = getRouteContent(slug, "en");
      const ar = getRouteContent(slug, "ar");
      assertRouteContentShape(ar);
      expect(Object.keys(ar)).toEqual(Object.keys(en));
      expect(ar).not.toEqual(en);
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

  it("prague-liberec: byte-parity spot-check", () => {
    assertRouteParity("prague-liberec", {
      "hero.intro":
        "105 km north to North Bohemia's capital at the foot of the Jizera Mountains. Cable car, neo-baroque town hall, and Czech glass tradition — one and a half hours, one fixed price.",
      "inclusions.0":
        "A black Mercedes — E-Class, S-Class, or V-Class depending on group size and preference. Every vehicle under three years old.",
      "faqs.1.a":
        "Fixed fare from €485 in Mercedes E-Class (up to 3 passengers), €590 in V-Class (up to 6 passengers), or €650 in S-Class. Prices include fuel, the Czech motorway vignette, and driver time. No hidden charges.",
      "cta.headingItalic": "From €485, fixed.",
      "metadata.title": "Prague to Liberec Chauffeur — From €485",
    });
  });

  it("prague-liberec: has no day-trip section (page never rendered one)", () => {
    const content = getRouteContent("prague-liberec", "en");
    expect(content.dayTripLabel).toBe("");
    expect(content.dayTrip.configurations).toEqual([]);
  });

  it("prague-linz: byte-parity spot-check", () => {
    assertRouteParity("prague-linz", {
      "hero.intro":
        "195 km south to Upper Austria's capital on the Danube. Ars Electronica, Lentos Museum, and a city that has reinvented itself as a creative hub — two and a half hours, one fixed price.",
      "inclusions.0":
        "A black Mercedes — E-Class, S-Class, or V-Class depending on group size and preference. Every vehicle under three years old.",
      "faqs.1.a":
        "Fixed fare from €485 in Mercedes E-Class (up to 3 passengers), €590 in V-Class (up to 6 passengers), or €650 in S-Class. Prices include fuel, Czech and Austrian motorway vignettes, and driver time. No hidden charges.",
      "cta.headingItalic": "From €485, fixed.",
      "metadata.title": "Prague to Linz Chauffeur — From €485",
    });
  });

  it("prague-marianske-lazne: byte-parity spot-check", () => {
    assertRouteParity("prague-marianske-lazne", {
      "hero.intro":
        "165 km west to the most elegant of the West Bohemian spa towns. Colonnaded promenades, mineral springs, the Singing Fountain, and forested hills — two hours, one fixed price.",
      "inclusions.0":
        "A black Mercedes — E-Class, S-Class, or V-Class depending on group size and preference. Every vehicle under three years old.",
      "faqs.1.a":
        "Fixed fare from €485 in Mercedes E-Class (up to 3 passengers), €590 in V-Class (up to 6 passengers), or €650 in S-Class. Prices include fuel, the Czech motorway vignette, and driver time. No hidden charges.",
      "cta.headingItalic": "From €485, fixed.",
      "metadata.title": "Prague to Mariánské Lázně Chauffeur — From €485",
    });
  });

  it("prague-marianske-lazne: has no day-trip section (page never rendered one)", () => {
    const content = getRouteContent("prague-marianske-lazne", "en");
    expect(content.dayTripLabel).toBe("");
    expect(content.dayTrip.configurations).toEqual([]);
  });

  it("prague-munich: byte-parity spot-check", () => {
    assertRouteParity("prague-munich", {
      "hero.intro":
        "385 km southwest through Bohemia and Bavaria. Marienplatz, the English Garden, Oktoberfest, and Munich Airport — four hours, one fixed price, door to door.",
      "inclusions.0":
        "A black Mercedes — E-Class, S-Class, or V-Class depending on group size and preference. Every vehicle under three years old.",
      "faqs.1.a":
        "Fixed fare from €485 in Mercedes E-Class (up to 3 passengers), €590 in V-Class (up to 6 passengers), or €650 in S-Class. Prices include fuel, the Czech vignette, the German toll, and driver time. No hidden charges.",
      "cta.headingItalic": "From €485, fixed.",
      "metadata.title": "Prague to Munich Chauffeur — From €485",
    });
  });

  it("prague-nuremberg: byte-parity spot-check", () => {
    assertRouteParity("prague-nuremberg", {
      "hero.intro":
        "360 km southwest on the D5 into Bavaria. Three and a half hours door-to-door. Fixed fare from €485. Your chauffeur is already waiting.",
      "inclusions.0":
        "A black Mercedes — E-Class, S-Class, or V-Class depending on group size and preference. Every vehicle under three years old.",
      "faqs.1.a":
        "Fixed fare from €485 in Mercedes E-Class (up to 3 passengers), €590 in V-Class (up to 6 passengers), or €650 in S-Class. Prices include fuel, the Czech vignette, the German toll, and driver time. No hidden charges.",
      "cta.headingItalic": "From €485, fixed.",
      "metadata.title": "Prague to Nuremberg Chauffeur — From €485",
    });
  });

  it("prague-olomouc: byte-parity spot-check", () => {
    assertRouteParity("prague-olomouc", {
      "hero.intro":
        "280 km east to Moravia's grand historic capital. Six baroque fountains, a UNESCO Holy Trinity Column, and one of Central Europe's most intact old towns — three hours, one fixed price.",
      "inclusions.0":
        "A black Mercedes — E-Class, S-Class, or V-Class depending on group size and preference. Every vehicle under three years old.",
      "faqs.1.a":
        "Fixed fare from €485 in Mercedes E-Class (up to 3 passengers), €590 in V-Class (up to 6 passengers), or €650 in S-Class. Prices include fuel, the Czech motorway vignette, and driver time. No hidden charges.",
      "cta.headingItalic": "From €485, fixed.",
      "metadata.title": "Prague to Olomouc Chauffeur — From €485",
    });
  });

  it("prague-olomouc: has no day-trip section (page never rendered one)", () => {
    const content = getRouteContent("prague-olomouc", "en");
    expect(content.dayTripLabel).toBe("");
    expect(content.dayTrip.configurations).toEqual([]);
  });
});
