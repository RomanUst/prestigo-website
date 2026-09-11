// @vitest-environment node
import { describe, it, expect } from "vitest";
import { getPageContent } from "@/lib/page-content";

type AirportTransferContent = {
  hero: { intro: string };
  meetGreet: { paragraph1: string };
  faqs: { q: string; a: string }[];
};

type CorporateAccountsContent = {
  hero: { intro: string };
  benefits: { title: string; body: string }[];
  builtFor: { title: string; body: string }[];
};

type GroupTransfersContent = {
  hero: { intro: string };
  editorial: string[];
  features: { title: string; body: string }[];
};

describe("getPageContent('services/airport-transfer') — airport-transfer page", () => {
  it("EN-fallback: getPageContent('services/airport-transfer', 'ru') deep-equals the 'en' result", () => {
    const en = getPageContent("services/airport-transfer", "en");
    const ru = getPageContent("services/airport-transfer", "ru");
    expect(ru).toEqual(en);
  });

  it("spot-checks 3 representative body strings against verbatim originals", () => {
    const content = getPageContent("services/airport-transfer", "en") as AirportTransferContent;
    expect(content.hero.intro).toBe(
      "Prestigo Prague Airport Transfer is a fixed-price chauffeur service from Václav Havel Airport (PRG) to any Prague address, starting at €{businessPrice}. Your driver tracks your flight in real time, waits up to 60 minutes free at Arrivals with a name board, handles your luggage, and drives you in a Mercedes-Benz E-Class, S-Class, or V-Class."
    );
    expect(content.meetGreet.paragraph1).toBe(
      "Every Prestigo airport transfer is a full meet and greet. Your chauffeur is inside the Arrivals hall at Prague Václav Havel (PRG) holding a name board before you reach the exit — not waiting in a car park or a ride-hail queue. From the moment you clear customs, your driver takes your luggage and walks you to the car."
    );
    expect(content.faqs[7].a).toBe(
      "Uber has held the exclusive official taxi rank at PRG since September 2023. A standard Uber to central Prague runs CZK 650–800 — lower than PRESTIGO's starting price. The difference is how you are collected: your PRESTIGO driver is inside the Arrivals hall with a name board before you reach the exit. Uber requires walking 120 metres to the designated P11 pickup zone and waiting for a vehicle to be assigned. For solo travellers with light luggage arriving off-peak, Uber is a practical option. For business arrivals, families, or anyone with luggage and a tight connection, the meet & greet and flight tracking more than justify the difference."
    );
  });

  it("path-traversal: getPageContent('services/../x', 'en') throws (segment-wise guard on nested keys)", () => {
    expect(() => getPageContent("services/../x", "en")).toThrow();
  });
});

describe("getPageContent('services/corporate-accounts') — corporate-accounts page", () => {
  it("EN-fallback: getPageContent('services/corporate-accounts', 'ru') deep-equals the 'en' result", () => {
    const en = getPageContent("services/corporate-accounts", "en");
    const ru = getPageContent("services/corporate-accounts", "ru");
    expect(ru).toEqual(en);
  });

  it("spot-checks 3 representative body strings against verbatim originals", () => {
    const content = getPageContent("services/corporate-accounts", "en") as CorporateAccountsContent;
    expect(content.hero.intro).toBe(
      "PRESTIGO corporate accounts are designed for companies that move people regularly and expect every detail handled. Fixed rates, monthly invoicing, a named account manager, and a fleet that reflects the standard your organisation holds itself to."
    );
    expect(content.benefits[0].body).toBe(
      "One invoice. All trips. All departments. Sent on the first of every month, formatted for your accounts team, with full trip breakdown."
    );
    expect(content.builtFor[1].body).toBe(
      "With staff visiting Prague regularly who need a reliable, bookable ground transport partner."
    );
  });
});

describe("getPageContent('services/group-transfers') — group-transfers page", () => {
  it("EN-fallback: getPageContent('services/group-transfers', 'ru') deep-equals the 'en' result", () => {
    const en = getPageContent("services/group-transfers", "en");
    const ru = getPageContent("services/group-transfers", "ru");
    expect(ru).toEqual(en);
  });

  it("spot-checks 3 representative body strings against verbatim originals", () => {
    const content = getPageContent("services/group-transfers", "en") as GroupTransfersContent;
    expect(content.hero.intro).toBe(
      "Prestigo group transfers move up to 50 passengers in a coordinated Mercedes-Benz V-Class fleet across Prague and Central Europe — conference delegations, incentive programmes, corporate off-sites, wedding parties, sports teams. Single dispatch contact, synchronised arrivals, full movement schedule. Fixed pricing per vehicle, door-to-door from hotels, airports, or venues."
    );
    expect(content.editorial[2]).toBe(
      "For Prague group transfers, one detail is worth noting in advance: Václav Havel Airport has two separate terminals. Terminal 2 handles Schengen arrivals and has its own building west of the main structure. Terminal 1 handles non-Schengen arrivals in the lower level of the central building. An international delegation arriving on mixed Schengen and non-Schengen flights will be split between terminals, with separate arrivals halls and a ten-minute walk between them. We build terminal-split logistics into every group brief as standard."
    );
    expect(content.features[3].body).toBe(
      "We have operated groups as small as four passengers in a single V-Class and delegations as large as forty-eight passengers across eight vehicles coordinated simultaneously at two airport terminals. The operational approach does not change with scale: a movement brief, confirmed vehicle and chauffeur assignments, a lead coordinator available to your events team throughout, and direct contact for any real-time adjustment. We do not sub-contract to third-party operators for groups under fifty passengers."
    );
  });
});
