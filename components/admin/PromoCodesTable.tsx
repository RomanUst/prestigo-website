'use client'
import { useState, useEffect } from 'react'
import { ToggleLeft, ToggleRight, Trash2 } from 'lucide-react'

export interface PromoCode {
  id: string
  code: string
  discount_type: string
  discount_value: number
  expiry_date: string | null
  max_uses: number | null
  current_uses: number
  is_active: boolean
  created_at: string
}

type PromoCodesTableProps = {
  promoCodes: PromoCode[]
  onUpdate: () => void
}

const thStyle: React.CSSProperties = {
  fontFamily: 'var(--font-montserrat)',
  fontSize: '11px',
  fontWeight: 400,
  letterSpacing: '0.3em',
  textTransform: 'uppercase',
  color: '#9A958F',
  padding: '10px 12px',
  textAlign: 'left',
  borderBottom: '1px solid #3A3A3F',
}

function formatExpiry(date: string | null): React.ReactNode {
  if (!date) {
    return (
      <span style={{ fontSize: '11px', color: '#9A958F', letterSpacing: '0.3em' }}>
        No expiry
      </span>
    )
  }
  return date
}

function formatUses(current: number, max: number | null): React.ReactNode {
  const maxLabel = max !== null ? String(max) : 'Unlimited'
  return (
    <span style={{ fontSize: '11px', color: '#9A958F' }}>
      {current} / {maxLabel}
    </span>
  )
}

export function PromoCodesTable({ promoCodes, onUpdate }: PromoCodesTableProps) {
  const [localCodes, setLocalCodes] = useState<PromoCode[]>(promoCodes)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  // Keep local state in sync when parent updates
  useEffect(() => {
    setLocalCodes(promoCodes)
  }, [promoCodes])

  async function handleToggleActive(code: PromoCode) {
    const newActive = !code.is_active
    // Optimistic update
    setLocalCodes(prev =>
      prev.map(c => c.id === code.id ? { ...c, is_active: newActive } : c)
    )

    try {
      const res = await fetch('/api/admin/promo-codes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: code.id, is_active: newActive }),
      })
      if (!res.ok) throw new Error('Failed')
    } catch {
      // Revert on error
      setLocalCodes(prev =>
        prev.map(c => c.id === code.id ? { ...c, is_active: code.is_active } : c)
      )
      alert('Failed to update promo code')
    }
  }

  function handleDeleteClick(id: string) {
    setConfirmDeleteId(id)
    setTimeout(() => {
      setConfirmDeleteId(prev => (prev === id ? null : prev))
    }, 3000)
  }

  async function handleDeleteConfirm(id: string) {
    setConfirmDeleteId(null)
    try {
      const res = await fetch(`/api/admin/promo-codes?id=${id}`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error('Failed')
      onUpdate()
    } catch {
      alert('Failed to delete promo code')
    }
  }

  if (localCodes.length === 0) {
    return (
      <div
        style={{
          textAlign: 'center',
          padding: '48px 24px',
          border: '1px solid #3A3A3F',
          borderRadius: '8px',
          backgroundColor: '#2A2A2D',
        }}
      >
        <div
          style={{
            fontFamily: 'var(--font-montserrat)',
            fontSize: '13px',
            fontWeight: 300,
            color: '#F5F2EE',
            marginBottom: '8px',
          }}
        >
          No promo codes yet.
        </div>
        <div
          style={{
            fontFamily: 'var(--font-montserrat)',
            fontSize: '13px',
            fontWeight: 300,
            color: '#9A958F',
            marginBottom: '16px',
          }}
        >
          Create a code to offer a discount at checkout.
        </div>
        <button
          onClick={() => {
            const input = document.querySelector<HTMLInputElement>('input[placeholder="SUMMER20"]')
            if (input) input.focus()
          }}
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
            cursor: 'pointer',
          }}
        >
          Create Code
        </button>
      </div>
    )
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontFamily: 'var(--font-montserrat)',
        }}
      >
        <thead>
          <tr>
            <th style={thStyle}>Code</th>
            <th style={thStyle}>Discount</th>
            <th style={thStyle}>Expiry</th>
            <th style={thStyle}>Uses</th>
            <th style={thStyle}>Status</th>
            <th style={thStyle}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {localCodes.map((code) => {
            const dimmed = !code.is_active
            const cellStyle: React.CSSProperties = {
              fontSize: '13px',
              fontWeight: 300,
              color: dimmed ? '#9A958F' : '#F5F2EE',
              padding: '10px 12px',
              borderBottom: '1px solid #3A3A3F',
              backgroundColor: dimmed ? '#1C1C1E' : '#2A2A2D',
            }

            return (
              <tr key={code.id}>
                <td style={{ ...cellStyle, letterSpacing: '0.08em' }}>{code.code}</td>
                <td style={{ ...cellStyle, color: dimmed ? '#9A958F' : '#4ade80', fontWeight: 400 }}>
                  {code.discount_value}%
                </td>
                <td style={cellStyle}>{formatExpiry(code.expiry_date)}</td>
                <td style={cellStyle}>{formatUses(code.current_uses, code.max_uses)}</td>
                <td style={cellStyle}>
                  <span
                    style={{
                      display: 'inline-block',
                      padding: '2px 8px',
                      fontSize: '11px',
                      fontWeight: 400,
                      letterSpacing: '0.08em',
                      borderRadius: '2px',
                      color: code.is_active ? '#4ade80' : '#f87171',
                      border: `1px solid ${code.is_active ? '#4ade80' : '#f87171'}`,
                    }}
                  >
                    {code.is_active ? 'ACTIVE' : 'INACTIVE'}
                  </span>
                </td>
                <td style={{ ...cellStyle, padding: '0 4px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    {/* Toggle active */}
                    <button
                      onClick={() => handleToggleActive(code)}
                      aria-label={code.is_active ? 'Deactivate promo' : 'Reactivate promo'}
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        minWidth: '44px',
                        minHeight: '44px',
                        padding: '0',
                        color: code.is_active ? '#4ade80' : '#f87171',
                      }}
                    >
                      {code.is_active ? <ToggleLeft size={20} /> : <ToggleRight size={20} />}
                    </button>

                    {/* Delete */}
                    {confirmDeleteId === code.id ? (
                      <button
                        onClick={() => handleDeleteConfirm(code.id)}
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          minWidth: '44px',
                          minHeight: '44px',
                          padding: '0 8px',
                          fontFamily: 'var(--font-montserrat)',
                          fontSize: '11px',
                          fontWeight: 400,
                          letterSpacing: '0.08em',
                          color: '#f87171',
                        }}
                      >
                        CONFIRM?
                      </button>
                    ) : (
                      <button
                        onClick={() => handleDeleteClick(code.id)}
                        aria-label="Delete promo"
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          minWidth: '44px',
                          minHeight: '44px',
                          padding: '0',
                          color: '#9A958F',
                        }}
                        onMouseEnter={(e) => {
                          ;(e.currentTarget as HTMLButtonElement).style.color = '#f87171'
                        }}
                        onMouseLeave={(e) => {
                          ;(e.currentTarget as HTMLButtonElement).style.color = '#9A958F'
                        }}
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
