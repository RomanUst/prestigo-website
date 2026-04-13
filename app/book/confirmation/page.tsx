'use client'

import { useSearchParams } from 'next/navigation'
import { useEffect, useRef, Suspense } from 'react'
import { useBookingStore } from '@/lib/booking-store'
import { computeExtrasTotal } from '@/lib/extras'
import { consumePurchaseSnapshot } from '@/lib/analytics-snapshot'
import Link from 'next/link'
import { buildIcs, type IcsEvent } from '@/lib/ics'
import { trackMetaEvent } from '@/components/MetaPixel'

const VEHICLE_LABELS: Record<string, string> = {
  business: 'Business',
  first_class: 'First Class',
  business_van: 'Business Van',
}

/**
 * Pushes a GA4 event to gtag.js. Safe before gtag.js has loaded — entries
 * queued on dataLayer are replayed when the gtag.js library finishes loading.
 * No-op when cookie consent hasn't granted analytics and gtag isn't present.
 */
type GtagFn = (...args: unknown[]) => void
function pushGA4Event(eventName: string, params: Record<string, unknown>): void {
  if (typeof window === 'undefined') return
  const w = window as typeof window & {
    dataLayer?: unknown[]
    gtag?: GtagFn
  }
  // Prefer the gtag function defined by GoogleAnalytics.tsx (global inline
  // script scope) or by gtag.js itself after it loads.
  if (typeof w.gtag === 'function') {
    w.gtag('event', eventName, params)
    return
  }
  // Fallback: write directly to dataLayer in the gtag.js tuple format. If
  // gtag.js loads later, it will replay this entry. Forward-compatible with
  // GTM (which accepts { event, ... } objects) via a second push.
  w.dataLayer = w.dataLayer || []
  w.dataLayer.push(['event', eventName, params])
  w.dataLayer.push({ event: eventName, ...params })
}

/**
 * Client-side ICS content generator. EXTENDED in Phase 27 to support two legs
 * for round-trip bookings. Internally delegates to buildIcs from @/lib/ics
 * (the single source of truth shared with the server-side email attachment
 * path in lib/email.ts → sendRoundTripClientConfirmation).
 *
 * Phase 27 D-13: extend, not replace. The function name remains; the body
 * no longer uses toISOString().replace('Z') which caused a pre-existing
 * UTC-drift bug for Europe/Prague clients. buildIcs emits TZID=Europe/Prague
 * with a VTIMEZONE block so calendar apps honor wall-clock times correctly.
 */
function generateICSContent(
  outbound: {
    pickupDate: string
    pickupTime: string
    origin: string
    destination: string
    bookingReference: string
  },
  returnLeg?: {
    pickupDate: string
    pickupTime: string
    bookingReference: string
  }
): string {
  const events: IcsEvent[] = [
    {
      uid: `${outbound.bookingReference}-outbound@prestigo.cz`,
      date: outbound.pickupDate,
      time: outbound.pickupTime,
      durationMinutes: 60,
      summary: `PRESTIGO ${returnLeg ? 'Outbound' : 'Transfer'} — ${outbound.bookingReference}`,
      description: `Pickup: ${outbound.origin}\nDropoff: ${outbound.destination}\nRef: ${outbound.bookingReference}`,
      location: outbound.origin,
    },
  ]
  if (returnLeg) {
    // Return leg: route is swapped — pickup is the outbound destination,
    // dropoff is the outbound origin.
    events.push({
      uid: `${returnLeg.bookingReference}-return@prestigo.cz`,
      date: returnLeg.pickupDate,
      time: returnLeg.pickupTime,
      durationMinutes: 60,
      summary: `PRESTIGO Return — ${returnLeg.bookingReference}`,
      description: `Pickup: ${outbound.destination}\nDropoff: ${outbound.origin}\nRef: ${returnLeg.bookingReference}`,
      location: outbound.destination,
    })
  }
  return buildIcs(events)
}

/**
 * Validates a booking/quote reference against the expected format.
 * Accepts both the current hex suffix (PRG-YYYYMMDD-AB12CD) and the
 * legacy numeric suffix (PRG-YYYYMMDD-1234) for backward compatibility.
 */
function isValidRef(ref: string | null): ref is string {
  if (!ref) return false
  return /^(PRG|QR)-\d{8}-([A-F0-9]{6}|\d{4})$/.test(ref)
}

function ConfirmationContent() {
  const searchParams = useSearchParams()
  const type = searchParams.get('type')
  const rawRef = searchParams.get('ref')
  // D-11: param name is `returnRef` (NOT `ref2`)
  const rawReturnRef = searchParams.get('returnRef')
  // Reject refs that don't match the expected format — prevents crafted URLs
  const ref = isValidRef(rawRef) ? rawRef : null
  const returnRef = isValidRef(rawReturnRef) ? rawReturnRef : null
  const isRoundTrip = Boolean(ref && returnRef)
  const isQuote = type === 'quote'

  const storeRef = useRef(useBookingStore.getState())
  const resetBooking = useBookingStore((s) => s.resetBooking)
  // Guard against StrictMode double-invocation and hydration re-runs — we
  // must only fire the analytics event once per confirmation page view.
  const analyticsFiredRef = useRef(false)

  useEffect(() => {
    // Capture the latest state before we reset the store.
    const snap = useBookingStore.getState()
    storeRef.current = snap

    if (!analyticsFiredRef.current && ref) {
      analyticsFiredRef.current = true

      // For the PAID booking flow, read the authoritative snapshot that
      // Step6Payment wrote to sessionStorage right before the Stripe redirect.
      // This is the only reliable source for `value`, because priceBreakdown
      // is not persisted by Zustand and the redirect wipes in-memory state.
      // For the QUOTE flow, navigation is client-side (router.push), so the
      // in-memory store still has priceBreakdown — fall back to computing it.
      const purchaseSnapshot = !isQuote ? consumePurchaseSnapshot(ref) : null

      let totalEur: number
      let currency: string
      let items: Array<{
        item_id: string
        item_name: string
        item_category: string
        item_variant: string
        price: number
        quantity: number
      }>

      if (purchaseSnapshot) {
        totalEur = purchaseSnapshot.value
        currency = purchaseSnapshot.currency
        items = purchaseSnapshot.items
      } else {
        // Fallback: reconstruct from the Zustand store (used for the quote
        // flow and as a safety net if sessionStorage is unavailable).
        const selectedPrice =
          snap.vehicleClass && snap.priceBreakdown
            ? snap.priceBreakdown[snap.vehicleClass]
            : null
        const extrasTotal = computeExtrasTotal(snap.extras)
        const baseTotal = selectedPrice ? selectedPrice.base + extrasTotal : 0
        totalEur =
          snap.promoDiscount > 0
            ? Math.round(baseTotal * (1 - snap.promoDiscount / 100))
            : baseTotal
        currency = selectedPrice?.currency ?? 'EUR'

        const itemName =
          snap.vehicleClass && VEHICLE_LABELS[snap.vehicleClass]
            ? VEHICLE_LABELS[snap.vehicleClass]
            : 'Chauffeur Transfer'

        items = [
          {
            item_id: snap.vehicleClass ?? 'transfer',
            item_name: itemName,
            item_category: snap.tripType ?? 'transfer',
            item_variant: snap.tripType ?? 'transfer',
            price: totalEur,
            quantity: 1,
          },
        ]
      }

      if (isQuote) {
        // Unpriced quote leads — send generate_lead with the quoted amount
        // (may be 0 if the route is priced by agent).
        pushGA4Event('generate_lead', {
          currency,
          value: totalEur,
          transaction_id: ref,
          lead_type: 'quote_request',
        })
      } else {
        // Paid booking — GA4 recommended ecommerce purchase event.
        pushGA4Event('purchase', {
          transaction_id: ref,
          value: totalEur,
          currency,
          items,
          affiliation: 'PRESTIGO',
        })

        // Meta Pixel — client-side Purchase (fires only if user consented)
        trackMetaEvent(
          'Purchase',
          {
            value: totalEur,
            currency,
            content_type: 'product',
            content_ids: [ref],
            content_name: items[0]?.item_name ?? 'Chauffeur Transfer',
          },
          ref, // eventId — matched server-side for deduplication
        )

        // Meta CAPI — server-side Purchase (non-blocking, hashes PII server-side)
        void fetch('/api/meta-capi', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            event_name: 'Purchase',
            event_id: ref,
            url: window.location.href,
            email: snap.passengerDetails?.email,
            first_name: snap.passengerDetails?.firstName,
            last_name: snap.passengerDetails?.lastName,
            phone: snap.passengerDetails?.phone,
            custom_data: {
              value: totalEur,
              currency,
              content_type: 'product',
              content_ids: [ref],
            },
          }),
        })
      }
    }

    resetBooking()
  }, [resetBooking, ref, isQuote])

  const { origin, destination, pickupDate, pickupTime, vehicleClass, passengers, hours, tripType, returnDate, returnTime } =
    storeRef.current

  const handleDownloadICS = () => {
    if (!ref || !pickupDate || !pickupTime) return
    const originAddr = origin?.address ?? ''
    const destAddr = destination?.address ?? ''
    const icsContent = generateICSContent(
      {
        pickupDate,
        pickupTime,
        origin: originAddr,
        destination: destAddr,
        bookingReference: ref,
      },
      isRoundTrip && returnRef && returnDate && returnTime
        ? {
            pickupDate: returnDate,
            pickupTime: returnTime,
            bookingReference: returnRef,
          }
        : undefined
    )
    const blob = new Blob([icsContent], { type: 'text/calendar' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${ref}.ics`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handlePrint = () => window.print()

  const vehicleLabel = vehicleClass ? (VEHICLE_LABELS[vehicleClass] ?? vehicleClass) : null

  if (!ref) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--anthracite)', padding: '64px 0' }}>
        <div className="max-w-[640px] mx-auto px-4">
          <span className="copper-line" style={{ display: 'block', marginBottom: 24 }} />
          <span
            className="wordmark"
            style={{ display: 'block', marginBottom: 32 }}
          >
            <span className="wordmark-presti">PRESTI</span>
            <span className="wordmark-go">GO</span>
          </span>
          <p
            style={{
              color: 'var(--warmgrey)',
              fontSize: 14,
              fontWeight: 300,
              lineHeight: 1.5,
              marginBottom: 24,
            }}
          >
            Your session has expired. Begin a new booking.
          </p>
          <Link
            href="/book"
            className="btn-primary"
            style={{ display: 'inline-block' }}
          >
            BOOK NOW
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--anthracite)', padding: '64px 0' }}>
      <div className="max-w-[640px] mx-auto px-4">
        {/* Top copper accent line */}
        <span className="copper-line" style={{ display: 'block', marginBottom: 24 }} />

        {/* PRESTIGO wordmark */}
        <span className="wordmark" style={{ display: 'block', marginBottom: 32 }}>
          <span className="wordmark-presti">PRESTI</span>
          <span className="wordmark-go">GO</span>
        </span>

        {/* Confirmation status — D-14: single h1 on the page */}
        <h1 className="label" style={{ display: 'block', marginBottom: 16, fontFamily: 'inherit', fontWeight: 'inherit', fontSize: 'inherit', letterSpacing: 'inherit' }}>
          {isQuote ? 'QUOTE REQUEST SENT' : 'BOOKING CONFIRMED'}
        </h1>

        {/* Reference display — D-14: h1 stays BOOKING CONFIRMED above; refs use h2 inside sections */}
        {!isRoundTrip && (
          <section aria-labelledby="booking-ref-label">
            <span
              id="booking-ref-label"
              className="label"
              style={{ display: 'block', marginBottom: 8, color: 'var(--warmgrey)' }}
            >
              {isQuote ? 'YOUR REFERENCE' : 'YOUR BOOKING REFERENCE'}
            </span>
            <h2
              style={{
                fontFamily: 'var(--font-cormorant)',
                fontWeight: 300,
                fontSize: 32,
                lineHeight: 1.1,
                color: 'var(--offwhite)',
                marginBottom: 32,
              }}
            >
              {ref}
            </h2>
          </section>
        )}

        {isRoundTrip && (
          <div style={{ marginBottom: 32, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <section
              aria-labelledby="outbound-ref-label"
              style={{
                flex: '1 1 240px',
                padding: 16,
                background: 'var(--anthracite-mid)',
                borderLeft: '3px solid #B87333',
              }}
            >
              <span
                id="outbound-ref-label"
                className="label"
                style={{ display: 'block', marginBottom: 8, color: 'var(--warmgrey)' }}
              >
                OUTBOUND
              </span>
              <h2
                style={{
                  fontFamily: 'var(--font-cormorant)',
                  fontWeight: 300,
                  fontSize: 22,
                  color: 'var(--offwhite)',
                  margin: 0,
                }}
              >
                {ref}
              </h2>
            </section>
            <section
              aria-labelledby="return-ref-label"
              style={{
                flex: '1 1 240px',
                padding: 16,
                background: 'var(--anthracite-mid)',
                borderLeft: '3px solid #B87333',
              }}
            >
              <span
                id="return-ref-label"
                className="label"
                style={{ display: 'block', marginBottom: 8, color: 'var(--warmgrey)' }}
              >
                RETURN
              </span>
              <h2
                style={{
                  fontFamily: 'var(--font-cormorant)',
                  fontWeight: 300,
                  fontSize: 22,
                  color: 'var(--offwhite)',
                  margin: 0,
                }}
              >
                {returnRef}
              </h2>
            </section>
          </div>
        )}

        {/* Quote body copy — only for quote flow */}
        {isQuote && (
          <p
            style={{
              fontSize: 14,
              fontWeight: 300,
              color: 'var(--warmgrey)',
              lineHeight: 1.5,
              marginBottom: 32,
            }}
          >
            We will be in touch within 2 hours to confirm your journey and pricing.
          </p>
        )}

        {/* Journey details — one-way: single card; round-trip: two stacked cards (D-12) */}
        {!isRoundTrip && (
          <div
            style={{
              background: 'var(--anthracite-mid)',
              borderRadius: 4,
              padding: 24,
              marginBottom: 32,
            }}
          >
            <span className="label" style={{ display: 'block', marginBottom: 16 }}>
              JOURNEY DETAILS
            </span>

            {/* Route */}
            {(origin?.address || destination?.address) && (
              <p
                style={{
                  fontSize: 14,
                  fontWeight: 300,
                  color: 'var(--warmgrey)',
                  lineHeight: 1.5,
                  marginBottom: 8,
                }}
              >
                {tripType === 'hourly'
                  ? `${hours} hours`
                  : `${origin?.address ?? ''} \u2192 ${destination?.address ?? ''}`}
              </p>
            )}

            {/* Date + time */}
            {(pickupDate || pickupTime) && (
              <p
                style={{
                  fontSize: 14,
                  fontWeight: 300,
                  color: 'var(--warmgrey)',
                  lineHeight: 1.5,
                  marginBottom: 8,
                }}
              >
                {[pickupDate, pickupTime ? `at ${pickupTime}` : null].filter(Boolean).join(' ')}
              </p>
            )}

            {/* Vehicle + passengers */}
            {vehicleLabel && (
              <p
                style={{
                  fontSize: 14,
                  fontWeight: 300,
                  color: 'var(--warmgrey)',
                  lineHeight: 1.5,
                }}
              >
                {vehicleLabel} &middot; {passengers} {passengers === 1 ? 'passenger' : 'passengers'}
              </p>
            )}
          </div>
        )}

        {isRoundTrip && (
          <>
            <div
              style={{
                background: 'var(--anthracite-mid)',
                borderRadius: 4,
                padding: 24,
                marginBottom: 16,
              }}
            >
              <span className="label" style={{ display: 'block', marginBottom: 16 }}>
                OUTBOUND JOURNEY
              </span>
              {(origin?.address || destination?.address) && (
                <p style={{ fontSize: 14, fontWeight: 300, color: 'var(--warmgrey)', lineHeight: 1.5, marginBottom: 8 }}>
                  {`${origin?.address ?? ''} \u2192 ${destination?.address ?? ''}`}
                </p>
              )}
              {(pickupDate || pickupTime) && (
                <p style={{ fontSize: 14, fontWeight: 300, color: 'var(--warmgrey)', lineHeight: 1.5, marginBottom: 8 }}>
                  {[pickupDate, pickupTime ? `at ${pickupTime}` : null].filter(Boolean).join(' ')}
                </p>
              )}
              {vehicleLabel && (
                <p style={{ fontSize: 14, fontWeight: 300, color: 'var(--warmgrey)', lineHeight: 1.5 }}>
                  {vehicleLabel} &middot; {passengers} {passengers === 1 ? 'passenger' : 'passengers'}
                </p>
              )}
            </div>

            <div
              style={{
                background: 'var(--anthracite-mid)',
                borderRadius: 4,
                padding: 24,
                marginBottom: 32,
              }}
            >
              <span className="label" style={{ display: 'block', marginBottom: 16 }}>
                RETURN JOURNEY
              </span>
              {(origin?.address || destination?.address) && (
                <p style={{ fontSize: 14, fontWeight: 300, color: 'var(--warmgrey)', lineHeight: 1.5, marginBottom: 8 }}>
                  {`${destination?.address ?? ''} \u2192 ${origin?.address ?? ''}`}
                </p>
              )}
              {(returnDate || returnTime) && (
                <p style={{ fontSize: 14, fontWeight: 300, color: 'var(--warmgrey)', lineHeight: 1.5, marginBottom: 8 }}>
                  {[returnDate, returnTime ? `at ${returnTime}` : null].filter(Boolean).join(' ')}
                </p>
              )}
              {vehicleLabel && (
                <p style={{ fontSize: 14, fontWeight: 300, color: 'var(--warmgrey)', lineHeight: 1.5 }}>
                  {vehicleLabel} &middot; {passengers} {passengers === 1 ? 'passenger' : 'passengers'}
                </p>
              )}
            </div>
          </>
        )}

        {/* Divider */}
        <div
          style={{
            height: 1,
            background: 'var(--anthracite-light)',
            margin: '24px 0',
          }}
          role="separator"
        />

        {/* Action buttons row */}
        <div
          style={{
            display: 'flex',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <button
            type="button"
            className="btn-ghost"
            onClick={handlePrint}
            aria-label="Print or save as PDF"
          >
            PRINT / SAVE PDF
          </button>
          <button
            type="button"
            className="btn-ghost"
            onClick={handleDownloadICS}
            aria-label="Add this booking to your calendar"
          >
            ADD TO CALENDAR
          </button>
          <a
            href="mailto:info@rideprestige.com"
            className="btn-ghost"
            style={{ textDecoration: 'none' }}
            aria-label="Contact us with questions"
          >
            QUESTIONS? CONTACT US
          </a>
        </div>

        {/* Bottom copper accent line */}
        <span className="copper-line" style={{ display: 'block', marginTop: 48 }} />
      </div>
    </div>
  )
}

export default function ConfirmationPage() {
  return (
    <Suspense
      fallback={
        <div style={{ minHeight: '100vh', background: 'var(--anthracite)' }} />
      }
    >
      <ConfirmationContent />
    </Suspense>
  )
}
