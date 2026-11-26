'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CircleCheck, Clock, Info } from 'lucide-react'
import type { OfferView } from '@/lib/driver-cabinet/offers'
import OfferCard, { OffersEmptyState } from '@/components/driver/OfferCard'
import ConfirmStepDialog from '@/app/(internal)/driver/trip/[token]/ConfirmStepDialog'

// Phase 94 plan 94-11 (DCAB-07, DCAB-08; D-08): the client island of /driver/offers. Accept and Decline each open the
// shared confirm dialog; nothing is sent before its primary button. The answer goes to the cabinet respond route, which
// is the authority (compare-and-set on 'pending'); this component only maps the outcome to the UI-SPEC banners.

type Action = 'accepted' | 'declined'
type Banner = { kind: 'ok' | 'info' | 'amber'; text: string; openRideId?: string; key: number }

const ERROR_TEXT = 'Could not save your answer. Check your connection and try again.'
const SIGN_IN_URL = `/driver/login?next=${encodeURIComponent('/driver/offers')}&ended=1`
const BANNER_MS = 8000

const answerButton: CSSProperties = {
  boxSizing: 'border-box',
  width: '100%',
  minHeight: 48,
  borderRadius: 'var(--admin-radius-md)',
  fontFamily: 'inherit',
  fontSize: 'var(--driver-fs-body)',
  lineHeight: 1.5,
  fontWeight: 500,
  cursor: 'pointer',
}

const BANNER_TONE = {
  ok: { bg: 'var(--status-ok-bg)', fg: 'var(--status-ok-fg)' },
  info: { bg: 'var(--status-info-bg)', fg: 'var(--status-info-fg)' },
  amber: { bg: 'var(--status-warn-bg)', fg: 'var(--status-warn-fg)' },
} as const

export default function OffersList({ offers }: { offers: OfferView[] }) {
  const router = useRouter()
  // Cards the driver already answered (or that the office changed): hidden at once, the server list follows on refresh.
  const [gone, setGone] = useState<ReadonlySet<string>>(() => new Set())
  const [dialog, setDialog] = useState<{ id: string; action: 'accept' | 'decline' } | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [banner, setBanner] = useState<Banner | null>(null)
  const [live, setLive] = useState('')
  const inFlight = useRef(false)
  const bannerRef = useRef<HTMLDivElement>(null)
  const bannerKey = useRef(0)

  const visible = offers.filter((o) => !gone.has(o.assignmentId))
  const dialogOffer = dialog ? (offers.find((o) => o.assignmentId === dialog.id) ?? null) : null

  const showBanner = useCallback((next: Omit<Banner, 'key'>) => {
    bannerKey.current += 1
    setBanner({ ...next, key: bannerKey.current })
  }, [])

  // Focus moves to the banner when it appears; ok and info clear after 8 s.
  useEffect(() => {
    if (!banner) return
    bannerRef.current?.focus()
    if (banner.kind === 'amber') return
    const timer = setTimeout(() => {
      setBanner((current) => (current && current.key === banner.key ? null : current))
    }, BANNER_MS)
    return () => clearTimeout(timer)
  }, [banner])

  function openDialog(id: string, action: 'accept' | 'decline') {
    setBanner(null)
    setLive('')
    setError(null)
    setDialog({ id, action })
  }

  function closeDialog() {
    if (inFlight.current) return
    setDialog(null)
    setError(null)
  }

  async function confirm() {
    if (!dialog || inFlight.current) return
    const { id, action } = dialog
    const answer: Action = action === 'accept' ? 'accepted' : 'declined'
    inFlight.current = true
    setSubmitting(true)
    setError(null)

    let status = 0
    try {
      const res = await fetch(`/api/driver/cabinet/offers/${id}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: answer }),
      })
      status = res.status
    } catch {
      status = 0
    }

    if (status === 401) {
      // The session ended: no retry without one. The page is left, so the in-flight lock stays on.
      window.location.assign(SIGN_IN_URL)
      return
    }

    inFlight.current = false
    setSubmitting(false)

    if (status === 200) {
      setGone((prev) => new Set(prev).add(id))
      setDialog(null)
      if (answer === 'accepted') {
        showBanner({ kind: 'ok', text: 'Ride accepted. You can find it under Rides.', openRideId: id })
        setLive('Ride accepted.')
      } else {
        showBanner({ kind: 'info', text: 'Ride declined. The office has been told.' })
        setLive('Ride declined.')
      }
      router.refresh()
    } else if (status === 409) {
      setGone((prev) => new Set(prev).add(id))
      setDialog(null)
      showBanner({ kind: 'info', text: 'This offer is no longer available. The office has changed this ride.' })
      router.refresh()
    } else if (status === 429) {
      setDialog(null)
      showBanner({ kind: 'amber', text: 'Too many taps. Wait a moment and try again.' })
    } else {
      setError(ERROR_TEXT)
    }
  }

  const BannerIcon = banner?.kind === 'ok' ? CircleCheck : banner?.kind === 'amber' ? Clock : Info

  return (
    <>
      <div className="driver-sr-only" aria-live="polite">
        {live}
      </div>

      {banner ? (
        <div
          ref={bannerRef}
          key={banner.key}
          tabIndex={-1}
          role={banner.kind === 'amber' ? 'alert' : 'status'}
          style={{
            boxSizing: 'border-box',
            margin: '0 24px 16px',
            padding: '8px 16px',
            borderRadius: 'var(--admin-radius-md)',
            background: BANNER_TONE[banner.kind].bg,
            color: BANNER_TONE[banner.kind].fg,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            fontSize: 'var(--driver-fs-body)',
            fontWeight: 400,
            lineHeight: 1.5,
            outline: 'none',
          }}
        >
          <BannerIcon size={20} aria-hidden="true" style={{ flexShrink: 0 }} />
          <span style={{ minWidth: 0, flex: 1, overflowWrap: 'anywhere' }}>{banner.text}</span>
          {banner.openRideId ? (
            <Link
              href={`/driver/rides/${banner.openRideId}`}
              data-driver-focus=""
              style={{
                minHeight: 48,
                display: 'inline-flex',
                alignItems: 'center',
                flexShrink: 0,
                color: 'var(--admin-accent-text)',
                fontWeight: 500,
                textDecoration: 'underline',
              }}
            >
              Open ride
            </Link>
          ) : null}
        </div>
      ) : null}

      {visible.length === 0 ? (
        <OffersEmptyState />
      ) : (
        visible.map((offer) => (
          <OfferCard
            key={offer.assignmentId}
            offer={offer}
            actions={
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <button
                  type="button"
                  data-driver-focus=""
                  onClick={() => openDialog(offer.assignmentId, 'accept')}
                  style={{
                    ...answerButton,
                    border: '1px solid var(--admin-accent)',
                    background: 'var(--admin-accent)',
                    color: 'var(--admin-on-accent)',
                  }}
                >
                  Accept
                </button>
                <button
                  type="button"
                  data-driver-focus=""
                  onClick={() => openDialog(offer.assignmentId, 'decline')}
                  style={{
                    ...answerButton,
                    border: '1px solid var(--admin-border-strong)',
                    background: 'transparent',
                    color: 'var(--admin-text)',
                  }}
                >
                  Decline
                </button>
              </div>
            }
          />
        ))
      )}

      {dialog && dialogOffer ? (
        <ConfirmStepDialog
          mode={dialog.action}
          submitting={submitting}
          error={error}
          onConfirm={confirm}
          onCancel={closeDialog}
          offer={{ whenLabel: `${dialogOffer.dayLabel} at ${dialogOffer.time}`, feeLabel: dialogOffer.feeLabel }}
        />
      ) : null}
    </>
  )
}
