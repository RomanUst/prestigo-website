// Phase 94 plan 94-09 (D-09, D-12, D-18; DCAB-11, DCAB-12): tell a cabinet driver about a new ride offer.
//
// One assignment to a driver with a cabinet = the cabinet offer email (one button into the Offers tab) plus one web
// push to every stored browser. The lock screen shows day, time, place labels and class only: never a passenger name,
// a fee, a booking reference or a token (D-12). Both channels are best effort: this module never rejects, and the push
// runs even when the email sender fails.

import { formatVehicleLabel, sendDriverCabinetOfferEmail, type DriverCabinetOfferEmailData } from '@/lib/email'
import { getPragueTodayISO } from '@/lib/prague-date'
import { pragueDayLabel, placeLabel } from '@/lib/driver-cabinet/format'
import { sendDriverPush, type DriverPushPayload } from '@/lib/driver-cabinet/push'

// Minimal structural type of the service client, like lib/driver-cabinet/push.ts.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ServiceClient = { from: (table: string) => any }

const PLACE_MAX = 28

export function buildOfferPushPayload(input: {
  assignmentId: string
  pickupDate: string
  pickupTime: string
  originAddress: string | null
  destinationAddress: string | null
  vehicleClass: string
  todayIso: string
}): DriverPushPayload {
  const when = `${pragueDayLabel(input.pickupDate, input.todayIso)} ${input.pickupTime}`
  const from = placeLabel(input.originAddress, PLACE_MAX)
  const to = placeLabel(input.destinationAddress, PLACE_MAX)
  const route = to === '' ? `${from}, as directed` : `${from} to ${to}`
  const cls = input.vehicleClass ? formatVehicleLabel(input.vehicleClass) : ''
  const body = [`${when}.`, `${route}.`, cls ? `${cls}.` : ''].filter((s) => s !== '').join(' ')

  return {
    title: 'New ride offer',
    body,
    url: '/driver/offers',
    tag: `offer-${input.assignmentId}`,
  }
}

/** Email first, then push. Never rejects: a failed email does not stop the push and the reverse. */
export async function notifyCabinetDriverOfOffer(input: {
  supabase: ServiceClient
  driverId: string
  assignmentId: string
  email: DriverCabinetOfferEmailData
}): Promise<void> {
  try {
    await sendDriverCabinetOfferEmail(input.email)
  } catch (err) {
    console.error('[driver-cabinet] offer email failed:', err instanceof Error ? err.message : 'unknown')
  }

  try {
    await sendDriverPush(
      input.supabase,
      input.driverId,
      buildOfferPushPayload({
        assignmentId: input.assignmentId,
        pickupDate: input.email.pickupDate,
        pickupTime: input.email.pickupTime,
        originAddress: input.email.originAddress,
        destinationAddress: input.email.destinationAddress,
        vehicleClass: input.email.vehicleClass,
        todayIso: getPragueTodayISO(),
      }),
    )
  } catch (err) {
    console.error('[driver-cabinet] offer push failed:', err instanceof Error ? err.message : 'unknown')
  }
}
