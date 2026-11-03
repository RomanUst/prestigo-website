'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { CircleHelp, Clock, Info, TriangleAlert } from 'lucide-react'
import { StatusBadge } from '@/components/admin/StatusBadge'
import type { StatusBadgeVariant } from '@/components/admin/StatusBadge'
import { DRIVER_STEP_LABEL } from '@/lib/booking-status'
import type { DriverStep } from '@/lib/booking-status'
import {
  DRIVER_STATUS_LABEL,
  formatPickupDate,
  formatPickupTime,
  formatPragueTime,
  formatPragueUnlock,
} from '@/lib/driver-trip-format'
import SlideToAdvance from './SlideToAdvance'
import type { SlideState } from './SlideToAdvance'
import ConfirmStepDialog from './ConfirmStepDialog'
import TripCompleted from './TripCompleted'

export interface TripScreenProps {
  token: string
  view: {
    status: string
    nextStep: DriverStep | null
    lockReason: 'too_early' | 'waiting' | null
    unlocksAt: string | null
  }
  trip: {
    bookingReference: string
    pickupDate: string
    pickupTime: string
    originAddress: string
    destinationAddress: string
    origin: { lat: number; lng: number } | null
    destination: { lat: number; lng: number } | null
    passengerName: string
    passengerPhone: string | null
    vehicleLabel: string
    vehicleInfo: string | null
    flight: string | null
    clientNotes: string | null
    distanceKm: number | null
  }
  initialNote: string | null
}

type BannerKind = 'info' | 'amber' | 'danger'
interface Banner {
  kind: BannerKind
  text: string
}

const INFO_BANNER_MS = 8000

const SAVE_ERROR =
  'Could not save this step. Your trip was not changed. Check your connection and try again.'

// The server may take a moment to re-render after router.refresh(); never stay "Saving…" forever.
const SETTLE_TIMEOUT_MS = 8000
// setTimeout cannot take a delay above 2^31-1 ms.
const MAX_TIMEOUT_MS = 2_147_483_647

const visuallyHidden: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  margin: -1,
  padding: 0,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
  border: 0,
}

const BANNER_ICON: Record<BannerKind, ReactNode> = {
  info: <Info size={20} aria-hidden="true" />,
  amber: <Clock size={20} aria-hidden="true" />,
  danger: <TriangleAlert size={20} aria-hidden="true" />,
}

function statusLabel(status: string): string {
  return DRIVER_STATUS_LABEL[status] ?? status
}

interface StepResponseBody {
  ok?: boolean
  status?: string
  nextStep?: DriverStep | null
  error?: string
  unlocksAt?: string
  completedAt?: string
}

export default function TripScreen({ token, view, trip }: TripScreenProps) {
  const router = useRouter()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [completedAt, setCompletedAt] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [dialogError, setDialogError] = useState<string | null>(null)
  const [banner, setBanner] = useState<Banner | null>(null)
  const [announcement, setAnnouncement] = useState('')
  // Status the server confirmed; the control keeps "Saving…" until the refreshed view reaches it.
  const [settlingTo, setSettlingTo] = useState<string | null>(null)
  const [nowMs, setNowMs] = useState(() => Date.now())
  const sendingRef = useRef(false)

  const unlocksAtMs = view.unlocksAt ? Date.parse(view.unlocksAt) : Number.NaN
  const stillEarly =
    view.lockReason === 'too_early' && Number.isFinite(unlocksAtMs) ? nowMs < unlocksAtMs : view.lockReason === 'too_early'

  // The knob flips from locked-early to ready at the unlock instant (one timer, no polling).
  useEffect(() => {
    if (view.lockReason !== 'too_early' || !Number.isFinite(unlocksAtMs)) return
    const delay = unlocksAtMs - Date.now()
    if (delay <= 0) {
      setNowMs(Date.now())
      return
    }
    const id = setTimeout(() => {
      setNowMs(Date.now())
      setAnnouncement('Start step unlocked.')
    }, Math.min(delay, MAX_TIMEOUT_MS))
    return () => clearTimeout(id)
  }, [view.lockReason, unlocksAtMs])

  // Info banners clear on their own after 8 s (UI-SPEC: banners clear on the next success or after 8 s).
  useEffect(() => {
    if (banner?.kind !== 'info') return
    const id = setTimeout(() => setBanner(null), INFO_BANNER_MS)
    return () => clearTimeout(id)
  }, [banner])

  // The refreshed server view reached the status we are waiting for: leave the settling state.
  useEffect(() => {
    if (settlingTo !== null && view.status === settlingTo) setSettlingTo(null)
  }, [view.status, settlingTo])

  useEffect(() => {
    if (settlingTo === null) return
    const id = setTimeout(() => setSettlingTo(null), SETTLE_TIMEOUT_MS)
    return () => clearTimeout(id)
  }, [settlingTo])

  const nextStep = view.nextStep
  const stepLabel = nextStep ? DRIVER_STEP_LABEL[nextStep] : ''

  let slideState: SlideState
  let slideLabel = stepLabel
  let secondaryLine: string | undefined
  if (view.lockReason === 'waiting' || nextStep === null) {
    slideState = 'locked-waiting'
    slideLabel = 'Waiting for the office'
    secondaryLine = 'The office has not released this trip yet.'
  } else if (stillEarly) {
    slideState = 'locked-early'
    slideLabel = 'Too early to start'
    secondaryLine = view.unlocksAt ? formatPragueUnlock(view.unlocksAt, nowMs) : 'Not unlocked yet'
  } else if (submitting || settlingTo !== null) {
    slideState = 'submitting'
  } else if (dialogOpen) {
    slideState = 'awaiting-confirm'
  } else {
    slideState = 'ready'
  }

  const cancelDialog = useCallback(() => {
    if (sendingRef.current) return
    setDialogOpen(false)
    setDialogError(null)
  }, [])

  const activate = useCallback(() => {
    if (sendingRef.current) return
    setDialogError(null)
    setDialogOpen(true)
  }, [])

  const submit = useCallback(async () => {
    if (!nextStep || sendingRef.current) return
    sendingRef.current = true
    setSubmitting(true)
    setDialogError(null)
    try {
      const res = await fetch(`/api/driver/trip/${token}/progress`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step: nextStep }),
      })
      let body: StepResponseBody | null = null
      try {
        body = (await res.json()) as StepResponseBody
      } catch {
        body = null
      }

      if (res.status === 200 && body?.ok && typeof body.status === 'string') {
        // Server truth only: the screen re-renders from router.refresh(), never from local state.
        setDialogOpen(false)
        setBanner(null)
        setAnnouncement(`Status updated: ${DRIVER_STEP_LABEL[nextStep]}.`)
        if (body.status === 'completed') {
          // The link is closed now: a refresh would render the details-free re-opened view, so the
          // in-session summary is built from the server's 200 answer and no refresh is requested.
          setCompletedAt(body.completedAt ?? new Date().toISOString())
        } else {
          setSettlingTo(body.status)
          router.refresh()
        }
      } else if (res.status === 400 && body?.error === 'invalid_token') {
        // The link died while the screen was open: the refreshed page renders the ended view.
        setDialogOpen(false)
        router.refresh()
      } else if (res.status === 429) {
        setDialogOpen(false)
        setBanner({ kind: 'amber', text: 'Too many taps. Wait a moment and try again.' })
      } else if (res.status === 409 && body?.error === 'step_conflict') {
        setDialogOpen(false)
        setBanner({
          kind: 'info',
          text: `The office has updated this trip (${statusLabel(body.status ?? view.status)}). Showing the latest step.`,
        })
        router.refresh()
      } else if (res.status === 409 && body?.error === 'too_early') {
        setDialogOpen(false)
        setBanner({
          kind: 'amber',
          text: body.unlocksAt
            ? `Too early to start. This step unlocks at ${formatPragueTime(body.unlocksAt)}.`
            : 'Too early to start.',
        })
        router.refresh()
      } else {
        setDialogError(SAVE_ERROR)
      }
    } catch {
      setDialogError(SAVE_ERROR)
    } finally {
      sendingRef.current = false
      setSubmitting(false)
    }
  }, [nextStep, router, token, view.status])

  const badgeVariant = view.status as StatusBadgeVariant

  if (completedAt !== null) {
    return (
      <TripCompleted
        variant="in-session"
        summary={{
          bookingReference: trip.bookingReference,
          pickupDate: trip.pickupDate,
          completedAt,
        }}
      />
    )
  }

  return (
    <main
      style={{
        boxSizing: 'border-box',
        width: '100%',
        maxWidth: 480,
        margin: '0 auto',
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'var(--font-montserrat)',
        color: 'var(--admin-text)',
      }}
    >
      <header
        style={{
          boxSizing: 'border-box',
          height: 56,
          padding: '0 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'var(--admin-bg)',
          flexShrink: 0,
        }}
      >
        <span className="admin-wordmark">PRESTIGO</span>
        {/* D-18: Help only. No Back in Phase 87 (the back slot is reserved for the Phase 94 ride list). */}
        <button
          type="button"
          data-driver-focus=""
          onClick={() => setHelpOpen(true)}
          style={{
            boxSizing: 'border-box',
            minWidth: 48,
            minHeight: 48,
            padding: '0 12px',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            background: 'transparent',
            border: '1px solid var(--admin-border-strong)',
            borderRadius: 'var(--admin-radius-md)',
            color: 'var(--admin-text)',
            fontFamily: 'inherit',
            fontSize: 'var(--driver-fs-body)',
            fontWeight: 400,
            cursor: 'pointer',
          }}
        >
          <CircleHelp size={20} aria-hidden="true" />
          Help
        </button>
      </header>

      <section
        aria-label="Trip"
        style={{
          boxSizing: 'border-box',
          flex: 1,
          marginTop: 16,
          background: 'var(--admin-surface)',
          border: '1px solid var(--admin-border)',
          borderBottom: 'none',
          borderRadius: 'var(--admin-radius-lg) var(--admin-radius-lg) 0 0',
          boxShadow: 'var(--admin-shadow-sheet)',
          padding: '16px 24px 0',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
          <div>
            <div
              style={{
                fontSize: 'var(--driver-fs-display)',
                fontWeight: 500,
                lineHeight: 1.1,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {formatPickupTime(trip.pickupTime)}
            </div>
            <div
              style={{
                fontSize: 'var(--driver-fs-label)',
                fontWeight: 400,
                lineHeight: 1.4,
                color: 'var(--admin-text-muted)',
              }}
            >
              {formatPickupDate(trip.pickupDate)}
            </div>
          </div>
          <StatusBadge variant={badgeVariant} label={statusLabel(view.status)} />
        </div>

        <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column' }}>
          <AddressRow caption="Pickup" address={trip.originAddress} dot="filled" connector />
          <AddressRow caption="Drop-off" address={trip.destinationAddress} dot="ring" />
        </ol>

        <div
          style={{
            position: 'sticky',
            bottom: 0,
            zIndex: 2,
            marginTop: 'auto',
            background: 'var(--admin-surface)',
            padding: '16px 0 calc(16px + env(safe-area-inset-bottom))',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          {banner ? (
            <div
              role={banner.kind === 'danger' ? 'alert' : 'status'}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 8,
                padding: '8px 16px',
                borderRadius: 'var(--admin-radius-md)',
                background: `var(--status-${banner.kind}-bg)`,
                color: `var(--status-${banner.kind}-fg)`,
                fontSize: 'var(--driver-fs-body)',
                fontWeight: 400,
                lineHeight: 1.5,
              }}
            >
              <span style={{ flexShrink: 0, paddingTop: 2 }}>{BANNER_ICON[banner.kind]}</span>
              <span>{banner.text}</span>
            </div>
          ) : null}
          <SlideToAdvance label={slideLabel} state={slideState} secondaryLine={secondaryLine} onActivate={activate} />
        </div>
      </section>

      <div aria-live="polite" style={visuallyHidden}>
        {announcement}
      </div>

      {helpOpen ? (
        <ConfirmStepDialog
          mode="help"
          submitting={false}
          error={null}
          onConfirm={() => setHelpOpen(false)}
          onCancel={() => setHelpOpen(false)}
        />
      ) : null}

      {dialogOpen && nextStep ? (
        <ConfirmStepDialog
          mode="step"
          stepLabel={DRIVER_STEP_LABEL[nextStep]}
          isFinal={nextStep === 'completed'}
          submitting={submitting}
          error={dialogError}
          onConfirm={submit}
          onCancel={cancelDialog}
        />
      ) : null}
    </main>
  )
}

function AddressRow({
  caption,
  address,
  dot,
  connector = false,
}: {
  caption: string
  address: string
  dot: 'filled' | 'ring'
  connector?: boolean
}) {
  return (
    <li style={{ display: 'flex', gap: 16, paddingBottom: connector ? 16 : 0 }}>
      <div style={{ position: 'relative', width: 16, flexShrink: 0, display: 'flex', justifyContent: 'center' }}>
        <span
          aria-hidden="true"
          style={{
            boxSizing: 'border-box',
            marginTop: 4,
            width: 12,
            height: 12,
            borderRadius: '50%',
            flexShrink: 0,
            zIndex: 1,
            background: dot === 'filled' ? 'var(--admin-accent)' : 'var(--admin-surface)',
            border: dot === 'ring' ? '2px solid var(--admin-text)' : 'none',
          }}
        />
        {connector ? (
          <span
            aria-hidden="true"
            style={{
              position: 'absolute',
              top: 16,
              bottom: -20,
              left: '50%',
              width: 1,
              background: 'var(--admin-border-strong)',
            }}
          />
        ) : null}
      </div>
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontSize: 'var(--driver-fs-label)',
            fontWeight: 500,
            lineHeight: 1.4,
            color: 'var(--admin-text-muted)',
          }}
        >
          {caption}
        </div>
        <div
          style={{
            fontSize: 'var(--driver-fs-body)',
            fontWeight: 400,
            lineHeight: 1.5,
            overflowWrap: 'anywhere',
          }}
        >
          {address}
        </div>
      </div>
    </li>
  )
}
