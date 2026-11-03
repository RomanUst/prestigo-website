'use client'

import type { KeyboardEvent } from 'react'
import { ChevronsRight, Lock, LoaderCircle } from 'lucide-react'

export type SlideState = 'ready' | 'locked-early' | 'locked-waiting' | 'awaiting-confirm' | 'submitting'

interface SlideToAdvanceProps {
  label: string
  state: SlideState
  secondaryLine?: string
  onActivate: () => void
}

// 87-UI-SPEC "SlideToAdvance": track 64, knob 56, inset 4 measured from the outer edge. The track
// has a 1px border, so absolute offsets (relative to the padding box) are 3px.
const TRACK_HEIGHT = 64
const KNOB_SIZE = 56
const KNOB_OFFSET = 3

/**
 * The single next-step control (D-12). This version activates from the keyboard (Enter/Space on the
 * role=button knob) and renders the locked, awaiting-confirm and submitting states. The pointer
 * drag, press-and-hold, tap hint, offline lock and motion are layered on by plan 87-14 behind the
 * same props.
 */
export default function SlideToAdvance({ label, state, secondaryLine, onActivate }: SlideToAdvanceProps) {
  const locked = state === 'locked-early' || state === 'locked-waiting'
  const submitting = state === 'submitting'
  const atEnd = state === 'awaiting-confirm' || submitting

  const visibleLabel = submitting ? 'Saving…' : state === 'awaiting-confirm' ? 'Confirm to continue' : label

  const ariaLabel = locked
    ? [label, secondaryLine].filter(Boolean).join('. ')
    : `Next step: ${label}. Double tap to confirm.`

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return
    e.preventDefault()
    if (locked || submitting || state === 'awaiting-confirm') return
    onActivate()
  }

  return (
    <div
      aria-busy={submitting ? 'true' : undefined}
      style={{
        position: 'relative',
        boxSizing: 'border-box',
        height: TRACK_HEIGHT,
        borderRadius: 32,
        border: '1px solid var(--admin-border-strong)',
        background: 'var(--admin-hover)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        paddingLeft: TRACK_HEIGHT,
        paddingRight: 16,
        touchAction: 'pan-y',
        userSelect: 'none',
      }}
    >
      <div
        role="button"
        tabIndex={0}
        aria-label={ariaLabel}
        aria-disabled={locked ? 'true' : undefined}
        aria-busy={submitting ? 'true' : undefined}
        data-driver-focus=""
        onKeyDown={onKeyDown}
        style={{
          position: 'absolute',
          top: KNOB_OFFSET,
          left: atEnd ? `calc(100% - ${KNOB_SIZE + KNOB_OFFSET}px)` : KNOB_OFFSET,
          width: KNOB_SIZE,
          height: KNOB_SIZE,
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: locked ? 'var(--admin-border)' : 'var(--admin-accent)',
          color: locked ? 'var(--admin-text-muted)' : 'var(--admin-on-accent)',
          cursor: locked || submitting ? 'default' : 'pointer',
          touchAction: 'none',
          userSelect: 'none',
        }}
      >
        {locked ? (
          <Lock size={24} aria-hidden="true" />
        ) : submitting ? (
          <LoaderCircle size={24} className="driver-spin" aria-hidden="true" />
        ) : (
          <ChevronsRight size={24} aria-hidden="true" />
        )}
      </div>

      <div style={{ textAlign: 'center', minWidth: 0 }}>
        <div
          style={{
            fontSize: 'var(--driver-fs-body)',
            fontWeight: 500,
            lineHeight: 1.5,
            color: 'var(--admin-text)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {visibleLabel}
        </div>
        {locked && secondaryLine ? (
          <div
            style={{
              fontSize: 'var(--driver-fs-label)',
              fontWeight: 400,
              lineHeight: 1.4,
              color: 'var(--admin-text-muted)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {secondaryLine}
          </div>
        ) : null}
      </div>
    </div>
  )
}
