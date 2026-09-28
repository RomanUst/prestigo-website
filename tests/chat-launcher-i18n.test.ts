/**
 * Phase 77, Plan 05 (tracer) — ChatLauncher namespace parity across all 7
 * site locales (D-01/D-03/D-07/D-08, INBOX-02). No network calls; reads the
 * committed catalogs directly with fs, mirroring tests/i18n-completeness.test.ts.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const LOCALES = ['en', 'ru', 'es', 'fr', 'ar', 'hi', 'zh'] as const
const DNT_LEAVES = new Set(['whatsapp', 'telegram'])

function loadCatalog(locale: string): Record<string, unknown> {
  const raw = readFileSync(join(process.cwd(), 'messages', `${locale}.json`), 'utf8')
  return JSON.parse(raw)
}

/** Flattens a nested object into dot-path leaf entries, e.g. widget.welcomeTitle. */
function flatten(obj: Record<string, unknown>, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      Object.assign(out, flatten(value as Record<string, unknown>, path))
    } else {
      out[path] = String(value)
    }
  }
  return out
}

const catalogs = Object.fromEntries(LOCALES.map((l) => [l, loadCatalog(l)])) as Record<
  (typeof LOCALES)[number],
  Record<string, unknown>
>

const chatLaunchers = Object.fromEntries(
  LOCALES.map((l) => [l, (catalogs[l] as Record<string, unknown>).ChatLauncher as Record<string, unknown>])
) as Record<(typeof LOCALES)[number], Record<string, unknown>>

const flatByLocale = Object.fromEntries(
  LOCALES.map((l) => [l, flatten(chatLaunchers[l] ?? {})])
) as Record<(typeof LOCALES)[number], Record<string, string>>

describe('ChatLauncher namespace exists in all 7 catalogs', () => {
  for (const locale of LOCALES) {
    it(`messages/${locale}.json has a ChatLauncher namespace`, () => {
      expect(chatLaunchers[locale]).toBeTruthy()
      expect(typeof chatLaunchers[locale]).toBe('object')
    })
  }

  it('messages/en.json ChatLauncher includes the widget sub-object', () => {
    expect(chatLaunchers.en.widget).toBeTruthy()
    expect((chatLaunchers.en.widget as Record<string, unknown>).welcomeTitle).toBeTruthy()
    expect((chatLaunchers.en.widget as Record<string, unknown>).welcomeDescription).toBeTruthy()
  })
})

describe('ChatLauncher key tree is identical across all 7 locales', () => {
  const enKeys = Object.keys(flatByLocale.en).sort()

  it('en has the expected leaf set', () => {
    expect(enKeys).toEqual(
      [
        'openAria',
        'closeAria',
        'menuAria',
        'chatOnSite',
        'whatsapp',
        'telegram',
        'replyTimeHint',
        'widgetLoading',
        'widgetError',
        'widget.welcomeTitle',
        'widget.welcomeDescription',
      ].sort()
    )
  })

  for (const locale of LOCALES) {
    if (locale === 'en') continue
    it(`${locale} has the same key set as en (deep key set equality)`, () => {
      expect(Object.keys(flatByLocale[locale]).sort()).toEqual(enKeys)
    })
  }
})

describe('non-DNT leaves are actually translated (differ from en)', () => {
  for (const locale of LOCALES) {
    if (locale === 'en') continue
    for (const key of Object.keys(flatByLocale.en)) {
      if (DNT_LEAVES.has(key)) continue
      it(`${locale}.ChatLauncher.${key} differs from the en value`, () => {
        expect(flatByLocale[locale][key]).not.toBe(flatByLocale.en[key])
      })
    }
  }
})

describe('DNT leaves (whatsapp, telegram) are identical across every locale', () => {
  for (const key of DNT_LEAVES) {
    for (const locale of LOCALES) {
      it(`${locale}.ChatLauncher.${key} equals the en value`, () => {
        expect(flatByLocale[locale][key]).toBe(flatByLocale.en[key])
      })
    }
  }
})

describe('no ChatLauncher value contains a currency token, a literal minute count, or "Prestigio"', () => {
  const CURRENCY_RE = /[€$£¥]|Kč|EUR|CZK|USD/
  const MINUTE_COUNT_RE = /\d+\s*(min|minute|minutes|мин|минут|minuto|minutos|minute[s]?|دقيق|मिनट|分钟)/i

  for (const locale of LOCALES) {
    for (const [key, value] of Object.entries(flatByLocale[locale])) {
      it(`${locale}.ChatLauncher.${key} has no currency token`, () => {
        expect(CURRENCY_RE.test(value)).toBe(false)
      })
      it(`${locale}.ChatLauncher.${key} has no digit-followed-by-minute-word`, () => {
        expect(MINUTE_COUNT_RE.test(value)).toBe(false)
      })
      it(`${locale}.ChatLauncher.${key} does not contain the misspelling "Prestigio"`, () => {
        expect(value.includes('Prestigio')).toBe(false)
      })
    }
  }
})
