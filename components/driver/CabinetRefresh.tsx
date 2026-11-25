'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

// Phase 94 plan 94-10 (UI-SPEC "Freshness"): keeps the three tab pages current without a polling endpoint. It re-runs the
// server render (router.refresh) when the page becomes visible, when the phone comes back online and every 30 s while
// the page is visible. router.refresh keeps client state (open dialogs, the push toggle). Same cadence as the trip screen.
const REFRESH_MS = 30_000

export default function CabinetRefresh() {
  const router = useRouter()

  useEffect(() => {
    const visible = () => document.visibilityState === 'visible'
    const timer = setInterval(() => {
      if (visible()) router.refresh()
    }, REFRESH_MS)
    const onVisibility = () => {
      if (visible()) router.refresh()
    }
    const onOnline = () => router.refresh()
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('online', onOnline)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('online', onOnline)
    }
  }, [router])

  return null
}
