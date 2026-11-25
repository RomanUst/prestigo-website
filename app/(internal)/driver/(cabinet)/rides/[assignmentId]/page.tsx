import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { requireDriver } from '@/lib/driver-cabinet/auth'
import { resolveCabinetRide } from '@/lib/driver-cabinet/ride-detail'
import { createSupabaseServiceClient } from '@/lib/supabase'
import InvalidTripLinkView from '@/app/(internal)/driver/trip/[token]/InvalidTripLinkView'
import TripScreenForToken from '@/app/(internal)/driver/trip/[token]/TripScreenForToken'

// Phase 94 plan 94-07 (DCAB-05, DCAB-09; D-01, D-12): one ride of the signed-in driver. Per request (reads the session
// cookie), gated by this page itself (a layout is not a gate, Pitfall 4). The URL holds the assignment id only; the
// trip token stays on the server and reaches the browser only the way the token page already does, for the existing
// token-gated step routes. This page and its resolver never write.
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Ride | Prestigo Driver',
  robots: { index: false, follow: false },
}

interface PageProps {
  params: Promise<{ assignmentId: string }>
}

export default async function DriverRideDetailPage({ params }: PageProps) {
  const { assignmentId } = await params
  const { driverId } = await requireDriver(`/driver/rides/${assignmentId}`)

  // Malformed ids never reach the database and look exactly like an unknown id.
  const parsedId = z.string().uuid().safeParse(assignmentId)
  if (!parsedId.success) return <InvalidTripLinkView />

  const ride = await resolveCabinetRide(createSupabaseServiceClient(), driverId, parsedId.data)

  if (ride.kind === 'trip') return <TripScreenForToken token={ride.tripToken} />
  if (ride.kind === 'offer') redirect('/driver/offers')
  return <InvalidTripLinkView />
}
