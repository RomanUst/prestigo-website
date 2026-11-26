import type { Metadata } from 'next'
import TripScreenForToken from './TripScreenForToken'

// D-08: this page must never be indexed — it is a permanent, unguessable
// per-assignment link presentable to police control, not public content.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

interface PageProps {
  params: Promise<{ token: string }>
}

// Phase 94 (D-15): the loader moved to TripScreenForToken so the driver cabinet renders the same screen. It is
// called as a function (not as a JSX element) so this page keeps returning the screen's element tree itself.
// This page performs no write: it reads through the loader only.
export default async function TripSheetPage({ params }: PageProps) {
  const { token } = await params
  return TripScreenForToken({ token })
}
