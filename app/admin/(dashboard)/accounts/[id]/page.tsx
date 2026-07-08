'use client'
import { useState, useEffect, useCallback, use } from 'react'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { ManualBookingForm } from '@/components/admin/ManualBookingForm'
import { StatusBadge } from '@/components/admin/StatusBadge'

interface Account {
  user_id: string
  email: string | null
  account_type: 'personal' | 'corporate'
  company_name: string | null
  full_name: string | null
  phone: string | null
  ico: string | null
  vat_id: string | null
  billing_address: string | null
  created_at: string
}

interface AccountBooking {
  id: string
  booking_reference: string
  booking_source: string
  pickup_date: string
  pickup_time: string
  trip_type: string
  vehicle_class: string
  origin_address: string
  destination_address: string | null
  amount_czk: number
  status: string
  paid_at: string | null
  invoice_number: string | null
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending', confirmed: 'Confirmed', completed: 'Completed', cancelled: 'Cancelled',
  assigned: 'Assigned', en_route: 'En Route', on_location: 'On Location',
}
const vehicleClassMap: Record<string, string> = {
  business: 'Business', first_class: 'First Class', business_van: 'Business Van',
}
const formatCZK = (v: number) => new Intl.NumberFormat('cs-CZ').format(v)

export default function AccountDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [account, setAccount] = useState<Account | null>(null)
  const [bookings, setBookings] = useState<AccountBooking[]>([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [showNewBooking, setShowNewBooking] = useState(false)

  const fetchAccount = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/accounts/${id}`)
      if (res.status === 404) { setNotFound(true); return }
      if (!res.ok) return
      const data = await res.json()
      setAccount(data.account)
      setBookings(data.bookings ?? [])
    } catch {
      /* ignore */
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { fetchAccount() }, [fetchAccount])

  const handleCreated = useCallback(() => {
    setShowNewBooking(false)
    fetchAccount()
  }, [fetchAccount])

  if (loading) {
    return <div style={{ padding: '32px 0', color: 'var(--warmgrey)', fontFamily: 'var(--font-montserrat)', fontSize: '13px' }}>Loading...</div>
  }
  if (notFound || !account) {
    return (
      <div style={{ padding: '32px 0' }}>
        <Link href="/admin/accounts" style={backLinkStyle}><ArrowLeft size={14} /> Accounts</Link>
        <div style={{ marginTop: 24, color: 'var(--warmgrey)', fontFamily: 'var(--font-montserrat)', fontSize: '13px' }}>Account not found.</div>
      </div>
    )
  }

  const name = account.company_name || account.full_name || account.email || 'Account'
  const revenue = bookings.filter(b => b.status !== 'cancelled').reduce((s, b) => s + (b.amount_czk ?? 0), 0)

  return (
    <div>
      <Link href="/admin/accounts" style={backLinkStyle}><ArrowLeft size={14} /> Accounts</Link>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '16px 0 24px', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-cormorant)', fontSize: '28px', fontWeight: 400, color: 'var(--offwhite)', letterSpacing: '0.06em', margin: 0 }}>
            {name}
          </h1>
          <span style={{
            display: 'inline-block', marginTop: 8, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.1em',
            padding: '3px 8px', borderRadius: '2px', border: '1px solid',
            borderColor: account.account_type === 'corporate' ? 'var(--copper)' : 'var(--anthracite-light)',
            color: account.account_type === 'corporate' ? 'var(--copper)' : 'var(--warmgrey)',
          }}>
            {account.account_type}
          </span>
        </div>
        <button onClick={() => setShowNewBooking(true)} style={newBookingBtnStyle}>New Booking</button>
      </div>

      {/* Account info card */}
      <div style={{ border: '1px solid var(--anthracite-light)', borderRadius: '4px', padding: '20px', marginBottom: '24px', background: 'var(--anthracite-mid)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
          <Info label="Company" value={account.company_name} />
          <Info label="Contact" value={account.full_name} />
          <Info label="Email" value={account.email} />
          <Info label="Phone" value={account.phone} />
          <Info label="Reg / IČO" value={account.ico} />
          <Info label="VAT ID" value={account.vat_id} />
          <Info label="Billing address" value={account.billing_address} />
          <Info label="Trips" value={String(bookings.length)} />
          <Info label="Revenue" value={`${formatCZK(revenue)} CZK`} />
        </div>
      </div>

      {/* Bookings */}
      <h2 style={{ fontFamily: 'var(--font-cormorant)', fontSize: '20px', fontWeight: 400, color: 'var(--offwhite)', letterSpacing: '0.06em', margin: '0 0 12px' }}>
        Bookings
      </h2>
      <div style={{ width: '100%', border: '1px solid var(--anthracite-light)', borderRadius: '4px', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'var(--anthracite)', borderBottom: '1px solid var(--anthracite-light)', height: '40px' }}>
              {['REF', 'PICKUP', 'ROUTE', 'VEHICLE', 'AMOUNT', 'STATUS'].map((h, i) => (
                <th key={h} style={{ padding: '0 12px', textAlign: i === 4 ? 'right' : 'left', fontFamily: 'var(--font-montserrat)', fontSize: '11px', fontWeight: 400, textTransform: 'uppercase', letterSpacing: '0.4em', color: 'var(--warmgrey)' }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {bookings.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: '32px', textAlign: 'center', fontFamily: 'var(--font-montserrat)', fontSize: '13px', color: 'var(--warmgrey)' }}>
                  No bookings yet for this account. Use “New Booking” to add one.
                </td>
              </tr>
            ) : (
              bookings.map((b) => (
                <tr key={b.id} style={{ background: 'var(--anthracite-mid)', borderBottom: '1px solid var(--anthracite-light)' }}>
                  <td style={{ ...tdStyle, fontFamily: 'monospace', color: 'var(--copper)' }}>{b.booking_reference}</td>
                  <td style={tdStyle}>{b.pickup_date} · {b.pickup_time}</td>
                  <td style={{ ...tdStyle, color: 'var(--warmgrey)', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {b.origin_address}{b.destination_address ? ` → ${b.destination_address}` : ''}
                  </td>
                  <td style={tdStyle}>{vehicleClassMap[b.vehicle_class] ?? b.vehicle_class}</td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>{formatCZK(b.amount_czk)} CZK</td>
                  <td style={tdStyle}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <StatusBadge
                        variant={b.status as 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'assigned' | 'en_route' | 'on_location'}
                        label={STATUS_LABELS[b.status] ?? b.status}
                      />
                      {b.paid_at && (
                        <span
                          title={b.invoice_number ? `Invoice ${b.invoice_number}` : 'Paid'}
                          style={{
                            display: 'inline-flex', alignItems: 'center', gap: 6,
                            padding: '4px 8px', backgroundColor: '#1a3a2a', color: '#4ade80',
                            border: '1px solid rgba(34,197,94,0.25)', borderRadius: '2px',
                            fontFamily: 'var(--font-montserrat)', fontSize: '11px',
                            textTransform: 'uppercase', letterSpacing: '0.08em',
                          }}
                        >
                          <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: '#4ade80' }} />
                          Paid
                        </span>
                      )}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <ManualBookingForm
        key={account.user_id}
        open={showNewBooking}
        onClose={() => setShowNewBooking(false)}
        onCreated={handleCreated}
        accountUserId={account.user_id}
        accountLabel={name}
        prefill={{
          firstName: account.full_name ? account.full_name.split(' ')[0] : '',
          lastName: account.full_name ? account.full_name.split(' ').slice(1).join(' ') : '',
          email: account.email ?? '',
          phone: account.phone ?? '',
        }}
      />
    </div>
  )
}

function Info({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <div style={{ fontFamily: 'var(--font-montserrat)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.3em', color: 'var(--warmgrey)', marginBottom: '4px' }}>{label}</div>
      <div style={{ fontFamily: 'var(--font-montserrat)', fontSize: '13px', color: 'var(--offwhite)', wordBreak: 'break-word' }}>{value || '—'}</div>
    </div>
  )
}

const backLinkStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--warmgrey)', textDecoration: 'none',
  fontFamily: 'var(--font-montserrat)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.2em',
}
const tdStyle: React.CSSProperties = {
  padding: '0 12px', height: '48px', fontFamily: 'var(--font-montserrat)', fontSize: '13px', color: 'var(--offwhite)',
}
const newBookingBtnStyle: React.CSSProperties = {
  border: '1px solid var(--copper)', background: 'transparent', color: 'var(--copper)',
  fontFamily: 'var(--font-montserrat)', fontSize: '11px', fontWeight: 500, letterSpacing: '3px',
  textTransform: 'uppercase', padding: '0 24px', minHeight: '44px', borderRadius: '2px', cursor: 'pointer',
}
