/**
 * 82-16 (GDPR-02, D-13, D-14): the public data-deletion page states the same
 * booking-record retention and the same held data as the privacy policy
 * (82-04), so the two public legal pages never contradict each other.
 */
import { describe, it, expect, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next-intl/server", () => ({
  getLocale: vi.fn(async () => "en"),
  setRequestLocale: vi.fn(),
}));
vi.mock("@/components/Nav", () => ({ default: () => null }));
vi.mock("@/components/Footer", () => ({ default: () => null }));

const LOCALES = ["en", "ru", "es", "fr", "ar", "hi", "zh"] as const;
const TRANSLATED = ["ru", "es", "fr", "ar", "hi", "zh"] as const;

type DataDeletion = {
  section1: { text: string };
  section2: { paragraph2: string };
};

type Privacy = { section6: { items: { period: string }[] } };

function loadJson<T>(locale: string, file: string): T {
  const p = path.join(process.cwd(), "content", "pages", locale, file);
  return JSON.parse(fs.readFileSync(p, "utf-8")) as T;
}

function leafPaths(value: unknown, prefix = ""): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((v, i) => leafPaths(v, `${prefix}[${i}]`));
  }
  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).flatMap(([k, v]) =>
      leafPaths(v, prefix ? `${prefix}.${k}` : k)
    );
  }
  return [prefix];
}

// Standalone 5 (e.g. "5 years", "5 лет", "5 年") but not 10, 15, 30, 365.
const STANDALONE_FIVE = /(^|\D)5(\D|$)/;

// The key set shipped before 82-16: copy only, no key added/removed/moved.
const EXPECTED_KEYS = [
  "metadata.title",
  "metadata.description",
  "hero.label",
  "hero.headlineLine1",
  "hero.headlineItalic",
  "requestReceived.label",
  "requestReceived.paragraph1",
  "requestReceived.paragraph2Prefix",
  "requestReceived.paragraph2EmailLabel",
  "requestReceived.paragraph2Suffix",
  "section1.title",
  "section1.text",
  "section2.title",
  "section2.paragraph1Prefix",
  "section2.paragraph1EmailLabel",
  "section2.paragraph1Suffix",
  "section2.paragraph2",
  "section3.title",
  "section3.paragraph1Prefix",
  "section3.facebookLinkLabel",
  "section3.paragraph1Suffix",
  "cta.headingLine1",
  "cta.headingItalic",
  "cta.buttonPrimary",
  "cta.buttonSecondary",
];

describe("data-deletion content (EN source of truth)", () => {
  const en = loadJson<DataDeletion>("en", "data-deletion.json");

  it("states the D-13 retention: up to 10 years, 3 business days, 30 days, no standalone 5", () => {
    const p = en.section2.paragraph2;
    expect(p).toContain("10 years");
    expect(p).toContain("3 business days");
    expect(p).toMatch(/within 30\s+days/); // source uses a no-break space
    expect(p).not.toMatch(STANDALONE_FIVE);
    expect(p).toContain("without your name, email, phone, notes or addresses");
  });

  it("lists messages (chat, email, Telegram, WhatsApp) and the CRM customer record among the data held", () => {
    const t = en.section1.text;
    expect(t).toContain("Telegram");
    expect(t).toContain("WhatsApp");
    expect(t).toContain("CRM");
  });

  it("keeps the key set unchanged (copy only)", () => {
    expect(leafPaths(en)).toEqual(EXPECTED_KEYS);
  });
});

describe.each(LOCALES)("data-deletion.json integrity (%s)", (locale) => {
  const dd = loadJson<DataDeletion>(locale, "data-deletion.json");

  it("has the same deep key set as en", () => {
    expect(leafPaths(dd)).toEqual(EXPECTED_KEYS);
  });

  it("keeps WhatsApp and Telegram in Latin script in section1.text", () => {
    expect(dd.section1.text).toContain("WhatsApp");
    expect(dd.section1.text).toContain("Telegram");
  });

  it("keeps the 3 business day and 30 day commitments and no standalone 5", () => {
    const p = dd.section2.paragraph2;
    expect(p).toMatch(/(^|\D)3(\D|$)/);
    expect(p).toMatch(/(^|\D)30(\D|$)/);
    expect(p).toMatch(/(^|\D)10(\D|$)/);
    expect(p).not.toMatch(STANDALONE_FIVE);
  });
});

describe.each(TRANSLATED)("data-deletion.json translation (%s)", (locale) => {
  const en = loadJson<DataDeletion>("en", "data-deletion.json");
  const dd = loadJson<DataDeletion>(locale, "data-deletion.json");

  it("section1.text and section2.paragraph2 are non-empty and differ from en", () => {
    expect(dd.section1.text.trim().length).toBeGreaterThan(0);
    expect(dd.section2.paragraph2.trim().length).toBeGreaterThan(0);
    expect(dd.section1.text).not.toBe(en.section1.text);
    expect(dd.section2.paragraph2).not.toBe(en.section2.paragraph2);
  });

  it("mentions CRM in section1.text", () => {
    expect(dd.section1.text).toContain("CRM");
  });
});

describe.each(LOCALES)("data-deletion vs privacy adjacency (%s)", (locale) => {
  it("both pages state the figure 10 for booking records", () => {
    const dd = loadJson<DataDeletion>(locale, "data-deletion.json");
    const privacy = loadJson<Privacy>(locale, "privacy.json");
    expect(privacy.section6.items[0].period).toContain("10");
    expect(dd.section2.paragraph2).toContain("10");
    expect(dd.section2.paragraph2).not.toMatch(STANDALONE_FIVE);
  });
});

describe("data-deletion page render (en)", () => {
  it("renders the new retention sentence and the held-data sentence", async () => {
    const { default: Page } = await import("@/app/[locale]/data-deletion/page");
    const el = await Page({ searchParams: Promise.resolve({}) });
    const html = renderToStaticMarkup(el);
    const en = loadJson<DataDeletion>("en", "data-deletion.json");
    expect(html).toContain("kept for up to 10 years");
    expect(html).toContain(en.section1.text);
  });
});
