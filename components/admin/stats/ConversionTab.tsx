'use client'
import { useEffect, useState } from 'react'
import { StatsTable, StatsNote } from '@/components/admin/stats/StatsTable'
import {
  DIRECT_SOURCES,
  DIRECT_SOURCE_LABELS,
  FUNNEL_SOURCES,
  FUNNEL_SOURCE_LABELS,
  conversionStatsSchema,
  formatEur,
  formatPct,
  periodQuery,
} from '@/lib/admin-stats'
import type { ConversionStats, Period } from '@/lib/admin-stats'

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
  margin: '40px 0 16px',
}

type Result = { key: string; data: ConversionStats | null }

// A percentage is never printed without its counts (tiny samples), and a zero
// denominator reads 'n/a' (D-05).
function conversionCell(converted: number, inquiries: number): string {
  if (inquiries === 0) return 'n/a'
  return `${formatPct(converted, inquiries)} (${converted} of ${inquiries})`
}

// D-05 / D-06: inquiries of the period that became paid bookings, by source,
// plus the bookings that arrived with no recorded inquiry. Only this tab's
// endpoint is fetched; a period change aborts the previous request.
export function ConversionTab({ period }: { period: Period }) {
  const [result, setResult] = useState<Result | null>(null)
  const { from, to } = period
  const key = `${from}|${to}`

  useEffect(() => {
    const controller = new AbortController()
    const requestKey = `${from}|${to}`
    fetch(`/api/admin/stats/conversion?${periodQuery({ from, to })}`, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch conversion stats')
        return res.json()
      })
      .then((json) => {
        const parsed = conversionStatsSchema.parse(json)
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

  const funnelRows = FUNNEL_SOURCES.flatMap((source) => {
    const row = stats.funnel.find((f) => f.source === source) ?? {
      source,
      inquiries: 0,
      converted: 0,
      window_open: 0,
      revenue_eur: 0,
    }
    // D-05: the eight fixed rows are always shown; "Chat · Other" only when used.
    if (source === 'chat_other' && row.inquiries === 0) return []
    return [
      {
        key: source,
        cells: [
          FUNNEL_SOURCE_LABELS[source],
          String(row.inquiries),
          String(row.converted),
          conversionCell(row.converted, row.inquiries),
          formatEur(row.revenue_eur),
        ],
      },
    ]
  })

  // Total comes from funnel_total (distinct converting bookings): one booking
  // can be claimed by several inquiries, so the row revenues must not be added up.
  const total = stats.funnel_total
  const funnelTotal = [
    'Total',
    String(total.inquiries),
    String(total.converted),
    conversionCell(total.converted, total.inquiries),
    formatEur(total.revenue_eur),
  ]

  const directRows = DIRECT_SOURCES.map((source) => {
    const row = stats.direct.find((d) => d.source === source) ?? { source, bookings: 0, revenue_eur: 0 }
    return {
      key: source,
      cells: [DIRECT_SOURCE_LABELS[source], String(row.bookings), formatEur(row.revenue_eur)],
    }
  })
  const directTotal = ['Total', String(stats.direct_total.bookings), formatEur(stats.direct_total.revenue_eur)]

  // WR-01: every paid booking created in the period lands in exactly one of
  // these two rows, so they add up to the period's full booking revenue.
  const periodRows = [
    {
      key: 'attributed',
      cells: [
        'After a recorded inquiry',
        String(stats.attributed_total.bookings),
        formatEur(stats.attributed_total.revenue_eur),
      ],
    },
    {
      key: 'direct',
      cells: ['Direct (no recorded inquiry)', String(stats.direct_total.bookings), formatEur(stats.direct_total.revenue_eur)],
    },
  ]
  const periodTotal = ['Total', String(stats.period_total.bookings), formatEur(stats.period_total.revenue_eur)]

  return (
    <div>
      <StatsTable
        headers={['Source', 'Inquiries', 'Converted', 'Conversion', 'Revenue (EUR)']}
        rightAlignFrom={1}
        rows={funnelRows}
        emptyText="No inquiries in this period."
        totalRow={funnelTotal}
      />

      {total.window_open > 0 && (
        <StatsNote>
          {total.window_open} {total.window_open === 1 ? 'inquiry is' : 'inquiries are'} still inside their 90-day
          window, so the conversion shown may still rise.
        </StatsNote>
      )}
      <StatsNote>
        A booking counts when it is paid (confirmed, assigned, en route, on location, completed); quotes and cancelled
        bookings are excluded. An inquiry converts when the same person books within 90 days, or when the chat Lead
        was marked converted.
      </StatsNote>

      <h2 style={headingStyle}>Direct bookings (no recorded inquiry)</h2>
      <StatsTable
        headers={['Source', 'Bookings', 'Revenue (EUR)']}
        rightAlignFrom={1}
        rows={directRows}
        emptyText="No direct bookings in this period."
        totalRow={directTotal}
      />

      <h2 style={headingStyle}>All paid bookings created in this period</h2>
      <StatsTable
        headers={['Origin', 'Bookings', 'Revenue (EUR)']}
        rightAlignFrom={1}
        rows={periodRows}
        emptyText="No paid bookings in this period."
        totalRow={periodTotal}
      />
      <StatsNote>
        The funnel above follows the inquiries made in this period, so its revenue counts only the first booking each
        inquiry led to. This table follows the bookings made in this period: a repeat booking after an inquiry, or one
        whose inquiry came before the period, is counted here under &ldquo;After a recorded inquiry&rdquo;.
      </StatsNote>
    </div>
  )
}
