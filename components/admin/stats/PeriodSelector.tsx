'use client'
import { useId, useState } from 'react'
import { inputBaseStyle, labelStyle, errorStyle, focusRingHandlers } from '@/components/admin/adminFieldStyles'
import { PERIOD_PRESETS, PRESET_LABELS, matchPreset, periodSchema, resolvePreset } from '@/lib/admin-stats'
import type { Period } from '@/lib/admin-stats'

// D-13: five presets plus a custom From/To range. An invalid custom range shows
// 'Invalid date range' and changes nothing (no onChange call).
export function PeriodSelector({ value, onChange }: { value: Period; onChange: (p: Period) => void }) {
  const fromId = useId()
  const toId = useId()
  // Uncommitted edits of the two date inputs; null = show the committed value.
  const [draft, setDraft] = useState<Period | null>(null)
  const [invalid, setInvalid] = useState(false)

  const shown = draft ?? value
  const active = matchPreset(value, new Date())

  function pickPreset(preset: (typeof PERIOD_PRESETS)[number]) {
    setDraft(null)
    setInvalid(false)
    onChange(resolvePreset(preset, new Date()))
  }

  function apply() {
    const parsed = periodSchema.safeParse(shown)
    if (!parsed.success) {
      setInvalid(true)
      return
    }
    setInvalid(false)
    setDraft(null)
    onChange({ from: parsed.data.from, to: parsed.data.to })
  }

  return (
    <div style={{ marginBottom: '32px' }}>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '16px' }}>
        {PERIOD_PRESETS.map((preset) => {
          const pressed = preset === active
          return (
            <button
              key={preset}
              type="button"
              aria-pressed={pressed}
              onClick={() => pickPreset(preset)}
              style={{
                background: pressed ? 'var(--anthracite-light)' : 'transparent',
                border: `1px solid ${pressed ? 'var(--copper)' : 'var(--anthracite-light)'}`,
                borderRadius: '4px',
                padding: '8px 16px',
                minHeight: '44px',
                cursor: 'pointer',
                fontFamily: 'var(--font-montserrat)',
                fontSize: '13px',
                fontWeight: 400,
                color: pressed ? 'var(--copper)' : 'var(--offwhite)',
              }}
            >
              {PRESET_LABELS[preset]}
            </button>
          )
        })}
      </div>

      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div style={{ width: '170px' }}>
          <label htmlFor={fromId} style={labelStyle}>From</label>
          <input
            id={fromId}
            type="date"
            value={shown.from}
            onChange={(e) => setDraft({ from: e.target.value, to: shown.to })}
            style={{ ...inputBaseStyle, fontWeight: 400 }}
            {...focusRingHandlers}
          />
        </div>
        <div style={{ width: '170px' }}>
          <label htmlFor={toId} style={labelStyle}>To</label>
          <input
            id={toId}
            type="date"
            value={shown.to}
            onChange={(e) => setDraft({ from: shown.from, to: e.target.value })}
            style={{ ...inputBaseStyle, fontWeight: 400 }}
            {...focusRingHandlers}
          />
        </div>
        <button
          type="button"
          onClick={apply}
          style={{
            background: 'transparent',
            border: '1px solid var(--copper)',
            borderRadius: '4px',
            padding: '8px 24px',
            minHeight: '44px',
            cursor: 'pointer',
            fontFamily: 'var(--font-montserrat)',
            fontSize: '13px',
            fontWeight: 400,
            color: 'var(--copper)',
          }}
        >
          Apply
        </button>
      </div>

      {invalid && (
        <div role="alert" style={errorStyle}>
          Invalid date range
        </div>
      )}

      <div
        style={{
          marginTop: '12px',
          fontFamily: 'var(--font-montserrat)',
          fontSize: '11px',
          color: 'var(--warmgrey)',
        }}
      >
        {value.from} – {value.to}
      </div>
    </div>
  )
}
