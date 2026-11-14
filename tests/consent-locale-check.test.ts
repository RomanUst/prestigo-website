import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { locales } from '@/i18n/locales'

// The consent record stores the page locale (recordConsent). A locale the CHECK does not know makes every card
// booking on that locale fail, which happened when zh-hant was added. The newest migration that defines the
// constraint must list exactly the supported locales.
describe('booking_payment_consents.locale CHECK covers every supported locale', () => {
  const dir = join(process.cwd(), 'supabase', 'migrations')
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()

  it('the latest definition of the constraint lists exactly the site locales', () => {
    let latest: string[] | null = null
    for (const file of files) {
      const sql = readFileSync(join(dir, file), 'utf8')
      const named = sql.match(/CONSTRAINT booking_payment_consents_locale_check\s+CHECK \(locale IN \(([^)]*)\)\)/)
      if (named) latest = named[1].split(',').map((s) => s.trim().replace(/'/g, ''))
    }
    expect(latest).not.toBeNull()
    expect([...(latest as string[])].sort()).toEqual([...locales].sort())
  })
})
