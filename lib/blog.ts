/**
 * Blog post aggregator. Merges MDX articles (read at build time via
 * gray-matter from content/blog/<locale>/, English fallback) with the
 * JSX_POSTS registry (3 legacy articles that remain as colocated app/ JSX
 * pages, EN-only per D-08). Sorted newest-first.
 *
 * Build-time only — uses node:fs. Never import in a client component.
 */

import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import type { AuthorSlug } from "@/lib/authors";
import { routing } from "@/i18n/routing";

export type BlogPost = {
  slug: string;
  title: string;
  description: string;
  date: string; // ISO YYYY-MM-DD
  coverImage: string; // relative path under /public
  category: string;
  author: AuthorSlug;
  dateModified?: string;
  source: "mdx" | "jsx";
};

const BLOG_ROOT = path.join(process.cwd(), "content", "blog");

const SLUG_PATTERN = /^[a-z0-9-]+$/;

/**
 * Resolves the content directory for a locale, falling back to English
 * when no localized directory exists yet (D-07). Phase 71 populates only
 * content/blog/en/ — ru/es/fr/ar/hi/zh land in Phase 72/73.
 */
function contentDirFor(locale: string): string {
  const localized = path.join(BLOG_ROOT, locale);
  const fallback = path.join(BLOG_ROOT, "en");
  return fs.existsSync(localized) ? localized : fallback;
}

function getMDXPosts(locale: string = "en"): BlogPost[] {
  const contentDir = contentDirFor(locale);
  if (!fs.existsSync(contentDir)) return [];
  return fs
    .readdirSync(contentDir)
    .filter((f) => f.endsWith(".mdx"))
    .map((filename) => {
      const slug = filename.replace(/\.mdx$/, "");
      const raw = fs.readFileSync(path.join(contentDir, filename), "utf-8");
      const { data } = matter(raw);
      const required = ["title", "description", "date", "coverImage", "category", "author"];
      for (const key of required) {
        if (!data[key]) {
          throw new Error(
            `MDX file "${filename}" is missing required frontmatter field: "${key}"`
          );
        }
      }
      const post: BlogPost = {
        slug,
        title: data.title as string,
        description: data.description as string,
        date: data.date as string,
        coverImage: data.coverImage as string,
        category: data.category as string,
        author: data.author as AuthorSlug,
        source: "mdx",
      };
      if (typeof data.dateModified === "string") {
        post.dateModified = data.dateModified;
      }
      return post;
    });
}

/**
 * Hardcoded registry of legacy JSX articles that live in app/ and have not
 * been converted to MDX. Phase 56 will git-mv these into app/blog/* but
 * they keep `source: 'jsx'` so the /blog/[slug] MDX route does NOT try to
 * dynamic-import them (see generateStaticParams in app/blog/[slug]/page.tsx).
 *
 * Titles and descriptions extracted verbatim from each source file's
 * metadata block on 2026-05-13.
 */
export const JSX_POSTS: BlogPost[] = [
  {
    slug: "prague-airport-to-city-center",
    title:
      "Prague Airport to City Centre 2026 — By Passenger Type (Full Guide)",
    description:
      "Prague Airport (PRG) to city centre in 2026: every option with real fares after the 1 Jan 2026 PID hike, neighbourhood-by-neighbourhood routing, and late-night protocols.",
    date: "2026-04-09",
    coverImage: "/hero-airport-transfer.webp",
    category: "Airport Transfer",
    author: "roman-ustyugov",
    source: "jsx",
  },
  {
    slug: "prague-airport-taxi-vs-chauffeur",
    title: "Prague Airport Taxi vs Chauffeur 2026 — After Uber Took the Rank",
    description:
      "Prague airport taxi vs private chauffeur in 2026: Uber is the exclusive official rank partner, AAA Taxi is no longer there. Real fares, scam alerts, decision tree by passenger profile.",
    date: "2026-04-09",
    coverImage: "/hero-airport-transfer.webp",
    category: "Airport Transfer",
    author: "roman-ustyugov",
    source: "jsx",
  },
  {
    slug: "prague-vienna-transfer-vs-train",
    title:
      "Prague to Vienna 2026: Private Transfer vs Train vs Bus (Honest Guide)",
    description:
      "Prague to Vienna 2026: private chauffeur vs RailJet vs RegioJet vs FlixBus vs rental car — honest cost per person by group size, timing, luggage, Sparschiene traps.",
    date: "2026-04-09",
    coverImage: "/vienna.png",
    category: "Intercity Routes",
    author: "roman-ustyugov",
    source: "jsx",
  },
];

export function getAllPosts(locale: string = "en"): BlogPost[] {
  return [...getMDXPosts(locale), ...JSX_POSTS].sort((a, b) => {
    const ta = new Date(a.date).getTime();
    const tb = new Date(b.date).getTime();
    if (isNaN(ta) || isNaN(tb)) {
      throw new Error(
        `Invalid date in BlogPost: "${isNaN(ta) ? a.slug : b.slug}"`
      );
    }
    return tb - ta;
  });
}

/**
 * Resolves which MDX directory serves a given (slug, locale) pair for the
 * /blog/[slug] route: the localized post when it exists, else the English
 * fallback (D-07). Returns null when neither exists, or when slug/locale
 * fail validation (path-traversal guard, T-71-BLOG-01) — validated BEFORE
 * any path.join/fs call.
 */
export function resolveLocalizedMdx(
  slug: string,
  locale: string
): { dir: string; isFallback: boolean } | null {
  if (!SLUG_PATTERN.test(slug)) return null;
  if (!(routing.locales as readonly string[]).includes(locale)) return null;

  const localizedFile = path.join(BLOG_ROOT, locale, `${slug}.mdx`);
  if (fs.existsSync(localizedFile)) {
    return { dir: locale, isFallback: false };
  }

  const enFile = path.join(BLOG_ROOT, "en", `${slug}.mdx`);
  if (fs.existsSync(enFile)) {
    return { dir: "en", isFallback: true };
  }

  return null;
}

/**
 * Canonical URL for a blog post: the current locale-relative /blog/<slug>
 * form when the post is genuinely localized (or EN, since EN IS the
 * canonical locale), else the absolute English URL when serving an
 * EN-fallback body under a non-EN locale path (canonical → EN, D-07 — no
 * duplicate indexation of untranslated content).
 */
export function blogCanonical(slug: string, isFallback: boolean): string {
  return isFallback
    ? `https://rideprestigo.com/blog/${slug}`
    : `/blog/${slug}`;
}
