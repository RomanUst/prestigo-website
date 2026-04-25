'use client'

import { useState, useEffect } from 'react'
import { useCalculatorStore } from '@/lib/calculator-store'

export default function ContinueQuoteToast() {
  const { from, to, expiresAt } = useCalculatorStore()
  const [visible, setVisible] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (expiresAt && Date.now() < expiresAt && from && to) {
      setVisible(true)
      const timer = setTimeout(() => {
        setVisible(false)
      }, 8000)
      return () => clearTimeout(timer)
    }
  }, [expiresAt, from, to])

  if (!visible || dismissed) return null

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        bottom: '16px',
        left: '16px',
        right: '16px',
        zIndex: 1000,
        background: 'var(--anthracite-mid)',
        borderRadius: '4px',
        borderLeft: '4px solid var(--copper)',
        padding: '12px 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '12px',
        // Desktop override
        maxWidth: '420px',
      }}
    >
      <span
        style={{
          fontFamily: 'var(--font-montserrat)',
          fontSize: '13px',
          fontWeight: 300,
          color: 'var(--offwhite)',
        }}
      >
        Continue your quote? {from?.address} → {to?.address}
      </span>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => setDismissed(true)}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: 'var(--warmgrey)',
          fontSize: '16px',
          lineHeight: 1,
          padding: '4px',
          flexShrink: 0,
        }}
      >
        ×
      </button>
    </div>
  )
}
