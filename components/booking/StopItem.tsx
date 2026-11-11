'use client'

import { useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { X } from 'lucide-react'
import AddressInput from '@/components/booking/AddressInput'
import { useWaitingConfig } from '@/components/booking/useWaitingConfig'
import { MAX_STOP_WAIT_MIN, STOP_FREE_WAIT_MIN, WAIT_BLOCK_MIN } from '@/lib/stops'
import type { Stop, PlaceResult } from '@/types/booking'

export interface StopItemProps {
  stop: Stop
  index: number
  onRemove: (id: string) => void
  onUpdate: (id: string, place: PlaceResult | null) => void
  /** Absent where waiting is not priced (multi-day planner): the wait selector is not shown. */
  onWaitChange?: (id: string, minutes: number) => void
}

// D-06: 15-minute steps from 0 to the per-stop maximum (0, 15 ... 120).
const WAIT_TIME_OPTIONS: readonly number[] = Array.from(
  { length: MAX_STOP_WAIT_MIN / WAIT_BLOCK_MIN + 1 },
  (_, i) => i * WAIT_BLOCK_MIN,
)

const HINT_STYLE = {
  margin: '6px 0 0',
  fontFamily: 'var(--font-montserrat)',
  fontSize: '11px',
  fontWeight: 300,
  lineHeight: 1.5,
  color: 'var(--warmgrey)',
} as const

function WaitSelector({
  stop,
  onWaitChange,
}: {
  stop: Stop
  onWaitChange: (id: string, minutes: number) => void
}) {
  const t = useTranslations('Booking.stopItem')
  const { offeredClasses, loaded } = useWaitingConfig()
  // D-06: the wait is booking data — it lives in the store (stop.waitMinutes) and goes to the quote.
  const waitMinutes = stop.waitMinutes ?? 0

  // D-05: once the config is known, no class offering paid waiting means only the free time is offered.
  const paidUnavailable = loaded && offeredClasses.length === 0
  const options = paidUnavailable
    ? WAIT_TIME_OPTIONS.filter((m) => m <= STOP_FREE_WAIT_MIN)
    : WAIT_TIME_OPTIONS

  // A stored wait above the free time can no longer be priced: bring it back to the free time.
  useEffect(() => {
    if (paidUnavailable && waitMinutes > STOP_FREE_WAIT_MIN) {
      onWaitChange(stop.id, STOP_FREE_WAIT_MIN)
    }
  }, [paidUnavailable, waitMinutes, stop.id, onWaitChange])

  return (
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
        {t('waitTimeLabel')}
      </label>
      <select
        id={`wait-time-${stop.id}`}
        aria-label={t('waitTimeAria')}
        value={waitMinutes}
        onChange={(e) => onWaitChange(stop.id, Number(e.target.value))}
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
        {options.map((m) => (
          <option key={m} value={m}>
            {m === 0 ? t('noWait') : t('minutes', { count: m })}
          </option>
        ))}
      </select>
      {paidUnavailable ? (
        <p style={HINT_STYLE}>{t('paidWaitUnavailable')}</p>
      ) : (
        <p style={HINT_STYLE}>{t('freeWaitHint')}</p>
      )}
    </div>
  )
}

export default function StopItem({ stop, index, onRemove, onUpdate, onWaitChange }: StopItemProps) {
  const t = useTranslations('Booking.stopItem')

  const label = t('stopLabel', { number: index + 1 })

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
          aria-label={t('removeStop')}
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
        placeholder={t('addressPlaceholder')}
        value={stop.place}
        onSelect={(place) => onUpdate(stop.id, place)}
        onClear={() => onUpdate(stop.id, null)}
        ariaLabel={t('addressAria', { number: index + 1 })}
      />

      {/* Wait time selector — bound to the store; the server prices it */}
      {onWaitChange && <WaitSelector stop={stop} onWaitChange={onWaitChange} />}
    </div>
  )
}
