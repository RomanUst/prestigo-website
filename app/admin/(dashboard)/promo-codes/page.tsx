'use client'
import { useState, useEffect } from 'react'
import { PromoCodesTable } from '@/components/admin/PromoCodesTable'
import type { PromoCode } from '@/components/admin/PromoCodesTable'
import { PromoCodeForm } from '@/components/admin/PromoCodeForm'

export default function PromoCodesPage() {
  const [promoCodes, setPromoCodes] = useState<PromoCode[]>([])
  const [loading, setLoading] = useState(true)

  async function fetchPromoCodes() {
    try {
      const res = await fetch('/api/admin/promo-codes')
      if (res.ok) {
        const json = await res.json()
        setPromoCodes(json.data ?? [])
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchPromoCodes()
  }, [])

  function handleCreated(code: PromoCode) {
    setPromoCodes(prev => [code, ...prev])
  }

  return (
    <div>
      <h1
        style={{
          fontFamily: 'var(--font-cormorant)',
          fontSize: '26px',
          fontWeight: 300,
          lineHeight: 1.2,
          color: '#F5F2EE',
          letterSpacing: 0,
          marginBottom: '8px',
        }}
      >
        Promo Codes
      </h1>
      <p
        style={{
          fontSize: '13px',
          fontWeight: 300,
          color: '#9A958F',
          fontFamily: 'var(--font-montserrat)',
          marginBottom: '32px',
          margin: '0 0 32px 0',
        }}
      >
        Manage discount codes for the booking wizard.
      </p>

      <div
        style={{
          backgroundColor: '#2A2A2D',
          border: '1px solid #3A3A3F',
          borderRadius: '8px',
          padding: '24px',
          marginBottom: '32px',
        }}
      >
        <PromoCodeForm onCreated={handleCreated} />
      </div>

      {loading ? (
        <div
          style={{
            fontFamily: 'var(--font-montserrat)',
            fontSize: '13px',
            fontWeight: 300,
            color: '#F5F2EE',
            opacity: 0.4,
          }}
        >
          ...
        </div>
      ) : (
        <PromoCodesTable promoCodes={promoCodes} onUpdate={fetchPromoCodes} />
      )}
    </div>
  )
}
