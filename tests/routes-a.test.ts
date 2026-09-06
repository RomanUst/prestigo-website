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
});
