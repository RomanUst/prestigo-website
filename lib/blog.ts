/**
 * Blog post aggregator. Merges MDX articles (read at build time via
 * gray-matter from content/blog/) with the JSX_POSTS registry (3 legacy
 * articles that remain as colocated app/ JSX pages). Sorted newest-first.
 *
 * Build-time only — uses node:fs. Never import in a client component.
 */

import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import type { AuthorSlug } from "@/lib/authors";

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

const CONTENT_DIR = path.join(process.cwd(), "content", "blog");

function getMDXPosts(): BlogPost[] {
  if (!fs.existsSync(CONTENT_DIR)) return [];
  return fs
    .readdirSync(CONTENT_DIR)
    .filter((f) => f.endsWith(".mdx"))
    .map((filename) => {
      const slug = filename.replace(/\.mdx$/, "");
      const raw = fs.readFileSync(path.join(CONTENT_DIR, filename), "utf-8");
      const { data } = matter(raw);
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

export function getAllPosts(): BlogPost[] {
  return [...getMDXPosts(), ...JSX_POSTS].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );
}
