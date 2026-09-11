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
