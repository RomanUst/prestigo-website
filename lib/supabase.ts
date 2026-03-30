/*
 * Supabase SQL — run in Dashboard > SQL Editor:
 *
 * CREATE TABLE bookings (
 *   id                  uuid DEFAULT gen_random_uuid() PRIMARY KEY,
 *   created_at          timestamptz DEFAULT now() NOT NULL,
 *   booking_reference   text NOT NULL,
 *   payment_intent_id   text UNIQUE,
 *   booking_type        text NOT NULL,
 *   trip_type           text NOT NULL,
 *   origin_address      text,
 *   origin_lat          float8,
 *   origin_lng          float8,
 *   destination_address text,
 *   destination_lat     float8,
 *   destination_lng     float8,
 *   hours               integer,
 *   passengers          integer NOT NULL,
 *   luggage             integer NOT NULL,
 *   pickup_date         text NOT NULL,
 *   pickup_time         text NOT NULL,
 *   return_date         text,
 *   vehicle_class       text NOT NULL,
 *   distance_km         float8,
 *   amount_czk          integer NOT NULL,
 *   amount_eur          integer,
 *   extra_child_seat    boolean DEFAULT false NOT NULL,
 *   extra_meet_greet    boolean DEFAULT false NOT NULL,
 *   extra_luggage       boolean DEFAULT false NOT NULL,
 *   client_first_name   text NOT NULL,
 *   client_last_name    text NOT NULL,
 *   client_email        text NOT NULL,
 *   client_phone        text NOT NULL,
 *   flight_number       text,
 *   terminal            text,
 *   special_requests    text
 * );
 */

import { createClient } from '@supabase/supabase-js'
import { czkToEur } from '@/lib/currency'

export function createSupabaseServiceClient() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    }
  )
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 3,
  baseDelayMs = 1000
): Promise<T> {
  let lastError: unknown
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastError = err
      if (attempt < maxAttempts) {
        await new Promise((resolve) =>
          setTimeout(resolve, baseDelayMs * Math.pow(2, attempt - 1))
        )
      }
    }
  }
  throw lastError
}

export function buildBookingRow(
  meta: Record<string, string>,
  paymentIntentId: string | null,
  bookingType: 'confirmed' | 'quote'
) {
  return {
    booking_reference: meta.bookingReference,
    payment_intent_id: paymentIntentId,
    booking_type: bookingType,
    trip_type: meta.tripType,
    origin_address: meta.originAddress ?? meta.origin ?? null,
    origin_lat: meta.originLat ? parseFloat(meta.originLat) : null,
    origin_lng: meta.originLng ? parseFloat(meta.originLng) : null,
    destination_address: meta.destinationAddress ?? meta.destination ?? null,
    destination_lat: meta.destinationLat ? parseFloat(meta.destinationLat) : null,
    destination_lng: meta.destinationLng ? parseFloat(meta.destinationLng) : null,
    hours: meta.hours ? parseInt(meta.hours) : null,
    passengers: parseInt(meta.passengers) || 1,
    luggage: parseInt(meta.luggage) || 0,
    pickup_date: meta.pickupDate,
    pickup_time: meta.pickupTime,
    return_date: meta.returnDate || null,
    vehicle_class: meta.vehicleClass,
    distance_km: meta.distanceKm ? parseFloat(meta.distanceKm) : null,
    amount_czk: parseInt(meta.amountCzk) || 0,
    amount_eur: meta.amountCzk ? czkToEur(parseInt(meta.amountCzk)) : null,
    extra_child_seat: meta.extraChildSeat === 'true',
    extra_meet_greet: meta.extraMeetGreet === 'true',
    extra_luggage: meta.extraLuggage === 'true',
    client_first_name: meta.firstName,
    client_last_name: meta.lastName,
    client_email: meta.email,
    client_phone: meta.phone,
    flight_number: meta.flightNumber || null,
    terminal: meta.terminal || null,
    special_requests: meta.specialRequests || null,
  }
}

export async function saveBooking(row: ReturnType<typeof buildBookingRow>) {
  const supabase = createSupabaseServiceClient()
  const { error } = await supabase
    .from('bookings')
    .upsert([row], { onConflict: 'payment_intent_id', ignoreDuplicates: true })
  if (error) throw new Error(`Supabase insert failed: ${error.message}`)
}
