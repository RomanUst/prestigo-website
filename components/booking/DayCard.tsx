'use client'

import { X } from 'lucide-react'
import AddressInput from '@/components/booking/AddressInput'
import StopList from '@/components/booking/StopList'
import type { Stop, PlaceResult } from '@/types/booking'

export type DayType = 'transfer' | 'hourly'

export interface TransferDayFields {
  from: PlaceResult | null
  to: PlaceResult | null
  stops: Stop[]
}

export interface HourlyDayFields {
  city: PlaceResult | null
  hours: number
}

export interface Day {
  id: string       // crypto.randomUUID()
  type: DayType
  transfer: TransferDayFields
  hourly: HourlyDayFields
}

export interface DayCardProps {
  day: Day
  index: number           // zero-based; display as "DAY {index+1}"
  hourlyRange: { min: number; max: number }
  canRemove: boolean
  onChange: (next: Day) => void
  onRemove: (id: string) => void
}

export function createDay(defaultHours: number): Day {
  return {
    id: crypto.randomUUID(),
    type: 'transfer',
    transfer: { from: null, to: null, stops: [] },
    hourly: { city: null, hours: defaultHours },
  }
}

const TAB_BUTTON_BASE: React.CSSProperties = {
  fontFamily: 'var(--font-montserrat)',
  fontSize: '11px',
  fontWeight: 400,
  letterSpacing: '0.24em',
  textTransform: 'uppercase',
  padding: '10px 20px',
  minHeight: '40px',
  border: 'none',
  background: 'transparent',
  cursor: 'pointer',
  transition: 'color 0.2s ease, border-color 0.2s ease',
}

export default function DayCard({ day, index, hourlyRange, canRemove, onChange, onRemove }: DayCardProps) {
  const handleSetType = (type: DayType) => {
    if (type === day.type) return
    onChange({ ...day, type })
  }

  const handleFromSelect = (place: PlaceResult) => {
    onChange({ ...day, transfer: { ...day.transfer, from: place } })
  }
  const handleFromClear = () => {
    onChange({ ...day, transfer: { ...day.transfer, from: null } })
  }
  const handleToSelect = (place: PlaceResult) => {
    onChange({ ...day, transfer: { ...day.transfer, to: place } })
  }
  const handleToClear = () => {
    onChange({ ...day, transfer: { ...day.transfer, to: null } })
  }

  const handleStopAdd = () => {
    if (day.transfer.stops.length >= 5) return
    onChange({
      ...day,
      transfer: {
        ...day.transfer,
        stops: [...day.transfer.stops, { id: crypto.randomUUID(), place: null }],
      },
    })
  }
  const handleStopRemove = (stopId: string) => {
    onChange({
      ...day,
      transfer: {
        ...day.transfer,
        stops: day.transfer.stops.filter((s) => s.id !== stopId),
      },
    })
  }
  const handleStopUpdate = (stopId: string, place: PlaceResult | null) => {
    onChange({
      ...day,
      transfer: {
        ...day.transfer,
        stops: day.transfer.stops.map((s) => (s.id === stopId ? { ...s, place } : s)),
      },
    })
  }

  const handleCitySelect = (place: PlaceResult) => {
    onChange({ ...day, hourly: { ...day.hourly, city: place } })
  }
  const handleCityClear = () => {
    onChange({ ...day, hourly: { ...day.hourly, city: null } })
  }
  const handleHoursChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onChange({ ...day, hourly: { ...day.hourly, hours: Number(e.target.value) } })
  }

  const hourOptions: number[] = []
  for (let h = hourlyRange.min; h <= hourlyRange.max; h++) hourOptions.push(h)

  return (
    <section
      aria-label={`Day ${index + 1}`}
      style={{
        background: 'var(--anthracite-dark)',
        border: '1px solid var(--anthracite-light)',
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
      }}
    >
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span
          style={{
            fontFamily: 'var(--font-montserrat)',
            fontSize: '10px',
            letterSpacing: '0.32em',
            textTransform: 'uppercase',
            color: 'var(--copper-light)',
          }}
        >
          Day {index + 1}
        </span>
        {canRemove && (
          <button
            type="button"
            aria-label={`Remove day ${index + 1}`}
            onClick={() => onRemove(day.id)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '32px',
              height: '32px',
              background: 'transparent',
              border: '1px solid var(--anthracite-light)',
              color: 'var(--warmgrey)',
              cursor: 'pointer',
            }}
          >
            <X size={14} />
          </button>
        )}
      </header>

      <div
        role="tablist"
        aria-label={`Day ${index + 1} type`}
        style={{ display: 'flex', gap: '4px', borderBottom: '1px solid var(--anthracite-light)' }}
      >
        {(['transfer', 'hourly'] as const).map((type) => {
          const active = day.type === type
          return (
            <button
              key={type}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => handleSetType(type)}
              style={{
                ...TAB_BUTTON_BASE,
                color: active ? 'var(--copper-light)' : 'var(--warmgrey)',
                borderBottom: active ? '2px solid var(--copper-light)' : '2px solid transparent',
              }}
            >
              {type === 'transfer' ? 'TRANSFER' : 'HOURLY'}
            </button>
          )
        })}
      </div>

      {day.type === 'transfer' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <AddressInput
            label="From"
            placeholder="Pickup address"
            value={day.transfer.from}
            onSelect={handleFromSelect}
            onClear={handleFromClear}
            ariaLabel={`Day ${index + 1} from address`}
            required
          />
          <AddressInput
            label="To"
            placeholder="Destination address"
            value={day.transfer.to}
            onSelect={handleToSelect}
            onClear={handleToClear}
            ariaLabel={`Day ${index + 1} to address`}
            required
          />
          <StopList
            stops={day.transfer.stops}
            onAdd={handleStopAdd}
            onRemove={handleStopRemove}
            onUpdate={handleStopUpdate}
            maxStops={5}
          />
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <AddressInput
            label="Base city"
            placeholder="City for hourly hire"
            value={day.hourly.city}
            onSelect={handleCitySelect}
            onClear={handleCityClear}
            ariaLabel={`Day ${index + 1} base city`}
            required
          />
          <label
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              fontFamily: 'var(--font-montserrat)',
              fontSize: '11px',
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              color: 'var(--warmgrey)',
            }}
          >
            Hours
            <select
              name="hours"
              aria-label={`Day ${index + 1} hours`}
              value={day.hourly.hours}
              onChange={handleHoursChange}
              style={{
                appearance: 'none',
                WebkitAppearance: 'none',
                background: 'var(--anthracite)',
                color: 'var(--offwhite)',
                border: '1px solid var(--anthracite-light)',
                padding: '12px 16px',
                fontFamily: 'var(--font-montserrat)',
                fontSize: '14px',
              }}
            >
              {hourOptions.map((h) => (
                <option key={h} value={h}>
                  {h} {h === 1 ? 'hour' : 'hours'}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
    </section>
  )
}
