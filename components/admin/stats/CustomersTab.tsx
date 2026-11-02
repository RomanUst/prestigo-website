'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { KPICard } from '@/components/admin/KPICard'
import { StatsTable, StatsNote } from '@/components/admin/stats/StatsTable'
import { customersStatsSchema, formatEur, formatPct, periodQuery } from '@/lib/admin-stats'
import type { CustomersStats, Period } from '@/lib/admin-stats'

const messageStyle: React.CSSProperties = {
  color: 'var(--warmgrey)',
  fontFamily: 'var(--font-montserrat)',
  fontSize: '13px',
  padding: '32px 0',
}

const headingStyle: React.CSSProperties = {
  fontFamily: 'var(--font-cormorant)',
  fontSize: '20px',
  fontWeight: 400,
  color: 'var(--offwhite)',
  letterSpacing: '0.08em',
  margin: '0 0 16px',
}

type Result = { key: string; data: CustomersStats | null }

// D-09..D-12: repeat-customer rate, repeat revenue share and the top repeat
// customers. Names and emails are customer-entered: rendered as React text only,
// and the bookings link is built with encodeURIComponent.
export function CustomersTab({ period }: { period: Period }) {
  const [result, setResult] = useState<Result | null>(null)
  const { from, to } = period
  const key = `${from}|${to}`

  useEffect(() => {
    const controller = new AbortController()
    const requestKey = `${from}|${to}`
    fetch(`/api/admin/stats/customers?${periodQuery({ from, to })}`, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch customer stats')
        return res.json()
      })
      .then((json) => {
        const parsed = customersStatsSchema.parse(json)
        if (controller.signal.aborted) return
        setResult({ key: requestKey, data: parsed })
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return
        if (err instanceof DOMException && err.name === 'AbortError') return
        setResult({ key: requestKey, data: null })
      })
    return () => controller.abort()
  }, [from, to])

  // A result for another period counts as "still loading".
  if (!result || result.key !== key) {
    return <div style={messageStyle}>Loading...</div>
  }
  if (!result.data) {
    return <div style={messageStyle}>Could not load data. Refresh to retry.</div>
  }

  const stats = result.data

  const rows = stats.top.map((c, i) => ({
    key: `${c.email ?? c.name ?? 'customer'}-${i}`,
    cells: [
      c.email ? (
        <Link
          key="name"
          href={`/admin/bookings?search=${encodeURIComponent(c.email)}`}
          style={{ color: 'var(--copper)', textDecoration: 'none', fontWeight: 500 }}
        >
          {c.name || c.email}
        </Link>
      ) : (
        (c.name ?? '')
      ),
      c.email ?? '',
      String(c.trips),
      formatEur(c.revenue_eur),
      c.first_trip,
      c.last_trip,
    ],
  }))

  return (
    <div>
      <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginBottom: '32px' }}>
        <KPICard
          label="Repeat rate"
          value={formatPct(stats.repeat_customers, stats.customers)}
          subLabel={`${stats.repeat_customers} of ${stats.customers} customers with a trip in the period`}
        />
        <KPICard
          label="Repeat revenue share"
          value={formatPct(stats.repeat_revenue_eur, stats.revenue_eur)}
          subLabel={`${formatEur(stats.repeat_revenue_eur)} of ${formatEur(stats.revenue_eur)}`}
        />
        <KPICard
          label="Repeat customers"
          value={String(stats.repeat_customers_all_time)}
          subLabel="all time, 2+ paid trips"
        />
      </div>

      <h2 style={headingStyle}>Top repeat customers (all-time revenue)</h2>
      <StatsTable
        headers={['Name', 'Email', 'Trips', 'Revenue (EUR)', 'First trip', 'Last trip']}
        rightAlignFrom={2}
        rows={rows}
        emptyText="No repeat customers yet."
      />

      <StatsNote>
        GNet partner bookings and erased customers are not counted. A round trip counts as one trip. Revenue share
        compares repeat customers with all non-GNet customers who travelled in the period (by pickup date).
      </StatsNote>
    </div>
  )
}
