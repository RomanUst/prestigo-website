/**
 * Phase 72, Plan 01 — TRACER: manifest change-detection, glossary
 * validation, and end-to-end idempotency, all against a mocked translator.
 * No test in this file calls the real Anthropic API or requires
 * ANTHROPIC_API_KEY.
 */
import { describe, expect, it, vi } from 'vitest'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildSystemPrompt, loadGlossary } from '../scripts/lib/i18n-glossary.mjs'
import {
  flattenEnSource,
  isEmptyValue,
  loadManifest,
  sha256,
  unitsNeedingTranslation,
  writeManifest,
} from '../scripts/lib/i18n-manifest.mjs'
import { translateSource } from '../scripts/i18n-translate.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const FIXTURES_DIR = join(__dirname, 'fixtures/i18n')

function setupFixtureCopy() {
  const dir = mkdtempSync(join(tmpdir(), 'i18n-tracer-'))
  mkdirSync(join(dir, 'messages'), { recursive: true })
  copyFileSync(join(FIXTURES_DIR, 'messages/en.json'), join(dir, 'messages/en.json'))
  copyFileSync(join(FIXTURES_DIR, 'messages/ru.json'), join(dir, 'messages/ru.json'))
  return dir
}

describe('glossary', () => {
  it('loads and validates the real i18n/glossary.json (D-06/D-07)', () => {
    const glossary = loadGlossary()
    expect(glossary.locales.ru.formality).toBe('formal')
    expect(glossary.locales.es.dialect).toBe('es-ES')
    expect(glossary.doNotTranslate.brand).toContain('Prestigo')
  })

  it('throws a descriptive error on a malformed glossary (fail-loud, V5)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'i18n-glossary-bad-'))
    const badPath = join(dir, 'bad-glossary.json')
    writeFileSync(badPath, JSON.stringify({ doNotTranslate: {} }), 'utf8')
    expect(() => loadGlossary(badPath)).toThrow(/i18n-glossary/)
    rmSync(dir, { recursive: true, force: true })
  })

  it('throws on invalid JSON (fail-loud)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'i18n-glossary-badjson-'))
    const badPath = join(dir, 'bad-glossary.json')
    writeFileSync(badPath, '{ not valid json', 'utf8')
    expect(() => loadGlossary(badPath)).toThrow(/i18n-glossary/)
    rmSync(dir, { recursive: true, force: true })
  })

  it('buildSystemPrompt(glossary, "ru") includes DNT brand terms, the ru tone directive, and all 4 ru plural categories', () => {
    const glossary = loadGlossary()
    const prompt = buildSystemPrompt(glossary, 'ru')
    for (const brandTerm of glossary.doNotTranslate.brand) {
      expect(prompt).toContain(brandTerm)
    }
    expect(prompt).toContain('«Вы»')
    for (const category of ['one', 'few', 'many', 'other']) {
      expect(prompt).toContain(category)
    }
  })
})

describe('sha256', () => {
  it('is deterministic and prefixed', () => {
    expect(sha256('hello')).toBe(sha256('hello'))
    expect(sha256('hello')).toMatch(/^sha256:/)
    expect(sha256('hello')).not.toBe(sha256('hello!'))
  })
})

describe('flattenEnSource', () => {
  it('flattens nested leaf keys into dot-path unit keys', () => {
    const units = flattenEnSource({ Nav: { signIn: 'Sign in' } }, 'messages/en.json')
    expect(units).toEqual([{ unitKey: 'messages/en.json::Nav.signIn', value: 'Sign in' }])
  })

  it('tracks two units sharing an identical EN value independently, by distinct unitKeys', () => {
    const units = flattenEnSource(
      { Footer: { copyright: 'All rights reserved', legal: 'All rights reserved' } },
      'messages/en.json'
    )
    expect(units.map((u) => u.unitKey)).toEqual([
      'messages/en.json::Footer.copyright',
      'messages/en.json::Footer.legal',
    ])
    expect(units[0].value).toBe(units[1].value)
    expect(units[0].unitKey).not.toBe(units[1].unitKey)
  })

  it('does not fabricate a leaf for a structurally-empty object container', () => {
    const units = flattenEnSource({ Empty: {} }, 'messages/en.json')
    expect(units).toEqual([])
  })

  it('treats an empty array as a single leaf unit, not exploded per-element', () => {
    const units = flattenEnSource({ List: [] }, 'messages/en.json')
    expect(units).toEqual([{ unitKey: 'messages/en.json::List', value: [] }])
  })
})

describe('isEmptyValue', () => {
  it('treats empty and whitespace-only strings as empty', () => {
    expect(isEmptyValue('')).toBe(true)
    expect(isEmptyValue('   ')).toBe(true)
    expect(isEmptyValue('hello')).toBe(false)
  })

  it('treats empty arrays/objects as empty, non-empty ones as not', () => {
    expect(isEmptyValue([])).toBe(true)
    expect(isEmptyValue({})).toBe(true)
    expect(isEmptyValue(['x'])).toBe(false)
    expect(isEmptyValue({ a: 1 })).toBe(false)
  })
})

describe('unitsNeedingTranslation (D-04/D-05)', () => {
  it('selects a unit whose unitKey is absent from the manifest', () => {
    const enUnits = [{ unitKey: 'a::x', value: 'hello' }]
    const manifest = { version: 1, units: {} }
    expect(unitsNeedingTranslation(enUnits, manifest)).toEqual(enUnits)
  })

  it('selects a unit whose EN sha256 differs from the recorded enHash', () => {
    const enUnits = [{ unitKey: 'a::x', value: 'hello v2' }]
    const manifest = { version: 1, units: { 'a::x': { enHash: sha256('hello v1'), lastTranslatedAt: 't' } } }
    expect(unitsNeedingTranslation(enUnits, manifest)).toEqual(enUnits)
  })

  it('SKIPS a unit whose EN sha256 equals the recorded enHash (D-05)', () => {
    const enUnits = [{ unitKey: 'a::x', value: 'hello' }]
    const manifest = { version: 1, units: { 'a::x': { enHash: sha256('hello'), lastTranslatedAt: 't' } } }
    expect(unitsNeedingTranslation(enUnits, manifest)).toEqual([])
  })
})

describe('translateSource — tracer end-to-end (mocked translator, fixture corpus)', () => {
  it('translates newly-selected units, skips the hash-matched hand-edited unit untouched, and issues no translator call for the whitespace-only unit', async () => {
    const dir = setupFixtureCopy()
    try {
      const sourcePath = join(dir, 'messages/en.json')
      const targetPath = join(dir, 'messages/ru.json')
      const manifestPath = join(dir, 'translation-manifest.json')

      // Simulate a prior run: Nav.signIn was already translated + hand-edited by
      // the owner, and its manifest hash matches the current (unchanged) EN value.
      writeManifest(manifestPath, {
        version: 1,
        units: {
          'messages/en.json::Nav.signIn': { enHash: sha256('Sign in'), lastTranslatedAt: '2026-01-01T00:00:00Z' },
        },
      })

      const mockTranslator = vi.fn(async (unit: { unitKey: string; value: unknown }, ctx: { locale: string }) => {
        return `[${ctx.locale.toUpperCase()}] ${unit.value}`
      })

      const glossary = loadGlossary()
      const result = await translateSource({
        sourcePath,
        targetPath,
        manifestPath,
        sourceKey: 'messages/en.json',
        locale: 'ru',
        glossary,
        translator: mockTranslator,
      })

      const calledUnitKeys = mockTranslator.mock.calls.map((call: unknown[]) => (call[0] as { unitKey: string }).unitKey)
      expect(calledUnitKeys).not.toContain('messages/en.json::Nav.signIn') // D-05 skip — no API call
      expect(calledUnitKeys).not.toContain('messages/en.json::Nav.tagline') // whitespace-only — no API call
      expect(calledUnitKeys.sort()).toEqual(
        ['messages/en.json::Nav.bookNow', 'messages/en.json::Footer.copyright', 'messages/en.json::Footer.legal'].sort()
      )

      const output = JSON.parse(readFileSync(targetPath, 'utf8'))
      expect(output.Nav.signIn).toBe('Войти') // hand-edit preserved, untouched (D-05)
      expect(output.Nav.bookNow).toBe('[RU] Book now') // newly translated
      expect(output.Nav.tagline).toBe('   ') // empty unit copied verbatim, not fabricated
      expect(output.Footer.copyright).toBe('[RU] All rights reserved')
      expect(output.Footer.legal).toBe('[RU] All rights reserved')
      // Key order mirrors the EN source exactly.
      expect(Object.keys(output)).toEqual(['Nav', 'Footer'])
      expect(Object.keys(output.Nav)).toEqual(['signIn', 'bookNow', 'tagline'])

      // Manifest gains an entry only for the units that were selected+written this run
      // (the pre-seeded Nav.signIn entry survives untouched, not re-added as "new").
      const manifest = loadManifest(manifestPath)
      expect(Object.keys(manifest.units).sort()).toEqual(
        [
          'messages/en.json::Nav.signIn',
          'messages/en.json::Nav.bookNow',
          'messages/en.json::Nav.tagline',
          'messages/en.json::Footer.copyright',
          'messages/en.json::Footer.legal',
        ].sort()
      )
      expect(result.translatorCalls).toBe(3)
      expect(result.emptySkips).toBe(1)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('is idempotent: a second run against unchanged EN yields a byte-identical target file and manifest, with no new translator calls', async () => {
    const dir = setupFixtureCopy()
    try {
      const sourcePath = join(dir, 'messages/en.json')
      const targetPath = join(dir, 'messages/ru.json')
      const manifestPath = join(dir, 'translation-manifest.json')
      const glossary = loadGlossary()
      const mockTranslator = vi.fn(async (unit: { value: unknown }, ctx: { locale: string }) => `[${ctx.locale.toUpperCase()}] ${unit.value}`)

      await translateSource({ sourcePath, targetPath, manifestPath, sourceKey: 'messages/en.json', locale: 'ru', glossary, translator: mockTranslator })
      const firstOutput = readFileSync(targetPath, 'utf8')
      const firstManifest = readFileSync(manifestPath, 'utf8')
      const callsAfterFirstRun = mockTranslator.mock.calls.length
      expect(callsAfterFirstRun).toBeGreaterThan(0)

      await translateSource({ sourcePath, targetPath, manifestPath, sourceKey: 'messages/en.json', locale: 'ru', glossary, translator: mockTranslator })
      const secondOutput = readFileSync(targetPath, 'utf8')
      const secondManifest = readFileSync(manifestPath, 'utf8')

      expect(secondOutput).toBe(firstOutput)
      expect(secondManifest).toBe(firstManifest)
      expect(mockTranslator.mock.calls.length).toBe(callsAfterFirstRun) // zero new calls on the unchanged re-run

      // EN fixture (both the committed original and this run's copy) must never be mutated.
      const originalEn = readFileSync(join(FIXTURES_DIR, 'messages/en.json'), 'utf8')
      const copiedEnAfterRuns = readFileSync(sourcePath, 'utf8')
      expect(copiedEnAfterRuns).toBe(originalEn)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
