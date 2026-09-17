// @vitest-environment node
import { describe, it, expect } from "vitest";
import { getPageContent } from "@/lib/page-content";

type ServicesHubContent = {
  hero: { intro: string };
  trust: { title: string; body: string }[];
  faqs: { q: string; a: string }[];
};

type CityRidesContent = {
  hero: { intro: string };
  editorial: string[];
  features: { title: string; body: string }[];
};

type ConciergeContent = {
  hero: { intro: string };
  editorial: string[];
  faqs: { q: string; a: string }[];
};

describe("getPageContent('services') — hub page", () => {
  it("translated (Phase 72): getPageContent('services', 'ru') exists and is translated", () => {
    const en = getPageContent("services", "en");
    const ru = getPageContent("services", "ru");
    expect(ru).not.toEqual(en); // Phase 72: ru is now translated, not an EN copy
    expect(Object.keys(ru)).toEqual(Object.keys(en));
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

describe("getPageContent('services/city-rides') — city-rides page", () => {
  it("translated (Phase 72): getPageContent('services/city-rides', 'ru') exists and is translated", () => {
    const en = getPageContent("services/city-rides", "en");
    const ru = getPageContent("services/city-rides", "ru");
    expect(ru).not.toEqual(en); // Phase 72: ru is now translated, not an EN copy
    expect(Object.keys(ru)).toEqual(Object.keys(en));
  });

  it("spot-checks 3 representative body strings against verbatim originals", () => {
    const content = getPageContent("services/city-rides", "en") as CityRidesContent;
    expect(content.hero.intro).toBe(
      "Rent a car with a private chauffeur in Prague by the hour — a Mercedes-Benz E-Class, S-Class, or V-Class with a 2-hour minimum and no upper limit. Your driver and vehicle stay with you for the full duration: business meetings, theatre, shopping, private dining, or airport waits. The hourly rate is fixed at booking."
    );
    expect(content.editorial[0]).toBe(
      "Prague is a compact city for walking, but it is not always a practical one for self-navigation — particularly for visitors managing luggage, working to a schedule where arriving late is not an option, or unfamiliar with which streets permit through traffic at which hours. The Old Town's pedestrian zones are extensive, and many of Prague's best hotels sit on streets that require local knowledge to reach efficiently."
    );
    expect(content.features[1].body).toBe(
      "Our Prague chauffeurs know the city at the level that comes from years of operating within it. They know that Pařížská is one-way and when the pedestrian crossing restriction at Old Town Square applies. They know the Palace Hotel approach requires Panská rather than Jindřišská, and that Bílkova is faster than Kozí for reaching the riverside embankment at Dvořákovo nábřeží. A recommendation for a wine bar in Vinohrady or a tailor in Malá Strana is given when asked, never otherwise."
    );
  });

  it("path-traversal: getPageContent('services/../x', 'en') throws (segment-wise guard on nested keys)", () => {
    expect(() => getPageContent("services/../x", "en")).toThrow();
  });
});

describe("getPageContent('services/concierge') — concierge page", () => {
  it("translated (Phase 72): getPageContent('services/concierge', 'ru') exists and is translated", () => {
    const en = getPageContent("services/concierge", "en");
    const ru = getPageContent("services/concierge", "ru");
    expect(ru).not.toEqual(en); // Phase 72: ru is now translated, not an EN copy
    expect(Object.keys(ru)).toEqual(Object.keys(en));
  });

  it("spot-checks 3 representative body strings against verbatim originals", () => {
    const content = getPageContent("services/concierge", "en") as ConciergeContent;
    expect(content.hero.intro).toBe(
      "A PRESTIGO chauffeur does more than move you across Prague. Reservations confirmed, local knowledge offered, errands absorbed, plans changed on the day without a second thought — the logistics of your time in the city, handled by one trusted person. English-speaking, discreet, operating since 2016."
    );
    expect(content.editorial[1]).toBe(
      "A concierge chauffeur is not a more expensive way to get across town. It is a single person who removes the small, constant friction of moving through an unfamiliar city: the reservation that needs confirming, the route that needs local judgement, the bag that needs carrying, the plan that changes at four in the afternoon. Each of these is minor on its own. Together, over a day or a week, they are the difference between managing a visit and being looked after during one."
    );
    expect(content.faqs[0].a).toBe(
      "A standard transfer moves you from point A to point B. A concierge chauffeur takes on the tasks around the journey as well — confirming a restaurant reservation, coordinating with your hotel concierge, carrying shopping, advising on where to go, and adapting the plan as your day changes. It is the same Mercedes fleet and the same fixed pricing; the difference is that one trusted person handles the logistics of your time in Prague, not just the driving."
    );
  });
});
