'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Modal } from '@/components/admin/Modal'
import { AccountForm } from '@/components/admin/AccountForm'
import type { AdminAccount } from '@/app/api/admin/accounts/route'

const vehicleFormatCZK = (value: number) =>
  new Intl.NumberFormat('cs-CZ').format(value)

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<AdminAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [hoveredRow, setHoveredRow] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const router = useRouter()

  useEffect(() => {
    fetch('/api/admin/accounts')
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        if (data?.accounts) setAccounts(data.accounts)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '0 0 24px' }}>
        <h1
          style={{
            fontFamily: 'var(--font-cormorant)',
            fontSize: '28px',
            fontWeight: 400,
            color: 'var(--offwhite)',
            letterSpacing: '0.08em',
            margin: 0,
          }}
        >
          Accounts
        </h1>
        <button
          onClick={() => setModalOpen(true)}
          style={{
            backgroundColor: '#B87333',
            color: '#F5F2EE',
            border: 'none',
            borderRadius: '4px',
            padding: '8px 24px',
            fontFamily: 'var(--font-montserrat)',
            fontSize: '13px',
            fontWeight: 400,
            cursor: 'pointer',
            minHeight: '44px',
          }}
        >
          Add Account
        </button>
      </div>

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title="Add Account">
        <AccountForm
          onCreated={(id) => {
            setModalOpen(false)
            router.push(`/admin/accounts/${id}`)
          }}
          onClose={() => setModalOpen(false)}
        />
      </Modal>

      <div
        style={{
          width: '100%',
          border: '1px solid var(--anthracite-light)',
          borderRadius: '4px',
          overflow: 'hidden',
        }}
      >
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr
              style={{
                background: 'var(--anthracite)',
                borderBottom: '1px solid var(--anthracite-light)',
                height: '40px',
              }}
            >
              {['ACCOUNT', 'TYPE', 'EMAIL', 'REG / IČO', 'TRIPS', 'REVENUE'].map((h, i) => (
                <th
                  key={h}
                  style={{
                    padding: '0 12px',
                    textAlign: i >= 4 ? 'right' : 'left',
                    fontFamily: 'var(--font-montserrat)',
                    fontSize: '11px',
                    fontWeight: 400,
                    textTransform: 'uppercase',
                    letterSpacing: '0.4em',
                    color: 'var(--warmgrey)',
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} style={emptyCellStyle}>Loading...</td>
              </tr>
            ) : accounts.length === 0 ? (
              <tr>
                <td colSpan={6} style={emptyCellStyle}>
                  <div>No accounts yet.</div>
                </td>
              </tr>
            ) : (
              accounts.map((a) => {
                const name = a.company_name || a.full_name || a.email || '—'
                return (
                  <tr
                    key={a.user_id}
                    onMouseEnter={() => setHoveredRow(a.user_id)}
                    onMouseLeave={() => setHoveredRow(null)}
                    style={{
                      background: hoveredRow === a.user_id ? 'var(--anthracite-light)' : 'var(--anthracite-mid)',
                      borderBottom: '1px solid var(--anthracite-light)',
                    }}
                  >
                    <td style={cellStyle}>
                      <Link
                        href={`/admin/accounts/${a.user_id}`}
                        style={{ color: 'var(--copper)', textDecoration: 'none', fontWeight: 500 }}
                      >
                        {name}
                      </Link>
                    </td>
                    <td style={cellStyle}>
                      <span
                        style={{
                          fontSize: '11px',
                          textTransform: 'uppercase',
                          letterSpacing: '0.1em',
                          padding: '3px 8px',
                          borderRadius: '2px',
                          border: '1px solid',
                          borderColor: a.account_type === 'corporate' ? 'var(--copper)' : 'var(--anthracite-light)',
                          color: a.account_type === 'corporate' ? 'var(--copper)' : 'var(--warmgrey)',
                        }}
                      >
                        {a.account_type}
                      </span>
                    </td>
                    <td style={{ ...cellStyle, color: 'var(--warmgrey)' }}>{a.email ?? '—'}</td>
                    <td style={{ ...cellStyle, color: 'var(--warmgrey)' }}>{a.ico ?? '—'}</td>
                    <td style={{ ...cellStyle, textAlign: 'right' }}>{a.booking_count}</td>
                    <td style={{ ...cellStyle, textAlign: 'right' }}>{vehicleFormatCZK(a.total_spent_czk)} CZK</td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

const cellStyle: React.CSSProperties = {
  padding: '0 12px',
  height: '48px',
  fontFamily: 'var(--font-montserrat)',
  fontSize: '13px',
  color: 'var(--offwhite)',
}

const emptyCellStyle: React.CSSProperties = {
  padding: '32px',
  textAlign: 'center',
  fontFamily: 'var(--font-montserrat)',
  fontSize: '13px',
  color: 'var(--warmgrey)',
}
