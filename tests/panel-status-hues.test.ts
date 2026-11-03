import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { STATUS_LABELS } from '@/lib/panel-dto'
import { BOOKING_STATUSES, BOOKING_STATUS_LABELS } from '@/lib/booking-status'

// Phase 87 plan 05 (D-02, D-08): the Chatwoot panel knows every booking status, with its own hue.

const css = readFileSync(join(process.cwd(), 'app/embed/chatwoot-dashboard/panel.css'), 'utf8')
const count = (re: RegExp) => (css.match(re) ?? []).length

describe('panel-dto STATUS_LABELS (D-02)', () => {
  it('labels every booking status with the admin wording', () => {
    for (const s of BOOKING_STATUSES) expect(STATUS_LABELS[s], s).toBe(BOOKING_STATUS_LABELS[s])
    expect(STATUS_LABELS.on_board).toBe('On Board')
    expect(STATUS_LABELS.no_show).toBe('No-Show')
  })
})

describe('panel.css hues for on_board / no_show (D-08)', () => {
  it('declares both hue pairs in every theme block that declares en_route', () => {
    const themeBlocks = count(/--b-en_route-bg:/g)
    expect(themeBlocks).toBeGreaterThanOrEqual(3)
    for (const status of ['on_board', 'no_show']) {
      expect(count(new RegExp(`--b-${status}-bg:`, 'g')), `${status} bg`).toBe(themeBlocks)
      expect(count(new RegExp(`--b-${status}-fg:`, 'g')), `${status} fg`).toBe(themeBlocks)
    }
  })

  it('has a .badge rule per new status that uses its own variables', () => {
    expect(css).toMatch(/\.badge-on_board\s*\{[^}]*var\(--b-on_board-bg\)[^}]*var\(--b-on_board-fg\)/)
    expect(css).toMatch(/\.badge-no_show\s*\{[^}]*var\(--b-no_show-bg\)[^}]*var\(--b-no_show-fg\)/)
  })

  it('gives every booking status a .badge rule', () => {
    for (const s of BOOKING_STATUSES) expect(css, s).toContain(`.badge-${s} {`)
  })
})
