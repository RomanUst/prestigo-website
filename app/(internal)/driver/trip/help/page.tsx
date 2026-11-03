import type { Metadata } from 'next'
import DriverHelpChat from './DriverHelpChat'

// 87-UAT gap 3: the tokenless page that hosts the driver Help chat. The Chatwoot SDK reports the page
// address to the widget, so this address must never carry the trip token; the identity arrives from
// the trip page through sessionStorage. It sits in the static segment next to [token] and inherits
// the light driver layout. Never indexed.
export const metadata: Metadata = {
  title: 'Chat with the office',
  robots: { index: false, follow: false },
}

export default function DriverHelpPage() {
  return <DriverHelpChat />
}
