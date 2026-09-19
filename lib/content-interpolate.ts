import { createElement, type ReactNode } from "react";

/**
 * Tiny {token} substitution helper for content JSON strings.
 *
 * Content JSON (content/routes/*, content/pages/*) is plain JSON — it never
 * goes through next-intl's t()/ICU pipeline. Prices are DB-sourced per-request
 * (lib/route-prices.ts) and must stay locale-invariant (D-02), so content
 * strings store a `{ePrice}`-style placeholder token and this helper performs
 * simple substitution after the content is loaded, exactly reproducing the
 * pre-refactor template-literal output.
 *
 * Build-time/render-time only — no special runtime requirement, but this
 * module has no 'use client' directive and is meant to run alongside the
 * content loaders (lib/route-content.ts, lib/page-content.ts) inside Server
 * Components.
 */
export function interpolate(
  template: string,
  values: Record<string, string | number>
): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => {
    const value = values[key];
    return value === undefined ? `{${key}}` : String(value);
  });
}

/**
 * Same {token} substitution as interpolate(), but for RENDER sites only —
 * returns a ReactNode array instead of a plain string, wrapping each
 * substituted token in <bdi> (D-11: bidi-isolation for DNT price runs
 * embedded inside translated RTL prose — see components/Hero.tsx:79-89 for
 * the source-of-truth pattern this generalizes).
 *
 * Do NOT use this for generateMetadata()/JSON-LD strings — those need the
 * plain-string interpolate() above; a ReactNode cannot satisfy the Metadata
 * type. This is a render-site-only sibling.
 *
 * Uses createElement (not JSX) so this module can stay a plain .ts file
 * alongside interpolate()'s string-only signature.
 */
export function interpolateBidi(
  template: string,
  values: Record<string, string | number>
): ReactNode {
  const nodes: ReactNode[] = [];
  const pattern = /\{(\w+)\}/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = pattern.exec(template)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(template.slice(lastIndex, match.index));
    }
    const token = match[1];
    const value = values[token];
    if (value === undefined) {
      nodes.push(`{${token}}`);
    } else {
      nodes.push(createElement("bdi", { key: key++ }, String(value)));
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < template.length) {
    nodes.push(template.slice(lastIndex));
  }

  return nodes;
}
