'use client'
import { useState, useEffect } from 'react'
import { KPICard } from '@/components/admin/KPICard'
import BookingsTable from '@/components/admin/BookingsTable'

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

  const formatCZK = (value: number) =>
    new Intl.NumberFormat('cs-CZ').format(value)

  return (
    <div>
      <h1
        style={{
          fontFamily: 'var(--font-cormorant)',
          fontSize: '28px',
          fontWeight: 400,
          color: 'var(--offwhite)',
          letterSpacing: '0.08em',
          marginBottom: '16px',
        }}
      >
        Bookings
      </h1>

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

      <BookingsTable />
    </div>
  )
}
