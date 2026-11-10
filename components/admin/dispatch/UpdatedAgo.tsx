'use client'

import { useEffect, useState } from 'react'

/**
 * "Updated N s ago" for the dispatch toolbar. It owns a one-second ticker so the
 * board and calendar around it do not re-render every second.
 */
export function UpdatedAgo({ at }: { at: number | null }) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (at === null) return
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [at])

  if (at === null) return <span aria-live="off">Loading…</span>

  const seconds = Math.max(0, Math.floor((now - at) / 1000))
  const text = seconds < 60 ? `Updated ${seconds} s ago` : `Updated ${Math.floor(seconds / 60)} min ago`
  return <span aria-live="off">{text}</span>
}
