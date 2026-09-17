'use client'
import { useState, useEffect, useCallback } from 'react'
import { KPICard } from '@/components/admin/KPICard'
import BookingsTable from '@/components/admin/BookingsTable'
import { ManualBookingForm } from '@/components/admin/ManualBookingForm'

function getMonday(date: Date): string {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  d.setDate(diff)
  return d.toISOString().split('T')[0]
}

function getSunday(date: Date): string {
  const monday = new Date(date)
  const day = monday.getDay()
  const diff = monday.getDate() - day + (day === 0 ? -6 : 1)
  monday.setDate(diff)
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  return sunday.toISOString().split('T')[0]
}

export default function BookingsPage() {
  const [todayCount, setTodayCount] = useState<number | null>(null)
  const [weekRevenue, setWeekRevenue] = useState<number | null>(null)
  const [showNewBooking, setShowNewBooking] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  // DISP-02 read side: the persisted default horizon/days, hydrated from a
  // THIRD, separate fetch below — NOT one of the two KPI /api/admin/bookings
  // fetches. Falls back to the shipped defaults if the fetch fails.
  const [defaultHorizon, setDefaultHorizon] = useState('future')
  const [defaultHorizonDays, setDefaultHorizonDays] = useState(7)
  // CR-01 fix: BookingsTable seeds its ephemeral `horizon` state via
  // `useState(defaultHorizon)`, which only reads the prop on the component's
  // FIRST render. Since the settings fetch below is async, it always
  // resolves after BookingsTable's initial mount — so without this gate the
  // resolved persisted default is silently dropped and the table is stuck on
  // the hardcoded 'future' fallback forever. Gating the mount until the
  // settings fetch has settled (success or failure) guarantees BookingsTable
  // only ever mounts once it can see the real value.
  const [settingsLoaded, setSettingsLoaded] = useState(false)

  const handleBookingCreated = useCallback(() => {
    setRefreshKey(k => k + 1)
    setShowNewBooking(false)
  }, [])

  useEffect(() => {
    const now = new Date()
    const todayISO = now.toISOString().split('T')[0]
    const mondayISO = getMonday(now)
    const sundayISO = getSunday(now)

    // Today's bookings count
    fetch(`/api/admin/bookings?startDate=${todayISO}&endDate=${todayISO}&limit=1`)
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data) setTodayCount(data.total ?? 0)
      })
      .catch(() => {})

    // This week's revenue
    fetch(`/api/admin/bookings?startDate=${mondayISO}&endDate=${sundayISO}&limit=100`)
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data && data.bookings) {
          const sum = (data.bookings as Array<{ amount_czk: number }>)
            .reduce((acc, b) => acc + (b.amount_czk ?? 0), 0)
          setWeekRevenue(sum)
        }
      })
      .catch(() => {})
  }, [])

  // DISP-02: read the persisted dispatch-horizon default once on mount, in a
  // dedicated fetch decoupled from the two KPI fetches above (D-05) and from
  // BookingsTable's own list fetch — never routes the segmented-control's
  // ephemeral state back into this settings read.
  useEffect(() => {
    fetch('/api/admin/settings')
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data?.dispatch_default_horizon) setDefaultHorizon(data.dispatch_default_horizon)
        if (data?.dispatch_horizon_days) setDefaultHorizonDays(data.dispatch_horizon_days)
      })
      .catch(() => {})
      .finally(() => setSettingsLoaded(true))
  }, [])

  const formatCZK = (value: number) =>
    new Intl.NumberFormat('cs-CZ').format(value)

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
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
          Bookings
        </h1>
        <button
          onClick={() => setShowNewBooking(true)}
          style={{
            border: '1px solid var(--anthracite-light)',
            background: 'transparent',
            color: 'var(--warmgrey)',
            fontFamily: 'var(--font-montserrat)',
            fontSize: '11px',
            fontWeight: 500,
            letterSpacing: '3px',
            textTransform: 'uppercase',
            padding: '0 24px',
            minHeight: '44px',
            borderRadius: '2px',
            cursor: 'pointer',
          }}
        >
          New Booking
        </button>
      </div>

      <div
        style={{
          display: 'flex',
          gap: '16px',
          marginBottom: '24px',
        }}
      >
        <KPICard
          label="TODAY"
          value={todayCount !== null ? String(todayCount) : '—'}
          subLabel="bookings"
        />
        <KPICard
          label="THIS WEEK"
          value={weekRevenue !== null ? `${formatCZK(weekRevenue)} CZK` : '—'}
          subLabel="CZK revenue"
        />
      </div>

      {settingsLoaded && (
        <BookingsTable key={refreshKey} defaultHorizon={defaultHorizon} horizonDays={defaultHorizonDays} />
      )}

      <ManualBookingForm
        open={showNewBooking}
        onClose={() => setShowNewBooking(false)}
        onCreated={handleBookingCreated}
      />
    </div>
  )
}
