'use client'

import { useEffect, useState } from 'react'

/**
 * "Updated N s ago" for the dispatch toolbar. It owns a one-second ticker so the
 * board and calendar around it do not re-render every second.
 */
export function UpdatedAgo({ at, paused = false }: { at: number | null; paused?: boolean }) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (at === null) return
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [at])

  // While the panel holds input or a dialog is open the views stop refreshing; say so, or "Updated 3 min ago"
  // looks like a stalled connection.
  const pausedHint = paused ? (
    <span data-testid="refresh-paused" role="status">
      {' · '}Refresh paused while editing
    </span>
  ) : null

  if (at === null) {
    return (
      <>
        <span aria-live="off">Loading…</span>
        {pausedHint}
      </>
    )
  }

  const seconds = Math.max(0, Math.floor((now - at) / 1000))
  const text = seconds < 60 ? `Updated ${seconds} s ago` : `Updated ${Math.floor(seconds / 60)} min ago`
  return (
    <>
      <span aria-live="off">{text}</span>
      {pausedHint}
    </>
  )
}
