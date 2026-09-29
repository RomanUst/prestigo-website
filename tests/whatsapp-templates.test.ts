// @vitest-environment node
/* eslint-disable @typescript-eslint/no-explicit-any -- template JSON is intentionally loosely typed */
/**
 * Phase 78, Plan 08 — content rules for the WhatsApp templates in
 * infra/chatwoot/whatsapp-templates/. Structure is checked with the CLI's own
 * validateTemplate (single source of Meta's rules); this file adds the project
 * rules: no price, no Uber/ride-hailing comparison, native translations,
 * synthetic variable examples only. No network, no token.
 */
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { loadTemplates, validateTemplate, SITE_LOCALES } from '../infra/chatwoot/whatsapp-templates.mjs'
import { hasCurrencyToken } from '../scripts/qa/chatwoot_price_gate.mjs'
import { BUSINESS_PHONE_DIGITS } from '@/lib/contact-channels'

const TEMPLATES_DIR = path.join(process.cwd(), 'infra/chatwoot/whatsapp-templates')
const CANNED_DIR = path.join(process.cwd(), 'infra/chatwoot/canned-responses')

// The WA-02 set (plan 78-08 shipped the first four; plan 78-10 adds driver-details first, then the rest).
const REQUIRED_KEYS = ['booking-change', 'payment-help', 'review-request', 'trip-reminder', 'driver-details']

// The one phone-shaped string a template may carry: the non-dialable synthetic driver_phone example.
const SYNTHETIC_PHONE = '+420 000 000 000'

const loaded = loadTemplates() as Array<{ file: string; template: any }>
const byKey = new Map<string, any>(loaded.map(({ template }) => [template.key, template]))
const locales = SITE_LOCALES as string[]

/** Every customer-visible or Meta-submitted string of a template. */
function allStrings(t: any): string[] {
  const out: string[] = []
  for (const code of locales) {
    out.push(t.locales[code].body)
    for (const label of Object.values(t.locales[code].buttons ?? {})) out.push(label as string)
  }
  for (const v of t.variables) out.push(v.example)
  for (const b of t.buttons) if (b.url) out.push(b.url)
  return out
}

describe('WhatsApp templates: required set', () => {
  it.each(REQUIRED_KEYS)('%s exists as a file', (key) => {
    expect(fs.existsSync(path.join(TEMPLATES_DIR, `${key}.json`))).toBe(true)
    expect(byKey.has(key)).toBe(true)
  })
})

describe.each(loaded.map(({ template }) => [template.key, template] as const))('template %s', (key, t) => {
  it('passes the Meta structural validation and the key equals the filename', () => {
    expect(validateTemplate(t)).toEqual([])
    expect(t.key).toBe(key)
  })

  it('is UTILITY, named prestigo_*, and covers all 7 locales with zh -> zh_CN', () => {
    expect(t.category).toBe('UTILITY')
    expect(Object.keys(t.locales).sort()).toEqual([...locales].sort())
    expect(t.locales.zh.language).toBe('zh_CN')
  })

  it('has no price, currency, digit-amount, or discount wording', () => {
    for (const s of allStrings(t)) expect(hasCurrencyToken(s), s).toBe(false)
    for (const code of locales) expect(t.locales[code].body, code).not.toMatch(/%/)
    for (const s of allStrings(t)) {
      expect(s, s).not.toMatch(/\b(discount|offer|promo\w*|sale|deal|special price)\b/i)
    }
  })

  it('never names Uber / ride-hailing apps and spells the brand Prestigo', () => {
    const text = allStrings(t).join('\n')
    expect(text).not.toMatch(/prestigio/i)
    expect(text).not.toMatch(/\b(uber|bolt|lyft)\b/i)
    expect(text).not.toMatch(/ride[- ]?hailing/i)
    expect(text).not.toMatch(/taxi app/i)
    for (const code of locales) expect(t.locales[code].body, code).toContain('Prestigo')
  })

  it('carries only synthetic examples (no real booking reference, email or phone)', () => {
    const text = allStrings(t).join('\n').split(SYNTHETIC_PHONE).join('')
    expect(text).not.toMatch(/PRG-\d{8}/i)
    expect(text).not.toMatch(/@/)
    expect(text).not.toMatch(/\+?\d[\d ()-]{8,}\d/)
    for (const v of t.variables) {
      if (v.name === 'booking_ref') expect(v.example).toMatch(/^PRG-EXAMPLE/)
      if (v.name === 'first_name') expect(['Anna', 'Maria', 'Peter', 'John']).toContain(v.example)
      expect(v.example, v.name).not.toMatch(/['"]/) // Chatwoot strips quotes from variable values
    }
  })

  it('has a real native translation in every non-en locale (not a copy, not a stub)', () => {
    const en = t.locales.en.body
    for (const code of locales.filter((c) => c !== 'en')) {
      const body = t.locales[code].body as string
      expect(body, code).not.toBe(en)
      expect(body, code).not.toMatch(/\[(AR|RU|ES|FR|HI|ZH|EN)\]|\bTODO\b|lorem ipsum/)
    }
    expect(t.locales.ru.body).toMatch(/[Ѐ-ӿ]/)
    expect(t.locales.ar.body).toMatch(/[؀-ۿ]/)
    expect(t.locales.hi.body).toMatch(/[ऀ-ॿ]/)
    expect(t.locales.zh.body).toMatch(/[一-鿿]/)
    // es / fr must not be the English body with a greeting swapped: they share no long English run
    expect(t.locales.es.body).not.toContain(en.slice(0, 40))
    expect(t.locales.fr.body).not.toContain(en.slice(0, 40))
  })

  it('references an existing canned response when sourceCanned is set', () => {
    if (t.sourceCanned !== null) {
      expect(fs.existsSync(path.join(CANNED_DIR, `${t.sourceCanned}.json`)), t.sourceCanned).toBe(true)
    }
  })
})

describe('WhatsApp templates: per-template rules (D-07, D-11)', () => {
  const shape = (t: any) => t.buttons.map((b: any) => `${b.type}:${b.textKey}`)

  it('booking-change: quick replies ok + question, three variables', () => {
    const t = byKey.get('booking-change')
    expect(t.name).toBe('prestigo_booking_change')
    expect(shape(t)).toEqual(['QUICK_REPLY:ok', 'QUICK_REPLY:question'])
    expect(t.variables.map((v: any) => v.name)).toEqual(['first_name', 'booking_ref', 'change_summary'])
  })

  it('payment-help: no digit of any script in any locale body, quick replies new_link + question', () => {
    const t = byKey.get('payment-help')
    expect(t.name).toBe('prestigo_payment_help')
    expect(shape(t)).toEqual(['QUICK_REPLY:new_link', 'QUICK_REPLY:question'])
    for (const code of locales) {
      expect(t.locales[code].body, code).not.toMatch(/\p{Nd}/u)
      expect(t.locales[code].body, code).not.toMatch(/https?:|www\./i) // the link is sent on request, never baked in
    }
  })

  it('review-request: exactly one URL button equal to the Phase 77 canned-response review link', () => {
    const t = byKey.get('review-request')
    expect(t.name).toBe('prestigo_review_request')
    const canned = JSON.parse(fs.readFileSync(path.join(CANNED_DIR, 'review-request.json'), 'utf8'))
    const link = (canned.responses.en as string).match(/https:\/\/g\.page\/\S+/)?.[0]
    expect(link).toBeTruthy()
    const urls = t.buttons.filter((b: any) => b.type === 'URL')
    expect(urls).toHaveLength(1)
    expect(urls[0].url).toBe(link)
    expect(t.buttons).toHaveLength(1)
    for (const code of locales) expect(t.locales[code].body, code).toContain('{{booking_ref}}') // tied to the trip (UTILITY)
  })

  it('trip-reminder: all five variables in every locale body, quick replies all_good + change', () => {
    const t = byKey.get('trip-reminder')
    expect(t.name).toBe('prestigo_trip_reminder')
    expect(shape(t)).toEqual(['QUICK_REPLY:all_good', 'QUICK_REPLY:change'])
    const names = ['first_name', 'booking_ref', 'pickup_date', 'pickup_time', 'pickup_place']
    expect(t.variables.map((v: any) => v.name)).toEqual(names)
    for (const code of locales) for (const n of names) expect(t.locales[code].body, `${code} ${n}`).toContain(`{{${n}}}`)
  })

  it('driver-details: seven named variables in every locale body, synthetic non-dialable driver_phone, quick replies ok + question', () => {
    const t = byKey.get('driver-details')
    expect(t.name).toBe('prestigo_driver_details')
    expect(shape(t)).toEqual(['QUICK_REPLY:ok', 'QUICK_REPLY:question'])
    const names = ['first_name', 'booking_ref', 'driver_name', 'driver_phone', 'vehicle', 'plate', 'meeting_point']
    expect(t.variables.map((v: any) => v.name)).toEqual(names)
    for (const code of locales) for (const n of names) expect(t.locales[code].body, `${code} ${n}`).toContain(`{{${n}}}`)
    const phone = t.variables.find((v: any) => v.name === 'driver_phone').example as string
    expect(phone).toBe(SYNTHETIC_PHONE)
    const digits = phone.replace(/\D/g, '')
    expect(digits).not.toBe(BUSINESS_PHONE_DIGITS)
    expect(digits.includes(BUSINESS_PHONE_DIGITS)).toBe(false)
    expect(digits.slice(3)).toMatch(/^0+$/) // only the +420 country code, then zeros: never dialable
  })
})
