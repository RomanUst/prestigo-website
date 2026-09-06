/**
 * Non-route page content loader. Mirrors lib/route-content.ts's fallback +
 * validation shape for content/pages/<locale>/<page>.json — used by the
 * Home long-form sections, the 8 service pages, about/faq/contact/corporate,
 * and the legal pages (Wave 2+ of Phase 71).
 *
 * Unlike route pages (one rigid shared skeleton -> one RouteContent type),
 * each non-route page is bespoke with its own section set — there is no
 * single universal shape to type here. getPageContent() intentionally
 * returns `unknown`; callers narrow the shape at their own call site.
 *
 * `page` may be a nested key (e.g. "services/city-rides") to mirror the URL
 * structure — each path segment is validated independently before joining.
 *
 * Build-time only — uses node:fs. Never import in a client component.
 */

import fs from "node:fs";
import path from "node:path";
import { routing } from "@/i18n/routing";

const CONTENT_ROOT = path.join(process.cwd(), "content", "pages");

const SEGMENT_PATTERN = /^[a-z0-9-]+$/;

export function getPageContent(page: string, locale: string): unknown {
  const segments = page.split("/");
  for (const segment of segments) {
    if (!SEGMENT_PATTERN.test(segment)) {
      throw new Error(
        `Invalid page key "${page}" — segment "${segment}" must match ${SEGMENT_PATTERN}`
      );
    }
  }
  if (!(routing.locales as readonly string[]).includes(locale)) {
    throw new Error(
      `Invalid locale "${locale}" — must be one of ${routing.locales.join(", ")}`
    );
  }

  const localized = path.join(CONTENT_ROOT, locale, `${page}.json`);
  const fallback = path.join(CONTENT_ROOT, "en", `${page}.json`);
  const file = fs.existsSync(localized) ? localized : fallback;
  if (!fs.existsSync(file)) {
    throw new Error(
      `No content found for page "${page}" (locale="${locale}", tried ${localized} and ${fallback})`
    );
  }
  return JSON.parse(fs.readFileSync(file, "utf-8"));
}
