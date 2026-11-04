'use client'

// Promo code block for the card step (Phase 88, plan 88-10). A copy of the Step6Payment promo behaviour
// (same endpoint /api/validate-promo, same error codes, same markup) so Step6Payment.tsx stays untouched.
// The parent owns the booking store writes and the init re-call (onApplied / onRemoved).

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { CheckCircle2 } from 'lucide-react'

// Stable machine codes returned by /api/validate-promo that have a Booking.step6.errors.<code> catalog message.
const KNOWN_PROMO_ERROR_CODES = new Set([
  'RATE_LIMITED',
  'INVALID_REQUEST',
  'PROMO_INVALID',
  'PRICING_UNAVAILABLE',
  'INTERNAL',
  'NO_CODE',
])

interface Props {
  promoCode: string | null
  /** Applied discount in percent, shown under the field (0 / undefined = nothing). */
  discountPct?: number
  disabled?: boolean
  onApplied: (code: string, discountPct: number) => void
  onRemoved: () => void
}

export default function PromoCodeField({ promoCode, discountPct = 0, disabled = false, onApplied, onRemoved }: Props) {
  const t = useTranslations('Booking.step6')
  const [promoInput, setPromoInput] = useState('')
  const [promoLoading, setPromoLoading] = useState(false)
  const [promoError, setPromoError] = useState<string | null>(null)

  const handleApply = async () => {
    const code = promoInput.trim().toUpperCase()
    if (!code) return
    setPromoLoading(true)
    setPromoError(null)
    try {
      const res = await fetch(`/api/validate-promo?code=${encodeURIComponent(code)}`)
      const data = await res.json()
      if (data.valid) {
        setPromoError(null)
        onApplied(code, data.discountPct)
      } else {
        const errCode = data.code as string | undefined
        setPromoError(errCode && KNOWN_PROMO_ERROR_CODES.has(errCode) ? t(`errors.${errCode}`) : t('promoInvalid'))
      }
    } catch {
      setPromoError(t('promoGenericError'))
    } finally {
      setPromoLoading(false)
    }
  }

  const handleRemove = () => {
    setPromoInput('')
    setPromoError(null)
    onRemoved()
  }

  const applyDisabled = disabled || promoLoading || !promoInput.trim()

  return (
    <div style={{ marginTop: 24, marginBottom: 24 }}>
      <span
        style={{
          display: 'block',
          fontSize: '11px',
          fontWeight: 400,
          letterSpacing: '0.3em',
          textTransform: 'uppercase',
          color: '#A9AEB0',
          fontFamily: 'var(--font-montserrat)',
          marginBottom: 8,
        }}
      >
        {t('promoCodeLabel')}
      </span>

      {promoCode ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <CheckCircle2 size={16} color="#4ade80" aria-hidden="true" />
          <span
            style={{
              fontSize: '13px',
              fontWeight: 300,
              color: '#F3EEE3',
              fontFamily: 'var(--font-montserrat)',
              letterSpacing: '0.08em',
            }}
          >
            {promoCode}
          </span>
          <button
            type="button"
            onClick={handleRemove}
            disabled={disabled}
            style={{
              background: 'none',
              border: 'none',
              color: '#A9AEB0',
              fontSize: '11px',
              fontFamily: 'var(--font-montserrat)',
              cursor: disabled ? 'not-allowed' : 'pointer',
              textDecoration: 'underline',
              letterSpacing: '0.08em',
            }}
          >
            {t('remove')}
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type="text"
            value={promoInput}
            onChange={(e) => setPromoInput(e.target.value.toUpperCase())}
            placeholder={t('promoPlaceholder')}
            aria-label={t('promoCodeLabel')}
            style={{
              flex: 1,
              backgroundColor: '#17293B',
              border: promoError ? '1px solid #f87171' : '1px solid #2B4056',
              color: '#F3EEE3',
              fontFamily: 'var(--font-montserrat)',
              fontSize: '13px',
              fontWeight: 300,
              letterSpacing: '0.08em',
              padding: '8px 12px',
              minHeight: 44,
              borderRadius: 4,
              outline: 'none',
            }}
          />
          <button
            type="button"
            onClick={handleApply}
            disabled={applyDisabled}
            style={{
              backgroundColor: '#BFA06A',
              color: '#F3EEE3',
              border: 'none',
              fontFamily: 'var(--font-montserrat)',
              fontSize: '13px',
              fontWeight: 400,
              letterSpacing: '0.08em',
              padding: '0 16px',
              minHeight: 44,
              borderRadius: 4,
              cursor: applyDisabled ? 'not-allowed' : 'pointer',
              opacity: applyDisabled ? 0.4 : 1,
              whiteSpace: 'nowrap',
            }}
          >
            {promoLoading ? '...' : t('applyCode')}
          </button>
        </div>
      )}

      {promoError && (
        <p
          role="alert"
          style={{
            color: '#f87171',
            fontSize: '13px',
            fontWeight: 300,
            fontFamily: 'var(--font-montserrat)',
            marginTop: 8,
          }}
        >
          {promoError}
        </p>
      )}

      {discountPct > 0 && (
        <p
          style={{
            color: '#4ade80',
            fontSize: '13px',
            fontWeight: 400,
            fontFamily: 'var(--font-montserrat)',
            marginTop: 8,
          }}
        >
          {t('promoDiscount', { percent: discountPct })}
        </p>
      )}
    </div>
  )
}
