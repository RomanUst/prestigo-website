'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { KeyboardEvent, PointerEvent } from 'react'
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
const INSET = 4
const KNOB_OFFSET = 3
// Release at or beyond this share of the travel activates; below it the knob snaps back.
const ACTIVATE_RATIO = 0.85
const SNAP_TRANSITION = 'transform 150ms ease-out'

/**
 * The single next-step control (D-12). Dragging the knob to at least 85% of its travel and releasing
 * calls onActivate once; the parent opens the confirm dialog, so the control itself never sends a
 * request (D-13). Enter/Space on the role=button knob activates the same path.
 */
export default function SlideToAdvance({ label, state, secondaryLine, onActivate }: SlideToAdvanceProps) {
  const locked = state === 'locked-early' || state === 'locked-waiting'
  const submitting = state === 'submitting'
  const atEnd = state === 'awaiting-confirm' || submitting
  const blocked = locked || submitting || state === 'awaiting-confirm'

  // Travel of the knob in px: track width - knob - 2 x inset.
  const [travel, setTravel] = useState(0)
  const trackRef = useRef<HTMLDivElement | null>(null)
  const travelRef = useRef(0)

  const measure = useCallback(() => {
    const node = trackRef.current
    if (!node) return 0
    const next = Math.max(0, node.getBoundingClientRect().width - KNOB_SIZE - 2 * INSET)
    travelRef.current = next
    setTravel((prev) => (prev === next ? prev : next))
    return next
  }, [])

  const setTrack = useCallback(
    (node: HTMLDivElement | null) => {
      trackRef.current = node
      if (node) measure()
    },
    [measure],
  )

  useEffect(() => {
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [measure])

  // dragX is the live offset while a pointer is down; null when no drag is in progress.
  const [dragX, setDragX] = useState<number | null>(null)
  // The knob stays at the end after a successful release until the parent moves to another state.
  const [activated, setActivated] = useState(false)
  const [prevState, setPrevState] = useState(state)
  if (prevState !== state) {
    setPrevState(state)
    setActivated(false)
  }

  const gesture = useRef<{ startX: number; offset: number } | null>(null)

  // Never leave a pointer gesture running after the control stops accepting input.
  useEffect(() => {
    if (blocked) gesture.current = null
  }, [blocked])

  const restingOffset = atEnd || activated ? travel : 0
  const offset = dragX ?? restingOffset
  const progress = travel > 0 ? offset / travel : 0

  const visibleLabel = submitting ? 'Saving…' : state === 'awaiting-confirm' ? 'Confirm to continue' : label

  const ariaLabel = locked
    ? [label, secondaryLine].filter(Boolean).join('. ')
    : `Next step: ${label}. Double tap to confirm.`

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return
    e.preventDefault()
    if (blocked) return
    onActivate()
  }

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (blocked || e.button > 0) return
    measure()
    gesture.current = { startX: e.clientX, offset: 0 }
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      // Pointer already gone (or capture unsupported): the drag still works from move events.
    }
    setDragX(0)
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    const g = gesture.current
    if (!g) return
    const next = Math.min(Math.max(e.clientX - g.startX, 0), travelRef.current)
    g.offset = next
    setDragX(next)
  }

  function endGesture(activate: boolean) {
    const g = gesture.current
    gesture.current = null
    setDragX(null)
    if (!g || !activate) return
    const t = travelRef.current
    if (t > 0 && g.offset >= ACTIVATE_RATIO * t) {
      setActivated(true)
      onActivate()
    }
  }

  return (
    <div
      ref={setTrack}
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
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={() => endGesture(true)}
        onPointerCancel={() => endGesture(false)}
        style={{
          position: 'absolute',
          top: KNOB_OFFSET,
          left: KNOB_OFFSET,
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
          transform: `translateX(${offset}px)`,
          transition: dragX === null ? SNAP_TRANSITION : 'none',
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
            opacity: 1 - 0.6 * progress,
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
