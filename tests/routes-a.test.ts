// @vitest-environment node
import { describe, it, expect } from "vitest";
import { getRouteContent } from "@/lib/route-content";
import {
  assertRouteContentShape,
  assertRouteParity,
} from "./helpers/route-content-parity";

describe("Group A route content (71-02)", () => {
  describe.each([
    "prague-berlin",
    "prague-bratislava",
    "prague-brno",
    "prague-budapest",
    "prague-ceske-budejovice",
    "prague-cesky-krumlov",
    "prague-dresden",
    "prague-frantiskovy-lazne",
    "prague-graz",
    "prague-hradec-kralove",
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

  it("prague-berlin: byte-parity spot-check", () => {
    assertRouteParity("prague-berlin", {
      "hero.intro":
        "350 km north through Bohemia and Saxony to the German capital. Brandenburger Tor, Museum Island, and one of Europe's most dynamic cities — four hours, one fixed price.",
      "inclusions.0":
        "A black Mercedes — E-Class, S-Class, or V-Class depending on group size and preference. Every vehicle under three years old.",
      "faqs.1.a":
        "Fixed fare from €485 in Mercedes E-Class (up to 3 passengers), €590 in V-Class (up to 6 passengers), or €650 in S-Class. Prices include fuel, all tolls, the German vignette, and driver time. No hidden charges.",
      "cta.headingItalic": "From €485, fixed.",
      "metadata.title": "Prague to Berlin Chauffeur — From €485",
    });
  });

  it("prague-berlin: keeps its own 'Trip Configurations' label (not shared chrome)", () => {
    const content = getRouteContent("prague-berlin", "en");
    expect(content.dayTripLabel).toBe("Trip Configurations");
  });

  it("prague-bratislava: byte-parity spot-check", () => {
    assertRouteParity("prague-bratislava", {
      "hero.intro":
        "330 km east to Slovakia's compact capital on the Danube. Bratislava Castle, the Old Town's café culture, and Vienna just 65 km away — three and a half hours, one fixed price.",
      "inclusions.0":
        "A black Mercedes — E-Class, S-Class, or V-Class depending on group size and preference. Every vehicle under three years old.",
      "faqs.1.a":
        "Fixed fare from €485 in Mercedes E-Class (up to 3 passengers), €590 in V-Class (up to 6 passengers), or €650 in S-Class. Prices include fuel, both motorway vignettes, all tolls, and driver time. No hidden charges.",
      "cta.headingItalic": "From €485, fixed.",
      "metadata.title": "Prague to Bratislava Chauffeur — From €485",
    });
  });

  it("prague-brno: byte-parity spot-check", () => {
    assertRouteParity("prague-brno", {
      "hero.intro":
        "205 km east on the D1 to the Czech Republic's second city. Špilberk Castle, Villa Tugendhat, the Brno Exhibition Centre, and Moravian wine country — two and a half hours, one fixed price.",
      "inclusions.0":
        "A black Mercedes — E-Class, S-Class, or V-Class depending on group size and preference. Every vehicle under three years old.",
      "faqs.1.a":
        "Fixed fare from €485 in Mercedes E-Class (up to 3 passengers), €590 in V-Class (up to 6 passengers), or €650 in S-Class. Prices include fuel, the Czech motorway vignette, and driver time. No hidden charges.",
      "cta.headingItalic": "From €485, fixed.",
      "metadata.title": "Prague to Brno Chauffeur — From €485",
    });
  });

  it("prague-budapest: byte-parity spot-check", () => {
    assertRouteParity("prague-budapest", {
      "hero.intro":
        "535 km south through Moravia, Slovakia, and into Hungary. Buda Castle, the Chain Bridge, the thermal baths, and the ruin bars of Pest — five and a half hours, one fixed price.",
      "inclusions.0":
        "A black Mercedes — E-Class, S-Class, or V-Class depending on group size and preference. Every vehicle under three years old.",
      "faqs.1.a":
        "Fixed fare from €485 in Mercedes E-Class (up to 3 passengers), €590 in V-Class (up to 6 passengers), or €650 in S-Class. Prices include fuel, all three motorway vignettes, and driver time. No hidden charges.",
      "cta.headingItalic": "From €485, fixed.",
      "metadata.title": "Prague to Budapest Chauffeur — From €485",
    });
  });

  it("prague-ceske-budejovice: byte-parity spot-check", () => {
    assertRouteParity("prague-ceske-budejovice", {
      "hero.intro":
        "155 km south to the capital of South Bohemia. The baroque main square, Budějovický Budvar, and a gateway to Šumava and Český Krumlov — two hours, one fixed price.",
      "inclusions.0":
        "A black Mercedes — E-Class, S-Class, or V-Class depending on group size and preference. Every vehicle under three years old.",
      "faqs.1.a":
        "Fixed fare from €485 in Mercedes E-Class (up to 3 passengers), €590 in V-Class (up to 6 passengers), or €650 in S-Class. Prices include fuel, Czech tolls, the vignette, and driver time. No hidden charges.",
      "cta.headingItalic": "From €485, fixed.",
      "metadata.title": "Prague to České Budějovice Chauffeur — From €485",
    });
  });

  it("prague-ceske-budejovice: has no day-trip section (page never rendered one)", () => {
    const content = getRouteContent("prague-ceske-budejovice", "en");
    expect(content.dayTripLabel).toBe("");
    expect(content.dayTrip.configurations).toEqual([]);
  });

  it("prague-cesky-krumlov: byte-parity spot-check", () => {
    assertRouteParity("prague-cesky-krumlov", {
      "hero.intro":
        "175 km south to one of Bohemia's most remarkable medieval towns. A castle above a Vltava horseshoe, baroque theatre, and winding cobbled streets — two and a half hours, one fixed price.",
      "inclusions.0":
        "A black Mercedes — E-Class, S-Class, or V-Class depending on group size and preference. Every vehicle under three years old.",
      "faqs.1.a":
        "Fixed fare from €485 in Mercedes E-Class (up to 3 passengers), €590 in V-Class (up to 6 passengers), or €650 in S-Class. Prices include fuel, the Czech motorway vignette, and driver time. No hidden charges.",
      "cta.headingItalic": "From €485, fixed.",
      "metadata.title": "Prague to Český Krumlov Chauffeur — From €485",
    });
  });

  it("prague-dresden: byte-parity spot-check", () => {
    assertRouteParity("prague-dresden", {
      "hero.intro": "Two hours door-to-door on the D8. Fixed fare from €485. Your chauffeur is already waiting.",
      "inclusions.0":
        "A black Mercedes — E-Class, S-Class, or V-Class depending on group size and preference. Every vehicle under three years old.",
      "faqs.1.a":
        "Fixed fare from €485 in Mercedes E-Class (up to 3 passengers), €590 in V-Class (up to 6 passengers), or €650 in S-Class. Prices include fuel, all tolls, and driver time. No hidden charges.",
      "cta.headingItalic": "From €485, fixed.",
      "metadata.title": "Prague to Dresden Chauffeur — From €485",
    });
  });

  it("prague-frantiskovy-lazne: byte-parity spot-check", () => {
    assertRouteParity("prague-frantiskovy-lazne", {
      "hero.intro":
        "175 km west to the most intimate of West Bohemia's spa trio. Twenty-four mineral springs, Empire-style colonnades, and forested tranquillity — two and a half hours, one fixed price.",
      "inclusions.0":
        "A black Mercedes — E-Class, S-Class, or V-Class depending on group size and preference. Every vehicle under three years old.",
      "faqs.1.a":
        "Fixed fare from €485 in Mercedes E-Class (up to 3 passengers), €590 in V-Class (up to 6 passengers), or €650 in S-Class. Prices include fuel, the Czech motorway vignette, and driver time. No hidden charges.",
      "cta.headingItalic": "From €485, fixed.",
      "metadata.title": "Prague to Františkovy Lázně Chauffeur — From €485",
    });
  });

  it("prague-frantiskovy-lazne: has no day-trip section (page never rendered one)", () => {
    const content = getRouteContent("prague-frantiskovy-lazne", "en");
    expect(content.dayTripLabel).toBe("");
    expect(content.dayTrip.configurations).toEqual([]);
  });

  it("prague-graz: byte-parity spot-check", () => {
    assertRouteParity("prague-graz", {
      "hero.intro":
        "450 km south through Bohemia and Austria to the City of Design. Schlossberg, the Kunsthaus, and the Styrian mountains behind — four and a half hours, one fixed price.",
      "inclusions.0":
        "A black Mercedes — E-Class, S-Class, or V-Class depending on group size and preference. Every vehicle under three years old.",
      "faqs.1.a":
        "Fixed fare from €485 in Mercedes E-Class (up to 3 passengers), €590 in V-Class (up to 6 passengers), or €650 in S-Class. Prices include fuel, the Czech motorway vignette, the Austrian motorway vignette, Styrian tunnel tolls, and driver time. No hidden charges.",
      "cta.headingItalic": "From €485, fixed.",
      "metadata.title": "Prague to Graz Chauffeur — From €485",
    });
  });

  it("prague-graz: has no day-trip section (page never rendered one)", () => {
    const content = getRouteContent("prague-graz", "en");
    expect(content.dayTripLabel).toBe("");
    expect(content.dayTrip.configurations).toEqual([]);
  });

  it("prague-hradec-kralove: byte-parity spot-check", () => {
    assertRouteParity("prague-hradec-kralove", {
      "hero.intro":
        "115 km east on the D11 to the royal city on the upper Elbe. Modernist architecture by Kotěra and Gočár, the East Bohemia Museum, and East Bohemia's cultural capital. One fixed price.",
      "inclusions.0":
        "A black Mercedes — E-Class, S-Class, or V-Class depending on group size and preference. Every vehicle under three years old.",
      "faqs.1.a":
        "Fixed fare from €485 in Mercedes E-Class (up to 3 passengers), €590 in V-Class (up to 6 passengers), or €650 in S-Class. Prices include fuel, the Czech motorway vignette, and driver time. No hidden charges.",
      "cta.headingItalic": "From €485, fixed.",
      "metadata.title": "Prague to Hradec Králové Chauffeur — From €485",
    });
  });

  it("prague-hradec-kralove: has no day-trip section (page never rendered one)", () => {
    const content = getRouteContent("prague-hradec-kralove", "en");
    expect(content.dayTripLabel).toBe("");
    expect(content.dayTrip.configurations).toEqual([]);
  });

  it("prague-hradec-kralove: keeps its own distinct FAQ heading (not the shared 'Frequently asked questions' chrome)", () => {
    const content = getRouteContent("prague-hradec-kralove", "en");
    expect(content.faqsHeading).toBe("Common questions");
  });
});
