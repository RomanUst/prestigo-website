'use client'

import { useEffect, useState } from 'react'
import type { VehicleClass } from '@/types/booking'

/**
 * D-05: which vehicle classes the admin has priced paid waiting for. Carries no amounts
 * (the server prices everything). One GET per page load is shared by every StopItem.
 */
const KNOWN_CLASSES: readonly VehicleClass[] = ['business', 'first_class', 'business_van']

let pending: Promise<VehicleClass[]> | null = null

function loadOfferedClasses(): Promise<VehicleClass[]> {
  if (pending) return pending
  const request = fetch('/api/waiting-config')
    .then(async (res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = (await res.json()) as { offeredClasses?: unknown }
      if (!Array.isArray(data.offeredClasses)) return []
      return data.offeredClasses.filter((c): c is VehicleClass => KNOWN_CLASSES.includes(c as VehicleClass))
    })
    .catch((): VehicleClass[] => {
      // D-05: on error offer no paid waiting, and let the next mount try again.
      if (pending === request) pending = null
      return []
    })
  pending = request
  return request
}

/** Test helper: forget the cached request so each test starts from a clean page. */
export function resetWaitingConfigCache(): void {
  pending = null
}

export function useWaitingConfig(): { offeredClasses: VehicleClass[]; loaded: boolean } {
  const [state, setState] = useState<{ offeredClasses: VehicleClass[]; loaded: boolean }>({
    offeredClasses: [],
    loaded: false,
  })

  useEffect(() => {
    let cancelled = false
    loadOfferedClasses().then((offeredClasses) => {
      if (!cancelled) setState({ offeredClasses, loaded: true })
    })
    return () => {
      cancelled = true
    }
  }, [])

  return state
}
