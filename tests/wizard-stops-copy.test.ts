// @vitest-environment node
/**
 * Phase 91, Plan 17 - STOP-01 / STOP-03 / STOP-05: the wizard copy for stops, paid waiting and the airport landing
 * exists in all 7 locales as a real hand translation (never an English copy or a stub), formats through
 * next-intl with its placeholders resolved, and never types a price (T-91-48).
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createTranslator, type AbstractIntlMessages } from 'next-intl'
import { locales } from '@/i18n/locales'

type Catalog = AbstractIntlMessages & { Booking: Record<string, Record<string, string>> }

function loadCatalog(locale: string): Catalog {
  return JSON.parse(readFileSync(join(process.cwd(), 'messages', `${locale}.json`), 'utf8')) as Catalog
}

const CATALOGS = Object.fromEntries(locales.map((l) => [l, loadCatalog(l)])) as Record<string, Catalog>

interface CopyKey {
  namespace: string
  key: string
  values?: Record<string, string | number>
  /** Fragments the formatted string must contain (the resolved placeholder values). */
  contains?: string[]
}

const STOP_AND_WAIT_KEYS: CopyKey[] = [
  { namespace: 'Booking.stopItem', key: 'freeWaitHint' },
  { namespace: 'Booking.stopItem', key: 'paidWaitUnavailable' },
  { namespace: 'Booking.stopItem', key: 'moveUp' },
  { namespace: 'Booking.stopItem', key: 'moveDown' },
  { namespace: 'Booking.step3vehicle', key: 'waitingUnavailable' },
  { namespace: 'Booking.priceSummary', key: 'waitingLine' },
  { namespace: 'Booking.summaryBlock', key: 'waitingLine' },
]

const NON_ENGLISH = locales.filter((l) => l !== 'en')

// A price or an amount: a digit next to a currency sign, or an amount followed by a currency code.
const PRICE_PATTERN = /\d\s*[€$£¥]|[€$£¥]\s*\d|\d\s*(EUR|CZK|USD|Kč)\b/i

function lookup(locale: string, namespace: string, key: string): unknown {
  let node: unknown = CATALOGS[locale]
  for (const part of namespace.split('.')) node = (node as Record<string, unknown> | undefined)?.[part]
  return (node as Record<string, unknown> | undefined)?.[key]
}

function format(locale: string, item: CopyKey): string {
  const t = createTranslator({ locale, messages: CATALOGS[locale], namespace: item.namespace as never })
  return (t as unknown as (k: string, v?: Record<string, string | number>) => string)(item.key, item.values)
}

describe.each([
  ['stop and waiting copy', STOP_AND_WAIT_KEYS],
] as const)('wizard %s', (_name, keys) => {
  for (const locale of locales) {
    describe(locale, () => {
      for (const item of keys) {
        const id = `${item.namespace}.${item.key}`

        it(`${id} is a non-empty string that formats with no raw brace`, () => {
          const raw = lookup(locale, item.namespace, item.key)
          expect(typeof raw).toBe('string')
          expect((raw as string).trim().length).toBeGreaterThan(0)
          const out = format(locale, item)
          expect(out.trim().length).toBeGreaterThan(0)
          expect(out).not.toMatch(/[{}]/)
          for (const fragment of item.contains ?? []) expect(out).toContain(fragment)
        })

        it(`${id} types no price or amount`, () => {
          expect(String(lookup(locale, item.namespace, item.key))).not.toMatch(PRICE_PATTERN)
        })

        if (locale !== 'en') {
          it(`${id} is a real translation, not the English text`, () => {
            const en = lookup('en', item.namespace, item.key)
            expect(lookup(locale, item.namespace, item.key)).not.toBe(en)
          })
        }
      }
    })
  }

  it('covers every non-English locale', () => {
    expect(NON_ENGLISH.length).toBe(6)
  })
})
