'use client'

import { useEffect, useState } from 'react'

// Phase 90 plan 07 (D-06, RESEARCH Pitfall 8): the board card names the assigned driver from bookings.driver_id.
// One fetch of the drivers list when the board mounts; a failure leaves the map empty and the card says
// "Assigned driver" instead of a name. A declined offer keeps its name until reassignment (the panel's
// DriverAssignmentSection shows the exact accept or decline state).

interface DriverRow {
  id: string
  name: string
}

/** driver_id -> name. Empty until loaded, and empty when the request fails. */
export function useDriverNames(): Record<string, string> {
  const [names, setNames] = useState<Record<string, string>>({})

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch('/api/admin/drivers')
        if (!res.ok) return
        const body = (await res.json()) as { data?: DriverRow[] }
        if (cancelled || !Array.isArray(body.data)) return
        const next: Record<string, string> = {}
        for (const d of body.data) {
          if (d && typeof d.id === 'string' && typeof d.name === 'string') next[d.id] = d.name
        }
        setNames(next)
      } catch {
        // keep the empty map
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return names
}
