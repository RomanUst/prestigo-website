'use client'

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { KeyboardEvent, PointerEvent } from 'react'
import { ChevronsRight, Lock, LoaderCircle, WifiOff } from 'lucide-react'

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
// Press-and-hold fallback for drivers who cannot drag.
const HOLD_MS = 600
const HOLD_MOVE_PX = 8
const RING_WIDTH = 4
const RING_RADIUS = KNOB_SIZE / 2 + RING_WIDTH / 2
const RING_SIZE = KNOB_SIZE + 2 * RING_WIDTH
const RING_LENGTH = 2 * Math.PI * RING_RADIUS
// Plain tap hint, and how long a pointer interaction may wait for its click before the click is
// treated as assistive-technology activation again.
const HINT_MS = 2000
const POINTER_CLICK_WINDOW_MS = 500
const HINT_TEXT = 'Slide to continue'
const OFFLINE_LABEL = 'No connection'
const OFFLINE_LINE = 'Steps cannot be saved offline.'

function subscribeOnline(onChange: () => void) {
  window.addEventListener('online', onChange)
  window.addEventListener('offline', onChange)
  return () => {
    window.removeEventListener('online', onChange)
    window.removeEventListener('offline', onChange)
  }
}
const getOnline = () => navigator.onLine
const getOnlineServer = () => true

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'

function subscribeReducedMotion(onChange: () => void) {
  if (typeof window.matchMedia !== 'function') return () => {}
  const mql = window.matchMedia(REDUCED_MOTION_QUERY)
  mql.addEventListener?.('change', onChange)
  return () => mql.removeEventListener?.('change', onChange)
}
function getReducedMotion() {
  return typeof window.matchMedia === 'function' ? window.matchMedia(REDUCED_MOTION_QUERY).matches : false
}
const getReducedMotionServer = () => false

interface Gesture {
  startX: number
  offset: number
  moved: boolean
}

/**
 * The single next-step control (D-12). It can be operated four ways, all ending in the same
 * onActivate call that the parent turns into the confirm dialog (D-13), so the control itself never
 * sends a request:
 * - drag the knob to at least 85% of its travel and release;
 * - press and hold the knob for 600 ms without moving;
 * - Enter / Space on the role=button knob;
 * - a click that no pointer press on the knob preceded (screen-reader double tap).
 * A plain tap only shows a hint. Nothing activates while locked, offline, awaiting confirmation or
 * submitting (D-14).
 */
export default function SlideToAdvance({ label, state, secondaryLine, onActivate }: SlideToAdvanceProps) {
  const online = useSyncExternalStore(subscribeOnline, getOnline, getOnlineServer)
  const reducedMotion = useSyncExternalStore(subscribeReducedMotion, getReducedMotion, getReducedMotionServer)

  const stateLocked = state === 'locked-early' || state === 'locked-waiting'
  const submitting = state === 'submitting'
  const awaitingConfirm = state === 'awaiting-confirm'
  const atEnd = awaitingConfirm || submitting
  // Offline shows the locked look over the idle states. While the dialog is open or a request is
  // running, those states stay visible; the dialog reports the failure itself.
  const offlineLock = !online && (state === 'ready' || stateLocked)
  const locked = stateLocked || offlineLock
  const blocked = locked || submitting || awaitingConfirm

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

  // ui is the live pointer state: dragX while a pointer is down, holding while the 600 ms ring runs.
  const [ui, setUi] = useState<{ dragX: number; holding: boolean } | null>(null)
  // The knob stays at the end after a successful release until the parent moves to another state.
  const [activated, setActivated] = useState(false)
  const [hint, setHint] = useState(false)
  const [prevState, setPrevState] = useState(state)
  if (prevState !== state) {
    setPrevState(state)
    setActivated(false)
  }
  if (blocked && ui !== null) setUi(null)

  const gesture = useRef<Gesture | null>(null)
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pointerClickTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // True from a pointerdown on the knob until its click arrives (or the window expires): that click
  // belongs to a pointer interaction and is not assistive-technology activation.
  const pointerClickPending = useRef(false)
  const latest = useRef({ blocked, onActivate })
  useEffect(() => {
    latest.current = { blocked, onActivate }
  })

  const clearTimer = (ref: { current: ReturnType<typeof setTimeout> | null }) => {
    if (ref.current !== null) clearTimeout(ref.current)
    ref.current = null
  }

  // Never leave a pointer gesture or its hold timer running after the control stops accepting input.
  useEffect(() => {
    if (!blocked) return
    gesture.current = null
    if (holdTimer.current !== null) {
      clearTimeout(holdTimer.current)
      holdTimer.current = null
    }
  }, [blocked])

  useEffect(
    () => () => {
      for (const ref of [holdTimer, hintTimer, pointerClickTimer]) {
        if (ref.current !== null) clearTimeout(ref.current)
      }
    },
    [],
  )

  const showRing = !locked && !submitting
  const holding = !blocked && ui?.holding === true
  const restingOffset = atEnd || activated ? travel : 0
  const offset = !blocked && ui !== null ? ui.dragX : restingOffset
  const dragging = !blocked && ui !== null
  const progress = travel > 0 ? offset / travel : 0
  const showHint = hint && !blocked

  const visibleLabel = offlineLock
    ? OFFLINE_LABEL
    : submitting
      ? 'Saving…'
      : awaitingConfirm
        ? 'Confirm to continue'
        : label
  const lockedLine = offlineLock ? OFFLINE_LINE : secondaryLine
  const secondaryText = locked ? lockedLine : showHint ? HINT_TEXT : undefined

  const ariaLabel = locked
    ? [visibleLabel, lockedLine].filter(Boolean).join('. ')
    : `Next step: ${label}. Double tap to confirm.`

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return
    e.preventDefault()
    if (blocked) return
    onActivate()
  }

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    // Whatever click follows this press belongs to the pointer, not to assistive technology.
    pointerClickPending.current = true
    clearTimer(pointerClickTimer)
    if (blocked || e.button > 0) return
    measure()
    gesture.current = { startX: e.clientX, offset: 0, moved: false }
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      // Pointer already gone (or capture unsupported): the drag still works from move events.
    }
    setUi({ dragX: 0, holding: true })
    clearTimer(holdTimer)
    holdTimer.current = setTimeout(() => {
      holdTimer.current = null
      const g = gesture.current
      if (!g || g.moved || latest.current.blocked) return
      gesture.current = null
      setUi(null)
      setActivated(true)
      latest.current.onActivate()
    }, HOLD_MS)
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    const g = gesture.current
    if (!g) return
    const dx = e.clientX - g.startX
    if (!g.moved && Math.abs(dx) > HOLD_MOVE_PX) {
      g.moved = true
      clearTimer(holdTimer)
    }
    const next = Math.min(Math.max(dx, 0), travelRef.current)
    g.offset = next
    setUi({ dragX: next, holding: !g.moved })
  }

  function showTapHint() {
    setHint(true)
    clearTimer(hintTimer)
    hintTimer.current = setTimeout(() => {
      hintTimer.current = null
      setHint(false)
    }, HINT_MS)
  }

  function onPointerUp() {
    // Give the click of this interaction a moment to arrive, then forget it.
    clearTimer(pointerClickTimer)
    pointerClickTimer.current = setTimeout(() => {
      pointerClickTimer.current = null
      pointerClickPending.current = false
    }, POINTER_CLICK_WINDOW_MS)

    const g = gesture.current
    gesture.current = null
    clearTimer(holdTimer)
    setUi(null)
    if (!g) return
    if (!g.moved) {
      showTapHint()
      return
    }
    const t = travelRef.current
    if (t > 0 && g.offset >= ACTIVATE_RATIO * t) {
      setActivated(true)
      onActivate()
    }
  }

  function onPointerCancel() {
    pointerClickPending.current = false
    clearTimer(pointerClickTimer)
    gesture.current = null
    clearTimer(holdTimer)
    setUi(null)
  }

  function onClick() {
    if (pointerClickPending.current) {
      pointerClickPending.current = false
      clearTimer(pointerClickTimer)
      return
    }
    if (blocked) return
    onActivate()
  }

  const ringTransition = holding && !reducedMotion ? `stroke-dashoffset ${HOLD_MS}ms linear` : 'none'
  const SideIcon = offlineLock ? WifiOff : Lock

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
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onClick={onClick}
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
          // The knob follows the pointer without lag; the snap-back eases out, and jumps under
          // prefers-reduced-motion.
          transition: dragging || reducedMotion ? 'none' : SNAP_TRANSITION,
        }}
      >
        {showRing ? (
          <svg
            aria-hidden="true"
            width={RING_SIZE}
            height={RING_SIZE}
            viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}
            style={{
              position: 'absolute',
              top: -RING_WIDTH,
              left: -RING_WIDTH,
              pointerEvents: 'none',
              opacity: holding ? 1 : 0,
            }}
          >
            <circle
              data-hold-ring=""
              cx={RING_SIZE / 2}
              cy={RING_SIZE / 2}
              r={RING_RADIUS}
              fill="none"
              stroke="var(--admin-accent)"
              strokeWidth={RING_WIDTH}
              strokeDasharray={RING_LENGTH}
              transform={`rotate(-90 ${RING_SIZE / 2} ${RING_SIZE / 2})`}
              style={{
                strokeDashoffset: holding ? 0 : RING_LENGTH,
                transition: ringTransition,
              }}
            />
          </svg>
        ) : null}
        {locked ? (
          <SideIcon size={24} aria-hidden="true" />
        ) : submitting ? (
          <LoaderCircle size={24} className={reducedMotion ? undefined : 'motion-safe:animate-spin'} aria-hidden="true" />
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
        {secondaryText ? (
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
            {secondaryText}
          </div>
        ) : null}
      </div>
    </div>
  )
}
