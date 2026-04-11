'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import AddressInput from '@/components/booking/AddressInput'
import type { Stop, PlaceResult } from '@/types/booking'

export interface StopItemProps {
  stop: Stop
  index: number
  onRemove: (id: string) => void
  onUpdate: (id: string, place: PlaceResult | null) => void
}

const WAIT_TIME_OPTIONS = [0, 15, 30, 45, 60, 75, 90, 105, 120] as const

export default function StopItem({ stop, index, onRemove, onUpdate }: StopItemProps) {
  // Wait time is display-only per STOP-01 — local state, NEVER sent to API or store.
  const [waitMinutes, setWaitMinutes] = useState<number>(0)

  const label = `STOP ${index + 1}`

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        padding: '16px',
        background: 'var(--anthracite-dark)',
        border: '1px solid var(--anthracite-light)',
        position: 'relative',
      }}
    >
      {/* Header row: label + remove button */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span
          className="label"
          style={{
            fontFamily: 'var(--font-montserrat)',
            fontSize: '11px',
            fontWeight: 400,
            letterSpacing: '0.15em',
            color: 'var(--warmgrey)',
            textTransform: 'uppercase',
          }}
        >
          {label}
        </span>
        <button
          type="button"
          onClick={() => onRemove(stop.id)}
          aria-label="Remove stop"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '28px',
            height: '28px',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--warmgrey)',
            padding: 0,
          }}
        >
          <X size={16} />
        </button>
      </div>

      {/* Address input — reuses Places Autocomplete */}
      <AddressInput
        label=""
        placeholder="Enter stop address"
        value={stop.place}
        onSelect={(place) => onUpdate(stop.id, place)}
        onClear={() => onUpdate(stop.id, null)}
        ariaLabel={`Stop ${index + 1} address`}
      />

      {/* Wait time selector — LOCAL state only, does not affect price */}
      <div>
        <label
          htmlFor={`wait-time-${stop.id}`}
          className="label"
          style={{
            display: 'block',
            marginBottom: '6px',
            fontFamily: 'var(--font-montserrat)',
            fontSize: '11px',
            fontWeight: 400,
            letterSpacing: '0.15em',
            color: 'var(--warmgrey)',
            textTransform: 'uppercase',
          }}
        >
          WAIT TIME
        </label>
        <select
          id={`wait-time-${stop.id}`}
          aria-label="Wait time"
          value={waitMinutes}
          onChange={(e) => setWaitMinutes(Number(e.target.value))}
          style={{
            width: '100%',
            minHeight: '44px',
            appearance: 'none',
            WebkitAppearance: 'none',
            MozAppearance: 'none',
            background: 'var(--anthracite)',
            border: '1px solid var(--anthracite-light)',
            borderRadius: '2px',
            color: 'var(--offwhite)',
            fontFamily: 'var(--font-montserrat)',
            fontSize: '13px',
            letterSpacing: '0.05em',
            padding: '10px 14px',
            cursor: 'pointer',
            outline: 'none',
          }}
        >
          {WAIT_TIME_OPTIONS.map((m) => (
            <option key={m} value={m}>
              {m === 0 ? 'No wait' : `${m} min`}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}
