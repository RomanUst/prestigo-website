'use client'

import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { ArrowDown, ArrowUp, Calculator, Plane, Plus, Trash2, X } from 'lucide-react'
import AddressInput from '@/components/booking/AddressInput'
import { inputBaseStyle, labelStyle, errorStyle, focusRingHandlers } from '@/components/admin/adminFieldStyles'
import { CURRENCY_DECIMALS, money, minorToInput, parseAmountToMinor } from '@/components/admin/paymentShared'
import {
  isManualPrice,
  lineAmountMinor,
  lineToPriceRequest,
  newKey,
  type QuoteLineDraft,
  type QuoteLandingDraft,
  type QuotePlace,
  type QuoteStopDraft,
  type QuoteTripType,
  type QuoteVehicleClass,
} from '@/components/admin/quotes/quoteDraft'
import type { PlaceResult } from '@/types/booking'
import { DEFAULT_LANDING_OFFSET, LANDING_OFFSETS, pickupFromLanding } from '@/lib/airport-pickup'
import { MAX_STOPS, MAX_STOP_WAIT_MIN, STOP_FREE_WAIT_MIN, WAIT_BLOCK_MIN } from '@/lib/stops'

// Editor of one quote line (Phase 92, plan 92-15; QUOTE-01, D-04). Mounted by components/admin/quotes/QuoteBuilder.tsx
// (plan 92-19), which holds the QuoteDraft and passes one line at a time.
//
// The price suggestion always comes from the server (the admin quote price route, live tariffs and the real route
// through every stop); nothing is computed here. The operator's amount stays the authority and can be typed over the
// suggestion at any time (D-04): the line then shows "Manual price".
//
// Stops and waiting follow the Phase 91 rules: up to MAX_STOPS stops, each with a wait of 0..MAX_STOP_WAIT_MIN minutes
// in steps of WAIT_BLOCK_MIN, the first STOP_FREE_WAIT_MIN minutes free.

type Currency = 'eur' | 'czk'

interface QuoteLineEditorProps {
  line: QuoteLineDraft
  index: number
  total: number
  currency: Currency
  readOnly: boolean
  onChange: (line: QuoteLineDraft) => void
  onRemove: () => void
  onMove: (direction: -1 | 1) => void
}

/** 0, 15, ..., 120: the wait choices of a stop, derived from the Phase 91 constants (the same list the booking UI offers). */
const WAIT_OPTIONS: readonly number[] = Array.from(
  { length: MAX_STOP_WAIT_MIN / WAIT_BLOCK_MIN + 1 },
  (_, i) => i * WAIT_BLOCK_MIN,
)

const VEHICLE_OPTIONS: ReadonlyArray<{ value: QuoteVehicleClass; label: string }> = [
  { value: 'business', label: 'Business' },
  { value: 'first_class', label: 'First Class' },
  { value: 'business_van', label: 'Business Van' },
]

const TRIP_TYPE_OPTIONS: ReadonlyArray<{ value: QuoteTripType; label: string }> = [
  { value: 'transfer', label: 'Transfer' },
  { value: 'hourly', label: 'Hourly' },
  { value: 'daily', label: 'Daily' },
]

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => i + 1)

const PASSENGER_OPTIONS =Array.from({ length: 20 }, (_, i) => i + 1)
const LUGGAGE_OPTIONS = Array.from({ length: 21 }, (_, i) => i)

const cardStyle: CSSProperties = {
  backgroundColor: 'var(--admin-surface)',
  border: '1px solid var(--admin-border)',
  borderRadius: 'var(--admin-radius-lg)',
  padding: '16px',
  display: 'flex',
  flexDirection: 'column',
  gap: '16px',
}

const gridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
  gap: '12px',
}

const sectionTitleStyle: CSSProperties = {
  ...labelStyle,
  color: 'var(--admin-accent-text)',
  marginBottom: '8px',
}

const mutedTextStyle: CSSProperties = {
  fontFamily: 'var(--font-montserrat)',
  fontSize: 'var(--admin-fs-label)',
  color: 'var(--admin-text-muted)',
}

const buttonStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  minHeight: '44px',
  padding: '8px 14px',
  backgroundColor: 'transparent',
  border: '1px solid var(--admin-border-strong)',
  borderRadius: 'var(--admin-radius-md)',
  color: 'var(--admin-text)',
  fontFamily: 'var(--font-montserrat)',
  fontSize: 'var(--admin-fs-label)',
  fontWeight: 400,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  cursor: 'pointer',
}

const selectStyle: CSSProperties = { ...inputBaseStyle, fontWeight: 400 }
const fieldInputStyle: CSSProperties = { ...inputBaseStyle, fontWeight: 400 }

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={htmlFor} style={labelStyle}>
        {label}
      </label>
      {children}
    </div>
  )
}

const toPlaceResult = (place: QuotePlace | null): PlaceResult | null =>
  place && place.address !== '' ? { address: place.address, placeId: '', lat: place.lat, lng: place.lng } : null

const fromPlaceResult = (place: PlaceResult): QuotePlace => ({ address: place.address, lat: place.lat, lng: place.lng })

/** Everything the live tariffs read. When one of these changes, the stored suggestion no longer describes the line. */
function priceKey(line: QuoteLineDraft): string {
  return JSON.stringify([
    line.trip_type,
    line.vehicle_class,
    line.pickup_date,
    line.origin && [line.origin.lat, line.origin.lng],
    line.destination && [line.destination.lat, line.destination.lng],
    line.stops.map((s) => [s.lat, s.lng, s.wait_minutes]),
    line.hours,
    line.return_date,
    line.extra_child_seat,
    line.extra_meet_greet,
    line.extra_luggage,
  ])
}

/** The pickup that follows from a complete landing, or null while there is no landing or it is not complete yet. */
function derivedPickup(landing: QuoteLandingDraft | null): { pickupDate: string; pickupTime: string } | null {
  if (!landing || landing.date === '' || landing.time === '') return null
  const derived = pickupFromLanding(landing.date, landing.time, landing.offset_min)
  return derived ? { pickupDate: derived.pickupDate, pickupTime: derived.pickupTime } : null
}

function canSuggest(line: QuoteLineDraft): boolean {
  if (line.pickup_date === '' || line.pickup_time === '') return false
  if (!line.origin || line.origin.address === '') return false
  if (line.trip_type === 'hourly') return line.hours !== null
  if (line.trip_type === 'daily') return Boolean(line.return_date)
  if (!line.destination || line.destination.address === '') return false
  if (line.landing && derivedPickup(line.landing) === null) return false
  return line.stops.every((s) => s.address !== '')
}

const EXTRAS: ReadonlyArray<{ field: 'extra_child_seat' | 'extra_meet_greet' | 'extra_luggage'; label: string }> = [
  { field: 'extra_child_seat', label: 'Child seat' },
  { field: 'extra_meet_greet', label: 'Meet and greet' },
  { field: 'extra_luggage', label: 'Extra luggage' },
]

const TRIP_TYPE_LABEL: Record<QuoteTripType, string> = { transfer: 'Transfer', hourly: 'Hourly', daily: 'Daily' }
const VEHICLE_LABEL: Record<QuoteVehicleClass, string> = {
  business: 'Business',
  first_class: 'First Class',
  business_van: 'Business Van',
}

function ReadOnlyRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: '12px' }}>
      <dt style={{ ...labelStyle, marginBottom: 0 }}>{label}</dt>
      <dd style={{ margin: 0, fontFamily: 'var(--font-montserrat)', fontSize: 'var(--admin-fs-body)', color: 'var(--admin-text)' }}>
        {children}
      </dd>
    </div>
  )
}

/** One line of a frozen version: values as text only. */
function ReadOnlyLine({
  line,
  index,
  total,
  currency,
}: {
  line: QuoteLineDraft
  index: number
  total: number
  currency: Currency
}) {
  const amount = lineAmountMinor(line, currency)
  const extras = EXTRAS.filter(({ field }) => line[field]).map(({ label }) => label)
  return (
    <div data-testid="quote-line-editor" style={cardStyle}>
      <div style={sectionTitleStyle}>{`Trip ${index + 1} of ${total}`}</div>
      <dl style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <ReadOnlyRow label="Trip type">{TRIP_TYPE_LABEL[line.trip_type]}</ReadOnlyRow>
        <ReadOnlyRow label="Pickup">{`${line.pickup_date} ${line.pickup_time}`}</ReadOnlyRow>
        {line.landing ? (
          <ReadOnlyRow label="Flight landing">
            {`${line.landing.date} ${line.landing.time}, pickup ${line.landing.offset_min} min after landing`}
          </ReadOnlyRow>
        ) : null}
        <ReadOnlyRow label="From">{line.origin?.address ?? '-'}</ReadOnlyRow>
        {line.stops.map((stop, position) => (
          <ReadOnlyRow key={stop.key} label={`Stop ${position + 1}`}>
            {`${stop.address}, waits ${stop.wait_minutes} min`}
          </ReadOnlyRow>
        ))}
        {line.trip_type === 'transfer' ? <ReadOnlyRow label="To">{line.destination?.address ?? '-'}</ReadOnlyRow> : null}
        {line.hours !== null ? <ReadOnlyRow label="Hours">{String(line.hours)}</ReadOnlyRow> : null}
        {line.return_date ? <ReadOnlyRow label="Return date">{line.return_date}</ReadOnlyRow> : null}
        <ReadOnlyRow label="Vehicle">{VEHICLE_LABEL[line.vehicle_class]}</ReadOnlyRow>
        <ReadOnlyRow label="Passengers">{String(line.passengers)}</ReadOnlyRow>
        <ReadOnlyRow label="Luggage">{String(line.luggage)}</ReadOnlyRow>
        {line.flight_number ? <ReadOnlyRow label="Flight number">{line.flight_number}</ReadOnlyRow> : null}
        {line.terminal ? <ReadOnlyRow label="Terminal">{line.terminal}</ReadOnlyRow> : null}
        {extras.length > 0 ? <ReadOnlyRow label="Extras">{extras.join(', ')}</ReadOnlyRow> : null}
        {line.special_requests ? <ReadOnlyRow label="Notes for the driver">{line.special_requests}</ReadOnlyRow> : null}
        <ReadOnlyRow label="Amount">
          {amount === null ? '-' : money(amount, currency)}
          {isManualPrice(line, currency) ? ' · Manual price' : ''}
        </ReadOnlyRow>
      </dl>
    </div>
  )
}

const SUGGEST_FAILED = 'Could not suggest a price. Enter the amount by hand.'

export function QuoteLineEditor({ line, index, total, currency, readOnly, onChange, onRemove, onMove }: QuoteLineEditorProps) {
  const uid = useId()
  const id = (name: string) => `${uid}-${name}`

  // The line the editor holds right now: the price request is async, so its answer must be applied to the latest line.
  const latest = useRef(line)
  useEffect(() => {
    latest.current = line
  }, [line])

  const [busy, setBusy] = useState(false)
  const [suggestError, setSuggestError] = useState<string | null>(null)
  const [waitingUnavailable, setWaitingUnavailable] = useState(false)

  /** Applies a change; a change to anything the tariffs read drops the stored suggestion (the amount typed stays). */
  function commit(next: QuoteLineDraft) {
    if (priceKey(next) !== priceKey(line)) {
      onChange({ ...next, suggestedMinor: null, distanceKm: null })
      setWaitingUnavailable(false)
      return
    }
    onChange(next)
  }

  function changeStop(position: number, patch: Partial<QuoteStopDraft>) {
    commit({ ...line, stops: line.stops.map((s, i) => (i === position ? { ...s, ...patch } : s)) })
  }

  function addStop() {
    if (line.stops.length >= MAX_STOPS) return
    commit({
      ...line,
      stops: [...line.stops, { key: newKey('stop'), address: '', lat: 0, lng: 0, wait_minutes: 0 }],
    })
  }

  function removeStop(position: number) {
    commit({ ...line, stops: line.stops.filter((_, i) => i !== position) })
  }

  /** Fields that do not belong to the new trip type are cleared, so the payload never carries them (the server refuses them). */
  function changeTripType(tripType: QuoteTripType) {
    const transfer = tripType === 'transfer'
    commit({
      ...line,
      trip_type: tripType,
      destination: transfer ? line.destination : null,
      stops: transfer ? line.stops : [],
      landing: transfer ? line.landing : null,
      hours: tripType === 'hourly' ? line.hours : null,
      return_date: tripType === 'daily' ? line.return_date : null,
    })
  }

  /** The pickup of an airport arrival is landing + offset (Phase 91 D-18); it is derived here and again on the server. */
  function changeLanding(landing: QuoteLandingDraft) {
    const derived = derivedPickup(landing)
    commit({
      ...line,
      landing,
      ...(derived ? { pickup_date: derived.pickupDate, pickup_time: derived.pickupTime } : {}),
    })
  }

  async function suggestPrice() {
    if (busy || !canSuggest(line)) return
    const requestKey = priceKey(line)
    setBusy(true)
    setSuggestError(null)
    try {
      const res = await fetch('/api/admin/quotes/price', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ line: lineToPriceRequest(line), currency }),
      })
      if (!res.ok) {
        setSuggestError(SUGGEST_FAILED)
        return
      }
      const data = (await res.json()) as {
        suggestedMinor?: unknown
        distanceKm?: unknown
        waitingUnavailable?: unknown
      }
      if (typeof data.suggestedMinor !== 'number' || !Number.isSafeInteger(data.suggestedMinor) || data.suggestedMinor <= 0) {
        setSuggestError(SUGGEST_FAILED)
        return
      }
      const base = latest.current
      if (priceKey(base) !== requestKey) {
        setSuggestError('The line changed while the price was being suggested. Suggest again.')
        return
      }
      // The amount is filled only when it is empty or still the previous suggestion; a typed amount is never overwritten.
      const typed = lineAmountMinor(base, currency)
      const fill = base.amountInput.trim() === '' || (typed !== null && typed === base.suggestedMinor)
      onChange({
        ...base,
        suggestedMinor: data.suggestedMinor,
        distanceKm: typeof data.distanceKm === 'number' && Number.isFinite(data.distanceKm) ? data.distanceKm : null,
        amountInput: fill ? minorToInput(data.suggestedMinor, CURRENCY_DECIMALS[currency]) : base.amountInput,
      })
      setWaitingUnavailable(data.waitingUnavailable === true)
    } catch {
      setSuggestError(SUGGEST_FAILED)
    } finally {
      setBusy(false)
    }
  }

  const amountText = line.amountInput.trim()
  const amountInvalid = amountText !== '' && !parseAmountToMinor(amountText, CURRENCY_DECIMALS[currency]).ok
  const manual = isManualPrice(line, currency)
  const currencyLabel = currency.toUpperCase()

  // A frozen version (QUOTE-06) is shown as plain text: no inputs, no price request, no reorder or remove.
  if (readOnly) {
    return <ReadOnlyLine line={line} index={index} total={total} currency={currency} />
  }

  const transfer = line.trip_type === 'transfer'
  const pickupDerived = transfer && derivedPickup(line.landing) !== null

  return (
    <div data-testid="quote-line-editor" style={cardStyle}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
        <div style={sectionTitleStyle}>{`Trip ${index + 1} of ${total}`}</div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            type="button"
            aria-label="Move trip up"
            onClick={() => onMove(-1)}
            disabled={index <= 0}
            style={{ ...buttonStyle, opacity: index <= 0 ? 0.5 : 1 }}
          >
            <ArrowUp size={14} aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label="Move trip down"
            onClick={() => onMove(1)}
            disabled={index >= total - 1}
            style={{ ...buttonStyle, opacity: index >= total - 1 ? 0.5 : 1 }}
          >
            <ArrowDown size={14} aria-hidden="true" />
          </button>
          <button type="button" aria-label="Remove trip" onClick={onRemove} style={buttonStyle}>
            <Trash2 size={14} aria-hidden="true" />
          </button>
        </div>
      </div>

      <section aria-label="Pickup">
        <div style={gridStyle}>
          <Field label="Trip type" htmlFor={id('trip-type')}>
            <select
              id={id('trip-type')}
              value={line.trip_type}
              onChange={(e) => changeTripType(e.target.value as QuoteTripType)}
              style={selectStyle}
            >
              {TRIP_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>
          {pickupDerived ? (
            <div data-testid="quote-line-derived-pickup">
              <div style={labelStyle}>Pickup (landing plus offset)</div>
              <div style={{ ...mutedTextStyle, color: 'var(--admin-text)', minHeight: '44px', display: 'flex', alignItems: 'center' }}>
                {`${line.pickup_date} ${line.pickup_time}`}
              </div>
            </div>
          ) : (
            <>
              <Field label="Pickup date" htmlFor={id('date')}>
                <input
                  id={id('date')}
                  type="date"
                  value={line.pickup_date}
                  onChange={(e) => commit({ ...line, pickup_date: e.target.value })}
                  style={{ ...fieldInputStyle, colorScheme: 'dark' }}
                  {...focusRingHandlers}
                />
              </Field>
              <Field label="Pickup time" htmlFor={id('time')}>
                <input
                  id={id('time')}
                  type="time"
                  value={line.pickup_time}
                  onChange={(e) => commit({ ...line, pickup_time: e.target.value })}
                  style={{ ...fieldInputStyle, colorScheme: 'dark' }}
                  {...focusRingHandlers}
                />
              </Field>
            </>
          )}
          {line.trip_type === 'hourly' ? (
            <Field label="Hours" htmlFor={id('hours')}>
              <select
                id={id('hours')}
                value={line.hours ?? ''}
                onChange={(e) => commit({ ...line, hours: e.target.value === '' ? null : Number(e.target.value) })}
                style={selectStyle}
              >
                <option value="">Select</option>
                {HOUR_OPTIONS.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </Field>
          ) : null}
          {line.trip_type === 'daily' ? (
            <Field label="Return date" htmlFor={id('return')}>
              <input
                id={id('return')}
                type="date"
                value={line.return_date ?? ''}
                onChange={(e) => commit({ ...line, return_date: e.target.value === '' ? null : e.target.value })}
                style={{ ...fieldInputStyle, colorScheme: 'dark' }}
                {...focusRingHandlers}
              />
            </Field>
          ) : null}
        </div>
      </section>

      <section aria-label="Route" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <AddressInput
          label="Pickup address"
          placeholder="Start typing an address…"
          value={toPlaceResult(line.origin)}
          onSelect={(place) => commit({ ...line, origin: fromPlaceResult(place) })}
          onClear={() => commit({ ...line, origin: null })}
          ariaLabel="Pickup address"
          neverDisabled
        />

        {transfer && line.stops.map((stop, position) => (
          <div
            key={stop.key}
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              padding: '12px',
              border: '1px solid var(--admin-border)',
              borderRadius: 'var(--admin-radius-md)',
            }}
          >
            <AddressInput
              label={`Stop ${position + 1} address`}
              placeholder="Start typing an address…"
              value={toPlaceResult(stop.address === '' ? null : stop)}
              onSelect={(place) => changeStop(position, { address: place.address, lat: place.lat, lng: place.lng })}
              onClear={() => changeStop(position, { address: '', lat: 0, lng: 0 })}
              ariaLabel={`Stop ${position + 1} address`}
              neverDisabled
            />
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '12px' }}>
              <div style={{ flex: 1 }}>
                <Field label={`Stop ${position + 1} wait`} htmlFor={id(`wait-${stop.key}`)}>
                  <select
                    id={id(`wait-${stop.key}`)}
                    value={stop.wait_minutes}
                    onChange={(e) => changeStop(position, { wait_minutes: Number(e.target.value) })}
                    style={selectStyle}
                  >
                    {WAIT_OPTIONS.map((minutes) => (
                      <option key={minutes} value={minutes}>
                        {minutes === STOP_FREE_WAIT_MIN ? `${minutes} min (free)` : `${minutes} min`}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <button type="button" aria-label={`Remove stop ${position + 1}`} onClick={() => removeStop(position)} style={buttonStyle}>
                <X size={14} aria-hidden="true" />
              </button>
            </div>
          </div>
        ))}

        {transfer ? (
          <div>
            <button
              type="button"
              onClick={addStop}
              disabled={line.stops.length >= MAX_STOPS}
              style={{ ...buttonStyle, opacity: line.stops.length >= MAX_STOPS ? 0.5 : 1 }}
            >
              <Plus size={14} aria-hidden="true" />
              Add stop
            </button>
            <span style={{ ...mutedTextStyle, marginLeft: '12px' }}>
              {`Up to ${MAX_STOPS} stops. The first ${STOP_FREE_WAIT_MIN} minutes at each stop are free.`}
            </span>
          </div>
        ) : null}

        {transfer ? (
          <AddressInput
            label="Destination address"
            placeholder="Start typing an address…"
            value={toPlaceResult(line.destination)}
            onSelect={(place) => commit({ ...line, destination: fromPlaceResult(place) })}
            onClear={() => commit({ ...line, destination: null })}
            ariaLabel="Destination address"
            neverDisabled
          />
        ) : null}
      </section>

      {transfer ? (
        <section aria-label="Flight landing" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {line.landing ? (
            <>
              <div style={gridStyle}>
                <Field label="Landing date" htmlFor={id('landing-date')}>
                  <input
                    id={id('landing-date')}
                    type="date"
                    value={line.landing.date}
                    onChange={(e) => changeLanding({ ...line.landing!, date: e.target.value })}
                    style={{ ...fieldInputStyle, colorScheme: 'dark' }}
                    {...focusRingHandlers}
                  />
                </Field>
                <Field label="Landing time" htmlFor={id('landing-time')}>
                  <input
                    id={id('landing-time')}
                    type="time"
                    value={line.landing.time}
                    onChange={(e) => changeLanding({ ...line.landing!, time: e.target.value })}
                    style={{ ...fieldInputStyle, colorScheme: 'dark' }}
                    {...focusRingHandlers}
                  />
                </Field>
                <Field label="Minutes after landing" htmlFor={id('landing-offset')}>
                  <select
                    id={id('landing-offset')}
                    value={line.landing.offset_min}
                    onChange={(e) => changeLanding({ ...line.landing!, offset_min: Number(e.target.value) })}
                    style={selectStyle}
                  >
                    {LANDING_OFFSETS.map((minutes) => (
                      <option key={minutes} value={minutes}>
                        {minutes === 0 ? '0 min (at landing)' : `${minutes} min`}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <div>
                <button type="button" onClick={() => commit({ ...line, landing: null })} style={buttonStyle}>
                  <X size={14} aria-hidden="true" />
                  Remove flight landing
                </button>
              </div>
            </>
          ) : (
            <div>
              <button
                type="button"
                onClick={() => commit({ ...line, landing: { date: '', time: '', offset_min: DEFAULT_LANDING_OFFSET } })}
                style={buttonStyle}
              >
                <Plane size={14} aria-hidden="true" />
                Add flight landing
              </button>
              <span style={{ ...mutedTextStyle, marginLeft: '12px' }}>
                For an airport arrival: the pickup is the landing time plus the minutes you choose.
              </span>
            </div>
          )}
        </section>
      ) : null}

      <section aria-label="Vehicle">
        <div style={gridStyle}>
          <Field label="Vehicle class" htmlFor={id('vehicle')}>
            <select
              id={id('vehicle')}
              value={line.vehicle_class}
              onChange={(e) => commit({ ...line, vehicle_class: e.target.value as QuoteVehicleClass })}
              style={selectStyle}
            >
              {VEHICLE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Passengers" htmlFor={id('pax')}>
            <select
              id={id('pax')}
              value={line.passengers}
              onChange={(e) => commit({ ...line, passengers: Number(e.target.value) })}
              style={selectStyle}
            >
              {PASSENGER_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Luggage" htmlFor={id('luggage')}>
            <select
              id={id('luggage')}
              value={line.luggage}
              onChange={(e) => commit({ ...line, luggage: Number(e.target.value) })}
              style={selectStyle}
            >
              {LUGGAGE_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </section>

      <section aria-label="Details" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={gridStyle}>
          <Field label="Flight number" htmlFor={id('flight')}>
            <input
              id={id('flight')}
              type="text"
              maxLength={20}
              value={line.flight_number}
              onChange={(e) => commit({ ...line, flight_number: e.target.value })}
              style={fieldInputStyle}
              {...focusRingHandlers}
            />
          </Field>
          <Field label="Terminal" htmlFor={id('terminal')}>
            <input
              id={id('terminal')}
              type="text"
              maxLength={20}
              value={line.terminal}
              onChange={(e) => commit({ ...line, terminal: e.target.value })}
              style={fieldInputStyle}
              {...focusRingHandlers}
            />
          </Field>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px' }}>
          {EXTRAS.map(({ field, label }) => (
            <label
              key={field}
              htmlFor={id(field)}
              style={{ ...mutedTextStyle, display: 'inline-flex', alignItems: 'center', gap: '8px', color: 'var(--admin-text)' }}
            >
              <input
                id={id(field)}
                type="checkbox"
                checked={line[field]}
                onChange={(e) => commit({ ...line, [field]: e.target.checked })}
              />
              {label}
            </label>
          ))}
        </div>
        <Field label="Notes for the driver" htmlFor={id('notes')}>
          <textarea
            id={id('notes')}
            rows={3}
            maxLength={1000}
            value={line.special_requests}
            onChange={(e) => commit({ ...line, special_requests: e.target.value })}
            style={{ ...fieldInputStyle, resize: 'vertical' }}
          />
        </Field>
      </section>

      <section aria-label="Price" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '12px', flexWrap: 'wrap' }}>
          <div style={{ minWidth: '180px', flex: 1 }}>
            <Field label={`Amount (${currencyLabel})`} htmlFor={id('amount')}>
              <input
                id={id('amount')}
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={line.amountInput}
                onChange={(e) => onChange({ ...line, amountInput: e.target.value })}
                aria-invalid={amountInvalid}
                style={fieldInputStyle}
                {...focusRingHandlers}
              />
            </Field>
          </div>
          <button
            type="button"
            onClick={suggestPrice}
            disabled={busy || !canSuggest(line)}
            style={{ ...buttonStyle, opacity: busy || !canSuggest(line) ? 0.5 : 1 }}
          >
            <Calculator size={14} aria-hidden="true" />
            Suggest price
          </button>
        </div>
        {amountInvalid ? <div style={errorStyle}>Enter an amount like 120.00</div> : null}
        {line.suggestedMinor !== null ? (
          <div data-testid="quote-line-suggestion" style={mutedTextStyle}>
            {`Suggested ${money(line.suggestedMinor, currency)}`}
            {line.distanceKm !== null ? ` · ${Math.round(line.distanceKm * 10) / 10} km` : ''}
            {waitingUnavailable ? ' · waiting is not included (no waiting rate for this class)' : ''}
          </div>
        ) : null}
        {manual ? (
          <div style={{ ...mutedTextStyle, color: 'var(--status-warn-fg)' }}>Manual price</div>
        ) : null}
        {suggestError ? <div style={errorStyle}>{suggestError}</div> : null}
      </section>
    </div>
  )
}
