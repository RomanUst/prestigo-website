/**
 * Route-page content loader. Reads locale-aware JSON bodies for the
 * route pages under app/[locale]/routes/<slug>/page.tsx — hero copy,
 * inclusions, day-trip configs, FAQ, journey timeline, related routes, and
 * generateMetadata() strings. Falls back to the English file when the
 * localized file doesn't exist yet (Phase 72 populates ru/es/fr/ar/hi/zh).
 *
 * Locale-invariant route data (prices, distance, duration, tier,
 * metadataTitle) stays in lib/routes.ts — this loader only ever returns
 * locale-varying prose/structured content (D-02).
 *
 * Build-time only — uses node:fs. Never import in a client component.
 */

import fs from "node:fs";
import path from "node:path";
import { routing } from "@/i18n/routing";

export type RouteContent = {
  hero: {
    label: string;
    headlineLine1: string;
    headlineItalic: string;
    intro: string;
  };
  openingParagraphs: string[];
  routeNarrative: {
    headingLine1: string;
    headingItalic: string;
    paragraphs: string[];
  };
  includedLabel: string;
  includedIntro: string;
  inclusions: string[];
  fleetNote: string;
  vehicles: Array<{
    name: string;
    category: string;
    capacity: string;
    bags: string;
    price: string;
    photo: string;
  }>;
  journeyHeading: { line1: string; italic: string };
  journeyStops: Array<{
    city: string;
    note: string;
    anchor: boolean;
    custom: boolean;
  }>;
  goodToKnow: Array<{ label: string; value: string }>;
  dayTripLabel: string;
  dayTrip: {
    headingLine1: string;
    headingItalic: string;
    intro: string;
    configurations: Array<{ title: string; body: string; price: string }>;
    footnote: string;
  };
  chauffeurNarrative: string[];
  whyBook: {
    headingLine1: string;
    headingItalic: string;
    items: Array<{ title: string; body: string }>;
  };
  faqsHeading: string;
  faqs: Array<{ q: string; a: string }>;
  relatedRoutesIntro: string;
  relatedHeading: { line1: string; italic: string };
  relatedRoutes: Array<{
    slug: string;
    city: string;
    distance: string;
    duration: string;
  }>;
  highlights: Array<{
    label: string;
    value: string | string[];
    copper?: boolean;
  }>;
  cta: { headingLine1: string; headingItalic: string };
  metadata: {
    title: string;
    description: string;
    ogTitle: string;
    ogDescription: string;
  };
};

const CONTENT_ROOT = path.join(process.cwd(), "content", "routes");

const SLUG_PATTERN = /^[a-z0-9-]+$/;

export function getRouteContent(slug: string, locale: string): RouteContent {
  if (!SLUG_PATTERN.test(slug)) {
    throw new Error(`Invalid route slug "${slug}" — must match ${SLUG_PATTERN}`);
  }
  if (!(routing.locales as readonly string[]).includes(locale)) {
    throw new Error(
      `Invalid locale "${locale}" — must be one of ${routing.locales.join(", ")}`
    );
  }

  const localized = path.join(CONTENT_ROOT, locale, `${slug}.json`);
  const fallback = path.join(CONTENT_ROOT, "en", `${slug}.json`);
  const file = fs.existsSync(localized) ? localized : fallback;
  if (!fs.existsSync(file)) {
    throw new Error(
      `No content found for route "${slug}" (locale="${locale}", tried ${localized} and ${fallback})`
    );
  }
  return JSON.parse(fs.readFileSync(file, "utf-8")) as RouteContent;
}
