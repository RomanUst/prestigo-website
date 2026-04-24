'use client'
import { useState } from 'react'

const inputBaseStyle: React.CSSProperties = {
  width: '100px',
  background: 'var(--anthracite)',
  border: '1px solid var(--anthracite-light)',
  borderRadius: '2px',
  color: 'var(--offwhite)',
  fontFamily: 'var(--font-montserrat)',
  fontSize: '13px',
  textAlign: 'right',
  padding: '8px',
  outline: 'none',
}

const cardStyle: React.CSSProperties = {
  background: 'var(--anthracite-mid)',
  border: '1px solid var(--anthracite-light)',
  borderRadius: '4px',
  padding: '24px',
}

const headerLabelStyle: React.CSSProperties = {
  fontFamily: 'var(--font-montserrat)',
  fontSize: '11px',
  textTransform: 'uppercase',
  letterSpacing: '0.4em',
  color: 'var(--warmgrey)',
}

type PromoCardProps = {
  initial: { active: boolean; regularPriceEur: number; promoPriceEur: number }
}

export default function PromoCard({ initial }: PromoCardProps) {
  const [active, setActive] = useState(initial.active)
  const [regular, setRegular] = useState(initial.regularPriceEur)
  const [promo, setPromo] = useState(initial.promoPriceEur)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'range-error' | 'error'>('idle')

  async function handleSave() {
    setSaveStatus('saving')
    const res = await fetch('/api/admin/promo', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active, regularPriceEur: regular, promoPriceEur: promo }),
    })
    if (res.ok) {
      setSaveStatus('saved')
      setTimeout(() => setSaveStatus('idle'), 3000)
    } else if (res.status === 422) {
      setSaveStatus('range-error')
    } else {
      setSaveStatus('error')
    }
  }

  return (
    <div style={cardStyle}>
      <div style={headerLabelStyle}>AIRPORT PROMO</div>

      <div style={{ marginTop: '16px', marginBottom: '16px' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
          <input
            type="checkbox"
            role="switch"
            aria-checked={active}
            checked={active}
            onChange={e => setActive(e.target.checked)}
          />
          <span
            style={{
              fontFamily: 'var(--font-montserrat)',
              fontSize: '13px',
              color: 'var(--offwhite)',
            }}
          >
            Promo active
          </span>
        </label>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div>
          <label
            htmlFor="promo-regular"
            style={{
              ...headerLabelStyle,
              display: 'block',
              marginBottom: '6px',
            }}
          >
            Regular price (EUR)
          </label>
          <input
            id="promo-regular"
            type="number"
            step="0.01"
            min="0"
            value={regular}
            onChange={e => setRegular(Number(e.target.value))}
            style={inputBaseStyle}
          />
        </div>

        <div>
          <label
            htmlFor="promo-promo"
            style={{
              ...headerLabelStyle,
              display: 'block',
              marginBottom: '6px',
            }}
          >
            Promo price (EUR)
          </label>
          <input
            id="promo-promo"
            type="number"
            step="0.01"
            min="0"
            value={promo}
            onChange={e => setPromo(Number(e.target.value))}
            style={{
              ...inputBaseStyle,
              opacity: active ? 1 : 0.5,
              pointerEvents: active ? 'auto' : 'none',
            }}
          />
        </div>
      </div>

      <div style={{ marginTop: '20px', display: 'flex', alignItems: 'center', gap: '16px' }}>
        <button
          type="button"
          onClick={handleSave}
          disabled={saveStatus === 'saving'}
          style={{
            border: '1px solid var(--copper)',
            color: 'var(--offwhite)',
            background: 'transparent',
            padding: '12px 24px',
            fontFamily: 'var(--font-montserrat)',
            fontSize: '11px',
            fontWeight: 400,
            textTransform: 'uppercase',
            letterSpacing: '0.35em',
            borderRadius: '0',
            cursor: saveStatus === 'saving' ? 'not-allowed' : 'pointer',
            opacity: saveStatus === 'saving' ? 0.5 : 1,
          }}
        >
          Save
        </button>

        {saveStatus === 'range-error' && (
          <span style={{ color: '#ff6b6b', fontFamily: 'var(--font-montserrat)', fontSize: '12px' }}>
            Promo price must not exceed regular price.
          </span>
        )}
        {saveStatus === 'saved' && (
          <span style={{ color: 'var(--copper)', fontFamily: 'var(--font-montserrat)', fontSize: '12px' }}>
            Airport promo saved — pages revalidating
          </span>
        )}
        {saveStatus === 'error' && (
          <span style={{ color: '#ff6b6b', fontFamily: 'var(--font-montserrat)', fontSize: '12px' }}>
            Save failed. Try again.
          </span>
        )}
      </div>
    </div>
  )
}
