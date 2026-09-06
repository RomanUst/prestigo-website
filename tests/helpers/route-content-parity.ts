/**
 * Shared parity helpers for route content tests. Plain module (not a
 * `.test.` file) so Wave 2 route plans can import it directly without
 * touching this shared file.
 *
 * Exports:
 * - FIXTURE_PRICES: a fixed {ePrice,sPrice,vPrice} price set for tests.
 * - assertRouteContentShape: asserts every RouteContent key is present and
 *   correctly typed.
 * - assertRouteParity: loads getRouteContent(slug, 'en'), interpolates each
 *   provided field with FIXTURE_PRICES, and asserts equality against the
 *   supplied verbatim expected strings.
 */

import { expect } from "vitest";
import { getRouteContent, type RouteContent } from "@/lib/route-content";
import { interpolate } from "@/lib/content-interpolate";

export const FIXTURE_PRICES = {
  ePrice: 485,
  sPrice: 650,
  vPrice: 590,
};

export function assertRouteContentShape(content: RouteContent): void {
  expect(content.hero).toBeTypeOf("object");
  expect(content.hero.label).toBeTypeOf("string");
  expect(content.hero.headlineLine1).toBeTypeOf("string");
  expect(content.hero.headlineItalic).toBeTypeOf("string");
  expect(content.hero.intro).toBeTypeOf("string");

  expect(Array.isArray(content.openingParagraphs)).toBe(true);
  expect(content.openingParagraphs.length).toBeGreaterThan(0);

  expect(content.routeNarrative).toBeTypeOf("object");
  expect(content.routeNarrative.headingLine1).toBeTypeOf("string");
  expect(content.routeNarrative.headingItalic).toBeTypeOf("string");
  expect(Array.isArray(content.routeNarrative.paragraphs)).toBe(true);

  expect(content.includedLabel).toBeTypeOf("string");
  expect(content.includedIntro).toBeTypeOf("string");
  expect(Array.isArray(content.inclusions)).toBe(true);
  expect(content.inclusions.length).toBeGreaterThan(0);

  expect(content.fleetNote).toBeTypeOf("string");
  expect(Array.isArray(content.vehicles)).toBe(true);
  expect(content.vehicles.length).toBeGreaterThan(0);
  for (const v of content.vehicles) {
    expect(v.name).toBeTypeOf("string");
    expect(v.category).toBeTypeOf("string");
    expect(v.capacity).toBeTypeOf("string");
    expect(v.bags).toBeTypeOf("string");
    expect(v.price).toBeTypeOf("string");
    expect(v.photo).toBeTypeOf("string");
  }

  expect(content.journeyHeading).toBeTypeOf("object");
  expect(Array.isArray(content.journeyStops)).toBe(true);
  expect(content.journeyStops.length).toBeGreaterThan(0);
  for (const stop of content.journeyStops) {
    expect(stop.city).toBeTypeOf("string");
    expect(stop.note).toBeTypeOf("string");
    expect(stop.anchor).toBeTypeOf("boolean");
    expect(stop.custom).toBeTypeOf("boolean");
  }

  expect(Array.isArray(content.goodToKnow)).toBe(true);
  expect(content.goodToKnow.length).toBeGreaterThan(0);

  expect(content.dayTripLabel).toBeTypeOf("string");
  expect(content.dayTrip).toBeTypeOf("object");
  expect(content.dayTrip.headingLine1).toBeTypeOf("string");
  expect(content.dayTrip.headingItalic).toBeTypeOf("string");
  expect(content.dayTrip.intro).toBeTypeOf("string");
  expect(Array.isArray(content.dayTrip.configurations)).toBe(true);
  expect(content.dayTrip.footnote).toBeTypeOf("string");

  expect(Array.isArray(content.chauffeurNarrative)).toBe(true);
  expect(content.chauffeurNarrative.length).toBeGreaterThan(0);

  expect(content.whyBook).toBeTypeOf("object");
  expect(content.whyBook.headingLine1).toBeTypeOf("string");
  expect(content.whyBook.headingItalic).toBeTypeOf("string");
  expect(Array.isArray(content.whyBook.items)).toBe(true);

  expect(content.faqsHeading).toBeTypeOf("string");
  expect(Array.isArray(content.faqs)).toBe(true);
  expect(content.faqs.length).toBeGreaterThan(0);
  for (const faq of content.faqs) {
    expect(faq.q).toBeTypeOf("string");
    expect(faq.a).toBeTypeOf("string");
  }

  expect(content.relatedRoutesIntro).toBeTypeOf("string");
  expect(content.relatedHeading).toBeTypeOf("object");
  expect(Array.isArray(content.relatedRoutes)).toBe(true);

  expect(Array.isArray(content.highlights)).toBe(true);
  expect(content.highlights.length).toBeGreaterThan(0);

  expect(content.cta).toBeTypeOf("object");
  expect(content.cta.headingLine1).toBeTypeOf("string");
  expect(content.cta.headingItalic).toBeTypeOf("string");

  expect(content.metadata).toBeTypeOf("object");
  expect(content.metadata.title).toBeTypeOf("string");
  expect(content.metadata.description).toBeTypeOf("string");
  expect(content.metadata.ogTitle).toBeTypeOf("string");
  expect(content.metadata.ogDescription).toBeTypeOf("string");
}

type ParityField =
  | "hero.intro"
  | "inclusions.0"
  | "faqs.1.a"
  | "cta.headingItalic"
  | "metadata.title";

function resolveField(content: RouteContent, field: ParityField): string {
  switch (field) {
    case "hero.intro":
      return content.hero.intro;
    case "inclusions.0":
      return content.inclusions[0];
    case "faqs.1.a":
      return content.faqs[1].a;
    case "cta.headingItalic":
      return content.cta.headingItalic;
    case "metadata.title":
      return content.metadata.title;
    default:
      throw new Error(`Unknown parity field: ${field}`);
  }
}

/**
 * Loads getRouteContent(slug, 'en'), interpolates each provided field with
 * FIXTURE_PRICES, and asserts equality against the supplied verbatim
 * expected strings. `expected` keys must be one of the supported
 * ParityField paths.
 */
export function assertRouteParity(
  slug: string,
  expected: Partial<Record<ParityField, string>>
): void {
  const content = getRouteContent(slug, "en");
  for (const [field, expectedValue] of Object.entries(expected) as Array<
    [ParityField, string]
  >) {
    const raw = resolveField(content, field);
    expect(interpolate(raw, FIXTURE_PRICES)).toBe(expectedValue);
  }
}
