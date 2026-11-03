// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StatusBadge, STATUS_FAMILY } from '@/components/admin/StatusBadge'
import type { StatusBadgeVariant } from '@/components/admin/StatusBadge'

type Variant = keyof typeof STATUS_FAMILY

const EXPECTED: Record<Variant, string> = {
  active: 'ok',
  completed: 'ok',
  inactive: 'danger',
  cancelled: 'danger',
  no_show: 'danger',
  pending: 'warn',
  unpaid: 'warn',
  on_location: 'amber',
  arrived: 'amber',
  quote: 'info',
  confirmed: 'info',
  assigned: 'teal',
  on_board: 'teal',
  en_route: 'violet',
}

describe('StatusBadge (D-17)', () => {
  it('maps exactly 14 variants to the documented families', () => {
    expect(Object.keys(STATUS_FAMILY)).toHaveLength(14)
    expect(STATUS_FAMILY).toEqual(EXPECTED)
  })

  for (const variant of Object.keys(EXPECTED) as Variant[]) {
    it(`variant ${variant} renders its label and only status tokens`, () => {
      const family = EXPECTED[variant]
      const label = `Label ${variant}`
      const { container } = render(<StatusBadge variant={variant} label={label} />)

      expect(screen.getByText(label)).toBeTruthy()

      const outer = container.firstElementChild as HTMLElement
      const outerStyle = outer.getAttribute('style') ?? ''
      expect(outerStyle).toContain(`var(--status-${family}-bg)`)
      expect(outerStyle).toContain(`var(--status-${family}-fg)`)
      expect(outerStyle).toContain(`var(--status-${family}-border)`)

      const dot = outer.firstElementChild as HTMLElement
      expect(dot.getAttribute('style') ?? '').toContain(`var(--status-${family}-fg)`)

      for (const el of Array.from(container.querySelectorAll('[style]'))) {
        const style = el.getAttribute('style') ?? ''
        expect(style).not.toMatch(/#[0-9a-fA-F]{3,8}/)
        expect(style).not.toMatch(/rgba?\(/)
      }
    })
  }

  it('uses radius, font size and weight tokens', () => {
    const { container } = render(<StatusBadge variant="quote" label="Quote" />)
    const style = (container.firstElementChild as HTMLElement).getAttribute('style') ?? ''
    expect(style).toContain('var(--admin-radius-sm)')
    expect(style).toContain('var(--admin-fs-label)')
    expect(style).toContain('var(--admin-fw-strong)')
  })

  it('truncates long labels: nowrap chip, ellipsis label span', () => {
    const { container } = render(
      <StatusBadge variant="pending" label="A very long status label that should never wrap onto a second line" />,
    )
    const outer = container.firstElementChild as HTMLElement
    expect(outer.style.whiteSpace).toBe('nowrap')
    expect(outer.style.maxWidth).toBe('100%')
    const labelSpan = outer.lastElementChild as HTMLElement
    expect(labelSpan.textContent).toContain('A very long status label')
    expect(labelSpan.style.overflow).toBe('hidden')
    expect(labelSpan.style.textOverflow).toBe('ellipsis')
  })
})

describe('StatusBadge variant type (Phase 87 D-02)', () => {
  it('accepts every BookingStatus as a variant and resolves each to a family', async () => {
    const { BOOKING_STATUSES } = await import('@/lib/booking-status')
    for (const s of BOOKING_STATUSES) {
      // BookingStatus must be assignable to StatusBadgeVariant (compile-time) and map to a family (runtime)
      const v: StatusBadgeVariant = s
      expect(STATUS_FAMILY[v]).toBeDefined()
    }
  })

  it('on_board uses the teal family and no_show the danger family', () => {
    expect(STATUS_FAMILY.on_board).toBe('teal')
    expect(STATUS_FAMILY.no_show).toBe('danger')
  })
})
