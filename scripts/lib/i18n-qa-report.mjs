/**
 * i18n/QA-REPORT.md generator (D-09) — Phase 72, Plan 03.
 *
 * Builds the pipeline's recorded QA sampling-pass artifact: per-locale
 * key-completeness vs `messages/en.json` (0-missing target), a
 * no-English-leakage check on the units this run actually processed
 * (`runFullTranslation()`'s `summary.accepted`), a DNT/ICU/plural
 * preservation summary and an MDX structural-invariant summary (both
 * derived from `summary.flagged`), and a sampled per-locale diff for the
 * owner's manual native-speaker spot-check (D-09).
 *
 * Security note (T-72-05): the report is built ONLY from EN source
 * objects, translated output values, and `runFullTranslation()`'s summary
 * — never from `process.env` or request data — so no secret/env value can
 * end up serialized into a committed artifact.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

/** Recursively flattens a parsed JSON object into dot-path leaf keys (no sourceKey prefix — a plain structural diff). */
function flattenKeys(obj, prefix = '') {
  const keys = []
  function walk(node, keyPath) {
    if (node !== null && typeof node === 'object' && !Array.isArray(node)) {
      for (const [k, v] of Object.entries(node)) walk(v, keyPath ? `${keyPath}.${k}` : k)
      return
    }
    keys.push(keyPath)
  }
  walk(obj, prefix)
  return keys
}

/**
 * The leaf-key-set diff between an EN source object and a locale's output
 * object (TR-02's "every locale catalog has exactly the same leaf-key set
 * as en.json" requirement). `missing` = keys present in EN but absent from
 * the locale; `extra` = keys present in the locale but absent from EN.
 */
export function checkCompleteness(enFlat, localeFlat) {
  const enKeys = new Set(flattenKeys(enFlat))
  const localeKeys = new Set(flattenKeys(localeFlat))
  return {
    missing: [...enKeys].filter((k) => !localeKeys.has(k)).sort(),
    extra: [...localeKeys].filter((k) => !enKeys.has(k)).sort(),
  }
}

/** Structural type of a leaf value for parity checking: 'array' | 'object' | 'string' | 'number' | 'boolean' | 'null'. */
function leafType(v) {
  if (v === null) return 'null'
  if (Array.isArray(v)) return 'array'
  return typeof v
}

/**
 * Leaf value-TYPE parity between an EN source object and a locale output.
 * A completeness check alone misses a class of corruption where a key exists
 * in both but its value type differs — e.g. an `array` leaf (`Nav.items`,
 * `FeatureStrip.pillars`) stored as a JSON `string` in the locale catalog,
 * which crashes components that `.map()`/index it. Returns the list of
 * dot-path keys whose locale value type does not match the EN value type
 * (keys missing from the locale are the completeness check's job, not this one).
 */
export function checkValueTypeParity(enObj, localeObj) {
  const mismatches = []
  function walk(en, loc, keyPath) {
    if (en !== null && typeof en === 'object' && !Array.isArray(en)) {
      const isLocObj = loc !== null && typeof loc === 'object' && !Array.isArray(loc)
      for (const [k, ev] of Object.entries(en)) {
        const p = keyPath ? `${keyPath}.${k}` : k
        if (!isLocObj || !(k in loc)) continue // missing → completeness check owns it
        walk(ev, loc[k], p)
      }
      return
    }
    if (leafType(en) !== leafType(loc)) mismatches.push(`${keyPath} (en=${leafType(en)} locale=${leafType(loc)})`)
  }
  walk(enObj, localeObj, '')
  return mismatches
}

/** True when `value` is exactly one of the glossary's brand/vehicle-class DNT terms (legitimately identical across every locale). */
function isDntOnlyValue(value, glossary) {
  if (typeof value !== 'string') return false
  const trimmed = value.trim()
  const dnt = glossary?.doNotTranslate
  const dntTerms = [...(dnt?.brand ?? []), ...(dnt?.vehicleClasses ?? [])]
  return dntTerms.includes(trimmed)
}

/**
 * Flags a processed unit as a suspected English leak when its translated
 * value is byte-identical to its EN source — scoped to units this run
 * actually processed (never the whole catalog, since an untouched
 * hand-edited unit legitimately isn't re-examined) and excluding DNT-only
 * values (a brand/vehicle-class term that is correctly identical across
 * every locale, e.g. "Prestigo", must never be false-flagged).
 */
export function checkNoEnglishLeakage(processedUnits, glossary) {
  return processedUnits.filter(
    (u) =>
      typeof u.enValue === 'string' &&
      typeof u.trValue === 'string' &&
      u.enValue === u.trValue &&
      !isDntOnlyValue(u.enValue, glossary)
  )
}

function renderCompletenessSection(locales, completenessByLocale) {
  const lines = ['## Key Completeness (vs `messages/en.json`)', '']
  for (const locale of locales) {
    const { missing, extra } = completenessByLocale[locale] ?? { missing: [], extra: [] }
    lines.push(`### ${locale}`)
    lines.push(`- Missing: ${missing.length}${missing.length > 0 ? ' — ' + missing.slice(0, 20).join(', ') + (missing.length > 20 ? ', ...' : '') : ''}`)
    lines.push(`- Extra: ${extra.length}${extra.length > 0 ? ' — ' + extra.slice(0, 20).join(', ') + (extra.length > 20 ? ', ...' : '') : ''}`)
    lines.push('')
  }
  return lines.join('\n')
}

function renderLeakageSection(leaksByLocale) {
  const lines = ['## No-English-Leakage Check (units processed this run)', '']
  for (const [locale, leaks] of Object.entries(leaksByLocale)) {
    lines.push(`### ${locale}`)
    if (leaks.length === 0) {
      lines.push('- No suspected leaks.')
    } else {
      for (const leak of leaks) lines.push(`- \`${leak.unitKey}\`: "${leak.enValue}"`)
    }
    lines.push('')
  }
  return lines.join('\n')
}

function renderDntSection(flagged) {
  const dntFlags = flagged.filter(
    (f) => (f.missing?.length ?? 0) > 0 || (f.unbalanced?.length ?? 0) > 0 || (f.missingPluralCategories?.length ?? 0) > 0
  )
  const lines = ['## DNT / ICU-Variable / Plural-Category Preservation', '']
  if (dntFlags.length === 0) {
    lines.push('- No DNT/ICU/plural preservation failures this run.')
  } else {
    for (const f of dntFlags) {
      lines.push(
        `- \`${f.unitKey}\` (${f.locale}): missing=${JSON.stringify(f.missing ?? [])} unbalanced=${JSON.stringify(
          f.unbalanced ?? []
        )} missingPluralCategories=${JSON.stringify(f.missingPluralCategories ?? [])}`
      )
    }
  }
  lines.push('')
  return lines.join('\n')
}

function renderMdxStructureSection(flagged) {
  const mdxFlags = flagged.filter((f) => f.reason === 'mdx_structure_failed')
  const lines = ['## MDX Structural Invariants', '']
  if (mdxFlags.length === 0) {
    lines.push('- No MDX structural-invariant failures this run.')
  } else {
    for (const f of mdxFlags) {
      lines.push(`- \`${f.unitKey}\` (${f.locale}): failed structural verification (fences/links/headings) — see pipeline console log for detail, translation NOT written.`)
    }
  }
  lines.push('')
  return lines.join('\n')
}

function renderSampleDiffSection(locales, sampleByLocale) {
  const lines = ['## Sampled Diff (for the owner’s manual native-speaker spot-check)', '']
  for (const locale of locales) {
    const samples = sampleByLocale[locale] ?? []
    lines.push(`### ${locale}`)
    if (samples.length === 0) {
      lines.push('- (no processed units to sample this run)')
    } else {
      for (const s of samples) {
        lines.push(`- \`${s.unitKey}\``)
        lines.push(`  - EN: ${s.enValue}`)
        lines.push(`  - ${locale.toUpperCase()}: ${s.trValue}`)
      }
    }
    lines.push('')
  }
  return lines.join('\n')
}

/**
 * Builds + writes `i18n/QA-REPORT.md` (D-09). `results` is the object
 * returned by `runFullTranslation()` — carries `.flagged` (DNT/ICU/plural/
 * MDX-structural failures) and `.accepted` (processed-unit
 * `{unitKey, locale, enValue, trValue}` detail, used for both the
 * no-leakage check and the sampled-diff section). `completenessByLocale`
 * is precomputed by the caller via `checkCompleteness()` against
 * `messages/en.json` (the caller owns reading the catalog files — this
 * module never touches the filesystem for input, only for its own output).
 */
export function generateQaReport({ locales, results, glossary, completenessByLocale, outputPath, sampleSize = 5 }) {
  const accepted = results?.accepted ?? []
  const flagged = results?.flagged ?? []

  const leaksByLocale = {}
  const sampleByLocale = {}
  for (const locale of locales) {
    const localeUnits = accepted.filter((u) => u.locale === locale)
    leaksByLocale[locale] = checkNoEnglishLeakage(localeUnits, glossary)
    sampleByLocale[locale] = localeUnits.slice(0, sampleSize)
  }

  const content = [
    '# i18n Translation Pipeline — QA Report',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    renderCompletenessSection(locales, completenessByLocale ?? {}),
    renderLeakageSection(leaksByLocale),
    renderDntSection(flagged),
    renderMdxStructureSection(flagged),
    renderSampleDiffSection(locales, sampleByLocale),
  ].join('\n')

  mkdirSync(dirname(outputPath), { recursive: true })
  writeFileSync(outputPath, content, 'utf8')
  return content
}
