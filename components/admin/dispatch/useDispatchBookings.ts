'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

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

/**
 * Loads the dispatch range at once when the query changes, then every
 * `intervalMs` (30 s) while the tab is visible and the caller is not paused.
 * A tick that falls while paused or hidden is caught up as soon as the pause
 * ends or the tab becomes visible. Only the newest request may write state; a
 * 401 stops polling until the component remounts.
 */
export function useDispatchBookings<Row extends { id: string }>(
  query: DispatchQuery,
  opts: { enabled?: boolean; paused: boolean; intervalMs?: number },
): DispatchState<Row> {
  const { enabled = true, paused, intervalMs = DISPATCH_POLL_MS } = opts
  const [rows, setRows] = useState<Row[]>([])
  const [updatedAt, setUpdatedAt] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<'unauthorized' | 'failed' | null>(null)
  const [truncated, setTruncated] = useState(false)

  const url = buildUrl(query)

  const pausedRef = useRef(paused)
  const missedTickRef = useRef(false)
  const stoppedRef = useRef(false) // set by a 401, cleared only by remount
  const seqRef = useRef(0)
  const inFlightRef = useRef(false) // a request for the current query has not settled yet
  const controllerRef = useRef<AbortController | null>(null)
  const loadRef = useRef<() => void>(() => {})
  const loadedUrlRef = useRef(url) // the query the rows on screen belong to

  // Declared before the main effect so a pause that ends in the same commit as a
  // query change reads the current flag.
  useEffect(() => {
    pausedRef.current = paused
    if (!paused && missedTickRef.current && document.visibilityState === 'visible') {
      missedTickRef.current = false
      loadRef.current()
    }
  }, [paused])

  useEffect(() => {
    if (!enabled) return

    const load = async () => {
      if (stoppedRef.current) return
      controllerRef.current?.abort()
      const controller = new AbortController()
      controllerRef.current = controller
      const seq = ++seqRef.current
      missedTickRef.current = false
      inFlightRef.current = true
      try {
        const res = await fetch(url, { signal: controller.signal })
        if (seq !== seqRef.current) return
        if (res.status === 401) {
          stoppedRef.current = true
          clearInterval(timer)
          setError('unauthorized')
          return
        }
        if (!res.ok) {
          setError('failed')
          return
        }
        const body = (await res.json()) as { bookings: Row[]; truncated: boolean }
        if (seq !== seqRef.current) return
        setRows(body.bookings)
        setTruncated(body.truncated)
        setUpdatedAt(Date.now())
        setError(null)
      } catch {
        if (seq === seqRef.current) setError('failed')
      } finally {
        if (seq === seqRef.current) {
          inFlightRef.current = false
          setLoading(false)
        }
      }
    }
    loadRef.current = () => {
      void load()
    }

    // `load` reads `timer` only after its first await, so the const is initialised by then.
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible' && !pausedRef.current) {
        void load()
      } else {
        missedTickRef.current = true
      }
    }, intervalMs)

    // Rows of another range or filter must not stay on screen under the new label while it loads, or after it failed.
    if (loadedUrlRef.current !== url) {
      loadedUrlRef.current = url
      setRows([])
      setTruncated(false)
      setUpdatedAt(null)
      setError(prev => (prev === 'unauthorized' ? prev : null))
    }
    // A stopped hook (401) never loads again, so it would never clear the flag.
    if (!stoppedRef.current) setLoading(true)
    void load()

    const onVisibility = () => {
      if (document.visibilityState === 'visible' && !pausedRef.current) void load()
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisibility)
      controllerRef.current?.abort()
      controllerRef.current = null
      seqRef.current++ // anything still in flight belongs to a dead query
      inFlightRef.current = false
      loadRef.current = () => {}
    }
  }, [url, enabled, intervalMs])

  const refresh = useCallback(() => loadRef.current(), [])
  const patchRow = useCallback((id: string, patch: Partial<Row>) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)))
    // A poll that left before this change was accepted may carry the pre-change
    // row. Replace it with a request that starts now, so it cannot undo the patch.
    if (inFlightRef.current) loadRef.current()
  }, [])

  return { rows, updatedAt, loading: enabled ? loading : false, error, truncated, refresh, patchRow }
}
