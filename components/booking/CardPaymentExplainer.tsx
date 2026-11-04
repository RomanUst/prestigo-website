'use client'

// "How payment works" panel (Phase 88 UI-SPEC Surface 1; D-11, D-12). DRAFT legal copy, pending the Phase 89 review.
// Every string comes from Booking.step6.cardOnFile. The amount is the server amount (formatMinor) and the hold
// date is the exact Prague date from /init (formatLocaleDate, Latin digits in ar / hi / zh).

import { useTranslations, useLocale } from 'next-intl'
import { formatLocaleDate } from '@/lib/locale-date'
import { formatMinor, type PaymentCurrency } from '@/lib/payments/money'

interface Props {
  mode: 'setup' | 'hold_now'
  amountMinor: number
  currency: PaymentCurrency
  holdDateIso: string | null
}

const bodyStyle = {
  margin: '4px 0 0',
  fontSize: 14,
  fontWeight: 300,
  lineHeight: 1.5,
  color: 'var(--offwhite)',
  fontFamily: 'var(--font-montserrat)',
} as const

export default function CardPaymentExplainer({ mode, amountMinor, currency, holdDateIso }: Props) {
  const t = useTranslations('Booking.step6.cardOnFile')
  const locale = useLocale()
  const amount = formatMinor(amountMinor, currency)

  const rows: Array<{ caption: string; body: string }> =
    mode === 'setup'
      ? [
          { caption: t('captionToday'), body: t('setupToday') },
          {
            caption: holdDateIso ? formatLocaleDate(holdDateIso, locale) : t('captionToday'),
            body: t('setupHoldDay', { amount }),
          },
          { caption: t('captionAfterTrip'), body: t('setupAfterTrip') },
        ]
      : [
          { caption: t('captionToday'), body: t('holdNowToday', { amount }) },
          { caption: t('captionAfterTrip'), body: t('holdNowAfterTrip') },
        ]

  return (
    <section
      aria-live="off"
      style={{
        backgroundColor: 'var(--anthracite-mid)',
        border: '1px solid var(--anthracite-light)',
        borderInlineStart: '3px solid var(--copper)',
        borderRadius: 4,
        padding: 24,
        marginBottom: 32,
      }}
    >
      <h3
        style={{
          margin: 0,
          fontSize: 20,
          fontWeight: 400,
          lineHeight: 1.2,
          color: 'var(--offwhite)',
          fontFamily: 'var(--font-montserrat)',
        }}
      >
        {mode === 'setup' ? t('headlineSetup') : t('headlineHoldNow')}
      </h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 16 }}>
        {rows.map((row, i) => (
          <div key={i}>
            <span className="label" style={{ display: 'block' }}>
              {row.caption}
            </span>
            <p style={bodyStyle}>{row.body}</p>
          </div>
        ))}
      </div>
    </section>
  )
}
