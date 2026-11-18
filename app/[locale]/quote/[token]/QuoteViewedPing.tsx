'use client'

import { useEffect, useRef } from 'react'

// Records that the client opened the quote (Phase 92, plan 92-09; D-10, T-92-29).
//
// The page GET writes nothing, because mail scanners prefetch links. This island is the separate, explicit signal:
// after mount, once the tab is visible, it POSTs { token } to /api/quote/view a single time and ignores the answer.
// The status it causes is informational and never gates money. It renders nothing visible.

const VIEW_ENDPOINT = '/api/quote/view'

export default function QuoteViewedPing({ token }: { token: string }) {
  const sent = useRef(false)

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'visible') send()
    }
    function send() {
      if (sent.current) return
      sent.current = true
      document.removeEventListener('visibilitychange', onVisibility)
      void fetch(VIEW_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
        keepalive: true,
      }).catch(() => {
        // Informational only: a failed ping changes nothing for the client.
      })
    }

    if (document.visibilityState === 'visible') send()
    else document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [token])

  return <span hidden data-testid="quote-viewed-ping" />
}
