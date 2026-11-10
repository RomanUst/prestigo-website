'use client'

import { useCallback, useEffect, useState } from 'react'

export const DISPATCH_POLL_MS = 30_000

export interface DispatchQuery {
  startDate: string
  endDate: string
  search: string
  tripType: string // 'all' means no filter
}

export interface DispatchState<Row> {
  rows: Row[]
  updatedAt: number | null
  loading: boolean
  error: 'unauthorized' | 'failed' | null
  truncated: boolean
  refresh: () => void
  patchRow: (id: string, patch: Partial<Row>) => void
}

function buildUrl(q: DispatchQuery): string {
  const params = new URLSearchParams({ startDate: q.startDate, endDate: q.endDate })
  if (q.search) params.set('search', q.search)
  if (q.tripType && q.tripType !== 'all') params.set('tripType', q.tripType)
  return '/api/admin/bookings/dispatch?' + params.toString()
}

export function useDispatchBookings<Row extends { id: string }>(
  query: DispatchQuery,
  opts: { enabled?: boolean; paused: boolean; intervalMs?: number },
): DispatchState<Row> {
  const { enabled = true } = opts
  const [rows, setRows] = useState<Row[]>([])
  const [updatedAt, setUpdatedAt] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<'unauthorized' | 'failed' | null>(null)
  const [truncated, setTruncated] = useState(false)
  const [reloadTick, setReloadTick] = useState(0)

  const url = buildUrl(query)

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch(url)
        if (cancelled) return
        if (!res.ok) {
          setError('failed')
          return
        }
        const body = (await res.json()) as { bookings: Row[]; truncated: boolean }
        if (cancelled) return
        setRows(body.bookings)
        setTruncated(body.truncated)
        setUpdatedAt(Date.now())
        setError(null)
      } catch {
        if (!cancelled) setError('failed')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [url, enabled, reloadTick])

  const refresh = useCallback(() => setReloadTick((n) => n + 1), [])
  const patchRow = useCallback(
    (id: string, patch: Partial<Row>) =>
      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r))),
    [],
  )

  return { rows, updatedAt, loading, error, truncated, refresh, patchRow }
}
