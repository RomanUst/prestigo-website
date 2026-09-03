'use client'

import { useState } from 'react'

interface TripProgressClientProps {
  token: string
  initialProgress: string | null
  initialNote?: string | null
}

type SubmitState = 'idle' | 'submitting' | 'error'
type NoteSubmitState = 'idle' | 'submitting' | 'saved' | 'error'

const TRIP_PROGRESS_OPTIONS: { value: string; label: string }[] = [
  { value: 'en_route', label: 'En Route' },
  { value: 'arrived', label: 'Arrived' },
  { value: 'on_board', label: 'On Board' },
  { value: 'completed', label: 'Completed' },
  { value: 'no_show', label: 'No-Show' },
]

export default function TripProgressClient({ token, initialProgress, initialNote }: TripProgressClientProps) {
  const [progress, setProgress] = useState<string | null>(initialProgress)
  const [state, setState] = useState<SubmitState>('idle')
  const [note, setNote] = useState<string>(initialNote ?? '')
  const [noteState, setNoteState] = useState<NoteSubmitState>('idle')

  async function handleTap(value: string) {
    setState('submitting')
    try {
      const res = await fetch(`/api/driver/trip/${token}/progress`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ progress: value }),
      })
      const json = await res.json()
      if (json.ok) {
        // D-02 permissive: optimistic local update, no ordering/disable gate —
        // the driver can freely self-correct by tapping a different button.
        setProgress(value)
        setState('idle')
      } else {
        setState('error')
      }
    } catch {
      setState('error')
    }
  }

  // DTRIP-06: the note is a fully independent submit path against the same
  // endpoint — it posts { note } only, never { progress }, so it can never
  // clobber the status buttons above (and vice versa; the route applies
  // both fields field-by-field, never clobbering the other).
  async function handleSubmitNote() {
    setNoteState('submitting')
    try {
      const res = await fetch(`/api/driver/trip/${token}/progress`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note }),
      })
      const json = await res.json()
      if (json.ok) {
        setNoteState('saved')
      } else {
        setNoteState('error')
      }
    } catch {
      setNoteState('error')
    }
  }

  const isSubmitting = state === 'submitting'
  const isNoteSubmitting = noteState === 'submitting'

  return (
    <div style={{ marginTop: '24px' }}>
      <div
        style={{
          fontSize: '13px',
          fontWeight: 300,
          letterSpacing: '0.25em',
          textTransform: 'uppercase',
          color: 'var(--copper-light)',
          marginBottom: '12px',
        }}
      >
        Trip Progress
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {TRIP_PROGRESS_OPTIONS.map(({ value, label }) => {
          const active = progress === value
          return (
            <button
              key={value}
              onClick={() => handleTap(value)}
              disabled={isSubmitting}
              aria-busy={isSubmitting || undefined}
              aria-pressed={active}
              style={{
                width: '100%',
                minHeight: '56px',
                background: active ? 'var(--copper)' : 'transparent',
                border: '1px solid var(--copper)',
                color: active ? 'var(--anthracite)' : 'var(--offwhite)',
                fontFamily: 'var(--font-montserrat)',
                fontSize: '11px',
                fontWeight: 500,
                letterSpacing: '0.35em',
                textTransform: 'uppercase',
                cursor: isSubmitting ? 'default' : 'pointer',
                opacity: isSubmitting ? 0.5 : 1,
                transition: 'background 0.3s ease, color 0.3s ease',
                borderRadius: 0,
              }}
              onMouseEnter={(e) => {
                if (!isSubmitting && !active) {
                  e.currentTarget.style.background = 'var(--copper)'
                  e.currentTarget.style.color = 'var(--anthracite)'
                }
              }}
              onMouseLeave={(e) => {
                if (!isSubmitting && !active) {
                  e.currentTarget.style.background = 'transparent'
                  e.currentTarget.style.color = 'var(--offwhite)'
                }
              }}
            >
              {label}
            </button>
          )
        })}
      </div>

      {state === 'error' && (
        <p
          style={{
            color: '#f87171',
            fontSize: '14px',
            fontWeight: 300,
            lineHeight: 1.75,
            textAlign: 'center',
            marginTop: '8px',
          }}
        >
          Something went wrong. Please try again.
        </p>
      )}

      {/* DTRIP-06: optional driver note — independent submit path against
          the same route, posts { note } only. */}
      <div style={{ marginTop: '24px' }}>
        <label
          htmlFor="trip-note"
          style={{
            display: 'block',
            fontSize: '13px',
            fontWeight: 300,
            letterSpacing: '0.25em',
            textTransform: 'uppercase',
            color: 'var(--copper-light)',
            marginBottom: '12px',
          }}
        >
          Note
        </label>
        <textarea
          id="trip-note"
          value={note}
          onChange={(e) => {
            setNote(e.target.value)
            if (noteState === 'saved' || noteState === 'error') setNoteState('idle')
          }}
          maxLength={2000}
          rows={3}
          disabled={isNoteSubmitting}
          placeholder="Optional note for the office (e.g. passenger running late)"
          style={{
            width: '100%',
            resize: 'vertical',
            background: 'var(--anthracite)',
            border: '1px solid var(--anthracite-light)',
            borderRadius: '2px',
            color: 'var(--offwhite)',
            fontFamily: 'var(--font-montserrat)',
            fontSize: '13px',
            fontWeight: 300,
            lineHeight: 1.5,
            padding: '8px 12px',
            boxSizing: 'border-box',
            opacity: isNoteSubmitting ? 0.5 : 1,
          }}
        />
        <button
          onClick={handleSubmitNote}
          disabled={isNoteSubmitting}
          aria-busy={isNoteSubmitting || undefined}
          style={{
            width: '100%',
            minHeight: '44px',
            marginTop: '8px',
            background: 'transparent',
            border: '1px solid var(--copper)',
            color: 'var(--offwhite)',
            fontFamily: 'var(--font-montserrat)',
            fontSize: '11px',
            fontWeight: 500,
            letterSpacing: '0.35em',
            textTransform: 'uppercase',
            cursor: isNoteSubmitting ? 'default' : 'pointer',
            opacity: isNoteSubmitting ? 0.5 : 1,
            transition: 'background 0.3s ease, color 0.3s ease',
            borderRadius: 0,
          }}
          onMouseEnter={(e) => {
            if (!isNoteSubmitting) {
              e.currentTarget.style.background = 'var(--copper)'
              e.currentTarget.style.color = 'var(--anthracite)'
            }
          }}
          onMouseLeave={(e) => {
            if (!isNoteSubmitting) {
              e.currentTarget.style.background = 'transparent'
              e.currentTarget.style.color = 'var(--offwhite)'
            }
          }}
        >
          {isNoteSubmitting ? 'Saving...' : 'Save Note'}
        </button>

        {noteState === 'saved' && (
          <p
            style={{
              color: '#4ade80',
              fontSize: '13px',
              fontWeight: 300,
              lineHeight: 1.75,
              textAlign: 'center',
              marginTop: '8px',
            }}
          >
            Note saved.
          </p>
        )}

        {noteState === 'error' && (
          <p
            style={{
              color: '#f87171',
              fontSize: '14px',
              fontWeight: 300,
              lineHeight: 1.75,
              textAlign: 'center',
              marginTop: '8px',
            }}
          >
            Something went wrong. Please try again.
          </p>
        )}
      </div>
    </div>
  )
}
