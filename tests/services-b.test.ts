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

type IntercityRoutesContent = {
  hero: { intro: string };
  editorial: string[];
  features: { title: string; body: string }[];
};

type VipEventsContent = {
  hero: { intro: string };
  editorial: string[];
  features: { title: string; body: string }[];
};

describe("getPageContent('services/airport-transfer') — airport-transfer page", () => {
  it("translated (Phase 72): getPageContent('services/airport-transfer', 'ru') exists and is translated", () => {
    const en = getPageContent("services/airport-transfer", "en");
    const ru = getPageContent("services/airport-transfer", "ru");
    expect(ru).not.toEqual(en); // Phase 72: ru is now translated, not an EN copy
    expect(Object.keys(ru as object)).toEqual(Object.keys(en as object));
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
  it("translated (Phase 72): getPageContent('services/corporate-accounts', 'ru') exists and is translated", () => {
    const en = getPageContent("services/corporate-accounts", "en");
    const ru = getPageContent("services/corporate-accounts", "ru");
    expect(ru).not.toEqual(en); // Phase 72: ru is now translated, not an EN copy
    expect(Object.keys(ru as object)).toEqual(Object.keys(en as object));
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
  it("translated (Phase 72): getPageContent('services/group-transfers', 'ru') exists and is translated", () => {
    const en = getPageContent("services/group-transfers", "en");
    const ru = getPageContent("services/group-transfers", "ru");
    expect(ru).not.toEqual(en); // Phase 72: ru is now translated, not an EN copy
    expect(Object.keys(ru as object)).toEqual(Object.keys(en as object));
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

describe("getPageContent('services/intercity-routes') — intercity-routes page", () => {
  it("translated (Phase 72): getPageContent('services/intercity-routes', 'ru') exists and is translated", () => {
    const en = getPageContent("services/intercity-routes", "en");
    const ru = getPageContent("services/intercity-routes", "ru");
    expect(ru).not.toEqual(en); // Phase 72: ru is now translated, not an EN copy
    expect(Object.keys(ru as object)).toEqual(Object.keys(en as object));
  });

  it("spot-checks 3 representative body strings against verbatim originals", () => {
    const content = getPageContent("services/intercity-routes", "en") as IntercityRoutesContent;
    expect(content.hero.intro).toBe(
      "Prestigo intercity routes are fixed-price door-to-door private transfers from Prague to 30+ cities across Austria, Germany, Poland, Hungary, Slovakia, and the Czech Republic. All tolls and vignettes included, Mercedes-Benz fleet, no connections."
    );
    expect(content.editorial[0]).toBe(
      "Central Europe is compact by the standards of long-haul travel, but public transport connections are rarely convenient when time and comfort matter. Vienna is 3.5 hours from Prague by road, but the direct Railjet train takes 4 hours 20 minutes and arrives at Wien Hauptbahnhof — a further 30 minutes from most business hotels in the First or Fourth District by taxi or U-Bahn. Berlin by train from Praha hlavní nádraží is 4 hours 40 minutes on the direct EC service, which runs twice daily with limited luggage space and no guaranteed quiet zone."
    );
    expect(content.features[2].body).toBe(
      "Each vehicle carries USB-A and USB-C charging, a phone holder, and onboard Wi-Fi. The S-Class and V-Class also carry chilled bottled water. The separation between driver and passenger compartment means calls, video meetings, and confidential conversations remain private throughout. Four hours Prague to Vienna is genuinely productive time — it is common for passengers on the corporate account to spend the first two hours on calls and the second two in documents, arriving at the destination with the morning's work done."
    );
  });

  it("path-traversal: getPageContent('services/../y', 'en') throws (segment-wise guard on nested keys)", () => {
    expect(() => getPageContent("services/../y", "en")).toThrow();
  });
});

describe("getPageContent('services/vip-events') — vip-events page", () => {
  it("translated (Phase 72): getPageContent('services/vip-events', 'ru') exists and is translated", () => {
    const en = getPageContent("services/vip-events", "en");
    const ru = getPageContent("services/vip-events", "ru");
    expect(ru).not.toEqual(en); // Phase 72: ru is now translated, not an EN copy
    expect(Object.keys(ru as object)).toEqual(Object.keys(en as object));
  });

  it("spot-checks 3 representative body strings against verbatim originals", () => {
    const content = getPageContent("services/vip-events", "en") as VipEventsContent;
    expect(content.hero.intro).toBe(
      "Prestigo VIP and event transport coordinates private chauffeur service for diplomatic visits, luxury hotel arrivals, private openings, galas, and film production across Prague. Discreet drivers, synchronised arrival windows, live dispatch contact, and a zero-error protocol for events where timing, confidentiality, and presentation matter. Single-vehicle or full-fleet convoys on request."
    );
    expect(content.editorial[1]).toBe(
      "PRESTIGO has operated VIP-protocol transfers in Prague since 2016. In that time we have worked alongside concierge teams at the Four Seasons, the Mandarin Oriental, and the Augustine, and we have managed transfers for diplomatic missions requiring coordination with embassy security staff in the Hradčany district. Client names are not disclosed. The nature of past engagements is referenced because it is operationally relevant: our experience is practical, not theoretical."
    );
    expect(content.features[0].body).toBe(
      "Senior PRESTIGO chauffeurs operate in protocol-sensitive environments as a matter of routine. This means presenting credentials on request, understanding the distinction between a security advance team and a close-protection detail, positioning the vehicle so the principal exits on the pavement side without crossing traffic, and maintaining radio silence when required. A written briefing covering the guest's profile, schedule, and specific instructions is standard for senior VIP engagements. We do not assume preferences; we are briefed on them."
    );
  });
});
