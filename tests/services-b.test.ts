// @vitest-environment node
import { describe, it, expect } from "vitest";
import { getPageContent } from "@/lib/page-content";

type AirportTransferContent = {
  hero: { intro: string };
  meetGreet: { paragraph1: string };
  faqs: { q: string; a: string }[];
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
