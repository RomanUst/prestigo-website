/**
 * meta-pixel-locale.test.ts — Phase 75 Plan 04, Task 2
 *
 * Covers VER-01 (D-12): trackMetaEvent (components/MetaPixel.tsx) merges
 * site_locale — derived from window.location.pathname via the same helper
 * GA4 uses — into every Pixel event, unless the caller already supplied one.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { trackMetaEvent } from '@/components/MetaPixel'

function setPathname(path: string) {
  window.history.pushState({}, '', path)
}

describe('trackMetaEvent site_locale', () => {
  let fbqCalls: unknown[][]

  beforeEach(() => {
    fbqCalls = []
    window.fbq = (...args: unknown[]) => {
      fbqCalls.push(args)
    }
  })

  afterEach(() => {
    delete window.fbq
    setPathname('/')
    vi.restoreAllMocks()
  })

  it('merges site_locale derived from the pathname into the fbq call, keeping eventID', () => {
    setPathname('/ar/book/confirmation')

    trackMetaEvent('Purchase', { value: 1, currency: 'EUR' }, 'PRG-1')

    expect(fbqCalls).toHaveLength(1)
    const [action, eventName, params, options] = fbqCalls[0]
    expect(action).toBe('track')
    expect(eventName).toBe('Purchase')
    expect(params).toEqual(
      expect.objectContaining({ value: 1, currency: 'EUR', site_locale: 'ar' })
    )
    expect(options).toEqual({ eventID: 'PRG-1' })
  })

  it('resolves site_locale to en for the unprefixed root', () => {
    setPathname('/')

    trackMetaEvent('InitiateCheckout', {}, 'PRG-2')

    const [, , params] = fbqCalls[0]
    expect((params as Record<string, unknown>).site_locale).toBe('en')
  })

  it('does not overwrite a caller-supplied site_locale', () => {
    setPathname('/ru/book')

    trackMetaEvent('Purchase', { value: 1, site_locale: 'fr' }, 'PRG-3')

    const [, , params] = fbqCalls[0]
    expect((params as Record<string, unknown>).site_locale).toBe('fr')
  })

  it('does nothing when fbq is not present', () => {
    delete window.fbq
    trackMetaEvent('Purchase', { value: 1 }, 'PRG-4')
    expect(fbqCalls).toHaveLength(0)
  })
})
