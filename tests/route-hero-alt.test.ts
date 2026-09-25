// @vitest-environment node
/**
 * 75-10 Task 2: proves the hero.imageAlt content-model rollout across all
 * 30 route slugs x 7 locales, and closes WINDOWS #6 (the 9 hi whyBook
 * headings that fell back to English "Why book with Prestigo").
 */
import { describe, it, expect } from "vitest";
import { getRouteContent } from "@/lib/route-content";

const LOCALES = ["en", "ru", "es", "fr", "ar", "hi", "zh"] as const;

// EN hero alts, recorded verbatim from the hardcoded alt="..." attribute
// that lived on each page.tsx BEFORE this plan's refactor -- this fixture
// list is the byte-parity proof that content.hero.imageAlt for 'en' is
// unchanged from what was live.
const EN_ALTS: Record<string, string> = {
  "prague-berlin": "Berlin — private chauffeur transfer from Prague to Berlin",
  "prague-bratislava": "Bratislava — private chauffeur transfer from Prague to Bratislava",
  "prague-brno": "Brno — private chauffeur transfer from Prague to Brno",
  "prague-budapest": "Budapest — private chauffeur transfer from Prague to Budapest",
  "prague-ceske-budejovice": "České Budějovice — private chauffeur transfer from Prague to České Budějovice",
  "prague-cesky-krumlov": "Český Krumlov — private chauffeur transfer from Prague to Český Krumlov",
  "prague-dresden": "Dresden — private chauffeur transfer from Prague to Dresden",
  "prague-frantiskovy-lazne": "Františkovy Lázně — private chauffeur transfer from Prague to Františkovy Lázně",
  "prague-graz": "Graz — private chauffeur transfer from Prague to Graz",
  "prague-hradec-kralove": "Hradec Králové — private chauffeur transfer from Prague to Hradec Králové",
  "prague-karlovy-vary": "Karlovy Vary — private chauffeur transfer from Prague to Karlovy Vary",
  "prague-krakow": "Kraków — private chauffeur transfer from Prague to Kraków",
  "prague-kutna-hora": "Kutná Hora — private chauffeur transfer from Prague to Kutná Hora",
  "prague-leipzig": "Leipzig — private chauffeur transfer from Prague to Leipzig",
  "prague-liberec": "Liberec — private chauffeur transfer from Prague to Liberec",
  "prague-linz": "Linz — private chauffeur transfer from Prague to Linz",
  "prague-marianske-lazne": "Mariánské Lázně — private chauffeur transfer from Prague to Mariánské Lázně",
  "prague-munich": "Munich — private chauffeur transfer from Prague to Munich",
  "prague-nuremberg": "Nuremberg — private chauffeur transfer from Prague to Nuremberg",
  "prague-olomouc": "Olomouc — private chauffeur transfer from Prague to Olomouc",
  "prague-ostrava": "Ostrava — private chauffeur transfer from Prague to Ostrava",
  "prague-pardubice": "Pardubice — private chauffeur transfer from Prague to Pardubice",
  "prague-passau": "Passau — private chauffeur transfer from Prague to Passau",
  "prague-plzen": "Plzeň — private chauffeur transfer from Prague to Plzeň",
  "prague-regensburg": "Regensburg — private chauffeur transfer from Prague to Regensburg",
  "prague-salzburg": "Salzburg — private chauffeur transfer from Prague to Salzburg",
  "prague-vienna": "Vienna — private chauffeur transfer from Prague to Vienna",
  "prague-warsaw": "Warsaw — private chauffeur transfer from Prague to Warsaw",
  "prague-wroclaw": "Wrocław — private chauffeur transfer from Prague to Wrocław",
  "prague-zlin": "Zlín — private chauffeur transfer from Prague to Zlín",
};

const SLUGS = Object.keys(EN_ALTS);

// WINDOWS #6 gap-closure targets: the 9 hi route files whose
// whyBook.headingLine1 fell back to the EN string "Why book with Prestigo".
const HI_WHYBOOK_FIXED_SLUGS = [
  "prague-ceske-budejovice",
  "prague-wroclaw",
  "prague-frantiskovy-lazne",
  "prague-olomouc",
  "prague-hradec-kralove",
  "prague-marianske-lazne",
  "prague-zlin",
  "prague-plzen",
  "prague-pardubice",
];

describe("hero.imageAlt — all 30 route slugs x 7 locales (75-10)", () => {
  describe.each(SLUGS)("%s", (slug) => {
    it.each(LOCALES)("%s: getRouteContent returns a non-empty hero.imageAlt", (locale) => {
      const content = getRouteContent(slug, locale);
      expect(content.hero.imageAlt).toBeTypeOf("string");
      expect(content.hero.imageAlt.trim().length).toBeGreaterThan(0);
    });

    it("en: hero.imageAlt matches the pre-change hardcoded alt verbatim", () => {
      const content = getRouteContent(slug, "en");
      expect(content.hero.imageAlt).toBe(EN_ALTS[slug]);
    });

    it.each(["ru", "ar", "hi", "zh"] as const)(
      "%s: hero.imageAlt never contains the English phrase 'private chauffeur transfer'",
      (locale) => {
        const content = getRouteContent(slug, locale);
        expect(content.hero.imageAlt).not.toContain("private chauffeur transfer");
      }
    );
  });
});

describe("WINDOWS #6 gap closure — hi whyBook.headingLine1 (75-10 Task 2)", () => {
  it.each(HI_WHYBOOK_FIXED_SLUGS)("%s: hi whyBook.headingLine1 no longer equals its EN value", (slug) => {
    const en = getRouteContent(slug, "en");
    const hi = getRouteContent(slug, "hi");
    expect(hi.whyBook.headingLine1).not.toBe(en.whyBook.headingLine1);
    expect(hi.whyBook.headingLine1.trim().length).toBeGreaterThan(0);
  });

  it.each(HI_WHYBOOK_FIXED_SLUGS)("%s: hi whyBook.headingLine1 keeps the Prestigo DNT token verbatim", (slug) => {
    const hi = getRouteContent(slug, "hi");
    expect(hi.whyBook.headingLine1).toContain("Prestigo");
  });
});
