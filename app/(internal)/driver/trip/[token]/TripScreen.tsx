'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties, ReactNode, TouchEvent } from 'react'
import { useRouter } from 'next/navigation'
import { CircleHelp, Clock, Info, MessageSquare, Navigation, Phone, TriangleAlert } from 'lucide-react'
import { StatusBadge } from '@/components/admin/StatusBadge'
import type { StatusBadgeVariant } from '@/components/admin/StatusBadge'
import { DRIVER_STEP_LABEL, TERMINAL_BOOKING_STATUSES } from '@/lib/booking-status'
import type { NavigationTarget } from '@/lib/driver-nav-url'
import type { DriverStep } from '@/lib/booking-status'
import {
  DRIVER_STATUS_LABEL,
  formatPickupDate,
  formatPickupTime,
  formatPragueTime,
  formatPragueUnlock,
} from '@/lib/driver-trip-format'
import { driverHelpConfigPath, openDriverHelpPage, saveDriverHelpConfig } from '@/lib/driver-help-contract'
import SlideToAdvance from './SlideToAdvance'
import type { SlideState } from './SlideToAdvance'
import ConfirmStepDialog from './ConfirmStepDialog'
import NavigateChooser from './NavigateChooser'
import TripCompleted from './TripCompleted'
import TripMap from './TripMap'
import NoShowBlock from './NoShowBlock'
import TripDetails from './TripDetails'

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
  /** D-15: server-computed unlock instant and the open request (both null outside on_location). */
  noShow: { availableAt: string | null; requestedAt: string | null }
}

type BannerKind = 'info' | 'amber' | 'danger'
interface Banner {
  kind: BannerKind
  text: string
}

const INFO_BANNER_MS = 8000
// UI-SPEC "Freshness": the server view is re-rendered every 30 s while the page is visible.
const REFRESH_MS = 30_000

const SAVE_ERROR =
  'Could not save this step. Your trip was not changed. Check your connection and try again.'
const NO_SHOW_ERROR =
  'Could not send the request. Your trip was not changed. Check your connection and try again.'

// The server may take a moment to re-render after router.refresh(); never stay "Saving…" forever.
const SETTLE_TIMEOUT_MS = 8000
// 87-UAT gap 3: the help config request gives up after 10 s (the call link stays available).
const HELP_CHAT_TIMEOUT_MS = 10_000
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
  noShowRequestedAt?: string
  noShowAvailableAt?: string
}

const SWIPE_MIN_PX = 24

export default function TripScreen({ token, view, trip, initialNote, noShow }: TripScreenProps) {
  const router = useRouter()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [helpChat, setHelpChat] = useState<'idle' | 'opening' | 'error'>('idle')
  const [navTarget, setNavTarget] = useState<{
    title: 'Navigate to pickup' | 'Navigate to drop-off'
    address: string
    target: NavigationTarget
  } | null>(null)
  const [completedAt, setCompletedAt] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [dialogError, setDialogError] = useState<string | null>(null)
  const [banner, setBanner] = useState<Banner | null>(null)
  const [announcement, setAnnouncement] = useState('')
  // Status the server confirmed; the control keeps "Saving…" until the refreshed view reaches it.
  const [settlingTo, setSettlingTo] = useState<string | null>(null)
  const [nowMs, setNowMs] = useState(() => Date.now())
  const [noShowDialogOpen, setNoShowDialogOpen] = useState(false)
  const [expanded, setExpanded] = useState(false)
  // A short vertical swipe on the sheet head opens (up) or closes (down) the details; the tap on
  // the handle still toggles. The click that follows a swipe is swallowed so it does not undo it.
  const swipeStartY = useRef<number | null>(null)
  const swipedRef = useRef(false)
  const sheetSwipe = {
    onTouchStart: (e: TouchEvent) => {
      swipeStartY.current = e.touches[0]?.clientY ?? null
      swipedRef.current = false
    },
    onTouchEnd: (e: TouchEvent) => {
      const start = swipeStartY.current
      swipeStartY.current = null
      const end = e.changedTouches[0]?.clientY
      if (start == null || end == null) return
      const dy = end - start
      if (Math.abs(dy) < SWIPE_MIN_PX) return
      swipedRef.current = true
      setExpanded(dy < 0)
    },
  }
  // The note draft lives here: it survives collapsing the sheet and router.refresh() re-renders.
  const [noteDraft, setNoteDraft] = useState(initialNote ?? '')
  // Request time from this session's 200 answer; the refreshed server props take over afterwards.
  const [noShowSentAt, setNoShowSentAt] = useState<string | null>(null)
  const sendingRef = useRef(false)
  const helpChatBusyRef = useRef(false)

  const noShowActive = view.status === 'on_location'
  const noShowRequestedAt = noShowActive ? (noShow.requestedAt ?? noShowSentAt) : null
  const noShowAvailableMs = noShow.availableAt ? Date.parse(noShow.availableAt) : Number.NaN

  // Server props are the truth: whenever they report a different request state (a refresh brought
  // the stored request, or the office dismissed it), the local copy of the answer is dropped.
  useEffect(() => {
    setNoShowSentAt(null)
  }, [noShow.requestedAt])

  // The caption flips to the button at availableAt with one timer (the server still rejects an early ask).
  useEffect(() => {
    if (!noShowActive || noShow.requestedAt || !Number.isFinite(noShowAvailableMs)) return
    const delay = noShowAvailableMs - Date.now()
    if (delay <= 0) {
      setNowMs(Date.now())
      return
    }
    const id = setTimeout(() => setNowMs(Date.now()), Math.min(delay, MAX_TIMEOUT_MS))
    return () => clearTimeout(id)
  }, [noShowActive, noShow.requestedAt, noShowAvailableMs])

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

  // Freshness (no polling endpoint): re-render the server view every 30 s while visible, when the page
  // becomes visible again and when the connection returns. Stops on a terminal status and once the
  // in-session completed screen is showing (the link is closed, a refresh would drop that summary).
  const refreshable = completedAt === null && !(TERMINAL_BOOKING_STATUSES as ReadonlySet<string>).has(view.status)
  useEffect(() => {
    if (!refreshable) return
    const visible = () => document.visibilityState === 'visible'
    const timer = setInterval(() => {
      if (visible()) router.refresh()
    }, REFRESH_MS)
    const onVisibility = () => {
      if (!visible()) return
      // Timers are throttled while hidden: re-check the unlock / no-show instants against the clock.
      setNowMs(Date.now())
      router.refresh()
    }
    const onOnline = () => router.refresh()
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('online', onOnline)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('online', onOnline)
    }
  }, [refreshable, router])

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

  // 400 invalid_token, 429 and 409 step_conflict mean the same for a step and for a no-show request.
  // Returns true when the answer was one of those and has been handled.
  const handleSharedFailure = useCallback(
    (status: number, body: StepResponseBody | null, closeDialog: () => void): boolean => {
      if (status === 400 && body?.error === 'invalid_token') {
        // The link died while the screen was open: the refreshed page renders the ended view.
        closeDialog()
        router.refresh()
        return true
      }
      if (status === 429) {
        closeDialog()
        setBanner({ kind: 'amber', text: 'Too many taps. Wait a moment and try again.' })
        return true
      }
      if (status === 409 && body?.error === 'step_conflict') {
        closeDialog()
        setBanner({
          kind: 'info',
          text: `The office has updated this trip (${statusLabel(body.status ?? view.status)}). Showing the latest step.`,
        })
        router.refresh()
        return true
      }
      return false
    },
    [router, view.status],
  )

  const postProgress = useCallback(
    async (payload: Record<string, unknown>): Promise<{ status: number; body: StepResponseBody | null }> => {
      const res = await fetch(`/api/driver/trip/${token}/progress`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      let body: StepResponseBody | null = null
      try {
        body = (await res.json()) as StepResponseBody
      } catch {
        body = null
      }
      return { status: res.status, body }
    },
    [token],
  )

  const openHelp = useCallback(() => {
    setHelpChat('idle')
    setHelpOpen(true)
  }, [])

  const closeHelp = useCallback(() => {
    if (helpChatBusyRef.current) return
    setHelpOpen(false)
    setHelpChat('idle')
  }, [])

  // 87-UAT gap 3: fetch the driver identity, hand it to the tokenless help page through sessionStorage
  // and leave with a FULL page load (never the Next router), so the Chatwoot SDK never runs in a
  // document whose address carries the trip token.
  const openHelpChat = useCallback(async () => {
    if (helpChatBusyRef.current) return
    helpChatBusyRef.current = true
    setHelpChat('opening')
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), HELP_CHAT_TIMEOUT_MS)
    try {
      const res = await fetch(driverHelpConfigPath(token), { method: 'POST', signal: controller.signal })
      let body: unknown = null
      try {
        body = await res.json()
      } catch {
        body = null
      }
      if (res.status === 200 && saveDriverHelpConfig(body)) {
        // Stay "opening" while the browser leaves the page.
        openDriverHelpPage()
        return
      }
      if (res.status === 400 && (body as StepResponseBody | null)?.error === 'invalid_token') {
        // The link died while the screen was open: the refreshed page renders the ended view.
        helpChatBusyRef.current = false
        setHelpOpen(false)
        setHelpChat('idle')
        router.refresh()
        return
      }
      helpChatBusyRef.current = false
      setHelpChat('error')
    } catch {
      helpChatBusyRef.current = false
      setHelpChat('error')
    } finally {
      clearTimeout(timer)
    }
  }, [token, router])

  // "Back to trip" can restore this page from the back/forward cache with the chat button still
  // "Opening chat…": reset it so the driver can try again.
  useEffect(() => {
    const onPageShow = (e: PageTransitionEvent) => {
      if (!e.persisted) return
      helpChatBusyRef.current = false
      setHelpChat('idle')
    }
    window.addEventListener('pageshow', onPageShow)
    return () => window.removeEventListener('pageshow', onPageShow)
  }, [])

  const closeStepDialog = useCallback(() => setDialogOpen(false), [])
  const closeNoShowDialog = useCallback(() => setNoShowDialogOpen(false), [])

  const submit = useCallback(async () => {
    if (!nextStep || sendingRef.current) return
    sendingRef.current = true
    setSubmitting(true)
    setDialogError(null)
    try {
      const { status, body } = await postProgress({ step: nextStep })

      if (status === 200 && body?.ok && typeof body.status === 'string') {
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
      } else if (handleSharedFailure(status, body, closeStepDialog)) {
        // handled
      } else if (status === 409 && body?.error === 'too_early') {
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
  }, [nextStep, router, postProgress, handleSharedFailure, closeStepDialog])

  const cancelNoShowDialog = useCallback(() => {
    if (sendingRef.current) return
    setNoShowDialogOpen(false)
    setDialogError(null)
  }, [])

  const openNoShowDialog = useCallback(() => {
    if (sendingRef.current) return
    setDialogError(null)
    setNoShowDialogOpen(true)
  }, [])

  // D-15: the driver only asks. Nothing is posted until the dialog's primary button; the status never changes.
  const submitNoShow = useCallback(async () => {
    if (sendingRef.current) return
    sendingRef.current = true
    setSubmitting(true)
    setDialogError(null)
    try {
      const { status, body } = await postProgress({ action: 'request_no_show' })

      if (status === 200 && body?.ok) {
        setNoShowDialogOpen(false)
        setBanner(null)
        setNoShowSentAt(body.noShowRequestedAt ?? new Date().toISOString())
        setAnnouncement('No-show requested.')
        router.refresh()
      } else if (handleSharedFailure(status, body, closeNoShowDialog)) {
        // handled
      } else if (status === 409 && body?.error === 'too_early') {
        setNoShowDialogOpen(false)
        setBanner({
          kind: 'amber',
          text: body.noShowAvailableAt
            ? `Too early to request a no-show. You can request it after ${formatPragueTime(body.noShowAvailableAt)}.`
            : 'Too early to request a no-show.',
        })
        router.refresh()
      } else {
        setDialogError(NO_SHOW_ERROR)
      }
    } catch {
      setDialogError(NO_SHOW_ERROR)
    } finally {
      sendingRef.current = false
      setSubmitting(false)
    }
  }, [router, postProgress, handleSharedFailure, closeNoShowDialog])

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
          onClick={openHelp}
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

      <TripMap
        origin={trip.origin}
        destination={trip.destination}
        originAddress={trip.originAddress}
        destinationAddress={trip.destinationAddress}
        distanceKm={trip.distanceKm}
      />

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
        <button
          type="button"
          data-driver-focus=""
          aria-expanded={expanded}
          aria-label={expanded ? 'Hide trip details' : 'Show trip details'}
          onClick={() => {
            if (swipedRef.current) {
              swipedRef.current = false
              return
            }
            setExpanded((v) => !v)
          }}
          {...sheetSwipe}
          style={{
            boxSizing: 'border-box',
            alignSelf: 'center',
            width: '100%',
            minHeight: 48,
            margin: '-16px 0 -32px',
            padding: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
          }}
        >
          {/* Bar only, no chevron; tap toggles, a short swipe up / down opens / closes. */}
          <span
            aria-hidden="true"
            style={{ width: 40, height: 4, borderRadius: 2, background: 'var(--admin-border-strong)' }}
          />
        </button>

        <div
          {...sheetSwipe}
          style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}
        >
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
          <AddressRow
            caption="Pickup"
            address={trip.originAddress}
            point={trip.origin}
            navigateLabel="Navigate to pickup"
            onNavigate={() =>
              setNavTarget({
                title: 'Navigate to pickup',
                address: trip.originAddress,
                target: trip.origin ?? { address: trip.originAddress },
              })
            }
            clamp={!expanded}
            dot="filled"
            connector
          />
          <AddressRow
            caption="Drop-off"
            address={trip.destinationAddress}
            point={trip.destination}
            navigateLabel="Navigate to drop-off"
            onNavigate={() =>
              setNavTarget({
                title: 'Navigate to drop-off',
                address: trip.destinationAddress,
                target: trip.destination ?? { address: trip.destinationAddress },
              })
            }
            clamp={!expanded}
            dot="ring"
          />
        </ol>

        {expanded ? (
          <PassengerRow
            name={trip.passengerName}
            vehicleLine={trip.vehicleInfo ? `${trip.vehicleLabel} · ${trip.vehicleInfo}` : trip.vehicleLabel}
            phone={trip.passengerPhone}
          />
        ) : null}

        {expanded ? (
          <TripDetails
            token={token}
            bookingReference={trip.bookingReference}
            flight={trip.flight}
            clientNotes={trip.clientNotes}
            draft={noteDraft}
            onDraftChange={setNoteDraft}
          />
        ) : null}

        {noShowActive ? (
          <NoShowBlock
            availableAt={noShow.availableAt}
            requestedAt={noShowRequestedAt}
            nowMs={nowMs}
            onRequest={openNoShowDialog}
          />
        ) : null}

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

      {navTarget ? (
        <NavigateChooser
          title={navTarget.title}
          address={navTarget.address}
          target={navTarget.target}
          onClose={() => setNavTarget(null)}
        />
      ) : null}

      {helpOpen ? (
        <ConfirmStepDialog
          mode="help"
          submitting={helpChat === 'opening'}
          error={null}
          chat={{ state: helpChat, onOpen: openHelpChat }}
          onConfirm={closeHelp}
          onCancel={closeHelp}
        />
      ) : null}

      {noShowDialogOpen && noShowActive ? (
        <ConfirmStepDialog
          mode="no-show"
          submitting={submitting}
          error={dialogError}
          onConfirm={submitNoShow}
          onCancel={cancelNoShowDialog}
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

// Passenger contact lives in the expanded sheet (owner 2026-11-03, after the 87 UAT): the trip
// screen opens on the map and the route; a short swipe up shows who to meet and how to reach them.
function PassengerRow({ name, vehicleLine, phone }: { name: string; vehicleLine: string; phone: string | null }) {
  // tel:/sms: need digits and an optional leading +; spaces and punctuation from the booking form are dropped.
  const dialable = phone ? phone.replace(/[^\d+]/g, '') : ''
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, minWidth: 0 }}>
      <div style={{ minWidth: 0, flex: 1 }}>
        <span
          style={{
            fontSize: 'var(--driver-fs-label)',
            fontWeight: 500,
            lineHeight: 1.4,
            color: 'var(--admin-text-muted)',
          }}
        >
          Passenger
        </span>
        <p
          style={{
            margin: 0,
            overflow: 'hidden',
            whiteSpace: 'nowrap',
            textOverflow: 'ellipsis',
            fontSize: 'var(--driver-fs-heading)',
            fontWeight: 500,
            lineHeight: 1.2,
          }}
        >
          {name}
        </p>
        <p
          style={{
            margin: 0,
            fontSize: 'var(--driver-fs-body)',
            fontWeight: 400,
            lineHeight: 1.5,
            color: 'var(--admin-text-muted)',
            overflowWrap: 'anywhere',
          }}
        >
          {vehicleLine}
        </p>
      </div>
      {dialable ? (
        <>
          <a href={`sms:${dialable}`} aria-label="Message passenger" data-driver-focus="" style={iconButtonStyle}>
            <MessageSquare size={20} aria-hidden="true" />
          </a>
          <a href={`tel:${dialable}`} aria-label="Call passenger" data-driver-focus="" style={iconButtonStyle}>
            <Phone size={20} aria-hidden="true" />
          </a>
        </>
      ) : null}
    </div>
  )
}

const iconButtonStyle: CSSProperties = {
  boxSizing: 'border-box',
  minWidth: 48,
  minHeight: 48,
  flexShrink: 0,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  border: '1px solid var(--admin-border-strong)',
  borderRadius: 'var(--admin-radius-md)',
  background: 'transparent',
  color: 'var(--admin-text)',
  textDecoration: 'none',
}

function AddressRow({
  caption,
  address,
  point,
  navigateLabel,
  clamp,
  dot,
  connector = false,
  onNavigate,
}: {
  caption: string
  address: string
  point: { lat: number; lng: number } | null
  navigateLabel: string
  /** Opens the Google Maps / Waze chooser for this stop (87-UAT gap 2). */
  onNavigate: () => void
  /** Collapsed sheet: addresses stop at 2 lines (class in driver-trip.css); expanded shows them in full. */
  clamp: boolean
  dot: 'filled' | 'ring'
  connector?: boolean
}) {
  // Coordinates when present, otherwise the address string; nothing to navigate to means no button.
  const canNavigate = Boolean(point) || Boolean(address)
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
      <div style={{ minWidth: 0, flex: 1 }}>
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
          className={clamp ? 'driver-address-clamp' : undefined}
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
      {canNavigate ? (
        <button
          type="button"
          aria-haspopup="dialog"
          aria-label={navigateLabel}
          data-driver-focus=""
          onClick={onNavigate}
          style={{ ...iconButtonStyle, alignSelf: 'flex-start', cursor: 'pointer' }}
        >
          <Navigation size={20} aria-hidden="true" />
        </button>
      ) : null}
    </li>
  )
}
