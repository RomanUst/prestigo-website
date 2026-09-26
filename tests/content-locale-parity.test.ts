/**
 * Phase 75, Plan 18 — content/locale parity backstop (D-08 prerequisite,
 * pre-deploy gate D-15).
 *
 * Proves every `content/pages/en/**\/*.json` (recursive, including nested
 * `services/`, `book/`, `authors/`) and `content/routes/en/*.json` has all 6
 * locale siblings (ru/es/fr/ar/hi/zh) with an identical flattened key set,
 * matching leaf value types, and equal array lengths — the exact structural
 * invariant both the freeze tool (Task 1) and the AI translation pipeline
 * (scripts/i18n-translate.mjs) depend on. A missing sibling file, a dropped
 * key, a type drift (array stored as string — the Phase 72 bug this repo
 * already hit once, see tests/i18n-catalog-array-types.test.ts), or an
 * array whose length differs from EN (e.g. a locale missing an FAQ item) is
 * a structural regression this test catches deterministically, independent
 * of the freeze tool's own EN-identical-value check.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { flattenEnSource } from '../scripts/lib/i18n-manifest.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const LOCALES = ['ru', 'es', 'fr', 'ar', 'hi', 'zh']

/** Recursively lists `.json` files under `dir`, relative to `baseDir`, posix-separated, sorted. Mirrors scripts/lib/i18n-surfaces.mjs's walkJsonFilesRecursive. */
function walkJsonFilesRecursive(dir: string, baseDir: string = dir): string[] {
  const results: string[] = []
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

/** Structural type of a leaf value for parity comparison. */
function leafType(v: unknown): string {
  if (v === null) return 'null'
  if (Array.isArray(v)) return 'array'
  return typeof v
}

type ParityResult = {
  missing: string[]
  extra: string[]
  typeMismatches: string[]
  arrayLengthMismatches: string[]
}

/** Compares an EN source's flattened leaves against a locale's, by dot-path (sourceKey prefix stripped by using the same sourceKey for both flattens, so keys line up 1:1). */
function compareParity(enObj: unknown, localeObj: unknown, sourceKey: string): ParityResult {
  const enUnits = flattenEnSource(enObj, sourceKey)
  const localeUnits = flattenEnSource(localeObj, sourceKey)
  const enByKey = new Map(enUnits.map((u: { unitKey: string; value: unknown }) => [u.unitKey, u.value]))
  const localeByKey = new Map(localeUnits.map((u: { unitKey: string; value: unknown }) => [u.unitKey, u.value]))

  const missing = [...enByKey.keys()].filter((k) => !localeByKey.has(k)).sort()
  const extra = [...localeByKey.keys()].filter((k) => !enByKey.has(k)).sort()
  const typeMismatches: string[] = []
  const arrayLengthMismatches: string[] = []

  for (const key of enByKey.keys()) {
    if (!localeByKey.has(key)) continue
    const enValue = enByKey.get(key)
    const localeValue = localeByKey.get(key)
    const enType = leafType(enValue)
    const localeType = leafType(localeValue)
    if (enType !== localeType) {
      typeMismatches.push(`${key} (en=${enType} locale=${localeType})`)
      continue
    }
    if (enType === 'array' && (enValue as unknown[]).length !== (localeValue as unknown[]).length) {
      arrayLengthMismatches.push(`${key} (en=${(enValue as unknown[]).length} locale=${(localeValue as unknown[]).length})`)
    }
  }

  return { missing, extra, typeMismatches, arrayLengthMismatches }
}

type ContentSource = { sourceKey: string; enPath: string; targetPathFor: (locale: string) => string }

function enSources(): ContentSource[] {
  const sources: ContentSource[] = []

  const pagesDir = path.join(ROOT, 'content/pages/en')
  for (const rel of walkJsonFilesRecursive(pagesDir)) {
    sources.push({
      sourceKey: `content/pages/en/${rel}`,
      enPath: path.join(pagesDir, rel),
      targetPathFor: (locale) => path.join(ROOT, `content/pages/${locale}/${rel}`),
    })
  }

  const routesDir = path.join(ROOT, 'content/routes/en')
  const routeFiles = readdirSync(routesDir)
    .filter((f) => f.endsWith('.json'))
    .sort()
  for (const file of routeFiles) {
    sources.push({
      sourceKey: `content/routes/en/${file}`,
      enPath: path.join(routesDir, file),
      targetPathFor: (locale) => path.join(ROOT, `content/routes/${locale}/${file}`),
    })
  }

  return sources
}

describe('content/locale parity — every content JSON has all 6 locale siblings with identical structure', () => {
  const sources = enSources()

  it('discovers every known content surface (sanity check against an empty/misconfigured walk)', () => {
    // 22 content/pages/en/**/*.json (incl. services/, book/, authors/) + 30 content/routes/en/*.json at time of writing.
    expect(sources.length).toBeGreaterThanOrEqual(50)
  })

  for (const source of sources) {
    describe(source.sourceKey, () => {
      for (const locale of LOCALES) {
        it(`${locale} sibling exists with identical key set, types, and array lengths`, () => {
          const targetPath = source.targetPathFor(locale)
          expect(existsSync(targetPath), `missing locale file: ${targetPath}`).toBe(true)

          const enObj = JSON.parse(readFileSync(source.enPath, 'utf8'))
          const localeObj = JSON.parse(readFileSync(targetPath, 'utf8'))
          const { missing, extra, typeMismatches, arrayLengthMismatches } = compareParity(enObj, localeObj, source.sourceKey)

          expect(missing, `missing keys in ${locale}: ${missing.join(', ')}`).toEqual([])
          expect(extra, `extra keys in ${locale}: ${extra.join(', ')}`).toEqual([])
          expect(typeMismatches, `type mismatches in ${locale}: ${typeMismatches.join('; ')}`).toEqual([])
          expect(arrayLengthMismatches, `array length mismatches in ${locale}: ${arrayLengthMismatches.join('; ')}`).toEqual([])
        })
      }
    })
  }
})
