/**
 * EN-source surface walker + per-surface batching (Phase 72, Plan 02).
 *
 * Expands the Plan 01 tracer's one-key scope to every catalog + content-JSON
 * surface: `messages/en.json` (the catalog) and every `content/routes/en/*.json`
 * / `content/pages/en/**\/*.json` file (route + marketing pages, including the
 * nested `services/` subdirectory). See 72-RESEARCH.md Architecture Patterns —
 * Pattern 3 for the two batching strategies implemented here:
 *
 *   3.1 short chrome strings (the catalog) -> batchShortStrings(): many units
 *       batched into one structured-output call per locale, chunked so a
 *       single call never grows unbounded.
 *   3.2 long-form route/page prose -> translateWholeFile(): one call per
 *       file per locale so Claude sees the whole page and keeps cross-field
 *       tone/terminology consistent (D-01 quality priority).
 *
 * This module is transport-agnostic: every translate* function takes an
 * injected translator callback (translateBatch / translateFile) and never
 * imports @anthropic-ai/sdk itself. scripts/i18n-translate.mjs owns the
 * concrete Anthropic + dry-run translator implementations (mirrors the
 * Plan 01 injected-translator pattern for translateSource()).
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { flattenEnSource, isEmptyValue, unitsNeedingTranslation } from './i18n-manifest.mjs'

/** Short-string batch call chunk size (Pattern 3.1) — bounds a single call's prompt size. */
const SHORT_STRING_BATCH_SIZE = 40

/** Recursively lists `.json` files under `dir`, relative to `baseDir`, posix-separated, sorted. */
function walkJsonFilesRecursive(dir, baseDir = dir) {
  const results = []
  const entries = readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      results.push(...walkJsonFilesRecursive(full, baseDir))
    } else if (entry.isFile() && entry.name.endsWith('.json')) {
      results.push(path.relative(baseDir, full).split(path.sep).join('/'))
    }
  }
  return results
}

/**
 * Enumerates every EN source this pipeline translates, rooted at `rootDir`
 * (repo root for a real run, a fixtures directory for `--dry-run --fixtures`).
 *
 * - `messages/en.json` (surfaceType: 'catalog') — short chrome strings,
 *   batched (Pattern 3.1).
 * - `content/routes/en/*.json` (surfaceType: 'content') — one file per
 *   route, whole-file translated (Pattern 3.2).
 * - `content/pages/en/**\/*.json` (surfaceType: 'content'), walked
 *   recursively so `content/pages/en/services/*.json` map to
 *   `content/pages/<locale>/services/*.json` — nested tree preserved, not
 *   flattened.
 *
 * Each entry's `sourceKey` follows the existing unitKey convention
 * (`<relative-source-path>::<dot-path>`) established in Plan 01/72-RESEARCH.md
 * Pattern 1, and `targetPathFor(locale)` derives the sibling-locale write path.
 */
export function enumerateEnSources(rootDir = process.cwd()) {
  const sources = []

  const catalogPath = path.join(rootDir, 'messages/en.json')
  if (existsSync(catalogPath)) {
    sources.push({
      sourcePath: catalogPath,
      sourceKey: 'messages/en.json',
      surfaceType: 'catalog',
      targetPathFor: (locale) => path.join(rootDir, `messages/${locale}.json`),
    })
  }

  const routesDir = path.join(rootDir, 'content/routes/en')
  if (existsSync(routesDir)) {
    const files = readdirSync(routesDir)
      .filter((f) => f.endsWith('.json'))
      .sort()
    for (const file of files) {
      sources.push({
        sourcePath: path.join(routesDir, file),
        sourceKey: `content/routes/en/${file}`,
        surfaceType: 'content',
        targetPathFor: (locale) => path.join(rootDir, `content/routes/${locale}/${file}`),
      })
    }
  }

  const pagesDir = path.join(rootDir, 'content/pages/en')
  if (existsSync(pagesDir)) {
    for (const relPath of walkJsonFilesRecursive(pagesDir)) {
      sources.push({
        sourcePath: path.join(pagesDir, relPath),
        sourceKey: `content/pages/en/${relPath}`,
        surfaceType: 'content',
        targetPathFor: (locale) => path.join(rootDir, `content/pages/${locale}/${relPath}`),
      })
    }
  }

  return sources
}

/**
 * Pattern 3.1 — batches `units` into chunks of `batchSize`, calling
 * `translateBatch(chunk, {locale, glossary})` once per chunk and expecting
 * back an array of translated strings, same length and order as the chunk.
 * Returns a flat `{unitKey: translatedValue}` map across all chunks.
 *
 * Type round-trip: the batch translator serializes a non-string leaf (array or
 * object — e.g. `Nav.items`, `FeatureStrip.pillars`) to JSON before putting it
 * in the prompt, so the model returns its translation as a JSON *string*. For
 * those units the returned string is parsed back to the original container type,
 * so a locale catalog's value type always matches its EN source (a string stays
 * a string; an array stays an array). Without this, `messages/<locale>.json`
 * stores a stringified array and components that `.map()`/index it break at
 * render.
 */
export async function batchShortStrings({ units, locale, glossary, translateBatch, batchSize = SHORT_STRING_BATCH_SIZE }) {
  const results = {}
  for (let i = 0; i < units.length; i += batchSize) {
    const chunk = units.slice(i, i + batchSize)
    const translated = await translateBatch(chunk, { locale, glossary })
    if (!Array.isArray(translated) || translated.length !== chunk.length) {
      throw new Error(
        `i18n-surfaces: batchShortStrings — translator returned ${
          Array.isArray(translated) ? translated.length : typeof translated
        } result(s) for a batch of ${chunk.length} (locale=${locale})`
      )
    }
    chunk.forEach((unit, idx) => {
      results[unit.unitKey] = coerceToSourceType(unit.value, translated[idx])
    })
  }
  return results
}

/**
 * Restore a translated leaf to the type of its EN source. A string EN value
 * keeps the translated string as-is. A non-string EN value (array/object) was
 * JSON-serialized into the prompt, so the model returned a JSON string — parse
 * it back to the container type. If the parse fails or yields the wrong shape,
 * return the raw string unchanged so the downstream structural verifier flags
 * it (fail-closed) rather than silently shipping malformed data.
 */
export function coerceToSourceType(enValue, translatedValue) {
  if (typeof enValue === 'string' || typeof translatedValue !== 'string') return translatedValue
  try {
    const parsed = JSON.parse(translatedValue)
    if (Array.isArray(enValue) === Array.isArray(parsed) && typeof parsed === typeof enValue) return parsed
    return translatedValue
  } catch {
    return translatedValue
  }
}

/**
 * Pattern 3.2 — one whole-file call per locale. `translateFile(enObj, {locale,
 * glossary, sourceKey})` receives the FULL EN object (for cross-field tone/
 * terminology context) and must return a translated object of the same
 * shape. Only the values for `selectedUnits` (the units that actually need
 * (re-)translation this run) are extracted from the response — an untouched
 * sibling unit's existing target value is never derived from this call,
 * preserving D-05 hand-edit semantics even though the model saw the whole
 * file. Returns `{}` with no call at all when `selectedUnits` is empty
 * (idempotency — an unchanged file issues zero translator calls).
 */
export async function translateWholeFile({ enObj, sourceKey, selectedUnits, locale, glossary, translateFile }) {
  if (selectedUnits.length === 0) return {}

  const translatedObj = await translateFile(enObj, { locale, glossary, sourceKey })
  const translatedByUnitKey = Object.fromEntries(
    flattenEnSource(translatedObj, sourceKey).map((unit) => [unit.unitKey, unit.value])
  )

  const results = {}
  for (const unit of selectedUnits) {
    if (!Object.prototype.hasOwnProperty.call(translatedByUnitKey, unit.unitKey)) {
      throw new Error(`i18n-surfaces: translateWholeFile — response for "${sourceKey}" (locale=${locale}) missing unit "${unit.unitKey}"`)
    }
    results[unit.unitKey] = translatedByUnitKey[unit.unitKey]
  }
  return results
}

/**
 * Orchestrates ONE catalog source (messages/en.json) -> ONE locale using the
 * short-string batching strategy. Pure/read-only with respect to persistence:
 * never writes a file or mutates `manifest` — the caller
 * (scripts/i18n-translate.mjs) owns writing the target file and advancing
 * the manifest, so a failed unit can be retried on the next run without
 * partially-committed state.
 *
 * A translator failure for the batch is caught here (not re-thrown) so one
 * bad call never aborts the whole pipeline run — the affected unitKeys are
 * returned in `failedUnitKeys` for the caller to log / surface to the QA
 * report (Plan 72-03) and to exclude from this run's manifest advance.
 */
export async function translateCatalog({ enUnits, manifest, locale, glossary, translateBatch }) {
  const selected = unitsNeedingTranslation(enUnits, manifest)
  const emptyUnits = selected.filter((u) => isEmptyValue(u.value))
  const nonEmptyUnits = selected.filter((u) => !isEmptyValue(u.value))

  let translatedByUnitKey = {}
  const failedUnitKeys = []
  if (nonEmptyUnits.length > 0) {
    try {
      translatedByUnitKey = await batchShortStrings({ units: nonEmptyUnits, locale, glossary, translateBatch })
    } catch (err) {
      for (const unit of nonEmptyUnits) failedUnitKeys.push(unit.unitKey)
      console.error(`✗ i18n-translate: catalog batch translation failed (locale=${locale}): ${err.message}`)
    }
  }

  return { selected, emptyUnits, nonEmptyUnits, translatedByUnitKey, failedUnitKeys }
}

/**
 * Orchestrates ONE content-JSON source (a route/page file) -> ONE locale
 * using the whole-file batching strategy (Pattern 3.2). Same
 * pure/read-only + caught-failure contract as translateCatalog().
 */
export async function translateContentJson({ enObj, sourceKey, enUnits, manifest, locale, glossary, translateFile }) {
  const selected = unitsNeedingTranslation(enUnits, manifest)
  const emptyUnits = selected.filter((u) => isEmptyValue(u.value))
  const nonEmptyUnits = selected.filter((u) => !isEmptyValue(u.value))

  let translatedByUnitKey = {}
  const failedUnitKeys = []
  if (nonEmptyUnits.length > 0) {
    try {
      translatedByUnitKey = await translateWholeFile({
        enObj,
        sourceKey,
        selectedUnits: nonEmptyUnits,
        locale,
        glossary,
        translateFile,
      })
    } catch (err) {
      for (const unit of nonEmptyUnits) failedUnitKeys.push(unit.unitKey)
      console.error(`✗ i18n-translate: whole-file translation failed for "${sourceKey}" (locale=${locale}): ${err.message}`)
    }
  }

  return { selected, emptyUnits, nonEmptyUnits, translatedByUnitKey, failedUnitKeys }
}

/** Reads and JSON-parses a source file — small helper shared by the pipeline loop. */
export function readEnSource(sourcePath) {
  return JSON.parse(readFileSync(sourcePath, 'utf8'))
}
