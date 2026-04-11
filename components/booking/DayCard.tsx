'use client'

import { useState, useEffect, useRef } from 'react'
import { DayPicker } from 'react-day-picker'
import { X } from 'lucide-react'
import AddressInputLegacy from '@/components/booking/AddressInput'
import AddressInputNew from '@/components/booking/AddressInputNew'
import StopList from '@/components/booking/StopList'
import type { Stop, PlaceResult } from '@/types/booking'

const AddressInput =
  process.env.NEXT_PUBLIC_USE_NEW_PLACES_API === '1' ? AddressInputNew : AddressInputLegacy

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
  id: string
  type: DayType
  date: string        // optional — '' means not set
  time: string        // HH:MM, default '09:00'
  transfer: TransferDayFields
  hourly: HourlyDayFields
}

export interface DayCardProps {
  day: Day
  index: number
  hourlyRange: { min: number; max: number }
  canRemove: boolean
  onChange: (next: Day) => void
  onRemove: (id: string) => void
}

export function createDay(defaultHours: number): Day {
  return {
    id: crypto.randomUUID(),
    type: 'transfer',
    date: '',
    time: '09:00',
    transfer: { from: null, to: null, stops: [] },
    hourly: { city: null, hours: defaultHours },
  }
}

const HOURS = Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0'))
const MINUTES = Array.from({ length: 12 }, (_, i) => (i * 5).toString().padStart(2, '0'))

function formatDateDisplay(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso + 'T00:00:00')
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

const calendarStyles = {
  root: { fontFamily: 'var(--font-montserrat)', color: 'var(--offwhite)', background: 'transparent' },
  caption_label: { color: 'var(--offwhite)', fontSize: 12, fontWeight: 400, fontFamily: 'var(--font-montserrat)', letterSpacing: '0.18em', textTransform: 'uppercase' as const },
  weekday: { color: 'var(--warmgrey)', fontSize: 12, fontWeight: 400 },
  day: { color: 'var(--offwhite)', fontSize: 13, width: 36, height: 36 },
  day_button: { color: 'var(--offwhite)', fontSize: 13, width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', background: 'transparent', border: 'none' },
  nav: { color: 'var(--copper)' },
  button_previous: { color: 'var(--copper)', border: '1px solid var(--copper)', background: 'transparent', cursor: 'pointer', width: 32, height: 32 },
  button_next: { color: 'var(--copper)', border: '1px solid var(--copper)', background: 'transparent', cursor: 'pointer', width: 32, height: 32 },
  chevron: { fill: 'var(--copper)', width: 16, height: 16 },
}

const calendarModifiers = {
  selected: { background: 'var(--copper)', color: 'var(--anthracite)', borderRadius: 0 },
  disabled: { color: 'var(--warmgrey)', opacity: 0.4, cursor: 'not-allowed' },
  today: { outline: '1px solid var(--anthracite-light)', outlineOffset: '-2px' },
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

const fieldLabelStyle: React.CSSProperties = {
  fontFamily: 'var(--font-montserrat)',
  fontSize: '11px',
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
  color: 'var(--warmgrey)',
  marginBottom: '6px',
}

const triggerStyle: React.CSSProperties = {
  background: 'var(--anthracite)',
  border: '1px solid var(--anthracite-light)',
  padding: '10px 14px',
  minHeight: '44px',
  width: '100%',
  textAlign: 'left',
  fontFamily: 'var(--font-montserrat)',
  fontSize: '13px',
  cursor: 'pointer',
}

export default function DayCard({ day, index, hourlyRange, canRemove, onChange, onRemove }: DayCardProps) {
  const [openPicker, setOpenPicker] = useState<'date' | 'time' | null>(null)
  const [todayStr, setTodayStr] = useState<string>('')
  const pickerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setTodayStr(new Date().toISOString().split('T')[0])
  }, [])

  useEffect(() => {
    if (!openPicker) return
    function handlePointerDown(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setOpenPicker(null)
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpenPicker(null)
    }
    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKey)
    }
  }, [openPicker])

  // ── Date ──────────────────────────────────────────────────────────────
  function handleDateSelect(d: Date | undefined) {
    if (!d) { onChange({ ...day, date: '' }); return }
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    onChange({ ...day, date: iso })
    setOpenPicker(null)
  }

  // ── Time ──────────────────────────────────────────────────────────────
  const [selHour, selMin] = day.time ? day.time.split(':') : ['09', '00']

  function handleHourSelect(h: string) {
    onChange({ ...day, time: `${h}:${selMin}` })
  }
  function handleMinuteSelect(m: string) {
    onChange({ ...day, time: `${selHour}:${m}` })
    setOpenPicker(null)
  }

  // ── Address / stops ───────────────────────────────────────────────────
  const handleSetType = (type: DayType) => {
    if (type === day.type) return
    onChange({ ...day, type })
  }

  const handleFromSelect = (place: PlaceResult) => onChange({ ...day, transfer: { ...day.transfer, from: place } })
  const handleFromClear = () => onChange({ ...day, transfer: { ...day.transfer, from: null } })
  const handleToSelect = (place: PlaceResult) => onChange({ ...day, transfer: { ...day.transfer, to: place } })
  const handleToClear = () => onChange({ ...day, transfer: { ...day.transfer, to: null } })

  const handleStopAdd = () => {
    if (day.transfer.stops.length >= 5) return
    onChange({ ...day, transfer: { ...day.transfer, stops: [...day.transfer.stops, { id: crypto.randomUUID(), place: null }] } })
  }
  const handleStopRemove = (stopId: string) => {
    onChange({ ...day, transfer: { ...day.transfer, stops: day.transfer.stops.filter((s) => s.id !== stopId) } })
  }
  const handleStopUpdate = (stopId: string, place: PlaceResult | null) => {
    onChange({ ...day, transfer: { ...day.transfer, stops: day.transfer.stops.map((s) => (s.id === stopId ? { ...s, place } : s)) } })
  }

  const handleCitySelect = (place: PlaceResult) => onChange({ ...day, hourly: { ...day.hourly, city: place } })
  const handleCityClear = () => onChange({ ...day, hourly: { ...day.hourly, city: null } })
  const handleHoursChange = (e: React.ChangeEvent<HTMLSelectElement>) => onChange({ ...day, hourly: { ...day.hourly, hours: Number(e.target.value) } })

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
      {/* ── Header ── */}
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontFamily: 'var(--font-montserrat)', fontSize: '10px', letterSpacing: '0.32em', textTransform: 'uppercase', color: 'var(--copper-light)' }}>
          Day {index + 1}
        </span>
        {canRemove && (
          <button
            type="button"
            aria-label={`Remove day ${index + 1}`}
            onClick={() => onRemove(day.id)}
            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '32px', height: '32px', background: 'transparent', border: '1px solid var(--anthracite-light)', color: 'var(--warmgrey)', cursor: 'pointer' }}
          >
            <X size={14} />
          </button>
        )}
      </header>

      {/* ── Date + Time row ── */}
      <div ref={pickerRef} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', position: 'relative' }}>
        {/* Date */}
        <div>
          <p style={fieldLabelStyle}>
            Date <span style={{ color: 'var(--anthracite-light)', fontWeight: 300 }}>(optional)</span>
          </p>
          <button
            type="button"
            aria-haspopup="dialog"
            aria-expanded={openPicker === 'date'}
            aria-label={`Day ${index + 1} date`}
            onClick={() => setOpenPicker(openPicker === 'date' ? null : 'date')}
            style={{ ...triggerStyle, color: day.date ? 'var(--offwhite)' : 'var(--warmgrey)' }}
          >
            {day.date ? formatDateDisplay(day.date) : 'Select date'}
          </button>
        </div>

        {/* Time */}
        <div>
          <p style={fieldLabelStyle}>Start time</p>
          <button
            type="button"
            aria-haspopup="dialog"
            aria-expanded={openPicker === 'time'}
            aria-label={`Day ${index + 1} time`}
            onClick={() => setOpenPicker(openPicker === 'time' ? null : 'time')}
            style={{ ...triggerStyle, color: 'var(--offwhite)' }}
          >
            {day.time || '09:00'}
          </button>
        </div>

        {/* Date popover */}
        {openPicker === 'date' && (
          <div
            role="dialog"
            aria-label={`Day ${index + 1} date picker`}
            style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 50, background: 'var(--anthracite)', border: '1px solid var(--anthracite-light)', padding: '16px', boxShadow: '0 20px 40px rgba(0,0,0,0.5)' }}
          >
            <DayPicker
              mode="single"
              selected={day.date ? new Date(day.date + 'T00:00:00') : undefined}
              onSelect={handleDateSelect}
              disabled={todayStr ? { before: new Date(todayStr + 'T00:00:00') } : undefined}
              styles={calendarStyles as Parameters<typeof DayPicker>[0]['styles']}
              modifiersStyles={calendarModifiers}
            />
          </div>
        )}

        {/* Time popover */}
        {openPicker === 'time' && (
          <div
            role="dialog"
            aria-label={`Day ${index + 1} time picker`}
            style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 50, background: 'var(--anthracite)', border: '1px solid var(--anthracite-light)', padding: '16px', boxShadow: '0 20px 40px rgba(0,0,0,0.5)', display: 'flex', gap: '12px' }}
          >
            <div style={{ flex: 1 }}>
              <span style={{ ...fieldLabelStyle, display: 'block', marginBottom: 8 }}>HOUR</span>
              <ul role="listbox" aria-label={`Day ${index + 1} hour`} style={{ maxHeight: 200, overflowY: 'auto', margin: 0, padding: 0, border: '1px solid var(--anthracite-light)', listStyle: 'none' }}>
                {HOURS.map((h) => {
                  const isSel = selHour === h
                  return (
                    <li
                      key={h}
                      role="option"
                      aria-selected={isSel}
                      onClick={() => handleHourSelect(h)}
                      style={{ minHeight: 36, padding: '0 12px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-montserrat)', fontSize: 13, color: isSel ? 'var(--offwhite)' : 'var(--warmgrey)', background: isSel ? 'var(--anthracite-mid, #2a2a2f)' : 'transparent', borderLeft: isSel ? '3px solid var(--copper)' : '3px solid transparent', cursor: 'pointer' }}
                    >
                      {h}
                    </li>
                  )
                })}
              </ul>
            </div>
            <div style={{ flex: 1 }}>
              <span style={{ ...fieldLabelStyle, display: 'block', marginBottom: 8 }}>MIN</span>
              <ul role="listbox" aria-label={`Day ${index + 1} minute`} style={{ maxHeight: 200, overflowY: 'auto', margin: 0, padding: 0, border: '1px solid var(--anthracite-light)', listStyle: 'none' }}>
                {MINUTES.map((m) => {
                  const isSel = selMin === m
                  return (
                    <li
                      key={m}
                      role="option"
                      aria-selected={isSel}
                      onClick={() => handleMinuteSelect(m)}
                      style={{ minHeight: 36, padding: '0 12px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-montserrat)', fontSize: 13, color: isSel ? 'var(--offwhite)' : 'var(--warmgrey)', background: isSel ? 'var(--anthracite-mid, #2a2a2f)' : 'transparent', borderLeft: isSel ? '3px solid var(--copper)' : '3px solid transparent', cursor: 'pointer' }}
                    >
                      {m}
                    </li>
                  )
                })}
              </ul>
            </div>
          </div>
        )}
      </div>

      {/* ── Type tabs ── */}
      <div role="tablist" aria-label={`Day ${index + 1} type`} style={{ display: 'flex', gap: '4px', borderBottom: '1px solid var(--anthracite-light)' }}>
        {(['transfer', 'hourly'] as const).map((type) => {
          const active = day.type === type
          return (
            <button
              key={type}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => handleSetType(type)}
              style={{ ...TAB_BUTTON_BASE, color: active ? 'var(--copper-light)' : 'var(--warmgrey)', borderBottom: active ? '2px solid var(--copper-light)' : '2px solid transparent' }}
            >
              {type === 'transfer' ? 'TRANSFER' : 'HOURLY'}
            </button>
          )
        })}
      </div>

      {/* ── Fields ── */}
      {day.type === 'transfer' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <AddressInput label="From" placeholder="Pickup address" value={day.transfer.from} onSelect={handleFromSelect} onClear={handleFromClear} ariaLabel={`Day ${index + 1} from address`} required />
          <AddressInput label="To" placeholder="Destination address" value={day.transfer.to} onSelect={handleToSelect} onClear={handleToClear} ariaLabel={`Day ${index + 1} to address`} required />
          <StopList stops={day.transfer.stops} onAdd={handleStopAdd} onRemove={handleStopRemove} onUpdate={handleStopUpdate} maxStops={5} />
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <AddressInput label="Base city" placeholder="City for hourly hire" value={day.hourly.city} onSelect={handleCitySelect} onClear={handleCityClear} ariaLabel={`Day ${index + 1} base city`} required />
          <label style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontFamily: 'var(--font-montserrat)', fontSize: '11px', letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--warmgrey)' }}>
            Hours
            <select
              name="hours"
              aria-label={`Day ${index + 1} hours`}
              value={day.hourly.hours}
              onChange={handleHoursChange}
              style={{ appearance: 'none', WebkitAppearance: 'none', background: 'var(--anthracite)', color: 'var(--offwhite)', border: '1px solid var(--anthracite-light)', padding: '12px 16px', fontFamily: 'var(--font-montserrat)', fontSize: '14px' }}
            >
              {hourOptions.map((h) => (
                <option key={h} value={h}>{h} {h === 1 ? 'hour' : 'hours'}</option>
              ))}
            </select>
          </label>
        </div>
      )}
    </section>
  )
}
