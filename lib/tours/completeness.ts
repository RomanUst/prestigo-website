// Phase 93 (plan 93-05; TRIP-01, TRIP-02; D-08, D-23): when is a tour translation complete.
// One pure, client-safe rule set used by the admin API on save (93-07), the seed (93-21) and the
// checklist UI (93-10). A locale goes live for a tour only when every required field is filled and the
// leak guard passes, so English never shows up on a ru / ar / hi / zh page by accident.

import type { AppLocale } from '@/i18n/locales'
import type { TourTranslationRow } from '@/lib/tours/types'

export type LocaleLeak = null | 'english' | 'script'

export interface LocaleCompleteness {
  complete: boolean
  missing: Array<keyof TourTranslationRow>
  leak: LocaleLeak
}

const REQUIRED_TEXT = ['title', 'short_description', 'description', 'pickup_info', 'seo_title', 'seo_description'] as const

/** Scripts a translated title and short description must contain, per non-Latin locale. */
const SCRIPT_RE: Partial<Record<AppLocale, RegExp>> = {
  ru: /\p{Script=Cyrillic}/u,
  ar: /\p{Script=Arabic}/u,
  hi: /\p{Script=Devanagari}/u,
  zh: /\p{Script=Han}/u,
  'zh-hant': /\p{Script=Han}/u,
}

function filled(v: unknown): boolean {
  return typeof v === 'string' && v.trim().length > 0
}

function hasEntry(list: unknown, ok: (item: unknown) => boolean): boolean {
  return Array.isArray(list) && list.some(ok)
}

function textItem(item: unknown): boolean {
  return filled(item)
}

function pairItem(a: string, b: string): (item: unknown) => boolean {
  return (item) => {
    if (item === null || typeof item !== 'object') return false
    const o = item as Record<string, unknown>
    return filled(o[a]) && filled(o[b])
  }
}

function sameText(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase()
}

/**
 * Completeness of one translation. `en` (the English row of the same tour) enables the es / fr guard:
 * a title or short description that is byte-identical (ignoring case and edge whitespace) to the English one
 * was copied, not translated.
 */
export function isLocaleComplete(
  locale: AppLocale,
  t: TourTranslationRow,
  en?: TourTranslationRow | null,
): LocaleCompleteness {
  const missing: Array<keyof TourTranslationRow> = []
  for (const f of REQUIRED_TEXT) if (!filled(t[f])) missing.push(f)
  if (!hasEntry(t.highlights, textItem)) missing.push('highlights')
  if (!hasEntry(t.itinerary, pairItem('title', 'body'))) missing.push('itinerary')
  if (!hasEntry(t.includes, textItem)) missing.push('includes')
  if (!hasEntry(t.excludes, textItem)) missing.push('excludes')
  if (!hasEntry(t.faq, pairItem('q', 'a'))) missing.push('faq')

  let leak: LocaleLeak = null
  const script = SCRIPT_RE[locale]
  if (script) {
    // only judge fields that are filled: an empty field is already reported in `missing`
    const texts = [t.title, t.short_description].filter(filled)
    if (texts.some((s) => !script.test(s))) leak = 'script'
  } else if (locale !== 'en' && en) {
    if ((filled(t.title) && sameText(t.title, en.title)) || (filled(t.short_description) && sameText(t.short_description, en.short_description))) {
      leak = 'english'
    }
  }

  return { complete: missing.length === 0 && leak === null, missing, leak }
}
