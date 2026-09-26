/**
 * Phase 75, Plan 18 — TDD for scripts/i18n-freeze-manifest.mjs (D-08).
 *
 * Every case runs against a temp-dir fixture (a `content/pages/en/test.json`
 * + 6 locale siblings), never the real repo tree or the real
 * i18n/translation-manifest.json — the real-repo freeze run itself is a CLI
 * invocation in the plan's <action>, verified separately by `--verify`.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { loadGlossary } from '../scripts/lib/i18n-glossary.mjs'
import { freezeUnits, readFreezePatterns, selectUnits, verifyFrozen } from '../scripts/i18n-freeze-manifest.mjs'

const LOCALES = ['ru', 'es', 'fr', 'ar', 'hi', 'zh']

type Manifest = { version: number; units: Record<string, { enHash: string; lastTranslatedAt: string }> }

/** A fresh empty manifest — explicitly typed so `manifest.units[key]` indexing type-checks. */
function makeEmptyManifest(): Manifest {
  return { version: 1, units: {} }
}

type LocaleOverride = { b?: string; c?: string; omitB?: boolean }
type FixtureOptions = {
  enB?: string
  enC?: string
  localeOverrides?: Record<string, LocaleOverride>
  omitLocaleFiles?: string[]
}

/** Builds a temp rootDir with `content/pages/en/test.json` = {a:{b,c}} plus 6 locale siblings, per `overrides[locale]`. */
function makeFixtureRoot({ enB = 'Hello world', enC = 'PRESTIGO', localeOverrides = {}, omitLocaleFiles = [] }: FixtureOptions = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'i18n-freeze-'))
  mkdirSync(join(dir, 'content/pages/en'), { recursive: true })
  writeFileSync(join(dir, 'content/pages/en/test.json'), JSON.stringify({ a: { b: enB, c: enC } }), 'utf8')

  for (const locale of LOCALES) {
    if (omitLocaleFiles.includes(locale)) continue
    mkdirSync(join(dir, `content/pages/${locale}`), { recursive: true })
    const override: LocaleOverride = localeOverrides[locale] ?? {}
    const b = 'b' in override ? override.b : `[${locale.toUpperCase()}] ${enB}`
    const c = 'c' in override ? override.c : enC // DNT — identical by default
    const value: { a: { b?: string; c?: string } } = { a: {} }
    if (!override.omitB) value.a.b = b
    value.a.c = c
    writeFileSync(join(dir, `content/pages/${locale}/test.json`), JSON.stringify(value), 'utf8')
  }
  return dir
}

describe('readFreezePatterns', () => {
  it('parses non-blank, non-comment lines across every *.freeze file in a dir, sorted', () => {
    const dir = mkdtempSync(join(tmpdir(), 'i18n-freeze-patterns-'))
    try {
      writeFileSync(join(dir, '75-07.freeze'), '# comment\n\ncontent/pages/en/second.json\n', 'utf8')
      writeFileSync(join(dir, '75-06.freeze'), 'content/pages/en/first.json::a\n# trailing comment\n', 'utf8')
      const patterns = readFreezePatterns(dir)
      expect(patterns.map((p) => p.pattern)).toEqual(['content/pages/en/first.json::a', 'content/pages/en/second.json'])
      expect(patterns.map((p) => p.file)).toEqual(['75-06.freeze', '75-07.freeze'])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('returns [] for a non-existent dir', () => {
    expect(readFreezePatterns(join(tmpdir(), 'i18n-freeze-does-not-exist'))).toEqual([])
  })
})

describe('selectUnits — pattern resolution (whole path segments only)', () => {
  it('a bare sourceKey selects every unit in that source', () => {
    const dir = makeFixtureRoot()
    try {
      const units = selectUnits([{ pattern: 'content/pages/en/test.json', file: 'x.freeze' }], dir)
      expect(units.map((u) => u.unitKey).sort()).toEqual(['content/pages/en/test.json::a.b', 'content/pages/en/test.json::a.c'])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it("'<src>::a' selects a.b and a.c", () => {
    const dir = makeFixtureRoot()
    try {
      const units = selectUnits([{ pattern: 'content/pages/en/test.json::a', file: 'x.freeze' }], dir)
      expect(units.map((u) => u.unitKey).sort()).toEqual(['content/pages/en/test.json::a.b', 'content/pages/en/test.json::a.c'])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it("'<src>::a.b' selects only a.b", () => {
    const dir = makeFixtureRoot()
    try {
      const units = selectUnits([{ pattern: 'content/pages/en/test.json::a.b', file: 'x.freeze' }], dir)
      expect(units.map((u) => u.unitKey)).toEqual(['content/pages/en/test.json::a.b'])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it("'<src>::a.bx' selects nothing — prefix matches whole path segments only, not a string prefix", () => {
    const dir = makeFixtureRoot()
    try {
      const units = selectUnits([{ pattern: 'content/pages/en/test.json::a.bx', file: 'x.freeze' }], dir)
      expect(units).toEqual([])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('throws on an unknown sourceKey (typo protection)', () => {
    const dir = makeFixtureRoot()
    try {
      expect(() => selectUnits([{ pattern: 'content/pages/en/nope.json', file: 'x.freeze' }], dir)).toThrow(/unknown sourceKey/)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('freezeUnits — validation + write (D-08)', () => {
  it('freezes both units: a.b is translated in all 6 locales, a.c is DNT-only-identical ("PRESTIGO")', () => {
    const dir = makeFixtureRoot()
    try {
      const glossary = loadGlossary()
      const units = selectUnits([{ pattern: 'content/pages/en/test.json', file: 'x.freeze' }], dir)
      const manifest = makeEmptyManifest()
      const result = freezeUnits(units, manifest, glossary, '2026-09-26T00:00:00.000Z')

      expect(result.frozen).toBe(2)
      expect(result.byPattern['content/pages/en/test.json']).toBe(2)
      expect(Object.keys(manifest.units).sort()).toEqual(['content/pages/en/test.json::a.b', 'content/pages/en/test.json::a.c'])
      expect(manifest.units['content/pages/en/test.json::a.b'].lastTranslatedAt).toBe('2026-09-26T00:00:00.000Z')
      expect(manifest.units['content/pages/en/test.json::a.b'].enHash).toMatch(/^sha256:/)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('allows a purely-numeric identical value (a language-agnostic code, e.g. "404")', () => {
    const dir = makeFixtureRoot({
      enB: '404',
      localeOverrides: Object.fromEntries(LOCALES.map((l) => [l, { b: '404' }])),
    })
    try {
      const glossary = loadGlossary()
      const units = selectUnits([{ pattern: 'content/pages/en/test.json::a.b', file: 'x.freeze' }], dir)
      const manifest = makeEmptyManifest()
      const result = freezeUnits(units, manifest, glossary)
      expect(result.frozen).toBe(1)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('allows a value already registered in scripts/qa/en_leak_allowlist.json (place name with no distinct exonym, e.g. "Austria")', () => {
    const dir = makeFixtureRoot({
      enB: 'Austria',
      localeOverrides: Object.fromEntries(LOCALES.map((l) => [l, { b: 'Austria' }])),
    })
    try {
      const glossary = loadGlossary()
      const units = selectUnits([{ pattern: 'content/pages/en/test.json::a.b', file: 'x.freeze' }], dir)
      const manifest = makeEmptyManifest()
      const result = freezeUnits(units, manifest, glossary)
      expect(result.frozen).toBe(1)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('refuses (throws, naming unit + locale) when a locale value equals the EN value and is not DNT — nothing written', () => {
    const dir = makeFixtureRoot({ localeOverrides: { ru: { b: 'Hello world' } } }) // untranslated stub
    try {
      const glossary = loadGlossary()
      const units = selectUnits([{ pattern: 'content/pages/en/test.json', file: 'x.freeze' }], dir)
      const manifest = makeEmptyManifest()

      let threw = false
      try {
        freezeUnits(units, manifest, glossary)
      } catch (err) {
        threw = true
        expect((err as Error).message).toContain('a.b')
        expect((err as Error).message).toContain("'ru'")
        expect((err as Error).message).toContain('identical to EN')
      }
      expect(threw).toBe(true)
      expect(manifest.units).toEqual({}) // nothing written
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('refuses (throws, naming unit + locale) when a locale file is missing the unit — nothing written', () => {
    const dir = makeFixtureRoot({ localeOverrides: { hi: { omitB: true } } })
    try {
      const glossary = loadGlossary()
      const units = selectUnits([{ pattern: 'content/pages/en/test.json', file: 'x.freeze' }], dir)
      const manifest = makeEmptyManifest()

      let threw = false
      try {
        freezeUnits(units, manifest, glossary)
      } catch (err) {
        threw = true
        expect((err as Error).message).toContain('a.b')
        expect((err as Error).message).toContain("'hi'")
        expect((err as Error).message).toContain('missing')
      }
      expect(threw).toBe(true)
      expect(manifest.units).toEqual({})
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('refuses (throws, naming the locale file) when a whole locale file is missing — nothing written', () => {
    const dir = makeFixtureRoot({ omitLocaleFiles: ['zh'] })
    try {
      const glossary = loadGlossary()
      const units = selectUnits([{ pattern: 'content/pages/en/test.json', file: 'x.freeze' }], dir)
      const manifest = makeEmptyManifest()

      let threw = false
      try {
        freezeUnits(units, manifest, glossary)
      } catch (err) {
        threw = true
        expect((err as Error).message).toContain("'zh'")
        expect((err as Error).message).toContain('missing')
      }
      expect(threw).toBe(true)
      expect(manifest.units).toEqual({})
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('dedupes a unit selected by two overlapping patterns, freezing it once', () => {
    const dir = makeFixtureRoot()
    try {
      const glossary = loadGlossary()
      const units = [
        ...selectUnits([{ pattern: 'content/pages/en/test.json::a', file: 'p1.freeze' }], dir),
        ...selectUnits([{ pattern: 'content/pages/en/test.json::a.b', file: 'p2.freeze' }], dir),
      ]
      const manifest = makeEmptyManifest()
      const result = freezeUnits(units, manifest, glossary)
      expect(result.frozen).toBe(2) // a.b + a.c, not double-counted for a.b
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('verifyFrozen — --verify semantics', () => {
  it('exits ok after a freeze', () => {
    const dir = makeFixtureRoot()
    try {
      const glossary = loadGlossary()
      const patterns = [{ pattern: 'content/pages/en/test.json', file: 'x.freeze' }]
      const units = selectUnits(patterns, dir)
      const manifest = makeEmptyManifest()
      freezeUnits(units, manifest, glossary)

      const result = verifyFrozen(patterns, manifest, dir)
      expect(result.ok).toBe(true)
      expect(result.checked).toBe(2)
      expect(result.mismatches).toEqual([])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('fails after the EN value of a frozen unit changes', () => {
    const dir = makeFixtureRoot()
    try {
      const glossary = loadGlossary()
      const patterns = [{ pattern: 'content/pages/en/test.json', file: 'x.freeze' }]
      const units = selectUnits(patterns, dir)
      const manifest = makeEmptyManifest()
      freezeUnits(units, manifest, glossary)

      // Simulate the EN source changing after the freeze.
      writeFileSync(join(dir, 'content/pages/en/test.json'), JSON.stringify({ a: { b: 'Hello world v2', c: 'PRESTIGO' } }), 'utf8')

      const result = verifyFrozen(patterns, manifest, dir)
      expect(result.ok).toBe(false)
      expect(result.mismatches[0]).toContain('a.b')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
