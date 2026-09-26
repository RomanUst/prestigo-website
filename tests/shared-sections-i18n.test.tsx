/**
 * 75-13: shared homepage/booking components render catalog text in every
 * locale instead of hardcoded English, and their internal links keep the
 * locale prefix (i18n Link / getPathname).
 *
 * Task 1 (tracer): BookingSection only — proves the pattern with a real en
 * (unchanged output) + ru (no EN leak) render pair before Task 2 repeats it
 * across the remaining shared components.
 */
import { describe, it, expect, vi } from 'vitest'
import { renderWithIntl, screen } from './helpers/renderWithIntl'
import ruMessages from '@/messages/ru.json'
import type { AbstractIntlMessages } from 'next-intl'

const ruMessagesTyped = ruMessages as unknown as AbstractIntlMessages

// BookingWidget pulls in Stripe/Places/etc — mocked out, this suite only
// proves the surrounding text block, not the widget itself.
vi.mock('@/components/booking/BookingWidget', () => ({
  default: () => null,
}))

import BookingSection from '@/components/BookingSection'

const EN_STRINGS = [
  'Instant booking',
  'Book your',
  'chauffeur now.',
  'Fixed price. Instant confirmation. Your driver tracks your flight automatically.',
  'Flight tracking included',
  'Fixed price — no surprises',
  'Free cancellation up to 1 hour',
  'Meet & greet at Arrivals',
]

describe('BookingSection (75-13 Task 1 tracer)', () => {
  it('renders the label, headline, subhead and all 4 trust bullets in en (unchanged output)', () => {
    renderWithIntl(<BookingSection />)
    expect(screen.getByText('Instant booking')).toBeTruthy()
    expect(screen.getByText('Book your')).toBeTruthy()
    expect(screen.getByText('chauffeur now.')).toBeTruthy()
    expect(
      screen.getByText(
        'Fixed price. Instant confirmation. Your driver tracks your flight automatically.'
      )
    ).toBeTruthy()
    expect(screen.getByText('Flight tracking included')).toBeTruthy()
    expect(screen.getByText('Fixed price — no surprises')).toBeTruthy()
    expect(screen.getByText('Free cancellation up to 1 hour')).toBeTruthy()
    expect(screen.getByText('Meet & greet at Arrivals')).toBeTruthy()
  })

  it('renders the ru headline and none of the EN strings under the ru catalog', () => {
    const { container } = renderWithIntl(<BookingSection />, {
      locale: 'ru',
      messages: ruMessagesTyped,
    })
    const html = container.innerHTML
    for (const s of EN_STRINGS) {
      expect(html).not.toContain(s)
    }
    const ruSection = (ruMessagesTyped as unknown as { BookingSection: { headlineLine1: string } })
      .BookingSection
    expect(html).toContain(ruSection.headlineLine1)
  })
})
