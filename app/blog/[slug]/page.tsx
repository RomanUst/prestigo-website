/**
 * Phase 54: minimal MDX render route — proves the @next/mdx pipeline works
 * end-to-end. Phase 55 will replace this file with the full article UI:
 * hero coverImage, ArticleByline, MDX body inside design-system prose,
 * bottom CTA, full SEO metadata, and Schema.org BlogPosting JSON-LD.
 *
 * DO NOT add SEO metadata or styling here — that work belongs to Phase 55
 * (LIST-01, ART-01..05). Keeping this minimal avoids merge conflicts.
 */

import fs from "node:fs";
import path from "node:path";

export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams(): Array<{ slug: string }> {
  const contentDir = path.join(process.cwd(), "content", "blog");
  if (!fs.existsSync(contentDir)) return [];
  return fs
    .readdirSync(contentDir)
    .filter((f) => f.endsWith(".mdx"))
    .map((f) => ({ slug: f.replace(/\.mdx$/, "") }));
}

export default async function BlogArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  // CRITICAL: webpack/Turbopack cannot resolve the @/ alias in dynamic
  // import template strings. Use a relative path from this file's location
  // (app/blog/[slug]/page.tsx is 3 directories deep from repo root).
  // See RESEARCH.md Pitfall 1 + GitHub Discussion vercel/next.js #82837.
  const { default: Post } = await import(
    `../../../content/blog/${slug}.mdx`
  );
  return <Post />;
}
