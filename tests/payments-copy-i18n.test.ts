// @vitest-environment node
/**
 * Phase 88, Plan 05 — card-flow copy parity across all 7 site locales
 * (MAIL-01, HOLD-01; threat T-88-12). Reads the committed catalogs with fs.
 *
 * Guards the PaymentEmails and Booking.step6.cardOnFile namespaces: identical
 * key sets, identical ICU parameters per leaf, real translations (not stubs,
 * not English copies), no typed amounts and no refund / cancellation-fee
 * wording in any language.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { locales } from '@/i18n/locales'

type Json = string | { [k: string]: Json }
type Catalog = {
  PaymentEmails?: Json
  Booking: { step6: { cardOnFile?: Json } }
}

function loadCatalog(locale: string): Catalog {
  const raw = readFileSync(join(process.cwd(), 'messages', `${locale}.json`), 'utf8')
  return JSON.parse(raw) as Catalog
}

function flatten(node: Json | undefined, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {}
  if (node === undefined) return out
  if (typeof node === 'string') {
    out[prefix] = node
    return out
  }
  for (const [k, v] of Object.entries(node)) {
    Object.assign(out, flatten(v, prefix ? `${prefix}.${k}` : k))
  }
  return out
}

function copyOf(locale: string): Record<string, string> {
  const c = loadCatalog(locale)
  return {
    ...flatten(c.PaymentEmails, 'PaymentEmails'),
    ...flatten(c.Booking.step6.cardOnFile, 'Booking.step6.cardOnFile'),
  }
}

function params(s: string): string[] {
  return [...new Set([...s.matchAll(/\{([A-Za-z0-9_]+)\}/g)].map((m) => m[1]))].sort()
}

const EN = copyOf('en')
const NON_EN = locales.filter((l) => l !== 'en')

/** The brand tagline stays Latin in every locale. */
const BRAND_KEYS = new Set(['PaymentEmails.common.tagline'])

/** Genuine cognates that are spelled the same as the EN word in that locale. */
const COGNATES: Record<string, ReadonlySet<string>> = {
  fr: new Set(['PaymentEmails.common.dateLabel']),
}

/** Per-locale wording that must never appear (no refund promise, no cancellation fee). */
const FORBIDDEN: Record<string, RegExp> = {
  en: /refund|cancellation fee|will be cancelled/i,
  ru: /возврат|штраф|плат[аы] за отмен|комисси\S* за отмен/i,
  es: /reembols|devoluci|gastos de cancelaci|cargo por cancelaci|penalizaci/i,
  fr: /rembours|frais d'annulation|pénalité/i,
  ar: /استرداد|رسوم الإلغاء|رسوم إلغاء|غرامة/,
  hi: /रिफ़ंड|रिफंड|धनवापसी|पैसे वापस|रद्दीकरण शुल्क|जुर्माना/,
  zh: /退款|退还|取消费|取消手续费|违约金|罚款/,
}

describe('card-flow copy: the EN source', () => {
  it('has both namespaces with leaves', () => {
    expect(Object.keys(EN).filter((k) => k.startsWith('PaymentEmails.')).length).toBeGreaterThan(0)
    expect(Object.keys(EN).filter((k) => k.startsWith('Booking.step6.cardOnFile.')).length).toBeGreaterThan(0)
  })
})

describe.each(NON_EN)('card-flow copy parity: %s', (locale) => {
  const tr = copyOf(locale)

  it('has exactly the EN key set', () => {
    expect(Object.keys(tr).sort()).toEqual(Object.keys(EN).sort())
  })

  it('keeps exactly the ICU parameters of every EN leaf', () => {
    for (const [key, en] of Object.entries(EN)) {
      expect({ key, params: params(tr[key] ?? '') }).toEqual({ key, params: params(en) })
    }
  })

  it('is a real translation: no [XX] stub, differs from EN (brand tagline excepted)', () => {
    for (const [key, en] of Object.entries(EN)) {
      const value = tr[key]
      expect(typeof value).toBe('string')
      expect(value.trim().length).toBeGreaterThan(0)
      expect({ key, stub: /^\[[A-Z]{2}\]/.test(value) }).toEqual({ key, stub: false })
      if (BRAND_KEYS.has(key)) expect(value).toBe(en)
      else if (COGNATES[locale]?.has(key)) continue
      else expect({ key, sameAsEn: value === en }).toEqual({ key, sameAsEn: false })
    }
  })

  it('keeps the brand spelling and never types an amount', () => {
    for (const [key, value] of Object.entries(tr)) {
      expect({ key, misspelt: /Prestigio/i.test(value) }).toEqual({ key, misspelt: false })
      expect({ key, amount: /€\s?\d|\d\s?Kč/.test(value) }).toEqual({ key, amount: false })
    }
  })

  it('promises no refund and names no cancellation fee', () => {
    const rx = FORBIDDEN[locale]
    expect(rx).toBeDefined()
    for (const [key, value] of Object.entries(tr)) {
      expect({ key, forbidden: rx.test(value) }).toEqual({ key, forbidden: false })
    }
  })
})

describe('card-flow copy: EN source is clean', () => {
  it('types no amount and uses no refund / cancellation-fee wording', () => {
    for (const [key, value] of Object.entries(EN)) {
      expect({ key, amount: /€\s?\d|\d\s?Kč/.test(value) }).toEqual({ key, amount: false })
      expect({ key, forbidden: FORBIDDEN.en.test(value) }).toEqual({ key, forbidden: false })
    }
  })
})
