'use client'

// Cancellation policy note (Phase 89, plan 89-11; UI-SPEC Surface 2.3; CANC-02, D-07, D-18).
// Shown on the card, cash and pay-now checkout steps, and only when /api/card-checkout/init returned a policy for this
// client (the go-live gate). The caller decides: no policy, no note. Every number is an ICU parameter filled from the
// init policy (never typed); the deadline is the booking's own exact Prague date and time. Money goes through
// formatMinor. Dates and amounts sit in <bdi> so a right-to-left page keeps them intact.

import type { ReactNode } from 'react'
import { useTranslations, useLocale } from 'next-intl'
import { getPathname } from '@/i18n/routing'
import type { AppLocale } from '@/i18n/locales'
import { formatLocaleDateTime } from '@/lib/locale-date'
import { formatMinor, type PaymentCurrency } from '@/lib/payments/money'
import type { InitPolicy } from './steps/cardCheckoutApi'

interface Props {
  policy: InitPolicy
  /** The fee shown in row 2, in `currency` minor units. The pay-now step converts it for a CZK client. */
  feeMinor: number
  currency: PaymentCurrency
}

const rowStyle = {
  margin: 0,
  fontSize: 14,
  fontWeight: 300,
  lineHeight: 1.5,
  color: 'var(--offwhite)',
  fontFamily: 'var(--font-montserrat)',
  overflowWrap: 'anywhere',
} as const

const linkStyle = { color: 'var(--copper-light)', textDecoration: 'underline' } as const

export default function CancellationPolicyNote({ policy, feeMinor, currency }: Props) {
  const t = useTranslations('Booking.step6.cancellation')
  const locale = useLocale() as AppLocale

  // The catalog wraps dates and amounts in <bdi>…</bdi>; the rich tag renders it (as Hero does for its price token).
  const bdi = (chunks: ReactNode) => <bdi>{chunks}</bdi>
  const freeUntil = formatLocaleDateTime(Date.parse(policy.freeUntilIso), locale)
  const amount = formatMinor(feeMinor, currency)

  return (
    <section
      data-testid="cancellation-note"
      aria-labelledby="cancellation-note-label"
      style={{
        backgroundColor: 'var(--anthracite-mid)',
        border: '1px solid var(--anthracite-light)',
        borderInlineStart: '3px solid var(--copper)',
        borderRadius: 4,
        padding: 24,
        marginBottom: 32,
      }}
    >
      <span id="cancellation-note-label" className="label" style={{ display: 'block' }}>
        {t('label')}
      </span>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 16 }}>
        <p style={rowStyle}>
          {policy.freeUntilPassed
            ? t('rowFreeUnavailable', { hours: policy.hours })
            : t.rich('rowFree', { freeUntil, bdi })}
        </p>
        <p style={rowStyle}>{t.rich('rowFee', { percent: policy.percent, amount, bdi })}</p>
        <p style={rowStyle}>{t('rowNoShow', { waitMin: policy.waitMin })}</p>
      </div>
      <p style={{ margin: '16px 0 0', fontSize: 12, fontWeight: 300, fontFamily: 'var(--font-montserrat)' }}>
        <a
          href={getPathname({ locale, href: '/terms' })}
          target="_blank"
          rel="noopener noreferrer"
          style={linkStyle}
        >
          {t('termsLink')}
        </a>
      </p>
    </section>
  )
}

/**
 * Pay-now acceptance line, directly above the pay button (UI-SPEC 2.3). There is no checkbox: acceptance is recorded
 * through the policy version stored on the booking.
 */
export function CancellationAcceptanceLine() {
  const t = useTranslations('Booking.step6.cancellation')
  const locale = useLocale() as AppLocale
  return (
    <p
      data-testid="cancellation-acceptance"
      style={{
        margin: '24px 0 0',
        fontSize: 14,
        fontWeight: 300,
        lineHeight: 1.5,
        color: 'var(--offwhite)',
        fontFamily: 'var(--font-montserrat)',
      }}
    >
      {t.rich('acceptance', {
        terms: (chunks) => (
          <a href={getPathname({ locale, href: '/terms' })} target="_blank" rel="noopener noreferrer" style={linkStyle}>
            {chunks}
          </a>
        ),
      })}
    </p>
  )
}
