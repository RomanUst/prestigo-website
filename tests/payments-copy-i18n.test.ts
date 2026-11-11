// @vitest-environment node
/**
 * Phase 88, Plan 05 — card-flow copy parity across all 7 site locales
 * (MAIL-01, HOLD-01; threat T-88-12). Reads the committed catalogs with fs.
 *
 * Guards the PaymentEmails and Booking.step6.cardOnFile namespaces: identical
 * key sets, identical ICU parameters per leaf, real translations (not stubs,
 * not English copies), no typed amounts and no refund / cancellation-fee
 * wording in any language, except the keys on the FEE_WORDING_ALLOWED
 * allow-list (Phase 89: the cancellation box of plan 89-04, extended by 89-25 with exactly the kinds of UI-SPEC 8.2).
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

/**
 * Phase 89: the Phase 88 blanket ban on fee and refund wording is a positive allow-list. Only these keys may state a
 * fee, a percent or a refund; every other PaymentEmails and cardOnFile leaf must stay free of it.
 *  - plan 89-04: the cancellation box (`policyBox.*`);
 *  - plan 89-25: exactly the kinds of UI-SPEC 8.2 — cancelled, fee_charged, fee_waived, the cash variant of card_saved,
 *    the fee variant of payment_failed — and the money sentences (`money.*`) that cancelled and fee_waived share.
 */
const FEE_WORDING_PREFIXES = [
  'PaymentEmails.policyBox.',
  'PaymentEmails.cancelled.',
  'PaymentEmails.feeCharged.',
  'PaymentEmails.feeWaived.',
  'PaymentEmails.money.',
] as const
const FEE_WORDING_EXTRA_KEYS = [
  'PaymentEmails.cardSaved.introCash',
  'PaymentEmails.cardSaved.cashLineToday',
  'PaymentEmails.cardSaved.cashLineDay',
  'PaymentEmails.cardSaved.cashLineIfNeeded',
  'PaymentEmails.paymentFailed.subjectFee',
  'PaymentEmails.paymentFailed.h1Fee',
  'PaymentEmails.paymentFailed.introFeeCancellation',
  'PaymentEmails.paymentFailed.introFeeNoShow',
  'PaymentEmails.paymentFailed.introFeeTrip',
] as const
const FEE_WORDING_ALLOWED: ReadonlySet<string> = new Set([
  ...Object.keys(EN).filter((key) => FEE_WORDING_PREFIXES.some((prefix) => key.startsWith(prefix))),
  ...FEE_WORDING_EXTRA_KEYS,
])

/** Per-locale wording that must never appear outside the allow-list (no refund promise, no cancellation fee). */
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

  it('promises no refund and names no cancellation fee outside the allow-list', () => {
    const rx = FORBIDDEN[locale]
    expect(rx).toBeDefined()
    for (const [key, value] of Object.entries(tr)) {
      if (FEE_WORDING_ALLOWED.has(key)) continue
      expect({ key, forbidden: rx.test(value) }).toEqual({ key, forbidden: false })
    }
  })

  it('the Phase 89 keys carry exactly their parameters (amounts, dates, minutes are never typed)', () => {
    const expected: Record<string, string[]> = {
      'PaymentEmails.cardSaved.cashLineDay': ['amount'],
      'PaymentEmails.cardSaved.cashLineIfNeeded': ['freeUntil'],
      'PaymentEmails.policyBox.cash': ['amount'],
      'PaymentEmails.money.refunded': ['amount'],
      'PaymentEmails.cancelled.subject': ['reference'],
      'PaymentEmails.cancelled.introLate': ['amount', 'freeUntil'],
      'PaymentEmails.feeCharged.subjectLateCancel': ['reference'],
      'PaymentEmails.feeCharged.introLateCancel': ['amount', 'freeUntil', 'reference'],
      'PaymentEmails.feeCharged.reasonLateCancel': ['freeUntil'],
      'PaymentEmails.feeCharged.subjectNoShow': ['reference'],
      'PaymentEmails.feeCharged.introNoShow': ['amount', 'waitMin'],
      'PaymentEmails.feeCharged.reasonNoShow': ['waitMin'],
      'PaymentEmails.feeCharged.subjectCashUnpaid': ['reference'],
      'PaymentEmails.feeCharged.introCashUnpaid': ['amount', 'pickupDate'],
      'PaymentEmails.feeCharged.introCashCard': ['amount'],
      'PaymentEmails.feeWaived.subject': ['reference'],
      // Phase 91 D-10: the extra-charge receipt. Minutes, amounts, dates and the operator item line are parameters only.
      'PaymentEmails.extraCharged.subjectWaiting': ['reference'],
      'PaymentEmails.extraCharged.introWaiting': ['amount', 'minutes', 'pickupDate'],
      'PaymentEmails.extraCharged.lineWaiting': ['minutes'],
      'PaymentEmails.extraCharged.subjectOther': ['reference'],
      'PaymentEmails.extraCharged.introOther': ['amount', 'pickupDate'],
      'PaymentEmails.extraCharged.lineOther': ['item'],
      'PaymentEmails.extraCharged.h1Waiting': [],
      'PaymentEmails.extraCharged.h1Other': [],
      'PaymentEmails.extraCharged.approved': [],
      'PaymentEmails.paymentFailed.subjectFee': ['reference'],
      'PaymentEmails.paymentFailed.introFeeCancellation': ['amount'],
      'PaymentEmails.paymentFailed.introFeeNoShow': ['amount'],
      'PaymentEmails.paymentFailed.introFeeTrip': ['amount'],
      'PaymentEmails.contactOr': [],
      'PaymentEmails.common.decides': [],
    }
    for (const [key, want] of Object.entries(expected)) {
      expect({ key, params: params(tr[key] ?? '') }).toEqual({ key, params: want })
    }
  })

  it('"or" in the contact line is a real word of the locale, one short token', () => {
    const word = tr['PaymentEmails.contactOr']
    expect(word).not.toBe('or')
    expect(word.length).toBeLessThanOrEqual(4)
    expect(/[<>&{}]/.test(word)).toBe(false)
  })

  it('writes Latin digits only, and types a number in the bank delay sentence only', () => {
    for (const [key, value] of Object.entries(tr)) {
      if (!key.startsWith('PaymentEmails.')) continue
      expect({ key, nonLatinDigit: /[٠-٩۰-۹०-९]/.test(value) }).toEqual({ key, nonLatinDigit: false })
      if (key === 'PaymentEmails.money.refunded') {
        expect(value).toMatch(/\b5\b.*\b10\b/)
        continue
      }
      if (key === 'PaymentEmails.common.tagline') continue
      expect({ key, typedNumber: /[0-9]/.test(value) }).toEqual({ key, typedNumber: false })
    }
  })

  it('the cancellation box and manage keys carry their parameters and type no number', () => {
    expect(params(tr['PaymentEmails.policyBox.body'])).toEqual(['amount', 'freeUntil', 'percent', 'waitMin'])
    for (const key of [
      'PaymentEmails.policyBox.label',
      'PaymentEmails.policyBox.body',
      'PaymentEmails.manage.cta',
      'PaymentEmails.manage.note',
    ]) {
      expect({ key, typedNumber: /[0-9٠-٩۰-۹०-९]/.test(tr[key]) }).toEqual({ key, typedNumber: false })
      expect({ key, rawHtml: /[<>]|&[a-z]+;/i.test(tr[key]) }).toEqual({ key, rawHtml: false })
    }
  })
})

describe('card-flow copy: EN source is clean', () => {
  it('types no amount and uses no refund / cancellation-fee wording outside the allow-list', () => {
    for (const [key, value] of Object.entries(EN)) {
      expect({ key, amount: /€\s?\d|\d\s?Kč/.test(value) }).toEqual({ key, amount: false })
      if (FEE_WORDING_ALLOWED.has(key)) continue
      expect({ key, forbidden: FORBIDDEN.en.test(value) }).toEqual({ key, forbidden: false })
    }
  })

  it('the allow-list is closed: only the box and the kinds of UI-SPEC 8.2, every entry an existing key', () => {
    for (const key of FEE_WORDING_ALLOWED) {
      expect(EN[key]).toBeDefined()
      const kind = FEE_WORDING_PREFIXES.some((prefix) => key.startsWith(prefix)) || FEE_WORDING_EXTRA_KEYS.includes(key as never)
      expect({ key, kind }).toEqual({ key, kind: true })
    }
    // Nothing of the Phase 88 kinds beyond the explicit cash and fee keys is allowed to state a fee.
    for (const key of Object.keys(EN)) {
      if (/^PaymentEmails\.(common|charged|holdPlacedAtCheckout|holdPlacedScheduled|manage)\./.test(key)) {
        expect(FEE_WORDING_ALLOWED.has(key)).toBe(false)
      }
    }
    for (const key of ['cardSaved.subject', 'cardSaved.intro', 'paymentFailed.subject', 'paymentFailed.introDeclined']) {
      expect(FEE_WORDING_ALLOWED.has(`PaymentEmails.${key}`)).toBe(false)
    }
  })

  it('EN: every late and no-show mail says a person decides, and the fee kinds name no operator reason', () => {
    expect(EN['PaymentEmails.common.decides']).toBe('A person at Prestigo decides every charge.')
    expect(EN['PaymentEmails.cancelled.introLate']).toMatch(/A person at Prestigo decides/)
    expect(EN['PaymentEmails.cardSaved.cashLineIfNeeded']).toMatch(/A person at Prestigo decides first\./)
    for (const key of Object.keys(EN)) {
      expect({ key, operatorText: /\{(reason|note|adminNote)\}/i.test(EN[key]) }).toEqual({ key, operatorText: false })
    }
    // T-91-18: the item line the operator writes for the receipt is the one operator-text parameter, in one key only.
    expect(Object.keys(EN).filter((key) => /\{item\}/.test(EN[key]))).toEqual(['PaymentEmails.extraCharged.lineOther'])
  })

  it('the box states the policy: free until, a percent of the fare, the wait, and that a person decides', () => {
    const body = EN['PaymentEmails.policyBox.body']
    expect(body).toMatch(/\{freeUntil\}/)
    expect(body).toMatch(/\{percent\}%/)
    expect(body).toMatch(/\{amount\}/)
    expect(body).toMatch(/\{waitMin\}/)
    expect(body).toMatch(/A person at Prestigo decides every charge\./)
  })
})
