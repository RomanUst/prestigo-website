/**
 * meta-pixel-id.test.tsx — Phase 75 Plan 23, Task 1 (GAP-2 / WINDOWS #15)
 *
 * The production NEXT_PUBLIC_META_PIXEL_ID carried a trailing newline, which
 * landed inside the single-quoted fbq('init','…') argument of the inline
 * Meta Pixel script — a JS SyntaxError, so the pixel never fired.
 *
 * Covers:
 *  - normalizeMetaPixelId trims surrounding whitespace (incl. CR/LF) and only
 *    accepts a digits-only value (T-75-G06).
 *  - MetaPixel renders the init call with exactly the digits for a
 *    newline-suffixed env value, and renders nothing for a non-numeric one.
 *
 * MetaPixel reads the env var at module scope, so the render cases stub the
 * env with vi.stubEnv and dynamically import the component AFTER
 * vi.resetModules().
 */
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { normalizeMetaPixelId } from '@/lib/meta-pixel-id'

vi.mock('next/script', () => ({
  default: ({
    id,
    dangerouslySetInnerHTML,
  }: {
    id?: string
    dangerouslySetInnerHTML?: { __html: string }
  }) => (
    <script
      data-testid={id}
      id={id}
      dangerouslySetInnerHTML={dangerouslySetInnerHTML}
    />
  ),
}))

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
}))

describe('normalizeMetaPixelId', () => {
  it('trims a trailing newline', () => {
    expect(normalizeMetaPixelId('1234567890\n')).toBe('1234567890')
  })

  it('trims padded spaces and CRLF', () => {
    expect(normalizeMetaPixelId('  1234567890  ')).toBe('1234567890')
    expect(normalizeMetaPixelId('1234567890\r\n')).toBe('1234567890')
    expect(normalizeMetaPixelId('\t1234567890\r\n ')).toBe('1234567890')
  })

  it('returns a clean numeric ID unchanged', () => {
    expect(normalizeMetaPixelId('1234567890')).toBe('1234567890')
  })

  it('rejects empty, undefined, whitespace-only and non-numeric values', () => {
    expect(normalizeMetaPixelId('')).toBeUndefined()
    expect(normalizeMetaPixelId(undefined)).toBeUndefined()
    expect(normalizeMetaPixelId('   \n')).toBeUndefined()
    expect(normalizeMetaPixelId('abc123')).toBeUndefined()
    expect(normalizeMetaPixelId('12 34')).toBeUndefined()
    expect(normalizeMetaPixelId("123');alert(1);//")).toBeUndefined()
  })
})

describe('MetaPixel inline init script', () => {
  beforeEach(() => {
    vi.resetModules()
    localStorage.setItem('prestigo_consent_v2', JSON.stringify({ marketing: true }))
  })

  afterEach(() => {
    cleanup()
    localStorage.clear()
    vi.unstubAllEnvs()
  })

  it('renders fbq init with the bare digits for a newline-suffixed env value', async () => {
    vi.stubEnv('NEXT_PUBLIC_META_PIXEL_ID', '1234567890\n')
    const { default: MetaPixel } = await import('@/components/MetaPixel')

    const { findByTestId } = render(<MetaPixel />)
    const script = await findByTestId('meta-pixel')
    const html = script.innerHTML

    expect(html).toContain("fbq('init','1234567890')")
    const initMatch = html.match(/fbq\('init','([^']*)'\)/)
    expect(initMatch).not.toBeNull()
    expect(initMatch![1]).toBe('1234567890')
    expect(initMatch![1]).not.toMatch(/[\r\n]/)
  })

  it('renders no meta-pixel script for a non-numeric env value, even with consent', async () => {
    vi.stubEnv('NEXT_PUBLIC_META_PIXEL_ID', 'abc123')
    const { default: MetaPixel } = await import('@/components/MetaPixel')

    const { container, queryByTestId } = render(<MetaPixel />)
    // Let the consent effect run.
    await new Promise((r) => setTimeout(r, 0))

    expect(queryByTestId('meta-pixel')).toBeNull()
    expect(container.innerHTML).not.toContain('fbq(')
  })
})
