/**
 * i18n/glossary.json schema + loader + system-prompt builder (D-06/D-07).
 *
 * `i18n/glossary.json` is an owner-editable data file — the owner edits
 * do-not-translate terms and per-locale tone/formality rules without
 * touching pipeline code (D-06). This module validates that file's shape
 * with zod at load time and fails loudly on a malformed glossary (V5 —
 * Security Domain, 72-RESEARCH.md) rather than silently translating with
 * missing DNT rules.
 *
 * Imports `locales` from i18n/locales.ts (NOT i18n/routing.ts) — routing.ts
 * pulls in next-intl/navigation, which transitively requires next/navigation
 * and cannot be resolved by a plain `node` invocation outside Next's
 * bundler. i18n/locales.ts is the dependency-free single source of truth
 * that both routing.ts and this plain-Node script import from (Phase 72,
 * Plan 01 deviation — see 72-01-SUMMARY.md).
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { z } from 'zod'
import { locales as allLocales } from '../../i18n/locales.ts'

/**
 * ru/es/fr/ar/hi/zh — the full non-EN production locale set. Originally
 * ru/es/fr only (Phase 72, TR-01); extended to all six in Phase 73 (A1
 * decision, TR-02) so the CLI's default (used when `--locales` is
 * omitted, including by the CI workflow) and the manual `--locales`
 * invocation cover the same set going forward — closing the latent bug
 * where a future EN edit would silently skip ar/hi/zh re-translation.
 */
export const PHASE_72_LOCALES = allLocales.filter(
  (l) => l === 'ru' || l === 'es' || l === 'fr' || l === 'ar' || l === 'hi' || l === 'zh'
)

const structuralSchema = z.object({
  note: z.string(),
  icuVariablePattern: z.string().min(1),
  richTextTags: z.array(z.string()),
  pricePlaceholderPattern: z.string().min(1),
  phoneNumbers: z.array(z.string()),
  domains: z.array(z.string()),
})

const localeEntrySchema = z.object({
  formality: z.string().min(1),
  dialect: z.string().optional(),
  toneGuide: z.string().min(1),
  pluralCategories: z.array(z.string()).min(1),
  termMap: z.record(z.string(), z.string()),
})

export const glossarySchema = z.object({
  doNotTranslate: z.object({
    brand: z.array(z.string()).min(1),
    vehicleClasses: z.array(z.string()).min(1),
    structural: structuralSchema,
  }),
  placeNames: z.object({
    note: z.string(),
    policy: z.string().min(1),
  }),
  locales: z.record(z.string(), localeEntrySchema),
})

// Resolved against process.cwd() rather than import.meta.url — this project's convention
// (see scripts/get-business-location.mjs's relative '.env.local' read) is that scripts/*.mjs
// and the test runner both execute from the repo root; import.meta.url-relative resolution
// also breaks under Vite/Vitest's module transform (non-file:// URL scheme).
const DEFAULT_GLOSSARY_PATH = path.resolve(process.cwd(), 'i18n/glossary.json')

/**
 * Load + validate i18n/glossary.json. Throws a descriptive error (fail-loud)
 * on a missing file, invalid JSON, or a shape that fails `glossarySchema`.
 */
export function loadGlossary(glossaryPath = DEFAULT_GLOSSARY_PATH) {
  let raw
  try {
    raw = readFileSync(glossaryPath, 'utf8')
  } catch (err) {
    throw new Error(`i18n-glossary: cannot read glossary file at ${glossaryPath}: ${err.message}`)
  }

  let json
  try {
    json = JSON.parse(raw)
  } catch (err) {
    throw new Error(`i18n-glossary: ${glossaryPath} is not valid JSON: ${err.message}`)
  }

  const result = glossarySchema.safeParse(json)
  if (!result.success) {
    throw new Error(`i18n-glossary: ${glossaryPath} failed schema validation: ${result.error.message}`)
  }

  return result.data
}

/**
 * Render the DNT rules + per-locale tone/formality guidance into a
 * system-prompt string for the given locale. This is the model's only
 * signal that ICU variables / rich-text tags are syntax, not vocabulary
 * (Pitfall 1), and that Russian needs the full 4-category CLDR plural set
 * (Pitfall 2).
 */
export function buildSystemPrompt(glossary, locale) {
  const localeEntry = glossary.locales[locale]
  if (!localeEntry) {
    throw new Error(`i18n-glossary: buildSystemPrompt — no locale entry for "${locale}" in glossary.json`)
  }

  const dnt = glossary.doNotTranslate
  const lines = []

  lines.push('You are a professional translator for Prestigo, a premium chauffeur service based in Prague.')
  lines.push('')
  lines.push('DO NOT TRANSLATE the following terms — reproduce them exactly, verbatim, in every output:')
  lines.push(`- Brand: ${dnt.brand.join(', ')}`)
  lines.push(`- Vehicle classes: ${dnt.vehicleClasses.join(', ')}`)
  lines.push('')
  lines.push('DO NOT ALTER the following structural syntax embedded in the text — these are code, not vocabulary:')
  lines.push(`- ICU variables/plural blocks matching the pattern ${dnt.structural.icuVariablePattern} (e.g. {amount}, {count})`)
  lines.push(`- Rich-text tags: ${dnt.structural.richTextTags.map((t) => `<${t}>...</${t}>`).join(', ')}`)
  lines.push(`- Price placeholders matching ${dnt.structural.pricePlaceholderPattern}`)
  lines.push(`- Phone numbers: ${dnt.structural.phoneNumbers.join(', ')}`)
  lines.push(`- Domains: ${dnt.structural.domains.join(', ')}`)
  lines.push('')
  lines.push(
    glossary.placeNames.policy === 'use-standard-exonym'
      ? "Geographic place names ARE translated to this locale's standard exonym (e.g. Prague -> the locale's own form of the name) — they are NOT do-not-translate terms."
      : glossary.placeNames.note
  )
  lines.push('')
  lines.push(`Tone and register for ${locale}: ${localeEntry.toneGuide}`)
  lines.push(`Formality: ${localeEntry.formality}`)
  if (localeEntry.dialect) {
    lines.push(`Dialect: ${localeEntry.dialect}`)
  }
  lines.push(
    `When translating an ICU plural construct for this locale, emit the full CLDR plural category set: ${localeEntry.pluralCategories.join(', ')}.`
  )
  const termMapEntries = Object.entries(localeEntry.termMap)
  if (termMapEntries.length > 0) {
    lines.push('')
    lines.push('Fixed term mappings — use exactly, do not substitute a synonym:')
    for (const [en, mapped] of termMapEntries) {
      lines.push(`- "${en}" -> "${mapped}"`)
    }
  }

  return lines.join('\n')
}
