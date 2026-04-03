'use client'
import { useState } from 'react'
import type { PromoCode } from '@/components/admin/PromoCodesTable'

const inputBaseStyle: React.CSSProperties = {
  backgroundColor: '#2A2A2D',
  border: '1px solid #3A3A3F',
  color: '#F5F2EE',
  fontFamily: 'var(--font-montserrat)',
  fontSize: '13px',
  fontWeight: 300,
  letterSpacing: '0.03em',
  padding: '8px 12px',
  minHeight: '44px',
  borderRadius: '4px',
  outline: 'none',
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontFamily: 'var(--font-montserrat)',
  fontSize: '11px',
  fontWeight: 400,
  letterSpacing: '0.3em',
  textTransform: 'uppercase',
  color: '#9A958F',
  marginBottom: '4px',
}

type PromoCodeFormProps = {
  onCreated: (code: PromoCode) => void
}

export function PromoCodeForm({ onCreated }: PromoCodeFormProps) {
  const [code, setCode] = useState('')
  const [discountValue, setDiscountValue] = useState('')
  const [expiryDate, setExpiryDate] = useState('')
  const [maxUses, setMaxUses] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [codeError, setCodeError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setIsSubmitting(true)
    setCodeError(null)

    try {
      const res = await fetch('/api/admin/promo-codes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code,
          discount_value: parseFloat(discountValue),
          expiry_date: expiryDate || null,
          max_uses: maxUses ? parseInt(maxUses) : null,
        }),
      })

      const json = await res.json()

      if (!res.ok) {
        if (res.status === 400 && json.error === 'Code already exists.') {
          setCodeError('Code already exists.')
        } else {
          setCodeError(json.error ?? 'Something went wrong. Please try again.')
        }
        return
      }

      onCreated(json.data as PromoCode)
      setCode('')
      setDiscountValue('')
      setExpiryDate('')
      setMaxUses('')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div
        style={{
          display: 'flex',
          gap: '12px',
          alignItems: 'flex-end',
          flexWrap: 'wrap',
        }}
      >
        {/* CODE */}
        <div>
          <label style={labelStyle}>Code</label>
          <div>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="SUMMER20"
              required
              minLength={3}
              maxLength={50}
              style={{ ...inputBaseStyle, width: '160px' }}
            />
            {codeError && (
              <div
                style={{
                  color: '#f87171',
                  fontFamily: 'var(--font-montserrat)',
                  fontSize: '11px',
                  fontWeight: 400,
                  marginTop: '4px',
                }}
              >
                {codeError}
              </div>
            )}
          </div>
        </div>

        {/* DISCOUNT % */}
        <div>
          <label style={labelStyle}>Discount %</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <input
              type="number"
              value={discountValue}
              onChange={(e) => setDiscountValue(e.target.value)}
              min={1}
              max={100}
              required
              style={{ ...inputBaseStyle, width: '80px' }}
            />
            <span
              style={{
                fontFamily: 'var(--font-montserrat)',
                fontSize: '11px',
                fontWeight: 400,
                color: '#9A958F',
              }}
            >
              %
            </span>
          </div>
        </div>

        {/* EXPIRY DATE */}
        <div>
          <label style={labelStyle}>Expiry Date</label>
          <input
            type="date"
            value={expiryDate}
            onChange={(e) => setExpiryDate(e.target.value)}
            style={{ ...inputBaseStyle }}
          />
        </div>

        {/* USAGE LIMIT */}
        <div>
          <label style={labelStyle}>Usage Limit</label>
          <input
            type="number"
            value={maxUses}
            onChange={(e) => setMaxUses(e.target.value)}
            min={1}
            placeholder="Unlimited"
            style={{ ...inputBaseStyle, width: '80px' }}
          />
        </div>

        {/* SUBMIT */}
        <button
          type="submit"
          disabled={isSubmitting}
          style={{
            backgroundColor: '#B87333',
            color: '#F5F2EE',
            fontFamily: 'var(--font-montserrat)',
            fontSize: '13px',
            fontWeight: 400,
            letterSpacing: '0.08em',
            border: 'none',
            borderRadius: '4px',
            padding: '0 20px',
            minHeight: '44px',
            cursor: isSubmitting ? 'not-allowed' : 'pointer',
            opacity: isSubmitting ? 0.7 : 1,
          }}
        >
          {isSubmitting ? '...' : 'Add Code'}
        </button>
      </div>
    </form>
  )
}
