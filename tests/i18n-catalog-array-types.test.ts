/**
 * Phase 72 — regression: catalog array/object leaves must keep their type.
 *
 * Bug (found by phase verification): the short-string batch translator
 * JSON-stringifies a non-string catalog leaf (e.g. `Nav.items`,
 * `FeatureStrip.pillars`) into the prompt, so the model returns its
 * translation as a JSON *string*. That string was stored verbatim, leaving
 * `messages/<locale>.json` with a stringified array where an array belongs —
 * crashing every component that `.map()`/indexes it (FeatureStrip, Nav, Fleet,
 * Services, Footer, HeroTypewriter, HowItWorks, TripTypeTabs).
 *
 * Fix: `coerceToSourceType` parses a non-string leaf's translation back to its
 * source container type; `batchShortStrings` applies it; `checkValueTypeParity`
 * (wired into `--check`) fails the pipeline if any locale leaf type drifts.
 */
import { describe, expect, it } from 'vitest'
import { batchShortStrings, coerceToSourceType } from '../scripts/lib/i18n-surfaces.mjs'
import { checkValueTypeParity } from '../scripts/lib/i18n-qa-report.mjs'

describe('coerceToSourceType', () => {
  it('keeps a string leaf as a string', () => {
    expect(coerceToSourceType('Home', 'Главная')).toBe('Главная')
  })

  it('parses a JSON-stringified array back to an array matching the EN source', () => {
    const out = coerceToSourceType(['Services', 'Fleet'], '["Услуги","Автопарк"]')
    expect(Array.isArray(out)).toBe(true)
    expect(out).toEqual(['Услуги', 'Автопарк'])
  })

  it('parses a JSON-stringified object leaf back to an object', () => {
    const out = coerceToSourceType({ a: 'x' }, '{"a":"икс"}')
    expect(out).toEqual({ a: 'икс' })
  })

  it('fails closed (returns the raw string) when the translation is not valid JSON', () => {
    expect(coerceToSourceType(['a'], 'не json')).toBe('не json')
  })

  it('fails closed when the parsed type does not match the EN container type', () => {
    // EN is an array but the model returned a JSON string scalar → keep raw for the verifier to flag
    expect(coerceToSourceType(['a'], '"просто строка"')).toBe('"просто строка"')
  })
})

describe('batchShortStrings preserves non-string leaf types', () => {
  it('restores an array-typed catalog unit instead of storing a stringified array', async () => {
    const units = [
      { unitKey: 'messages/en.json::Nav.items', value: ['Services', 'Fleet', 'Contact'] },
      { unitKey: 'messages/en.json::Nav.home', value: 'Home' },
    ]
    // Mock translator mirrors the real one: non-string values arrive JSON-stringified.
    const translateBatch = async (chunk: { value: unknown }[]) =>
      chunk.map((u) => (typeof u.value === 'string' ? `RU:${u.value}` : JSON.stringify(u.value)))

    const results = (await batchShortStrings({ units, locale: 'ru', glossary: {}, translateBatch })) as Record<string, unknown>

    expect(Array.isArray(results['messages/en.json::Nav.items'])).toBe(true)
    expect(results['messages/en.json::Nav.items']).toEqual(['Services', 'Fleet', 'Contact'])
    expect(results['messages/en.json::Nav.home']).toBe('RU:Home')
  })
})

describe('checkValueTypeParity', () => {
  it('flags an array leaf stored as a string', () => {
    const en = { Nav: { items: ['a', 'b'] }, title: 'Hi' }
    const loc = { Nav: { items: '["а","б"]' }, title: 'Привет' }
    const mismatches = checkValueTypeParity(en, loc)
    expect(mismatches).toHaveLength(1)
    expect(mismatches[0]).toContain('Nav.items')
    expect(mismatches[0]).toContain('en=array')
    expect(mismatches[0]).toContain('locale=string')
  })

  it('passes when every leaf type matches', () => {
    const en = { Nav: { items: ['a', 'b'] }, title: 'Hi' }
    const loc = { Nav: { items: ['а', 'б'] }, title: 'Привет' }
    expect(checkValueTypeParity(en, loc)).toEqual([])
  })

  it('ignores keys missing from the locale (completeness check owns those)', () => {
    const en = { a: ['x'], b: 'y' }
    const loc = { a: ['икс'] } // b missing — not a type mismatch
    expect(checkValueTypeParity(en, loc)).toEqual([])
  })
})
