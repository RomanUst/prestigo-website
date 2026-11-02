'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { KPICard } from '@/components/admin/KPICard'
import { StatsTable, StatsNote } from '@/components/admin/stats/StatsTable'
import { b2bStatsSchema, formatEur, formatPct, periodQuery } from '@/lib/admin-stats'
import type { B2BStats, Period } from '@/lib/admin-stats'

const messageStyle: React.CSSProperties = {
  color: 'var(--warmgrey)',
  fontFamily: 'var(--font-montserrat)',
  fontSize: '13px',
  padding: '32px 0',
}

type Result = { key: string; data: B2BStats | null }

// D-07 / D-08: B2B revenue and bookings per corporate Account for the chosen
// period. Only this tab's endpoint is fetched; a period change aborts the
// previous request so a late response can never replace newer data.
export function B2BTab({ period }: { period: Period }) {
  const [result, setResult] = useState<Result | null>(null)
  const { from, to } = period
  const key = `${from}|${to}`

  useEffect(() => {
    const controller = new AbortController()
    const requestKey = `${from}|${to}`
    fetch(`/api/admin/stats/b2b?${periodQuery({ from, to })}`, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch B2B stats')
        return res.json()
      })
      .then((json) => {
        const parsed = b2bStatsSchema.parse(json)
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
  const withoutAmount = stats.accounts.reduce((sum, a) => sum + a.without_amount, 0)

  const rows = stats.accounts.map((a) => ({
    key: a.user_id,
    cells: [
      <Link
        key="name"
        href={`/admin/accounts/${a.user_id}`}
        style={{ color: 'var(--copper)', textDecoration: 'none', fontWeight: 500 }}
      >
        {a.company_name || a.full_name || a.email || 'Corporate account'}
      </Link>,
      String(a.bookings),
      formatEur(a.revenue_eur),
      formatEur(a.avg_eur),
      a.last_trip,
    ],
  }))

  return (
    <div>
      <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginBottom: '32px' }}>
        <KPICard
          label="B2B revenue"
          value={formatEur(stats.b2b_revenue_eur)}
          subLabel={`${formatPct(stats.b2b_revenue_eur, stats.all_revenue_eur)} of all revenue (${formatEur(stats.all_revenue_eur)})`}
        />
        <KPICard
          label="B2B bookings"
          value={String(stats.b2b_bookings)}
          subLabel={`of ${stats.all_bookings} paid trips`}
        />
        <KPICard
          label="Corporate accounts"
          value={String(stats.accounts.length)}
          subLabel={`with trips in period · ${stats.accounts_total} total`}
        />
      </div>

      <StatsTable
        headers={['Account', 'Bookings', 'Revenue (EUR)', 'Avg booking (EUR)', 'Last trip']}
        rightAlignFrom={1}
        rows={rows}
        emptyText="No B2B trips in this period."
      />

      {withoutAmount > 0 && (
        <StatsNote>
          {withoutAmount} {withoutAmount === 1 ? 'booking has' : 'bookings have'} no amount (group payment) and{' '}
          {withoutAmount === 1 ? 'counts' : 'count'} as 0 EUR.
        </StatsNote>
      )}
      <StatsNote>
        Paid trips only (confirmed, assigned, en route, on location, completed) by pickup date; guest bookings made
        with the account email count for the account.
      </StatsNote>
    </div>
  )
}
