// @vitest-environment node
import { describe, it, expect } from "vitest";
import { getPageContent } from "@/lib/page-content";

type ServicesHubContent = {
  hero: { intro: string };
  trust: { title: string; body: string }[];
  faqs: { q: string; a: string }[];
};

describe("getPageContent('services') — hub page", () => {
  it("EN-fallback: getPageContent('services', 'ru') deep-equals the 'en' result", () => {
    const en = getPageContent("services", "en");
    const ru = getPageContent("services", "ru");
    expect(ru).toEqual(en);
  });

  it("spot-checks 3 representative body strings against verbatim originals", () => {
    const content = getPageContent("services", "en") as ServicesHubContent;
    expect(content.hero.intro).toBe(
      "From Prague Václav Havel Airport to anywhere in Central Europe — PRESTIGO chauffeurs deliver every trip with fixed pricing, flight tracking, and the quiet confidence of a service built for executives."
    );
    expect(content.trust[0].body).toBe(
      "No surge pricing. No hidden tolls. The price you see at booking is the price you pay."
    );
    expect(content.faqs[2].a).toBe(
      "Yes — flight tracking is included in every airport transfer booking at no extra cost. Your driver monitors your flight against live air-traffic-control data from the moment you confirm the booking. If your flight lands early, the chauffeur is already in the arrivals hall with a name board. If the flight is delayed by minutes or hours, the pickup automatically shifts to the new arrival time and you pay nothing extra — waiting on flight delay is always free, with no hourly cap. If the flight is cancelled outright, we cancel the booking at no charge and rebook automatically for your next scheduled arrival. For airport collections we include 60 minutes of free waiting from the actual landing time (enough to clear customs, collect luggage, and reach the meeting point); for scheduled transfers we include 15 minutes of free waiting at the pickup address."
    );
  });
});
