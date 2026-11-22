// Phase 93 (plan 93-11): the shape of the `Tours` namespace translator the tour page components share.
// TourPageView creates it once (getTranslations) and hands it to the synchronous sub-components, so only one
// component on the page is async. Keys are relative to the `Tours` namespace ("page.eyebrow", "facts.total").

import type { ReactNode } from 'react'

export type TourT = {
  (key: string, values?: Record<string, string | number>): string
  rich: (key: string, values: Record<string, string | number | ((chunks: ReactNode) => ReactNode)>) => ReactNode
}

/** Paragraphs of a stored text field: split on blank lines, trimmed, empties dropped. */
export function splitParagraphs(text: string | null | undefined): string[] {
  if (!text) return []
  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
}

/** Split an internal href into path and query so the path can be locale-resolved and the query kept. */
export function splitHref(href: string): { path: string; query: string } {
  const q = href.indexOf('?')
  return q === -1 ? { path: href, query: '' } : { path: href.slice(0, q), query: href.slice(q) }
}
