#!/usr/bin/env node
/**
 * scripts/i18n-freeze-manifest.mjs — freezes hand-translated Phase 75 units
 * into `i18n/translation-manifest.json` (D-08).
 *
 * Phases 68–75 hand-translated many units in-session (Anthropic API credit
 * empty; `i18n Translate` GH workflow disabled — see 73-COMPLETE note). Those
 * units were never run through the AI pipeline (scripts/i18n-translate.mjs),
 * so their manifest entries don't exist yet. Without this tool, the next
 * time the pipeline runs it would see every one of those units as
 * "never translated" (`unitsNeedingTranslation()` in scripts/lib/i18n-manifest.mjs)
 * and both re-spend tokens on them AND overwrite the hand-translated value
 * with a fresh AI translation — silently destroying this phase's work.
 *
 * Freeze-pattern files live at
 * `.planning/phases/75-e2e-verification-launch/freeze/*.freeze` — one file
 * per plan (75-06..75-16), each a newline-separated list of pattern lines
 * (blank lines and `#`-comments ignored):
 *
 *   <sourceKey>              selects every unit in that EN source
 *   <sourceKey>::<dotPrefix> selects only units whose dot-path equals
 *                            dotPrefix, or starts with `${dotPrefix}.`
 *                            (whole path segments only — `a.bx` never
 *                            matches prefix `a.b`)
 *
 * `<sourceKey>` resolves via the SAME sourceKey -> {sourcePath,
 * targetPathFor(locale)} mapping `scripts/lib/i18n-surfaces.mjs`'s
 * `enumerateEnSources()` uses for the real pipeline, so a freeze pattern
 * always targets exactly the units a translate run would consider.
 *
 * Refuses (non-zero exit, unit + locale named, nothing written) to freeze
 * any selected unit whose value is missing in any of the 6 locale files, or
 * byte-identical to EN in any of them — UNLESS the value is "legitimately
 * identical": one of `i18n/glossary.json`'s DNT brand/vehicle-class terms,
 * one of `scripts/qa/en_leak_allowlist.json`'s already-audited `dnt` /
 * `placeNames` / `tierNames` entries (the SAME registry the D-06 static/
 * rendered EN-leak scanners use for this exact class of false positive —
 * e.g. a Czech/German town with no distinct Spanish/French exonym, or a
 * cross-language cognate like French "Service"/"Message"/"Distance"), or a
 * purely-numeric string (e.g. the "404" in NotFound.eyebrow — a language-
 * agnostic HTTP status code). Anything else identical is treated as an
 * untranslated stub and can never be frozen as "translated". `--verify`
 * re-derives the current EN hash for every unit a freeze pattern selects
 * and confirms it still matches the manifest's recorded `enHash`, with no
 * writes.
 *
 * Never imports scripts/i18n-translate.mjs (the translating pipeline
 * entry point) — only the transport-agnostic scripts/lib/* helpers. Never
 * calls a translator; this tool only records that a translation already
 * happened by hand.
 *
 * CLI:
 *   node scripts/i18n-freeze-manifest.mjs [--dir <freezeDir>] [--verify]
 *
 * Exports: readFreezePatterns, selectUnits, freezeUnits, verifyFrozen
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadGlossary, PHASE_72_LOCALES } from './lib/i18n-glossary.mjs'
import { flattenEnSource, loadManifest, sha256, writeManifest } from './lib/i18n-manifest.mjs'
import { enumerateEnSources, readEnSource } from './lib/i18n-surfaces.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DEFAULT_FREEZE_DIR = '.planning/phases/75-e2e-verification-launch/freeze'
const EN_LEAK_ALLOWLIST_PATH = path.join(__dirname, 'qa/en_leak_allowlist.json')

/**
 * The D-06 static/rendered EN-leak scanners' already-audited registry of
 * values that are legitimately identical across EN and a locale (place
 * names with no distinct exonym, cross-language cognates, tier/currency
 * labels never translated) — see scripts/qa/en_leak_allowlist.json. Loaded
 * once; returns `null` (never throws) if the allowlist file is absent, so
 * this tool degrades to the glossary-only DNT check rather than crashing.
 */
function loadLegitimatelyIdenticalAllowlist() {
  try {
    const parsed = JSON.parse(readFileSync(EN_LEAK_ALLOWLIST_PATH, 'utf8'))
    const values = new Set()
    for (const category of ['dnt', 'placeNames', 'tierNames']) {
      for (const entry of parsed[category] ?? []) if (entry?.value) values.add(entry.value)
    }
    return values
  } catch {
    return null
  }
}

/**
 * True when `value` is legitimately identical to its EN source across
 * every locale — never an untranslated stub:
 *   - one of `i18n/glossary.json`'s DNT brand/vehicle-class terms
 *   - one of `scripts/qa/en_leak_allowlist.json`'s `dnt`/`placeNames`/
 *     `tierNames` entries (place names with no distinct exonym, cognates,
 *     tier/currency labels)
 *   - a purely-numeric string (a language-agnostic code, e.g. "404")
 */
function isLegitimatelyIdenticalValue(value, glossary, allowlistValues) {
  if (typeof value !== 'string') return false
  const trimmed = value.trim()
  if (trimmed.length === 0) return false
  if (/^\d+$/.test(trimmed)) return true

  const dnt = glossary?.doNotTranslate
  const dntTerms = [...(dnt?.brand ?? []), ...(dnt?.vehicleClasses ?? [])]
  if (dntTerms.includes(trimmed)) return true

  return allowlistValues?.has(trimmed) ?? false
}

/** Reads a leaf value at a dot-path (`a.b.c`) from a parsed JSON tree, returning `undefined` if any segment is missing. */
function getAtDotPath(obj, dotPath) {
  return dotPath.split('.').reduce((acc, key) => (acc === undefined || acc === null ? undefined : acc[key]), obj)
}

/** Parses one `*.freeze` file into pattern lines — blank lines and `#`-comments ignored. */
function parseFreezeFile(filePath) {
  const raw = readFileSync(filePath, 'utf8')
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'))
}

/** Reads every `*.freeze` file in `dir` (sorted), returning a flat `{pattern, file}` list — `file` is the origin file, kept for error messages. Returns `[]` if `dir` does not exist. */
export function readFreezePatterns(dir) {
  if (!existsSync(dir)) return []
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.freeze'))
    .sort()
  const patterns = []
  for (const file of files) {
    for (const pattern of parseFreezeFile(path.join(dir, file))) {
      patterns.push({ pattern, file })
    }
  }
  return patterns
}

/**
 * Resolves each freeze pattern to the EN units it selects, using
 * `enumerateEnSources(rootDir)` for the sourceKey -> {sourcePath,
 * targetPathFor} mapping. Throws immediately if a pattern's sourceKey does
 * not resolve to a known EN source (almost certainly a typo). A dotPrefix
 * that matches zero units is not an error here — it is surfaced by the
 * caller (freezeUnits prints per-pattern counts; a 0 count is visible).
 *
 * Returns unit objects `{unitKey, value, sourceKey, source, pattern, file}`
 * — `source` carries `targetPathFor(locale)` for freezeUnits' locale
 * validation pass.
 */
export function selectUnits(patterns, rootDir) {
  const sources = enumerateEnSources(rootDir)
  const sourceByKey = new Map(sources.map((s) => [s.sourceKey, s]))
  const enUnitsCache = new Map() // sourceKey -> flattened EN units[]

  const selected = []
  for (const { pattern, file } of patterns) {
    const sepIdx = pattern.indexOf('::')
    const sourceKey = sepIdx === -1 ? pattern : pattern.slice(0, sepIdx)
    const dotPrefix = sepIdx === -1 ? null : pattern.slice(sepIdx + 2)

    const source = sourceByKey.get(sourceKey)
    if (!source) {
      throw new Error(`i18n-freeze-manifest: unknown sourceKey "${sourceKey}" (pattern "${pattern}" in ${file})`)
    }

    if (!enUnitsCache.has(sourceKey)) {
      const enObj = readEnSource(source.sourcePath)
      enUnitsCache.set(sourceKey, flattenEnSource(enObj, sourceKey))
    }
    const allUnits = enUnitsCache.get(sourceKey)

    const matched =
      dotPrefix === null
        ? allUnits
        : allUnits.filter((u) => {
            const dotPath = u.unitKey.slice(sourceKey.length + 2)
            return dotPath === dotPrefix || dotPath.startsWith(`${dotPrefix}.`)
          })

    for (const unit of matched) {
      selected.push({ ...unit, sourceKey, source, pattern, file })
    }
  }
  return selected
}

/**
 * Validates every selected unit against all 6 locale target files, then
 * writes `{enHash, lastTranslatedAt}` into `manifest.units` for each
 * (mutating `manifest` in place) using a single ISO timestamp for the
 * whole batch. Duplicate unitKeys across patterns are frozen once (first
 * occurrence's pattern/file wins for reporting).
 *
 * Throws — listing EVERY violation, writing NOTHING — if any selected
 * unit's locale value is missing or byte-identical to EN (unless the EN
 * value is DNT-only). Validation always runs to completion before any
 * write, so a partial-violation batch never partially freezes.
 *
 * Returns `{frozen, byPattern}` — `byPattern` maps each pattern string to
 * the count of units it froze (for CLI reporting).
 */
export function freezeUnits(units, manifest, glossary, now = new Date().toISOString()) {
  const byUnitKey = new Map()
  for (const unit of units) {
    if (!byUnitKey.has(unit.unitKey)) byUnitKey.set(unit.unitKey, unit)
  }
  const uniqueUnits = [...byUnitKey.values()]

  const allowlistValues = loadLegitimatelyIdenticalAllowlist()
  const violations = []
  const localeFileCache = new Map() // targetPath -> parsed JSON, or null if missing

  for (const unit of uniqueUnits) {
    const dotPath = unit.unitKey.slice(unit.sourceKey.length + 2)
    for (const locale of PHASE_72_LOCALES) {
      const targetPath = unit.source.targetPathFor(locale)
      if (!localeFileCache.has(targetPath)) {
        localeFileCache.set(targetPath, existsSync(targetPath) ? JSON.parse(readFileSync(targetPath, 'utf8')) : null)
      }
      const localeObj = localeFileCache.get(targetPath)
      if (localeObj === null) {
        violations.push(`${unit.unitKey}: locale file missing for '${locale}' (${targetPath})`)
        continue
      }
      const localeValue = getAtDotPath(localeObj, dotPath)
      if (localeValue === undefined) {
        violations.push(`${unit.unitKey}: unit missing in '${locale}' (${targetPath})`)
        continue
      }
      const identical = JSON.stringify(localeValue) === JSON.stringify(unit.value)
      if (identical && !isLegitimatelyIdenticalValue(unit.value, glossary, allowlistValues)) {
        violations.push(`${unit.unitKey}: identical to EN value in '${locale}' (not DNT) — refusing to freeze as translated`)
      }
    }
  }

  if (violations.length > 0) {
    throw new Error(
      `i18n-freeze-manifest: refusing to freeze — ${violations.length} violation(s):\n` +
        violations.map((v) => `  - ${v}`).join('\n')
    )
  }

  /** @type {Record<string, number>} */
  const byPattern = {}
  for (const unit of uniqueUnits) {
    manifest.units[unit.unitKey] = { enHash: sha256(unit.value), lastTranslatedAt: now }
    byPattern[unit.pattern] = (byPattern[unit.pattern] ?? 0) + 1
  }
  return { frozen: uniqueUnits.length, byPattern }
}

/**
 * `--verify` mode: re-derives every pattern-selected unit's current EN
 * sha256 and confirms it equals the manifest's recorded `enHash` — proving
 * the EN source has not changed since the freeze (and that the unit was
 * frozen at all). Never writes anything. Returns `{ok, mismatches, checked}`.
 */
export function verifyFrozen(patterns, manifest, rootDir) {
  const units = selectUnits(patterns, rootDir)
  const byUnitKey = new Map()
  for (const unit of units) if (!byUnitKey.has(unit.unitKey)) byUnitKey.set(unit.unitKey, unit)

  const mismatches = []
  for (const unit of byUnitKey.values()) {
    const recorded = manifest.units[unit.unitKey]
    if (!recorded) {
      mismatches.push(`${unit.unitKey}: not frozen in manifest`)
      continue
    }
    const currentHash = sha256(unit.value)
    if (recorded.enHash !== currentHash) {
      mismatches.push(`${unit.unitKey}: enHash mismatch — EN source changed since freeze`)
    }
  }
  return { ok: mismatches.length === 0, mismatches, checked: byUnitKey.size }
}

async function main(argv = process.argv.slice(2)) {
  const dirIdx = argv.indexOf('--dir')
  const freezeDir = dirIdx !== -1 ? argv[dirIdx + 1] : DEFAULT_FREEZE_DIR
  const verifyMode = argv.includes('--verify')
  const rootDir = process.cwd()

  const patterns = readFreezePatterns(path.join(rootDir, freezeDir))
  if (patterns.length === 0) {
    console.error(`✗ i18n-freeze-manifest: no *.freeze pattern lines found in ${freezeDir}`)
    process.exit(1)
  }

  const manifestPath = path.join(rootDir, 'i18n/translation-manifest.json')
  const manifest = loadManifest(manifestPath)

  if (verifyMode) {
    const result = verifyFrozen(patterns, manifest, rootDir)
    if (result.ok) {
      console.log(`✓ i18n-freeze-manifest --verify: PASSED — ${result.checked} frozen unit(s) match current EN`)
      return
    }
    for (const mismatch of result.mismatches) console.error(`✗ i18n-freeze-manifest --verify: ${mismatch}`)
    console.error('✗ i18n-freeze-manifest --verify: FAILED')
    process.exit(1)
  }

  const glossary = loadGlossary()
  const units = selectUnits(patterns, rootDir)
  const { frozen, byPattern } = freezeUnits(units, manifest, glossary)
  writeManifest(manifestPath, manifest)

  console.log(`✓ i18n-freeze-manifest: froze ${frozen} unit(s) across ${Object.keys(byPattern).length} pattern(s):`)
  for (const [pattern, count] of Object.entries(byPattern)) {
    console.log(`  ${count.toString().padStart(3)}  ${pattern}`)
  }
}

const isMainModule = process.argv[1] && import.meta.url === `file://${process.argv[1]}`
if (isMainModule) {
  main().catch((err) => {
    console.error('✗ i18n-freeze-manifest failed:', err.message)
    process.exit(1)
  })
}

export { main }
