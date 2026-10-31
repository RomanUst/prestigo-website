'use client'
import { useEffect, useState } from 'react'
import { OverviewTab } from '@/components/admin/stats/OverviewTab'
import { B2BTab } from '@/components/admin/stats/B2BTab'
import { defaultPeriod, periodQuery, periodSchema } from '@/lib/admin-stats'
import type { Period } from '@/lib/admin-stats'

export type StatsTab = 'overview' | 'conversion' | 'customers' | 'b2b'

// Registered tabs, in display order. Plan 85-06 adds Conversion and Customers.
// Not exported: a Next.js page file may only export its default component.
const TABS: { id: StatsTab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'b2b', label: 'B2B' },
]

function isTab(value: string | null): value is StatsTab {
  return TABS.some((t) => t.id === value)
}

// D-13: tab and period live in the URL (?tab=&from=&to=). Read once after
// mount from window.location (never during render, never via the search-params
// hook which would force a Suspense boundary at build).
function readUrlState(): { tab: StatsTab; period: Period } {
  const params = new URLSearchParams(window.location.search)
  const rawTab = params.get('tab')
  const tab: StatsTab = isTab(rawTab) ? rawTab : 'overview'
  const parsed = periodSchema.safeParse({
    from: params.get('from') ?? undefined,
    to: params.get('to') ?? undefined,
  })
  const period: Period = parsed.success
    ? { from: parsed.data.from, to: parsed.data.to }
    : defaultPeriod(new Date())
  return { tab, period }
}

export default function StatsPage() {
  const [tab, setTab] = useState<StatsTab>('overview')
  const [period, setPeriod] = useState<Period>({ from: '', to: '' })
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const initial = readUrlState()
    setTab(initial.tab)
    setPeriod(initial.period)
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!mounted) return
    // Keep history.state: the Next.js router stores its own bookkeeping in it.
    const search = `?tab=${tab}&${periodQuery(period)}`
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${search}`)
  }, [mounted, tab, period])

  return (
    <div>
      <h1 style={{
        fontFamily: 'var(--font-cormorant)',
        fontSize: '28px',
        fontWeight: 400,
        color: 'var(--offwhite)',
        letterSpacing: '0.08em',
        marginBottom: '32px',
      }}>
        Stats
      </h1>

      <div
        role="tablist"
        style={{
          display: 'flex',
          gap: '24px',
          flexWrap: 'wrap',
          borderBottom: '1px solid var(--anthracite-light)',
          marginBottom: '32px',
        }}
      >
        {TABS.map((t) => {
          const active = t.id === tab
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(t.id)}
              style={{
                background: 'none',
                border: 'none',
                borderBottom: active ? '2px solid var(--copper)' : '2px solid transparent',
                marginBottom: '-1px',
                padding: '12px 0',
                minHeight: '44px',
                cursor: 'pointer',
                fontFamily: 'var(--font-montserrat)',
                fontSize: '11px',
                fontWeight: 400,
                textTransform: 'uppercase',
                letterSpacing: '0.4em',
                color: active ? 'var(--copper)' : 'var(--warmgrey)',
              }}
            >
              {t.label}
            </button>
          )
        })}
      </div>

      {mounted && tab === 'overview' && <OverviewTab />}
      {mounted && tab === 'b2b' && <B2BTab period={period} />}
    </div>
  )
}
