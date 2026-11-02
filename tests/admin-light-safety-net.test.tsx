import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { inputBaseStyle, labelStyle } from '@/components/admin/adminFieldStyles'

/**
 * Phase 86 (ADM-02, D-08, D-10, RESEARCH Pitfall 1): the light theme neutralises
 * inline uppercase labels and weight-300 text with attribute-substring selectors
 * on the style attribute. That only works when the selector substring equals the
 * serialisation the browser/React actually produces, and the two differ:
 *   - React SSR (renderToString):  "text-transform:uppercase"  (no space)
 *   - client-created DOM (jsdom/browser CSSOM): "text-transform: uppercase" (space)
 * This test renders the real adminFieldStyles objects through both paths and
 * checks admin-theme.css contains a selector for each exact substring.
 */

const CSS = fs.readFileSync(path.resolve(__dirname, '..', 'app/(internal)/admin/admin-theme.css'), 'utf8')
const LIGHT = '.admin-shell[data-admin-theme="light"]'

describe('admin light safety net: serialisations (Pitfall 1)', () => {
  const ssrLabel = renderToString(createElement('label', { style: labelStyle }, 'Name'))
  const ssrInput = renderToString(createElement('input', { style: inputBaseStyle }))

  it('React SSR serialises the uppercase label without a space', () => {
    expect(ssrLabel).toContain('text-transform:uppercase')
    expect(ssrLabel).not.toContain('text-transform: uppercase')
  })

  it('React SSR serialises the weight-300 input without a space', () => {
    expect(ssrInput).toContain('font-weight:300')
    expect(ssrInput).not.toContain('font-weight: 300')
  })

  it('a client-created DOM node serialises both with a space', () => {
    const el = document.createElement('span')
    el.style.textTransform = 'uppercase'
    el.style.fontWeight = '300'
    const attr = el.getAttribute('style') ?? ''
    expect(attr).toContain('text-transform: uppercase')
    expect(attr).toContain('font-weight: 300')
  })
})

describe('admin light safety net: selectors in admin-theme.css', () => {
  const forms = [
    'text-transform:uppercase',
    'text-transform: uppercase',
    'font-weight:300',
    'font-weight: 300',
  ]

  it.each(forms)('has a light-scoped [style*="%s"] selector', (form) => {
    expect(CSS).toContain(`${LIGHT} [style*="${form}"]`)
  })

  it('the SSR and DOM selector forms come in twins (no one-sided rule)', () => {
    const subs = [...CSS.matchAll(/\[style\*="([^"]+)"\]/g)].map((m) => m[1])
    expect(subs.length).toBeGreaterThan(0)
    for (const s of subs) {
      const twin = s.includes(': ') ? s.replace(': ', ':') : s.replace(':', ': ')
      expect(subs).toContain(twin)
    }
  })

  it('no [style*=] selector is scoped to the dark theme', () => {
    const offenders = CSS.split('\n').filter((l) => l.includes('[style*=') && l.includes('data-admin-theme="dark"'))
    expect(offenders).toEqual([])
  })

  it('every [style*=] selector starts with the light wrapper', () => {
    const lines = CSS.split('\n').filter((l) => l.includes('[style*='))
    expect(lines.length).toBeGreaterThan(0)
    for (const l of lines) expect(l.trim().startsWith(LIGHT)).toBe(true)
  })
})
