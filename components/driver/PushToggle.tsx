'use client'

import { useEffect, useRef, useState } from 'react'
import { LoaderCircle } from 'lucide-react'
import HomeScreenHint from '@/components/driver/HomeScreenHint'
import {
  PUSH_SIGN_IN_URL,
  disablePush,
  enablePush,
  readPushState,
  type PushUiState,
} from '@/lib/driver-cabinet/push-client'

// Phase 94 plan 94-13 (DCAB-10, DCAB-12; D-09, UI-SPEC You item 4 and E12): the "New ride offers" switch.
//
// Nothing here registers the worker or asks for permission on mount: the first thing that runs is the read-only
// readPushState(). The permission prompt happens only inside the tap, and the switch never moves before the server
// has stored the subscription. The public VAPID key is the only key the page ever sees. Colours only through tokens.

const TRACK_W = 56
const TRACK_H = 32
const KNOB = 24

const helper = {
  margin: 0,
  fontSize: 'var(--driver-fs-label)',
  fontWeight: 400,
  lineHeight: 1.4,
  color: 'var(--admin-text-muted)',
} as const

const body = { margin: 0, fontSize: 'var(--driver-fs-body)', fontWeight: 400, lineHeight: 1.5 } as const

export default function PushToggle({ publicKey }: { publicKey: string }) {
  const [state, setState] = useState<PushUiState | null>(null)
  const [alert, setAlert] = useState<string | null>(null)
  // True while a turn-off is running: the switch keeps its on position until the server has deleted the row.
  const [wasOn, setWasOn] = useState(false)
  const busyRef = useRef(false)

  useEffect(() => {
    let cancelled = false
    void readPushState().then((next) => {
      if (!cancelled) setState(next)
    })
    return () => {
      cancelled = true
    }
  }, [])

  async function turnOn() {
    if (busyRef.current) return
    busyRef.current = true
    setAlert(null)
    setState('busy')
    const result = await enablePush(publicKey)
    if (result === 'unauthorized') {
      // The session ended: the page is left, so the lock stays on.
      window.location.assign(PUSH_SIGN_IN_URL)
      return
    }
    busyRef.current = false
    if (result === 'on') setState('on')
    else if (result === 'denied') setState('denied')
    else {
      setState('error')
      setAlert('Could not turn on notifications. Try again.')
    }
  }

  async function turnOff() {
    if (busyRef.current) return
    busyRef.current = true
    setAlert(null)
    setState('busy')
    const result = await disablePush()
    if (result === 'unauthorized') {
      window.location.assign(PUSH_SIGN_IN_URL)
      return
    }
    busyRef.current = false
    if (result === 'off') {
      setState('off')
    } else {
      // Still subscribed: the switch stays on.
      setState('on')
      setAlert('Could not turn off notifications. Try again.')
    }
  }

  if (state === null) return <div aria-hidden="true" style={{ minHeight: 48 }} />

  if (state === 'unsupported') {
    return (
      <p style={{ ...body, color: 'var(--admin-text-muted)' }}>
        Notifications are not available in this browser. You still get an email for every new ride.
      </p>
    )
  }

  if (state === 'ios-install') return <HomeScreenHint />

  const busy = state === 'busy'
  const on = state === 'on'
  const denied = state === 'denied'
  // While busy the switch keeps the position it had before the tap (the tap came from off, or from on when turning off).
  const checked = on || (busy && wasOn)

  return (
    <div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby="push-toggle-label"
        aria-describedby="push-toggle-help"
        aria-busy={busy}
        data-driver-focus=""
        disabled={busy || denied}
        onClick={() => {
          setWasOn(on)
          void (on ? turnOff() : turnOn())
        }}
        style={{
          boxSizing: 'border-box',
          width: '100%',
          minHeight: 48,
          padding: 0,
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          border: 'none',
          background: 'transparent',
          color: 'var(--admin-text)',
          fontFamily: 'inherit',
          textAlign: 'left',
          cursor: busy || denied ? 'default' : 'pointer',
          opacity: denied ? 0.6 : 1,
        }}
      >
        <span style={{ flex: '1 1 160px', minWidth: 0, overflowWrap: 'anywhere' }}>
          <span
            id="push-toggle-label"
            style={{ display: 'block', fontSize: 'var(--driver-fs-body)', fontWeight: 500, lineHeight: 1.5 }}
          >
            New ride offers
          </span>
          <span id="push-toggle-help" style={{ ...helper, display: 'block' }}>
            {checked
              ? 'You will get a notification for every new ride offer.'
              : 'We notify you when the office sends you a ride.'}
          </span>
        </span>
        <span
          aria-hidden="true"
          style={{
            position: 'relative',
            flexShrink: 0,
            boxSizing: 'border-box',
            width: TRACK_W,
            height: TRACK_H,
            borderRadius: TRACK_H / 2,
            background: checked ? 'var(--admin-accent)' : 'var(--admin-hover)',
            border: `1px solid ${checked ? 'var(--admin-accent)' : 'var(--admin-border-strong)'}`,
          }}
        >
          <span
            style={{
              position: 'absolute',
              top: (TRACK_H - 2 - KNOB) / 2,
              left: checked ? TRACK_W - 2 - KNOB - 3 : 3,
              width: KNOB,
              height: KNOB,
              borderRadius: KNOB / 2,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: busy ? 'transparent' : checked ? 'var(--admin-on-accent)' : 'var(--admin-text-muted)',
              color: 'var(--admin-text-muted)',
            }}
          >
            {busy ? <LoaderCircle size={20} className="driver-spin" /> : null}
          </span>
        </span>
      </button>

      {denied ? (
        <p style={{ ...helper, marginTop: 8 }}>
          Notifications are blocked. Turn them on for this site in your phone&apos;s browser settings.
        </p>
      ) : null}
      {alert ? (
        <p role="alert" style={{ ...body, marginTop: 8, color: 'var(--status-danger-fg)' }}>
          {alert}
        </p>
      ) : null}
    </div>
  )
}
