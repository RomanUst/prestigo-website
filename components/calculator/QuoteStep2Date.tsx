'use client'

import 'react-day-picker/style.css'
import { DayPicker } from 'react-day-picker'
import { useCalculatorStore } from '@/lib/calculator-store'

interface QuoteStepProps {
  onNext?: () => void
  onBack?: () => void
  showBack?: boolean
}

// DayPicker style overrides matching Prestigo dark theme
const calendarStyles = {
  root: {
    fontFamily: 'var(--font-montserrat)',
    color: 'var(--offwhite)',
    background: 'transparent',
  },
  months: {
    color: 'var(--offwhite)',
  },
  caption_label: {
    color: 'var(--offwhite)',
    fontSize: 13,
    fontWeight: 400,
    fontFamily: 'var(--font-montserrat)',
  },
  weekday: {
    color: 'var(--warmgrey)',
    fontSize: 13,
    fontWeight: 400,
  },
  day: {
    color: 'var(--offwhite)',
    fontSize: 13,
    width: 44,
    height: 44,
  },
  day_button: {
    color: 'var(--offwhite)',
    fontSize: 13,
    width: '100%',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    background: 'transparent',
    border: 'none',
  },
  nav: {
    color: 'var(--copper)',
  },
  button_previous: {
    color: 'var(--copper)',
    border: '1px solid var(--copper)',
    background: 'transparent',
    cursor: 'pointer',
    width: 32,
    height: 32,
  },
  button_next: {
    color: 'var(--copper)',
    border: '1px solid var(--copper)',
    background: 'transparent',
    cursor: 'pointer',
    width: 32,
    height: 32,
  },
  chevron: {
    fill: 'var(--copper)',
    width: 16,
    height: 16,
  },
}

const modifiersStyles = {
  selected: {
    background: 'var(--copper)',
    color: 'var(--anthracite)',
    borderRadius: 0,
  },
  disabled: {
    color: 'var(--warmgrey)',
    opacity: 0.4,
    cursor: 'not-allowed',
  },
  today: {
    outline: '1px solid var(--anthracite-light)',
    outlineOffset: '-2px',
  },
}

export function generateTimeSlots(): string[] {
  const slots: string[] = []
  for (let hour = 0; hour < 24; hour++) {
    for (let minute = 0; minute < 60; minute += 15) {
      const hh = hour.toString().padStart(2, '0')
      const mm = minute.toString().padStart(2, '0')
      slots.push(`${hh}:${mm}`)
    }
  }
  return slots
}

const TIME_SLOTS = generateTimeSlots()

function toLocalDateString(d: Date): string {
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

export default function QuoteStep2Date({ onNext, onBack }: QuoteStepProps) {
  const date = useCalculatorStore((s) => s.date)
  const time = useCalculatorStore((s) => s.time)
  const setDate = useCalculatorStore((s) => s.setDate)
  const setTime = useCalculatorStore((s) => s.setTime)

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const maxDate = new Date(Date.now() + 365 * 86400000)

  function handleDateSelect(d: Date | undefined) {
    if (d) {
      setDate(toLocalDateString(d))
    } else {
      setDate(null)
    }
  }

  // Validate: if today selected, time must be at least 2h from now
  function isTimeValid(): boolean {
    if (!date || !time) return false
    const todayStr = toLocalDateString(new Date())
    if (date !== todayStr) return true
    const now = new Date()
    const minTime = new Date(now.getTime() + 2 * 60 * 60 * 1000)
    const [hh, mm] = time.split(':').map(Number)
    const selectedMinutes = hh * 60 + mm
    const minMinutes = minTime.getHours() * 60 + minTime.getMinutes()
    return selectedMinutes >= minMinutes
  }

  const showMinPickupError =
    date !== null &&
    time !== null &&
    date === toLocalDateString(new Date()) &&
    !isTimeValid()

  const canProceed = date !== null && time !== null && !showMinPickupError

  return (
    <div>
      {/* Step heading */}
      <h2
        style={{
          fontFamily: 'var(--font-montserrat)',
          fontSize: '16px',
          fontWeight: 400,
          color: 'var(--offwhite)',
          marginBottom: '8px',
          letterSpacing: '0.03em',
        }}
      >
        Date &amp; Time
      </h2>
      <div
        style={{
          width: '40px',
          height: '1px',
          background: 'linear-gradient(90deg, var(--copper) 0%, var(--copper-pale) 60%, transparent 100%)',
          marginBottom: '24px',
        }}
      />

      {/* DayPicker */}
      <div style={{ marginBottom: '16px' }}>
        <span
          style={{
            display: 'block',
            fontFamily: 'var(--font-montserrat)',
            fontSize: '11px',
            fontWeight: 400,
            letterSpacing: '0.28em',
            textTransform: 'uppercase',
            color: 'var(--copper-light)',
            marginBottom: '12px',
          }}
        >
          PICKUP DATE
        </span>
        <DayPicker
          mode="single"
          selected={date ? new Date(date) : undefined}
          onSelect={handleDateSelect}
          disabled={[{ before: today }, { after: maxDate }]}
          styles={calendarStyles as Parameters<typeof DayPicker>[0]['styles']}
          modifiersStyles={modifiersStyles}
        />
      </div>

      {/* Time slot select */}
      <div style={{ marginBottom: '16px' }}>
        <label
          style={{
            display: 'block',
            fontFamily: 'var(--font-montserrat)',
            fontSize: '11px',
            fontWeight: 400,
            letterSpacing: '0.28em',
            textTransform: 'uppercase',
            color: 'var(--copper-light)',
            marginBottom: '8px',
          }}
        >
          PICKUP TIME
        </label>
        <select
          value={time ?? ''}
          onChange={(e) => setTime(e.target.value || null)}
          style={{
            width: '100%',
            minHeight: '48px',
            background: 'var(--anthracite-mid)',
            border: '1px solid var(--anthracite-light)',
            color: time ? 'var(--offwhite)' : 'var(--warmgrey)',
            fontFamily: 'var(--font-montserrat)',
            fontSize: '14px',
            fontWeight: 300,
            padding: '12px 16px',
            cursor: 'pointer',
            appearance: 'none',
            WebkitAppearance: 'none',
          }}
        >
          <option value="">Select time…</option>
          {TIME_SLOTS.map((slot) => (
            <option key={slot} value={slot}>
              {slot}
            </option>
          ))}
        </select>

        {/* Min pickup error */}
        {showMinPickupError && (
          <p
            role="alert"
            style={{
              fontFamily: 'var(--font-montserrat)',
              fontSize: '13px',
              fontWeight: 400,
              color: '#C0392B',
              marginTop: '8px',
            }}
          >
            Pickup must be at least 2 hours from now
          </p>
        )}
      </div>

      {/* Footer */}
      <div className="quote-step-footer" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <button
          type="button"
          className="btn-primary"
          disabled={!canProceed}
          onClick={() => canProceed && onNext?.()}
          aria-disabled={!canProceed}
          style={{
            width: '100%',
            minHeight: 44,
            opacity: canProceed ? 1 : 0.4,
            cursor: canProceed ? 'pointer' : 'not-allowed',
          }}
        >
          CONTINUE →
        </button>
        <button
          type="button"
          className="btn-ghost"
          onClick={onBack}
          style={{ width: '100%', minHeight: 44 }}
        >
          ← BACK
        </button>
      </div>
    </div>
  )
}
