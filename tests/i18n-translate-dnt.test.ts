/**
 * Phase 72, Plan 02 — DNT / ICU-variable / rich-tag / RU-plural
 * preservation verifier (fail-closed, TDD). Every real EN token used below
 * is copied verbatim from `messages/en.json` (see 72-02-PLAN.md read_first:
 * Booking.dayCard.hoursOption, Booking.summaryBlock.classPax,
 * CookieBanner.consentBody).
 */
import { describe, expect, it } from 'vitest'
import enMessages from '../messages/en.json'
import { loadGlossary } from '../scripts/lib/i18n-glossary.mjs'
import {
  extractIcuTokens,
  extractRichTags,
  verifyDntPreserved,
  verifyPluralCategories,
} from '../scripts/lib/i18n-verify.mjs'

const glossary = loadGlossary()

const EN_HOURS_OPTION = enMessages.Booking.dayCard.hoursOption // "{count, plural, one {# hour} other {# hours}}"
const EN_CLASS_PAX = enMessages.Booking.summaryBlock.classPax // "{className} · {passengers, plural, one {# passenger} other {# passengers}}"
const EN_CONSENT_BODY = enMessages.CookieBanner.consentBody // contains <privacy>...</privacy> · <terms>...</terms>

describe('extractIcuTokens', () => {
  it('extracts a simple ICU variable name', () => {
    expect(extractIcuTokens('Total: {amount}')).toEqual(['amount'])
  })

  it('extracts only the leading variable name of a plural construct, not its sub-category text', () => {
    expect(extractIcuTokens(EN_HOURS_OPTION)).toEqual(['count'])
  })

  it('extracts multiple top-level tokens in order, including one preceding a plural block', () => {
    expect(extractIcuTokens(EN_CLASS_PAX)).toEqual(['className', 'passengers'])
  })

  it('returns an empty array for a non-string value', () => {
    expect(extractIcuTokens(42)).toEqual([])
    expect(extractIcuTokens(undefined)).toEqual([])
  })
})

describe('extractRichTags', () => {
  it('counts balanced open/close rich-text tags from a real EN string', () => {
    const tags = extractRichTags(EN_CONSENT_BODY)
    expect(tags.privacy).toEqual({ open: 1, close: 1 })
    expect(tags.terms).toEqual({ open: 1, close: 1 })
  })

  it('returns an empty object for a string with no tags', () => {
    expect(extractRichTags('Plain text, no tags.')).toEqual({})
  })
})

describe('verifyDntPreserved', () => {
  it('fails when a translated string drops an ICU variable present in EN', () => {
    const en = 'Total: {amount}'
    const tr = 'Итого:' // {amount} dropped
    const result = verifyDntPreserved(en, tr, glossary)
    expect(result.ok).toBe(false)
    expect(result.missing).toContain('{amount}')
  })

  it('fails when a rich-text tag has an odd/unbalanced open-close count in translation', () => {
    // Closing </privacy> dropped — one open, zero close for that tag.
    const tr = EN_CONSENT_BODY.replace('</privacy>', '')
    const result = verifyDntPreserved(EN_CONSENT_BODY, tr, glossary)
    expect(result.ok).toBe(false)
    expect(result.missing).toContain('<privacy>')
  })

  it('fails when a brand/vehicle DNT term is altered instead of reproduced verbatim', () => {
    const en = 'Book your Mercedes E-Class with Prestigo today.'
    const tr = 'Забронируйте ваш Мерседес Е-Класс с Престижио сегодня.' // DNT terms translated — wrong
    const result = verifyDntPreserved(en, tr, glossary)
    expect(result.ok).toBe(false)
    expect(result.missing).toContain('Prestigo')
    expect(result.missing).toContain('E-Class')
  })

  it('passes when every ICU var, tag, and DNT term is preserved verbatim in a translated string', () => {
    // Simulate a real translation: prose translated, tags/DNT/tokens untouched.
    const tr = EN_CONSENT_BODY.replace(
      'Before your journey begins, a quick word on privacy.',
      'Прежде чем начнётся ваше путешествие, короткое слово о конфиденциальности.'
    )
    const result = verifyDntPreserved(EN_CONSENT_BODY, tr, glossary)
    expect(result.ok).toBe(true)
    expect(result.missing).toEqual([])
    expect(result.unbalanced).toEqual([])
  })

  it('passes trivially for non-string EN/translated values', () => {
    expect(verifyDntPreserved(42, 42, glossary).ok).toBe(true)
    expect(verifyDntPreserved(['a'], ['b'], glossary).ok).toBe(true)
  })
})

describe('verifyPluralCategories (Pitfall 2 — RU needs 4 CLDR categories, not EN\'s 2)', () => {
  it('fails a RU plural block containing only one/other (missing few/many)', () => {
    const tr = '{count, plural, one {# час} other {# часов}}'
    const result = verifyPluralCategories(tr, 'ru', glossary)
    expect(result.ok).toBe(false)
    expect(result.missing).toEqual(expect.arrayContaining(['few', 'many']))
  })

  it('passes a full RU one/few/many/other plural block', () => {
    const tr = '{count, plural, one {# час} few {# часа} many {# часов} other {# часа}}'
    const result = verifyPluralCategories(tr, 'ru', glossary)
    expect(result.ok).toBe(true)
    expect(result.missing).toEqual([])
  })

  it('passes es/fr plural blocks with only one/other — no CLDR expansion required for those locales', () => {
    const trEs = '{count, plural, one {# hora} other {# horas}}'
    const trFr = '{count, plural, one {# heure} other {# heures}}'
    expect(verifyPluralCategories(trEs, 'es', glossary).ok).toBe(true)
    expect(verifyPluralCategories(trFr, 'fr', glossary).ok).toBe(true)
  })
})
