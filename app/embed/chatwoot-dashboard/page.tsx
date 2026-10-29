import type { Metadata } from 'next'
import { panelChatwootOrigin } from '@/lib/chatwoot-operator'
import PanelClient from './PanelClient'
import './panel.css'

// The embed CSP carries a fresh nonce per request, so this page must render dynamically.
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Bookings · Prestigo',
  robots: { index: false, follow: false },
}

// Reads no cookies or request headers and creates no database client. The exact Chatwoot origin is
// derived on the server and handed to the client, which accepts postMessage context from nowhere else.
export default function ChatwootDashboardPage() {
  return <PanelClient chatwootOrigin={panelChatwootOrigin()} />
}
