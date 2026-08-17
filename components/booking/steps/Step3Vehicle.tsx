'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { DayPicker } from 'react-day-picker'
import { useBookingStore } from '@/lib/booking-store'
import { VEHICLE_CONFIG, isAirportPlace } from '@/types/booking'
import type { VehicleClass } from '@/types/booking'
import { Check } from 'lucide-react'
import VehicleCard from '@/components/booking/VehicleCard'
import PriceSummary from '@/components/booking/PriceSummary'
import StickyBookingPanel from '@/components/booking/StickyBookingPanel'
import VehicleSlideshow from '@/components/booking/VehicleSlideshow'
import AddressInput from '@/components/booking/AddressInput'
import type { PlaceResult } from '@/types/booking'

const INCLUDED_ITEMS = [
  { label: 'Fixed price', sub: 'Guaranteed at booking' },
  { label: 'Phone charging', sub: 'USB-A & USB-C in every vehicle' },
  { label: '60 min free waiting', sub: 'Airport transfers included' },
  { label: 'Wi-Fi', sub: 'Complimentary on board' },
  { label: 'Water on board', sub: 'Still & sparkling' },
  { label: 'Meet & greet', sub: 'Name board at arrivals' },
]

const VEHICLE_LABELS: Record<string, string> = {
  business: 'Business',
  first_class: 'First Class',
  business_van: 'Business Van',
}

function pushVehicleSelect(
  vehicleKey: VehicleClass,
  price: number | null,
  currency: string,
  tripCategory: string,
): void {
  if (typeof window === 'undefined') return
  const w = window as typeof window & {
    dataLayer?: unknown[]
    gtag?: (...args: unknown[]) => void
  }
  const params = {
    item_list_name: 'Vehicle Selection',
    currency,
    items: [
      {
        item_id: vehicleKey,
        item_name: VEHICLE_LABELS[vehicleKey] ?? vehicleKey,
        item_category: tripCategory,
        item_variant: tripCategory,
        price: price ?? 0,
        quantity: 1,
      },
    ],
  }
  if (typeof w.gtag === 'function') {
    w.gtag('event', 'select_item', params)
  } else {
    w.dataLayer = w.dataLayer || []
    w.dataLayer.push(['event', 'select_item', params])
    w.dataLayer.push({ event: 'select_item', ...params })
  }
}

const TIME_SLOTS: string[] = Array.from({ length: 288 }, (_, i) => {
  const h = Math.floor(i / 12).toString().padStart(2, '0')
  const m = ((i % 12) * 5).toString().padStart(2, '0')
  return `${h}:${m}`
})

const calendarStyles = {
  root: { fontFamily: 'var(--font-montserrat)', color: 'var(--offwhite)', background: 'transparent' },
  caption_label: { color: 'var(--offwhite)', fontSize: 13, fontWeight: 400, fontFamily: 'var(--font-montserrat)' },
  weekday: { color: 'var(--warmgrey)', fontSize: 13, fontWeight: 400 },
  day: { color: 'var(--offwhite)', fontSize: 13, width: 44, height: 44 },
  day_button: { color: 'var(--offwhite)', fontSize: 13, width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', background: 'transparent', border: 'none' },
  button_previous: { color: 'var(--warmgrey)', border: '1px solid var(--anthracite-light)', background: 'transparent', cursor: 'pointer' },
  button_next: { color: 'var(--warmgrey)', border: '1px solid var(--anthracite-light)', background: 'transparent', cursor: 'pointer' },
}

const modifiersStyles = {
  selected: { background: 'var(--copper)', color: 'var(--anthracite)', borderRadius: 0 },
  disabled: { color: 'var(--warmgrey)', opacity: 0.4, cursor: 'not-allowed' },
  today: { outline: '1px solid var(--anthracite-light)', outlineOffset: '-2px' },
}

function fmt12Slot(t: string): string {
  const [h, m] = t.split(':').map(Number)
  const isPM = h >= 12
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h
  return `${h12}:${m.toString().padStart(2, '0')} ${isPM ? 'PM' : 'AM'}`
}

export default function Step3Vehicle() {
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState(false)
  const dateInputRef = useRef<HTMLInputElement>(null)

  const origin = useBookingStore((s) => s.origin)
  const destination = useBookingStore((s) => s.destination)
  const pickupTime = useBookingStore((s) => s.pickupTime)
  const tripType = useBookingStore((s) => s.tripType)
  const vehicleClass = useBookingStore((s) => s.vehicleClass)
  const priceBreakdown = useBookingStore((s) => s.priceBreakdown)
  const roundTripPriceBreakdown = useBookingStore((s) => s.roundTripPriceBreakdown)
  const returnDiscountPercent = useBookingStore((s) => s.returnDiscountPercent)
  const quoteMode = useBookingStore((s) => s.quoteMode)
  const returnDate = useBookingStore((s) => s.returnDate)
  const returnTime = useBookingStore((s) => s.returnTime)
  const pickupDate = useBookingStore((s) => s.pickupDate)

  const setOrigin = useBookingStore((s) => s.setOrigin)
  const setDestination = useBookingStore((s) => s.setDestination)
  const setPickupDate = useBookingStore((s) => s.setPickupDate)
  const setPickupTime = useBookingStore((s) => s.setPickupTime)
  const setPriceBreakdown = useBookingStore((s) => s.setPriceBreakdown)
  const setRoundTripPriceBreakdown = useBookingStore((s) => s.setRoundTripPriceBreakdown)
  const setReturnDiscountPercent = useBookingStore((s) => s.setReturnDiscountPercent)
  const setDistanceKm = useBookingStore((s) => s.setDistanceKm)
  const setQuoteMode = useBookingStore((s) => s.setQuoteMode)
  const setVehicleClass = useBookingStore((s) => s.setVehicleClass)
  const setReturnDate = useBookingStore((s) => s.setReturnDate)
  const setReturnTime = useBookingStore((s) => s.setReturnTime)

  // Route edit bar state
  const [isEditingRoute, setIsEditingRoute] = useState(false)
  const [editOrigin, setEditOrigin] = useState<PlaceResult | null>(null)
  const [editDest, setEditDest] = useState<PlaceResult | null>(null)
  const [editDate, setEditDate] = useState<string | null>(null)
  const [editTime, setEditTime] = useState<string | null>(null)

  function startEditRoute() {
    setEditOrigin(origin)
    setEditDest(destination)
    setEditDate(pickupDate)
    setEditTime(pickupTime)
    setIsEditingRoute(true)
  }

  function applyRouteEdit() {
    if (editOrigin) setOrigin(editOrigin)
    if (editDest) setDestination(editDest)
    if (editDate) setPickupDate(editDate)
    if (editTime) setPickupTime(editTime)
    setIsEditingRoute(false)
    // fetchPrice reads fresh state via getState() so calling after sync store updates is safe
    fetchPrice()
  }

  const isRoundTrip = tripType === 'round_trip'

  const fetchPrice = useCallback(async () => {
    const s = useBookingStore.getState()
    // STOP-01: forward only stops with a resolved place; null-place stops are
    // filtered out (they cannot reach the Google Routes API safely — T-30-13).
    const intermediates = s.stops
      .filter((stop) => stop.place !== null)
      .map((stop) => ({ lat: stop.place!.lat, lng: stop.place!.lng }))
    setLoading(true)
    try {
      const res = await fetch('/api/calculate-price', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          origin: s.origin ? { lat: s.origin.lat, lng: s.origin.lng } : null,
          destination: s.destination ? { lat: s.destination.lat, lng: s.destination.lng } : null,
          tripType: 'transfer',
          hours: s.hours,
          pickupDate: s.pickupDate,
          returnDate: s.returnDate,
          pickupTime: s.pickupTime,
          returnTime: s.returnTime,
          isAirport: !!(isAirportPlace(s.origin) || isAirportPlace(s.destination)),
          intermediates,
        }),
      })
      const data = await res.json()
      setPriceBreakdown(data.prices)
      setRoundTripPriceBreakdown(data.returnLegPrices ?? null)
      if (data.returnDiscountPercent !== null && data.returnDiscountPercent !== undefined) {
        setReturnDiscountPercent(data.returnDiscountPercent)
      }
      setDistanceKm(data.distanceKm)
      setQuoteMode(data.quoteMode)
      setFetchError(false)
    } catch {
      setQuoteMode(true)
      setPriceBreakdown(null)
      setRoundTripPriceBreakdown(null)
      setFetchError(true)
    } finally {
      setLoading(false)
    }
  }, [setPriceBreakdown, setRoundTripPriceBreakdown, setReturnDiscountPercent, setDistanceKm, setQuoteMode])

  // Initial fetch on mount
  useEffect(() => {
    fetchPrice()
  }, [fetchPrice])

  // Default to Business when no vehicle is selected yet and pricing is loaded.
  // Improves conversion by giving the user a sensible pre-selection — they
  // immediately see a total price in the summary and can advance without an
  // extra click. Round-trip flow is intentionally NOT auto-selected because
  // it requires a return date/time which would lock the user into an extra
  // section before they make a deliberate choice.
  useEffect(() => {
    if (!vehicleClass && priceBreakdown && priceBreakdown.business) {
      setVehicleClass('business')
    }
  }, [vehicleClass, priceBreakdown, setVehicleClass])

  // Re-fetch when return date+time are both set (to compute returnLegPrices)
  const prevReturnTime = useRef<string | null>(null)
  useEffect(() => {
    if (returnTime && returnTime !== prevReturnTime.current) {
      fetchPrice()
    }
    prevReturnTime.current = returnTime ?? null
  }, [returnTime, fetchPrice])

  // Min return date = pickup date (same day return allowed)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const returnDateMin = pickupDate ? new Date(pickupDate + 'T00:00:00') : today
  const returnDateObj = returnDate ? new Date(returnDate + 'T00:00:00') : undefined

  function handleReturnDateSelect(date: Date | undefined) {
    if (date) {
      const iso =
        `${date.getFullYear()}-` +
        `${String(date.getMonth() + 1).padStart(2, '0')}-` +
        `${String(date.getDate()).padStart(2, '0')}`
      setReturnDate(iso)
      // Clear returnTime if it may now violate ordering
      if (returnTime) setReturnTime(null)
    } else {
      setReturnDate(null)
      setReturnTime(null)
    }
  }

  const cards = VEHICLE_CONFIG.map((vc) => {
    const p = priceBreakdown?.[vc.key]
    return (
      <VehicleCard
        key={vc.key}
        config={vc}
        isSelected={vehicleClass === vc.key}
        price={p ? `€${p.base}` : null}
        onSelect={() => {
          setVehicleClass(vc.key)
          // Preserve the round-trip selection made on Step 1 — selecting a
          // vehicle must not silently downgrade the booking to one-way.
          pushVehicleSelect(vc.key, p?.base ?? null, p?.currency ?? 'EUR', tripType === 'round_trip' ? 'round_trip' : 'transfer')
        }}
      />
    )
  })

  // Format time helper (12h)
  function fmt12(t: string | null): string {
    if (!t) return ''
    const [h, m] = t.split(':').map(Number)
    const isPM = h >= 12
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h
    return `${h12}:${m.toString().padStart(2, '0')} ${isPM ? 'PM' : 'AM'}`
  }

  function fmtDate(iso: string | null): string {
    if (!iso) return ''
    const d = new Date(iso + 'T12:00:00')
    return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
  }

  // Abbreviate long address for summary bar
  function shortAddr(addr: string | undefined): string {
    if (!addr) return ''
    // Show up to first comma segment
    return addr.split(',')[0].trim()
  }

  return (
    <div className="theme-light">
      {/* Route summary bar — collapsed: 4 clickable segments; expanded: inline edit form */}
      {origin && destination && !isEditingRoute && (
        <div style={{
          display: 'flex', alignItems: 'stretch',
          background: 'var(--anthracite-mid)', border: '1px solid var(--anthracite-light)',
          borderRadius: 4, marginBottom: 28, overflow: 'hidden',
        }}>
          <button type="button" onClick={startEditRoute} style={{ flex: 1, minWidth: 0, padding: '10px 14px', background: 'none', border: 'none', borderRight: '1px solid var(--anthracite-light)', cursor: 'pointer', textAlign: 'left' }}>
            <p style={{ fontFamily: 'var(--font-montserrat)', fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--warmgrey)', marginBottom: 3 }}>From</p>
            <p style={{ fontFamily: 'var(--font-montserrat)', fontSize: 12, fontWeight: 500, color: 'var(--offwhite)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{shortAddr(origin.address)}</p>
          </button>
          <div style={{ display: 'flex', alignItems: 'center', padding: '0 8px', flexShrink: 0 }}>
            <svg width="14" height="10" viewBox="0 0 14 10" fill="none"><path d="M8.5 1L13 5L8.5 9M1 5h12" stroke="var(--copper)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </div>
          <button type="button" onClick={startEditRoute} style={{ flex: 1, minWidth: 0, padding: '10px 14px', background: 'none', border: 'none', borderRight: '1px solid var(--anthracite-light)', cursor: 'pointer', textAlign: 'left' }}>
            <p style={{ fontFamily: 'var(--font-montserrat)', fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--warmgrey)', marginBottom: 3 }}>To</p>
            <p style={{ fontFamily: 'var(--font-montserrat)', fontSize: 12, fontWeight: 500, color: 'var(--offwhite)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{shortAddr(destination.address)}</p>
          </button>
          <button type="button" onClick={startEditRoute} style={{ padding: '10px 14px', background: 'none', border: 'none', borderRight: '1px solid var(--anthracite-light)', cursor: 'pointer', textAlign: 'left', flexShrink: 0 }}>
            <p style={{ fontFamily: 'var(--font-montserrat)', fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--warmgrey)', marginBottom: 3 }}>Date</p>
            <p style={{ fontFamily: 'var(--font-montserrat)', fontSize: 12, fontWeight: 500, color: 'var(--offwhite)', whiteSpace: 'nowrap' }}>{pickupDate ? fmtDate(pickupDate) : '—'}</p>
          </button>
          <button type="button" onClick={startEditRoute} style={{ padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', flexShrink: 0 }}>
            <p style={{ fontFamily: 'var(--font-montserrat)', fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--warmgrey)', marginBottom: 3 }}>Time</p>
            <p style={{ fontFamily: 'var(--font-montserrat)', fontSize: 12, fontWeight: 500, color: 'var(--offwhite)', whiteSpace: 'nowrap' }}>{pickupTime ? fmt12(pickupTime) : '—'}</p>
          </button>
        </div>
      )}

      {/* Inline route edit — same visual style as step 1 EntryBar, no box/border */}
      {origin && destination && isEditingRoute && (
        <div className="theme-light" style={{ marginBottom: 28 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
            {/* FROM — full width */}
            <div style={{ gridColumn: '1 / -1' }}>
              <AddressInput
                label="PICKUP LOCATION"
                placeholder="Enter pickup address"
                value={editOrigin}
                onSelect={setEditOrigin}
                onClear={() => setEditOrigin(null)}
                ariaLabel="Pickup location"
              />
            </div>
            {/* TO — full width */}
            <div style={{ gridColumn: '1 / -1' }}>
              <AddressInput
                label="DESTINATION"
                placeholder="Enter destination"
                value={editDest}
                onSelect={setEditDest}
                onClear={() => setEditDest(null)}
                ariaLabel="Destination"
              />
            </div>
            {/* DATE — clicking anywhere in the block opens the picker */}
            <div
              style={{ cursor: 'pointer' }}
              onClick={() => dateInputRef.current?.showPicker?.()}
            >
              <label className="label" style={{ display: 'block', marginBottom: 8, cursor: 'pointer' }}>DATE</label>
              <input
                ref={dateInputRef}
                type="date"
                value={editDate ?? ''}
                min={new Date().toISOString().slice(0, 10)}
                onChange={(e) => setEditDate(e.target.value)}
                className="input"
                style={{ width: '100%', colorScheme: 'light', cursor: 'pointer' }}
              />
            </div>
            {/* TIME — options formatted as 12h AM/PM */}
            <div>
              <label className="label" style={{ display: 'block', marginBottom: 8 }}>TIME</label>
              <select
                value={editTime ?? ''}
                onChange={(e) => setEditTime(e.target.value)}
                className="input"
                style={{ width: '100%', appearance: 'none' }}
              >
                {TIME_SLOTS.map((t) => (
                  <option key={t} value={t}>{fmt12Slot(t)}</option>
                ))}
              </select>
            </div>
          </div>
          {/* Apply / Cancel row */}
          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <button
              type="button"
              onClick={applyRouteEdit}
              disabled={!editOrigin || !editDest || !editDate || !editTime}
              className="btn-primary"
              style={{ flex: 1, letterSpacing: '0.1em', fontSize: 11 }}
            >
              Update search
            </button>
            <button
              type="button"
              onClick={() => setIsEditingRoute(false)}
              style={{
                fontFamily: 'var(--font-montserrat)', fontSize: 11, letterSpacing: '0.1em',
                textTransform: 'uppercase', color: 'var(--warmgrey)', background: 'none',
                border: '1px solid var(--anthracite-light)', padding: '10px 20px', cursor: 'pointer',
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Step heading — shown here (below the route bar) instead of BookingWizard */}
      <h2
        style={{
          fontFamily: 'var(--font-cormorant)',
          fontWeight: 300,
          fontSize: 26,
          lineHeight: 1.25,
          color: 'var(--offwhite)',
          marginBottom: 24,
        }}
      >
        Choose your vehicle
      </h2>

      {fetchError && (
        <p style={{ fontSize: 13, fontWeight: 400, color: 'var(--warmgrey)', marginBottom: 24 }}>
          Pricing unavailable. Your selection has been saved — continue to request a quote.
        </p>
      )}

      {/* Desktop: 2-col grid — left: cards + slideshow; right: StickyBookingPanel (D-09, D-10) */}
      <div className="hidden md:grid" style={{ gridTemplateColumns: '1fr 320px', gap: 32 }}>
        <div>
          {/* Vehicle cards — one per row, horizontal layout */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {cards}
          </div>

          {/* What's included — shared block, shown before slideshow */}
          <div
            style={{
              marginTop: 40,
              paddingTop: 32,
              borderTop: '1px solid var(--anthracite-light)',
            }}
          >
            <p
              style={{
                fontFamily: 'var(--font-montserrat)',
                fontSize: 11,
                fontWeight: 400,
                letterSpacing: '0.28em',
                textTransform: 'uppercase',
                color: 'var(--warmgrey)',
                marginBottom: 24,
              }}
            >
              What&rsquo;s included in every ride
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
              {INCLUDED_ITEMS.map((item) => (
                <div key={item.label} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <Check size={13} style={{ color: 'var(--copper)', flexShrink: 0, marginTop: 2 }} aria-hidden="true" />
                  <div>
                    <p style={{ fontFamily: 'var(--font-montserrat)', fontSize: 13, fontWeight: 400, color: 'var(--offwhite)', marginBottom: 2 }}>
                      {item.label}
                    </p>
                    <p style={{ fontFamily: 'var(--font-montserrat)', fontSize: 11, fontWeight: 300, color: 'var(--warmgrey)' }}>
                      {item.sub}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Interior/luggage slideshow after inclusions block (D-15) */}
          <VehicleSlideshow activeClass={vehicleClass} />
        </div>
        <StickyBookingPanel />
      </div>

      {/* Mobile: single column. paddingBottom leaves room for the fixed PriceSummary.mobileBar
         (~68px + safe area) so cards aren't hidden behind it at scroll end. */}
      <div className="flex md:hidden flex-col" style={{ gap: 12, paddingBottom: 100 }}>
        {cards}

        {/* What's included — mobile */}
        <div
          style={{
            marginTop: 28,
            paddingTop: 28,
            borderTop: '1px solid var(--anthracite-light)',
          }}
        >
          <p
            style={{
              fontFamily: 'var(--font-montserrat)',
              fontSize: 11,
              fontWeight: 400,
              letterSpacing: '0.28em',
              textTransform: 'uppercase',
              color: 'var(--warmgrey)',
              marginBottom: 20,
            }}
          >
            What&rsquo;s included in every ride
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
            {INCLUDED_ITEMS.map((item) => (
              <div key={item.label} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <Check size={13} style={{ color: 'var(--copper)', flexShrink: 0, marginTop: 2 }} aria-hidden="true" />
                <div>
                  <p style={{ fontFamily: 'var(--font-montserrat)', fontSize: 13, fontWeight: 400, color: 'var(--offwhite)', marginBottom: 2 }}>
                    {item.label}
                  </p>
                  <p style={{ fontFamily: 'var(--font-montserrat)', fontSize: 11, fontWeight: 300, color: 'var(--warmgrey)' }}>
                    {item.sub}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Interior/luggage slideshow */}
        <VehicleSlideshow activeClass={vehicleClass} />
      </div>

      {/* Return date/time — appears after clicking "Round Trip" on any card.
         pb-32 on mobile keeps the last calendar row + return-time list clear of
         the fixed PriceSummary bar (position:fixed bottom:0) that would otherwise
         obscure the only selectable dates when pickup is near month-end. */}
      {isRoundTrip && (
        <div
          className="pb-32 md:pb-0"
          style={{
            marginTop: 32,
            paddingTop: 32,
            borderTop: '1px solid var(--anthracite-light)',
          }}
        >
          <p className="label" style={{ marginBottom: 24 }}>RETURN DATE &amp; TIME</p>

          <div className="flex flex-col md:flex-row" style={{ gap: 32 }}>
            {/* Return date calendar */}
            <div className="md:w-[60%] w-full">
              <span className="label" style={{ display: 'block', marginBottom: 12 }}>
                RETURN DATE
              </span>
              <DayPicker
                mode="single"
                selected={returnDateObj}
                defaultMonth={returnDateObj ?? returnDateMin}
                onSelect={handleReturnDateSelect}
                disabled={{ before: returnDateMin }}
                styles={calendarStyles as Parameters<typeof DayPicker>[0]['styles']}
                modifiersStyles={modifiersStyles}
              />
            </div>

            {/* Return time list */}
            <div className="md:w-[40%] w-full">
              <span className="label" style={{ display: 'block', marginBottom: 12 }}>
                RETURN TIME
              </span>
              {returnDate ? (
                <ul
                  role="listbox"
                  aria-label="Return time"
                  style={{
                    maxHeight: 240,
                    overflowY: 'auto',
                    margin: 0,
                    padding: 0,
                    border: '1px solid var(--anthracite-light)',
                  }}
                >
                  {TIME_SLOTS.map((slot) => (
                    <li
                      key={slot}
                      role="option"
                      aria-selected={returnTime === slot}
                      onClick={() => setReturnTime(slot)}
                      style={{
                        minHeight: 44,
                        padding: '0 16px',
                        display: 'flex',
                        alignItems: 'center',
                        fontFamily: 'var(--font-montserrat)',
                        fontSize: 13,
                        fontWeight: 400,
                        color: returnTime === slot ? 'var(--offwhite)' : 'var(--warmgrey)',
                        background: returnTime === slot ? 'var(--anthracite-mid)' : 'transparent',
                        borderLeft: returnTime === slot ? '4px solid var(--copper)' : '4px solid transparent',
                        cursor: 'pointer',
                        transition: 'background 0.15s ease, color 0.15s ease',
                        listStyle: 'none',
                      }}
                    >
                      {slot}
                    </li>
                  ))}
                </ul>
              ) : (
                <p style={{ fontFamily: 'var(--font-montserrat)', fontSize: 13, color: 'var(--warmgrey)', lineHeight: 1.8 }}>
                  Select a return date first
                </p>
              )}
            </div>
          </div>

          {/* Ordering validation */}
          {returnDate && returnTime && pickupDate && useBookingStore.getState().pickupTime &&
            `${returnDate}T${returnTime}` <= `${pickupDate}T${useBookingStore.getState().pickupTime}` && (
            <p
              role="alert"
              style={{
                fontFamily: 'var(--font-montserrat)',
                fontSize: 13,
                color: 'var(--copper)',
                marginTop: 12,
                letterSpacing: '0.03em',
              }}
            >
              Return must be after pickup
            </p>
          )}
        </div>
      )}

      {/* Mobile fixed bottom bar */}
      <PriceSummary mobileOnly />
    </div>
  )
}
