// @vitest-environment node
import { describe, it, expect } from "vitest";
import { getPageContent } from "@/lib/page-content";

type HomeContent = {
  metadata: { title: string; description: string; ogTitle: string };
  schema: { name: string; description: string };
};

type ContactContent = {
  metadata: { title: string; description: string; ogTitle: string };
  hero: { label: string; headlineLine1: string; headlineItalic: string; intro: string };
  whatHappensNext: { heading: string; steps: { step: string; title: string; body: string }[] };
  commonEnquiries: { heading: string; faqs: { q: string; a: string }[] };
};

type AboutContent = {
  metadata: { title: string; description: string; ogTitle: string };
  schema: { name: string; aboutPageName: string };
  ourStory: { paragraphs: string[] };
  discretion: { intro: string; items: { t: string; b: string }[] };
  principles: { title: string; body: string }[];
};

type FaqContent = {
  metadata: { title: string; description: string; ogTitle: string };
  hero: { headlineLine1: string };
  sections: { title: string; faqs: { q: string; a: string }[] }[];
};

type CorporateContent = {
  hero: { intro: string };
  whoUses: { paragraphs: string[] };
  faqs: { q: string; a: string }[];
};

describe("getPageContent('home')", () => {
  it("EN-fallback: getPageContent('home', 'ru') deep-equals the 'en' result", () => {
    const en = getPageContent("home", "en");
    const ru = getPageContent("home", "ru");
    expect(ru).toEqual(en);
  });

  it("spot-checks 3 representative strings against verbatim originals", () => {
    const content = getPageContent("home", "en") as HomeContent;
    expect(content.metadata.title).toBe(
      "Prague Chauffeur Service — Fixed-Price Transfers | PRESTIGO"
    );
    expect(content.metadata.description).toBe(
      "Prague chauffeur service with fixed prices, flight tracking and meet & greet. Executive Mercedes, English-speaking drivers, 24/7. Book online in 60 seconds."
    );
    expect(content.schema.description).toBe(
      "Premium chauffeur and private transfer service in Prague, Czech Republic. Executive airport transfers, corporate travel, and luxury city rides."
    );
  });
});

describe("getPageContent('contact')", () => {
  it("EN-fallback: getPageContent('contact', 'ru') deep-equals the 'en' result", () => {
    const en = getPageContent("contact", "en");
    const ru = getPageContent("contact", "ru");
    expect(ru).toEqual(en);
  });

  it("spot-checks 3 representative strings against verbatim originals", () => {
    const content = getPageContent("contact", "en") as ContactContent;
    expect(content.hero.intro).toBe(
      "Available 24 hours a day, 7 days a week. Reach us via the form, email, or instantly on WhatsApp."
    );
    expect(content.whatHappensNext.steps[1].body).toBe(
      "During business hours, expect a response in under 15 minutes. Outside business hours, we aim to confirm within 2 hours. Your booking is not final until confirmed in writing."
    );
    expect(content.commonEnquiries.faqs[0].a).toBe(
      "Use the booking form or WhatsApp. Provide your flight number, arrival terminal, and destination address. We track the flight and adjust pickup time if it lands early or late."
    );
  });
});

describe("getPageContent('about')", () => {
  it("EN-fallback: getPageContent('about', 'ru') deep-equals the 'en' result", () => {
    const en = getPageContent("about", "en");
    const ru = getPageContent("about", "ru");
    expect(ru).toEqual(en);
  });

  it("spot-checks 3 representative strings against verbatim originals, including a JSON-LD-fed string", () => {
    const content = getPageContent("about", "en") as AboutContent;
    // JSON-LD-fed: aboutPageSchemaGraph's AboutPage.name sources from content.schema.aboutPageName
    expect(content.schema.aboutPageName).toBe(
      "About PRESTIGO — Prague's Premium Chauffeur Service"
    );
    expect(content.ourStory.paragraphs[0]).toBe(
      "PRESTIGO began in 2016 the way most small operators begin in Central Europe — with a single late-model Mercedes and a founder who was tired of watching visiting executives step out of airport taxis looking like they’d rather have walked. The ambition from the first day was narrow and specific: build one chauffeur service in Prague that an international traveller would recognise as equivalent to the best they had used in London, Zurich, or Tokyo."
    );
    expect(content.principles[0]).toEqual({
      title: "Discretion",
      body: "Your journey is your own. We don't discuss clients, routes, or conversations.",
    });
  });
});

describe("getPageContent('faq')", () => {
  it("EN-fallback: getPageContent('faq', 'ru') deep-equals the 'en' result", () => {
    const en = getPageContent("faq", "en");
    const ru = getPageContent("faq", "ru");
    expect(ru).toEqual(en);
  });

  it("spot-checks 3 representative strings, including a JSON-LD-fed Q&A pair", () => {
    const content = getPageContent("faq", "en") as FaqContent;
    expect(content.hero.headlineLine1).toBe("Everything you need to know.");
    expect(content.sections[0].title).toBe("Booking");
    // JSON-LD-fed: faqSchema.mainEntity is derived from this exact sections array
    expect(content.sections[1].faqs[0]).toEqual({
      q: "Is the price fixed?",
      a: "Yes. The price shown at booking is the price you pay. No surge pricing. No hidden tolls. No extras unless you request them.",
    });
  });
});

describe("getPageContent('corporate')", () => {
  it("EN-fallback: getPageContent('corporate', 'ru') deep-equals the 'en' result", () => {
    const en = getPageContent("corporate", "en");
    const ru = getPageContent("corporate", "ru");
    expect(ru).toEqual(en);
  });

  it("spot-checks 3 representative strings against verbatim originals", () => {
    const content = getPageContent("corporate", "en") as CorporateContent;
    expect(content.hero.intro).toBe(
      "PRESTIGO corporate accounts are designed for companies that move people regularly and expect every detail handled. Fixed rates, monthly invoicing, a named account manager, and a fleet that reflects the standard your organisation holds itself to."
    );
    expect(content.whoUses.paragraphs[2]).toBe(
      "We keep account sizes deliberately modest so every client receives the same level of attention. PRESTIGO corporate isn’t a volume programme with tiered service — every account is handled as if it were our largest."
    );
    expect(content.faqs[0].a).toContain(
      "A PRESTIGO corporate account is a dedicated billing and dispatch relationship"
    );
  });
});
