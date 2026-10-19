/**
 * 82-04 (GDPR-02, D-13, D-14): the public privacy policy names the CRM/inbox
 * processing, the server location, the channels and the D-13 retention
 * periods, consistently in every locale.
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

const LOCALES = ["en"] as const;

type Privacy = {
  hero: { lastUpdated: string };
  section2: { messagingData: { heading: string; text: string } };
  section3: { legitimateInterest: { text: string } };
  section4: { providers: { name: string; purpose: string; url: string }[] };
  section5: { text: string };
  section6: { items: { type: string; period: string }[] };
  section8: { rights: { right: string }[]; erasureNote: string };
};

function load(locale: string): Privacy {
  const file = path.join(process.cwd(), "content", "pages", locale, "privacy.json");
  return JSON.parse(fs.readFileSync(file, "utf-8")) as Privacy;
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

describe("privacy policy content (EN source of truth)", () => {
  const en = load("en");

  it("names the messaging/customer-record data block and the erasure note", () => {
    expect(en.section2.messagingData.heading).toBe("Messages and customer record");
    expect(en.section2.messagingData.text).toContain("WhatsApp");
    expect(en.section8.erasureNote).toContain("we first confirm that it is really you");
  });

  it("lists 12 providers with EspoCRM at [10] and WhatsApp at [11]", () => {
    expect(en.section4.providers).toHaveLength(12);
    expect(en.section4.providers[6].name).toBe("Chatwoot (self-hosted)");
    expect(en.section4.providers[7].name).toBe("Hostinger");
    expect(en.section4.providers[8].name).toBe("Backblaze");
    expect(en.section4.providers[9].name).toBe("Telegram");
    expect(en.section4.providers[10].name).toBe("EspoCRM (self-hosted)");
    expect(en.section4.providers[11].name).toBe("WhatsApp (Meta)");
    expect(en.section4.providers[7].purpose).toContain("Germany");
    expect(en.section4.providers[8].purpose).toContain("United States");
  });

  it("D-13 retention: 7 items, 10 years, 90 days, 6 months, no old figures", () => {
    const items = en.section6.items;
    expect(items).toHaveLength(7);
    expect(items[0].period).toContain("10 years");
    expect(items[0].period).toContain("without your name");
    expect(items[1].period).toBe("Kept until you ask us to erase them.");
    expect(items[4].type).toBe("Messages and conversations");
    expect(items[5].period).toContain("90 days");
    expect(items[6].period).toContain("6 months");
    const all = JSON.stringify(en.section6);
    expect(all).not.toContain("5 years");
    expect(all).not.toContain("12 months after");
  });

  it("D-14: channels named generically, no Cloud API detail", () => {
    const all = JSON.stringify(en);
    expect(en.section5.text).toContain("WhatsApp");
    expect(all).not.toMatch(/Cloud API/i);
  });

  it("never states a price or compares with ride-hailing apps", () => {
    const all = JSON.stringify(en);
    expect(all).not.toMatch(/€|\bUber\b|\bBolt\b/);
  });
});

describe("privacy page render", () => {
  it("renders the messaging block and the erasure note between the rights list and the outro (en)", async () => {
    const { default: PrivacyPage } = await import("@/app/[locale]/privacy/page");
    const el = await PrivacyPage({ params: Promise.resolve({ locale: "en" }) });
    const html = renderToStaticMarkup(el);
    const en = load("en");
    expect(html).toContain("Messages and customer record");
    const note = html.indexOf("we first confirm that it is really you");
    const lastRight = html.lastIndexOf("Right to withdraw consent");
    const outro = html.indexOf(en.section8.rights.length ? "To exercise any of these rights" : "");
    expect(note).toBeGreaterThan(lastRight);
    expect(outro).toBeGreaterThan(note);
    // messagingData follows locationData
    expect(html.indexOf("Messages and customer record")).toBeGreaterThan(html.indexOf("Location data"));
  });
});

describe.each(LOCALES)("privacy.json parity (%s)", (locale) => {
  const en = load("en");
  const p = load(locale);

  it("has the same deep key set as en and no empty leaf", () => {
    expect(leafPaths(p).sort()).toEqual(leafPaths(en).sort());
    const walk = (v: unknown): void => {
      if (typeof v === "string") expect(v.trim().length).toBeGreaterThan(0);
      else if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === "object") Object.values(v).forEach(walk);
    };
    walk(p);
  });

  it("keeps product names byte-identical in Latin script, providers in order", () => {
    expect(p.section4.providers).toHaveLength(12);
    const names = ["Chatwoot", "Hostinger", "Backblaze", "Telegram", "EspoCRM", "WhatsApp"];
    names.forEach((n, i) => expect(p.section4.providers[6 + i].name).toContain(n));
    expect(p.section4.providers[10].url).toBe("https://www.espocrm.com/privacy-policy/");
    expect(p.section4.providers[11].url).toBe("https://www.whatsapp.com/legal/privacy-policy-eea");
  });

  it("states the D-13 retention figures", () => {
    const items = p.section6.items;
    expect(items).toHaveLength(7);
    expect(items[0].period).toContain("10");
    expect(items[5].period).toContain("90");
    expect(items[6].period).toContain("6");
    expect(items[0].period).not.toMatch(/(^|\s)5(\s|$)/);
  });

  if (locale !== "en") {
    it("is translated, not English copy", () => {
      for (const key of ["section2", "section8"] as const) {
        expect(p[key]).not.toEqual(en[key]);
      }
      expect(p.section2.messagingData.text).not.toBe(en.section2.messagingData.text);
      expect(p.section2.messagingData.heading).not.toBe(en.section2.messagingData.heading);
      expect(p.section8.erasureNote).not.toBe(en.section8.erasureNote);
      expect(p.section5.text).not.toBe(en.section5.text);
      expect(p.section3.legitimateInterest.text).not.toBe(en.section3.legitimateInterest.text);
      expect(p.hero.lastUpdated).not.toBe(en.hero.lastUpdated);
      expect(p.section6.items[4].period).not.toBe(en.section6.items[4].period);
      expect(p.section6.items[5].period).not.toBe(en.section6.items[5].period);
      expect(p.section6.items[6].period).not.toBe(en.section6.items[6].period);
      expect(p.section4.providers[10].purpose).not.toBe(en.section4.providers[10].purpose);
      expect(p.section4.providers[11].purpose).not.toBe(en.section4.providers[11].purpose);
    });
  }
});
